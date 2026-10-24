import database = require('./database');
import bilibili = require('./bilibili');
import express = require('express');
import request = require('request');

/**
 * 生成Token
 * 
 * @returns token
 */
function generateToken() {
    return "" + Math.floor(Math.random() * 100000000000)
}

/**
 * 修改数据库中的Token
 * 
 * @param {string} uid user's uid
 * @param {string} token user's token
 */
function storeToken(uid: string, token: string) {
    new database.Database(function (db) {
        db.updateOne("users", { uid: parseInt(uid) },
            { $set: { token: token } }, { upsert: true }, function () { db.close(); });
    });
}

/**
 * 从Bilibili获取登录二维码 (x/passport-login/web/qrcode/generate; the old qrcode/getLoginUrl API is retired)
 * 返回 {"url": "https://account.bilibili.com/h5/account-h5/auth/scan-web?...&qrcode_key=...", "oauthKey": "<qrcode_key>"}
 *
 * @param {(OAuthKey: object | null) => void} callback the callback
 */
function getOAuthKey(callback: (OAuthKey: object | null) => void) {
    bilibili.jsonCall("https://passport.bilibili.com/x/passport-login/web/qrcode/generate", null,
        function (res) {
            const data = res && res["data"];
            if (!data || !data["qrcode_key"]) { console.log("[Error][Login] Unexpected qrcode/generate response: " + JSON.stringify(res)); callback(null); return; }
            callback({ "url": data["url"], "oauthKey": data["qrcode_key"] });
        }, function (err) {
            console.log("[Error][Login] Failed to get OAuthKey");
            callback(null);
        });
}

// x/passport-login/web/qrcode/poll status codes, mapped to the codes the front end already understands
const POLL_STATUS: { [code: number]: number } = {
    86101: -4,  // 未扫码 (not scanned yet)
    86090: -5,  // 已扫码未确认 (scanned, waiting for confirmation on the phone)
    86038: -2,  // 二维码已失效 (expired)
};

const LOGIN_COOKIES = ["DedeUserID", "DedeUserID__ckMd5", "SESSDATA", "bili_jct"];
type LoginCookies = { [name: string]: string };

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

/**
 * 从Bilibili获取二维码的扫描状态 (x/passport-login/web/qrcode/poll)
 * callback: -4 未扫码, -5 已扫码未确认, -2 已失效, -1 其它, the login cookies on success, or null if Bilibili didn't answer.
 */
function pollLogin(oauthkey: string, callback: (status: number | LoginCookies | null) => void) {
    request.get({ url: "https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=" + encodeURIComponent(oauthkey || ""), headers: bilibili.BROWSER_HEADERS },
        function (error, response, body) {
            if (error || response.statusCode != 200) { console.log("[Error][Login] qrcode/poll failed: " + (error || response.statusCode)); callback(null); return; }
            let res: any;
            try { res = JSON.parse(body); } catch (e) { console.log("[Error][Login] qrcode/poll returned non-JSON"); callback(-1); return; }
            const data = res && res["data"];
            if (!data) { console.log("[Error][Login] Unexpected qrcode/poll response: code " + (res && res["code"]) + " " + (res && res["message"])); callback(-1); return; }
            if (data["code"] === 0) { callback(extractLoginCookies(data["url"], response.headers["set-cookie"])); return; }
            if (POLL_STATUS[data["code"]] === undefined) console.log("[Error][Login] Unknown qrcode/poll code " + data["code"] + " " + data["message"]);
            callback(POLL_STATUS[data["code"]] !== undefined ? POLL_STATUS[data["code"]] : -1);
        });
}

/**
 * Check the cookies against Bilibili (by reading the user's filter list) and, if they work, sign the visitor in:
 * set our session cookies on the response and store the token. done(true, uid) or done(false, reason).
 */
function completeLogin(parts: LoginCookies, response: express.Response, done: (ok: boolean, info: any) => void) {
    const uid = parts["DedeUserID"];
    const cookie = LOGIN_COOKIES.map(name => name + "=" + parts[name]).join("; ");
    bilibili.fetchBlacklist(cookie, function (suc, result) {
        if (!suc) {
            console.log("[Error][Login] Bilibili rejected the new session: " + JSON.stringify(result && result.code !== undefined ? { code: result.code, message: result.message } : String(result)).slice(0, 200));
            done(false, result);
            return;
        }
        const token = generateToken();
        response.cookie("token", token);
        response.cookie("uid", uid);
        response.cookie("bilibili_cookies", cookie);
        response.cookie("csrf", parts["bili_jct"]);
        storeToken(uid, token);
        done(true, uid);
    });
}

export function registerApis(app: express.Application) {
    // manual login with cookies copied from the browser
    app.post('/login/cookies', function (request, response) {
        const parts: LoginCookies = {};
        for (const name of LOGIN_COOKIES) parts[name] = request.body[name];
        completeLogin(parts, response, function (ok, info) {
            if (ok) response.redirect("../index.html");
            else response.json(info);
        });
    });
    app.get('/login/getoauth', function (req, response) {
        getOAuthKey(function (res) {
            if (res === null) response.status(502).json({ "code": -1, "message": "Bilibili did not respond" });
            else response.json(res);
        });
    });
    // poll the QR code; on success the login is completed right here, so the session cookies never pass through the page
    app.post('/login/getinfo', function (req, response) {
        pollLogin(req.body["oauthkey"], function (res) {
            if (res === null) { response.status(502).json({ "code": -1, "message": "Bilibili did not respond" }); return; }
            if (typeof res === "number") { response.json(res); return; }
            const missing = LOGIN_COOKIES.filter(name => !res[name]);
            if (missing.length) {
                console.log("[Error][Login] QR login confirmed but cookies are missing: " + missing.join(", ") + " (got: " + (Object.keys(res).join(", ") || "none") + ")");
                response.json({ "code": -3, "message": "missing cookies" });
                return;
            }
            completeLogin(res, response, function (ok, uid) {
                if (ok) response.json({ "code": 0, "uid": uid });
                else response.json({ "code": -6, "message": "Bilibili rejected the login" });
            });
        });
    });
}

export let _generateToken = generateToken;
