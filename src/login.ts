import database = require('./database');
import bilibili = require('./bilibili');
import express = require('express');

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

/**
 * 从Bilibili获取二维码的扫描状态 (x/passport-login/web/qrcode/poll)
 * 返回: -4 未扫码, -5 已扫码未确认, -2 已失效, -1 其它错误,
 * 或成功时 {"url": "https://passport.biligame.com/x/passport-login/web/crossDomain?DedeUserID=...&DedeUserID__ckMd5=...&Expires=...&SESSDATA=...&bili_jct=...&gourl=..."}
 *
 * @param {string} oauthkey 要验证的 qrcode_key
 * @param {((status: number|object|null)=>void)} callback callback
 */
function getLoginInfo(oauthkey: string, callback: (status: number | object | null) => void) {
    bilibili.jsonCall("https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=" + encodeURIComponent(oauthkey || ""), null,
        function (res) {
            const data = res && res["data"];
            if (!data) { console.log("[Error][Login] Unexpected qrcode/poll response: " + JSON.stringify(res)); callback(-1); return; }
            if (data["code"] === 0 && data["url"]) callback({ "url": data["url"] });
            else callback(POLL_STATUS[data["code"]] !== undefined ? POLL_STATUS[data["code"]] : -1);
        }, function (err) {
            console.log("[Error][Login] Failed to get login info");
            callback(null);
        });
}

export function registerApis(app: express.Application) {
    app.post('/login/cookies', function (request, response) {
        let uid = request.body["DedeUserID"];
        let cookie = "DedeUserID=" + uid + "; DedeUserID__ckMd5=" + request.body["DedeUserID__ckMd5"] + "; SESSDATA=" + request.body["SESSDATA"] + "; bili_jct=" + request.body["bili_jct"];
        bilibili.fetchBlacklist(cookie,
            function (suc, result) {
                if (suc) {
                    let token = generateToken();
                    response.cookie("token", token);
                    response.cookie("uid", uid);
                    response.cookie("bilibili_cookies", cookie);
                    response.cookie("csrf", request.body["bili_jct"]);
                    response.redirect("../index.html");
                    storeToken(uid, token);
                } else {
                    response.json(result);
                }
            }
        );
    });
    app.get('/login/getoauth', function (req, response) {
        getOAuthKey(function (res) {
            if (res === null) response.status(502).json({ "code": -1, "message": "Bilibili did not respond" });
            else response.json(res);
        });
    });
    app.post('/login/getinfo', function (req, response) {
        getLoginInfo(req.body["oauthkey"], function (res) {
            if (res === null) response.status(502).json({ "code": -1, "message": "Bilibili did not respond" });
            else response.json(res);
        });
    });
}

export let _generateToken = generateToken;
