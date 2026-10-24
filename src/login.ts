import express = require('express');
import database = require('./database');
import bilibili = require('./bilibili');
import http = require('./http');

/**
 * Login: QR code (Bilibili's passport-login qrcode/generate + poll API) or cookies pasted by hand, our session
 * cookies, and `currentUser` for the routes that need a logged-in visitor.
 */

function generateToken() {
    return "" + Math.floor(Math.random() * 100000000000);
}

// x/passport-login/web/qrcode/poll status codes, mapped to the codes the front end understands
const POLL_STATUS: { [code: number]: number } = {
    86101: -4,  // 未扫码 (not scanned yet)
    86090: -5,  // 已扫码未确认 (scanned, waiting for confirmation on the phone)
    86038: -2,  // 二维码已失效 (expired)
};

const LOGIN_COOKIES = ["DedeUserID", "DedeUserID__ckMd5", "SESSDATA", "bili_jct"];
type LoginCookies = { [name: string]: string };

/*
 * Our session cookies. Everything except uid is HttpOnly (the page never needs to read the Bilibili credentials),
 * all are SameSite=Lax (also blocks cross-site POSTs to /apply, /add_item, ...) and Secure when the request came in
 * over HTTPS (behind Caddy, via X-Forwarded-Proto). COOKIE_PATH scopes them to where the app is mounted, e.g.
 * /bilibili, so other sites on the same domain never receive them.
 */
const SESSION_COOKIES = ["uid", "token", "bilibili_cookies", "csrf"];
const COOKIE_PATH = process.env.COOKIE_PATH || "/";

function cookieOptions(req: express.Request, name: string): express.CookieOptions {
    return { path: COOKIE_PATH, httpOnly: name !== "uid", secure: req.secure, sameSite: "lax" };
}

// copies set by older versions live at Path=/ with no flags; expire them so only the hardened ones remain
function dropLegacyCookies(res: express.Response) {
    if (COOKIE_PATH === "/") return;
    for (const name of SESSION_COOKIES) res.clearCookie(name, { path: "/" });
}

function setSessionCookies(req: express.Request, res: express.Response, values: { [name: string]: string }) {
    for (const name of SESSION_COOKIES) if (values[name]) res.cookie(name, values[name], cookieOptions(req, name));
    dropLegacyCookies(res);
}

export function clearSessionCookies(req: express.Request, res: express.Response) {
    for (const name of SESSION_COOKIES) res.clearCookie(name, cookieOptions(req, name));
    dropLegacyCookies(res);
}

/** Sessions from before the cookies were hardened: on a page load, re-issue them with the new flags and path. */
export function upgradeSessionCookies(req: express.Request, res: express.Response, next: express.NextFunction) {
    const uid = http.cookie(req, "uid"), token = http.cookie(req, "token"), bili = http.cookie(req, "bilibili_cookies");
    if (req.method === "GET" && (req.path === "/" || req.path.endsWith(".html")) && uid && token && bili)
        setSessionCookies(req, res, { uid, token, bilibili_cookies: bili, csrf: http.cookie(req, "csrf") });
    next();
}

/** The logged-in visitor's uid (as stored: a number), or null. */
export function currentUser(req: express.Request): number | null {
    const uid = Number(http.cookie(req, "uid")), token = http.cookie(req, "token");
    if (!Number.isInteger(uid) || uid <= 0 || !token || token.length > 64) return null;
    return database.findOne("users", { uid: uid, token: token }) ? uid : null;
}

export function requireUser(req: express.Request): number {
    const uid = currentUser(req);
    if (uid === null) throw new http.HttpError(401, "登录已过期，请重新登录", -1);
    return uid;
}

/**
 * Pick the four login cookies out of a successful poll: the Set-Cookie headers first (what a browser would store),
 * then the crossDomain URL in data.url as a fallback. Values are kept exactly as Bilibili sent them (still URL-encoded),
 * because they go straight back into a Cookie header.
 */
export function extractLoginCookies(url: string | undefined, setCookie: string[] | undefined): LoginCookies {
    const out: LoginCookies = {};
    for (const line of setCookie || []) {
        const m = /^\s*([^=;\s]+)=([^;]*)/.exec(line);
        if (m && LOGIN_COOKIES.indexOf(m[1]) >= 0 && m[2]) out[m[1]] = m[2];
    }
    const q = url && url.indexOf("?") >= 0 ? url.slice(url.indexOf("?") + 1).split("#")[0] : "";
    for (const part of q.split("&")) {
        const i = part.indexOf("=");
        if (i <= 0) continue;
        const name = part.slice(0, i), value = part.slice(i + 1);
        if (LOGIN_COOKIES.indexOf(name) >= 0 && value && !out[name]) out[name] = value;
    }
    return out;
}

