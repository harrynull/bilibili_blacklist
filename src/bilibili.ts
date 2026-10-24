import express = require('express');
import http = require('./http');

/**
 * Bilibili API client (Node's built-in fetch) plus the routes that act on the visitor's own Bilibili account.
 * The visitor's Bilibili cookies arrive in our HttpOnly `bilibili_cookies` cookie and are only ever forwarded to
 * Bilibili for the current request; nothing here stores or logs them.
 */

// Bilibili's risk control rejects requests that don't look like a browser, so every call sends these
export const BROWSER_HEADERS: { [name: string]: string } = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
};

export enum FilterType { Normal = 0, Regex = 1, User = 2 }

export interface Filter { id: number; type: number; filter: string; }

export interface BiliResponse { json: any; setCookie: string[]; }

/** Bilibili answered with something other than success; `code`/`message` are Bilibili's, safe to pass on. */
export class BiliError extends Error {
    constructor(public code: number, message: string) { super(message); }
}

/** GET (or POST with a form) to Bilibili, expecting JSON. Throws on network errors, timeouts and non-200s. */
export async function call(url: string, opts: { cookie?: string, form?: { [k: string]: string | number } } = {}): Promise<BiliResponse> {
    const headers: { [name: string]: string } = Object.assign({}, BROWSER_HEADERS);
    if (opts.cookie) headers['Cookie'] = opts.cookie;
    let body: string | undefined;
    if (opts.form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(Object.entries(opts.form).map(([k, v]) => [k, String(v)])).toString();
    }
    const res = await fetch(url, { method: opts.form ? 'POST' : 'GET', headers, body, signal: AbortSignal.timeout(10000), redirect: 'manual' });
    if (res.status !== 200) throw new BiliError(-res.status, 'Bilibili HTTP ' + res.status);
    let json: any;
    try { json = await res.json(); } catch (e) { throw new BiliError(-1, 'Bilibili returned non-JSON'); }
    return { json, setCookie: res.headers.getSetCookie() };
}

/** The visitor's danmaku filter list. Throws BiliError when the cookies are no longer valid. */
export async function getFilters(cookie: string): Promise<Filter[]> {
    const { json } = await call('https://api.bilibili.com/x/dm/filter/user?jsonp=jsonp', { cookie });
    const rules = json && json.data && json.data.rule;
    if (!json || json.code !== 0 || !Array.isArray(rules)) throw new BiliError(json && json.code || -1, json && json.message || 'no filter list');
    return rules.map((r: any) => ({ id: r.id, type: r.type, filter: r.filter }));
}

/** Add one filter. Resolves with Bilibili's answer ({code: 0} on success); throws only on network errors. */
export async function addFilter(cookie: string, csrf: string, type: number, filter: string): Promise<{ code: number, message: string }> {
    const { json } = await call('https://api.bilibili.com/x/dm/filter/user/add', { cookie, form: { type, filter, jsonp: 'jsonp', csrf } });
    return { code: json && typeof json.code === 'number' ? json.code : -1, message: json && json.message || '' };
}

export async function deleteFilters(cookie: string, csrf: string, ids: string): Promise<any> {
    const { json } = await call('https://api.bilibili.com/x/dm/filter/user/del', { cookie, form: { ids, jsonp: 'jsonp', csrf } });
    return json;
}

/** The visitor's Bilibili cookie and csrf token from our cookies, or a 401. */
export function credentials(req: express.Request): { cookie: string, csrf: string } {
    const cookie = http.cookie(req, 'bilibili_cookies'), csrf = http.cookie(req, 'csrf');
    if (!cookie || !csrf || cookie.length > 4096 || csrf.length > 128) throw new http.HttpError(401, '请先登录 B 站账号', -1);
    return { cookie, csrf };
}

export const MAX_FILTER_LENGTH = 4000;

export function registerApis(app: express.Application) {
    app.get('/fetch_blacklist', http.rateLimit('bili-read', 60), http.route(async (req, res) => {
        const { cookie } = credentials(req);
        try { res.json(await getFilters(cookie)); }
        catch (e) {
            if (e instanceof BiliError) res.json({ code: e.code, message: 'B 站没有返回屏蔽列表，登录可能已经过期' });   // the page shows "re-login"
            else throw e;
        }
    }));

    app.post('/add_item', http.rateLimit('bili-write', 60), http.route(async (req, res) => {
        const { cookie, csrf } = credentials(req);
        const type = http.int(req.body.type, { name: '类型', min: 0, max: 2 });
        const filter = http.str(req.body.filter, { name: '屏蔽内容', max: MAX_FILTER_LENGTH });
        const result = await addFilter(cookie, csrf, type, filter);
        // a failure (e.g. Bilibili's risk control) gets an error status so the page can tell the user
        if (result.code !== 0) throw new http.HttpError(502, 'B 站拒绝了：' + (result.message || result.code), result.code);
        res.json({ code: 0 });
    }));

    app.post('/del_item', http.rateLimit('bili-write', 60), http.route(async (req, res) => {
        const { cookie, csrf } = credentials(req);
        const ids = http.str(req.body.ids, { name: '屏蔽词 id', max: 2000 });
        if (!/^\d+(,\d+)*$/.test(ids)) throw new http.HttpError(400, '屏蔽词 id 格式不对');
        const result = await deleteFilters(cookie, csrf, ids);
        if (!result || result.code !== 0) throw new http.HttpError(502, 'B 站拒绝了：' + (result && result.message || '删除失败'), result && result.code);
        res.json({ code: 0 });
    }));
}
