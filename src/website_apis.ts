import express = require('express');
import NodeCache = require("node-cache");
import database = require('./database');
import bilibili = require('./bilibili');
import login = require('./login');
import jobs = require('./jobs');
import http = require('./http');

/**
 * The share platform: filter packs (list, detail, export, submit, comment, apply) and the shared user blacklist.
 * Every input is coerced and bounded before it reaches the database or Bilibili.
 */

const cache = new NodeCache({ stdTTL: 60 * 20 });
const PER_PAGE = 20;

// limits for new submissions (existing packs are larger in places: up to ~1100 filters, regexes up to ~7500 chars)
const LIMITS = { name: 60, description: 2000, filters: 2000, tags: 20, tag: 20, comment: 300 };
const HASH = /^[0-9A-Za-z]{1,32}$/;          // the hashed sender ids Bilibili uses for user filters

/** user uid hash -> how many people shared a block of it, keeping only those blocked by at least `min` people */
function userSharelist(min: number): { [hash: string]: number } {
    const key = "user_sharelist_" + min;
    let value = cache.get<{ [hash: string]: number }>(key);
    if (value) return value;
    let counts = cache.get<{ [hash: string]: number }>("user_sharelist");
    if (!counts) {
        counts = {};
        for (const item of database.find("user_sharelist", {}))
            for (const hash of Array.isArray(item.data) ? item.data : []) counts[hash] = (counts[hash] || 0) + 1;
        cache.set("user_sharelist", counts);
    }
    value = {};
    for (const hash in counts) if (counts[hash] >= min) value[hash] = counts[hash];
    cache.set(key, value);
    return value;
}

/** A pack's filters as an array of {type, filter}, whatever shape old documents stored them in. */
function packFilters(pack: any): { type: number, filter: string }[] {
    const raw = pack && pack.filters;
    const list: any[] = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
    return list.map(f => ({ type: Number(f && f.type), filter: String(f && f.filter) }));
}

function findPack(id: unknown): any {
    const pack = database.findOne("sharelist", { _id: http.objectId(id) });
    if (!pack) throw new http.HttpError(404, "找不到这个屏蔽词包");
    return pack;
}