/** -4 未扫码, -5 已扫码未确认, -2 已失效, -1 其它, or the login cookies on success. */
async function pollLogin(key: string): Promise<number | LoginCookies> {
    const { json, setCookie } = await bilibili.call("https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=" + encodeURIComponent(key));
    const data = json && json.data;
    if (!data) { console.log("[Error][Login] Unexpected qrcode/poll response: code " + (json && json.code) + " " + (json && json.message)); return -1; }
    if (data.code === 0) return extractLoginCookies(data.url, setCookie);
    if (POLL_STATUS[data.code] === undefined) console.log("[Error][Login] Unknown qrcode/poll code " + data.code + " " + data.message);
    return POLL_STATUS[data.code] !== undefined ? POLL_STATUS[data.code] : -1;
}

/**
 * Check the cookies against Bilibili (by reading the user's filter list) and, if they work, sign the visitor in.
 * Returns the uid, or throws an HttpError the page can show.
 */
async function completeLogin(parts: LoginCookies, req: express.Request, res: express.Response): Promise<string> {
    const uid = parts["DedeUserID"];
    if (!/^\d{1,20}$/.test(uid || "")) throw new http.HttpError(400, "DedeUserID 格式不对");
    for (const name of LOGIN_COOKIES) if (!parts[name] || parts[name].length > 1024 || /[;\r\n]/.test(parts[name])) throw new http.HttpError(400, name + " 格式不对");
    const cookie = LOGIN_COOKIES.map(name => name + "=" + parts[name]).join("; ");
    try {
        await bilibili.getFilters(cookie);
    } catch (e) {
        console.log("[Error][Login] Bilibili rejected the new session: " + (e instanceof bilibili.BiliError ? e.code + " " + e.message : "network error"));
        throw new http.HttpError(502, "B 站拒绝了这次登录", -6);
    }
    const token = generateToken();
    setSessionCookies(req, res, { uid: uid, token: token, bilibili_cookies: cookie, csrf: parts["bili_jct"] });
    database.updateOne("users", { uid: parseInt(uid) }, { $set: { token: token } }, { upsert: true });
    return uid;
}

export function registerApis(app: express.Application) {
    // manual login with cookies copied from the browser
    app.post('/login/cookies', http.rateLimit('login', 20), http.route(async (req, res) => {
        const parts: LoginCookies = {};
        for (const name of LOGIN_COOKIES) parts[name] = http.str(req.body[name], { name: name, max: 1024 });
        await completeLogin(parts, req, res);
        res.json({ code: 0 });
    }));

    // the page can't delete HttpOnly cookies itself
    app.post('/logout', http.route((req, res) => {
        clearSessionCookies(req, res);
        res.json({ code: 0 });
    }));

    app.get('/login/getoauth', http.rateLimit('login', 20), http.route(async (req, res) => {
        let data: any;
        try { data = (await bilibili.call("https://passport.bilibili.com/x/passport-login/web/qrcode/generate")).json.data; } catch (e) { data = null; }
        if (!data || !data.qrcode_key) throw new http.HttpError(502, "B 站没有返回二维码");
        res.json({ url: data.url, oauthKey: data.qrcode_key });
    }));

    // poll the QR code; on success the login is completed right here, so the session cookies never pass through the page
    app.post('/login/getinfo', http.rateLimit('login-poll', 60), http.route(async (req, res) => {
        const key = http.str(req.body.oauthkey, { name: "二维码", max: 64 });
        let result: number | LoginCookies;
        try { result = await pollLogin(key); } catch (e) { throw new http.HttpError(502, "B 站没有响应"); }
        if (typeof result === "number") { res.json(result); return; }
        const missing = LOGIN_COOKIES.filter(name => !(result as LoginCookies)[name]);
        if (missing.length) {
            console.log("[Error][Login] QR login confirmed but cookies are missing: " + missing.join(", ") + " (got: " + (Object.keys(result).join(", ") || "none") + ")");
            res.json({ code: -3, message: "missing cookies" });
            return;
        }
        try { res.json({ code: 0, uid: await completeLogin(result, req, res) }); }
        catch (e) { if (e instanceof http.HttpError) res.json({ code: e.code, message: e.message }); else throw e; }
    }));
}

export let _generateToken = generateToken;