/** Text that is safe inside an XML element: escaped, and without the control characters XML 1.0 forbids. */
function xmlText(s: string): string {
    return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Parse and validate the filters of a new pack (text and regex only; user blocks are shared on their own page). */
function parseFilters(raw: unknown): { type: number, filter: string }[] {
    let list: unknown;
    try { list = JSON.parse(http.str(raw, { name: "屏蔽词", max: 2000000, trim: false })); } catch (e) { throw new http.HttpError(400, "屏蔽词格式不对"); }
    if (!Array.isArray(list) || list.length === 0) throw new http.HttpError(400, "至少添加一条屏蔽词");
    if (list.length > LIMITS.filters) throw new http.HttpError(400, "一个屏蔽词包最多 " + LIMITS.filters + " 条屏蔽词");
    const out: { type: number, filter: string }[] = [], seen = new Set<string>();
    for (const item of list) {
        const type = Number(item && (item as any).type);
        if (type !== 0 && type !== 1) throw new http.HttpError(400, "屏蔽词只能是文本或正则");
        const filter = http.str(item && (item as any).filter, { name: "屏蔽词", max: bilibili.MAX_FILTER_LENGTH });
        if (type === 1) { try { new RegExp(filter); } catch (e) { throw new http.HttpError(400, "正则表达式写得不对：" + filter.slice(0, 40)); } }
        if (seen.has(type + filter)) continue;
        seen.add(type + filter);
        out.push({ type, filter });
    }
    return out;
}

function parseTags(raw: unknown): string[] {
    const s = http.str(raw, { name: "标签", max: 1000, optional: true });
    const tags: string[] = [];
    for (const t of s.split(/[,，]/)) {
        const tag = t.trim();
        if (!tag || tags.indexOf(tag) >= 0) continue;
        if (tag.length > LIMITS.tag) throw new http.HttpError(400, "标签不能超过 " + LIMITS.tag + " 个字");
        tags.push(tag);
    }
    if (tags.length > LIMITS.tags) throw new http.HttpError(400, "最多 " + LIMITS.tags + " 个标签");
    return tags;
}

const lastComment = new Map<number, number>();

export function registerApis(app: express.Application) {
    // the whole public share list (used to seed fresh installs); cached, it is a few MB
    app.get('/fetch_sharelist', http.rateLimit('dump', 10), http.route((req, res) => {
        let body = cache.get<string>("fetch_sharelist");
        if (!body) { body = JSON.stringify(database.find("sharelist", {})); cache.set("fetch_sharelist", body, 600); }
        res.type("json").send(body);
    }));

    app.get('/sharelist', http.route((req, res) => {
        const page = http.int(req.query.page, { name: "页码", min: 0, max: 100000, def: 0 });
        const sort = http.oneOf(req.query.sort, ["usage", "time"] as const, "usage");
        const dir = http.oneOf(req.query.dir, ["asc", "desc"] as const, "desc");
        const tags = http.str(req.query.filter, { name: "标签", max: 400, optional: true }).split(",").map(t => t.trim()).filter(Boolean).slice(0, 10);
        const result = database.findPage("sharelist", tags.length ? { tags: { $in: tags } } : {}, sort, dir, page * PER_PAGE, PER_PAGE);
        res.json({ total: result.total, per_page: PER_PAGE, current_page: page, last_page: Math.ceil(result.total / PER_PAGE), data: result.data });
    }));

    app.get('/list', http.route((req, res) => {
        res.json(findPack(req.query.id));
    }));

    app.get('/export_list', http.route((req, res) => {
        const pack = findPack(req.query.id);
        const prefix: { [type: number]: string } = { 0: "t=", 1: "r=" };
        const items = packFilters(pack).filter(f => prefix[f.type]).map(f => '<item enabled="true">' + prefix[f.type] + xmlText(f.filter) + "</item>\n");
        database.updateOne("sharelist", { _id: pack._id }, { $inc: { usage: 1 } });
        res.json({ code: 0, message: "success", data: "<filters>\n" + items.join("") + "</filters>" });
    }));

    // add a whole pack to the visitor's Bilibili account, paced, as a job the page polls
    app.post('/apply', http.rateLimit('apply', 10), http.route((req, res) => {
        const { cookie, csrf } = bilibili.credentials(req);
        const owner = http.cookie(req, "uid") || cookie;
        const pack = findPack(req.body.id);
        const items = packFilters(pack).filter(f => (f.type === 0 || f.type === 1) && f.filter.length <= bilibili.MAX_FILTER_LENGTH * 2);
        if (!items.length) { res.json({ code: 0, total: 0 }); return; }
        if (jobs.running(owner)) throw new http.HttpError(409, "上一个屏蔽词包还在应用中，请等它完成");
        const job = jobs.start(owner, cookie, csrf, items, status => {
            if (status.added > 0) database.updateOne("sharelist", { _id: pack._id }, { $inc: { usage: 1 } });
        });
        res.json({ code: 0, job: job, total: items.length });
    }));

    // block a list of users (from the shared user blacklist), same job mechanism
    app.post('/block_users', http.rateLimit('apply', 10), http.route((req, res) => {
        const { cookie, csrf } = bilibili.credentials(req);
        const owner = http.cookie(req, "uid") || cookie;
        const hashes = req.body.hashes;
        if (!Array.isArray(hashes) || hashes.length === 0 || hashes.length > 5000 || !hashes.every(h => typeof h === "string" && HASH.test(h)))
            throw new http.HttpError(400, "用户列表格式不对");
        if (jobs.running(owner)) throw new http.HttpError(409, "上一个任务还在进行中，请等它完成");
        const job = jobs.start(owner, cookie, csrf, Array.from(new Set<string>(hashes)).map(h => ({ type: bilibili.FilterType.User, filter: h })));
        res.json({ code: 0, job: job, total: hashes.length });
    }));

    app.get('/job', http.rateLimit('job', 240), http.route((req, res) => {
        const owner = http.cookie(req, "uid") || http.cookie(req, "bilibili_cookies");
        const status = jobs.status(http.str(req.query.id, { name: "任务", max: 64 }), owner);
        if (!status) throw new http.HttpError(404, "任务不存在或已过期");
        res.json(Object.assign({ code: 0 }, status));
    }));

    app.post('/comment', http.rateLimit('comment', 10), http.route((req, res) => {
        const uid = login.requireUser(req);
        const pack = findPack(req.body.id);
        const content = http.str(req.body.content, { name: "评价", max: LIMITS.comment });
        const like = req.body.like === 1 || req.body.like === "1" || req.body.like === true;
        const last = lastComment.get(uid) || 0;
        if (Date.now() - last < 10000) throw new http.HttpError(429, "评价太频繁了，过几秒再试");
        lastComment.set(uid, Date.now());
        database.updateOne("sharelist", { _id: pack._id }, { $push: { comments: { uid: uid, content: content, like: like } } });
        cache.del("fetch_sharelist");
        res.json({ code: 0, message: "success" });
    }));

    app.post('/submit', http.rateLimit('submit', 5), http.route((req, res) => {
        const uid = login.requireUser(req);
        const name = http.str(req.body.name, { name: "名称", max: LIMITS.name });
        const description = http.str(req.body.description, { name: "介绍", max: LIMITS.description, optional: true });
        const filters = parseFilters(req.body.filters);
        const tags = parseTags(req.body.tags);
        const safeLevel = String(http.int(req.body["safe-level"], { name: "误伤程度", min: 0, max: 2, def: 0 }));
        const { insertedId } = database.insertOne("sharelist", {
            uid: String(uid), name, description, filters, time: Date.now(), tags, usage: 0, "safe-level": safeLevel, comments: []
        });
        if (tags.length) database.updateOne("tags", { name: "tags" }, { $addToSet: { tags: { $each: tags } } }, { upsert: true });
        cache.del("fetch_sharelist");
        res.json({ code: 0, id: insertedId });
    }));

    app.post('/share_user_blacklist', http.rateLimit('share', 5), http.route(async (req, res) => {
        const uid = login.requireUser(req);
        const { cookie } = bilibili.credentials(req);
        let filters: bilibili.Filter[];
        try { filters = await bilibili.getFilters(cookie); }
        catch (e) { throw new http.HttpError(502, "B 站没有返回你的屏蔽列表，登录可能已经过期"); }
        const hashes = Array.from(new Set(filters.filter(f => f.type === bilibili.FilterType.User && HASH.test(String(f.filter))).map(f => String(f.filter)))).slice(0, 5000);
        database.updateOne("user_sharelist", { uid: uid }, { $set: { data: hashes } }, { upsert: true });
        res.json({ code: 0, count: hashes.length });
    }));

    app.get('/fetch_user_sharelist', http.route((req, res) => {
        res.json(userSharelist(http.int(req.query.filter, { name: "门槛", min: 1, max: 1000, def: 3 })));
    }));

    app.get('/tags', http.route((req, res) => {
        const doc = database.findOne("tags", { name: "tags" });
        res.json(doc && Array.isArray(doc.tags) ? doc.tags : []);
    }));
}
