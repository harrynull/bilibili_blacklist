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
 * 从Bilibili获取OAuthKey
 * OAuthKey示例: {"data":{"url":"https://passport.bilibili.com/qrcode/h5/login?oauthKey=...","oauthKey":"..."}}
 * 
 * @param {(OAuthKey: string)=>void} callback the callback
 */
function getOAuthKey(callback: (OAuthKey: string) => void) {
    bilibili.jsonCall("https://passport.bilibili.com/qrcode/getLoginUrl", null,
        function (res) {
            callback(res["data"]);
        }, function (err) {
            console.log("[Error][Login] Failed to get OAuthKey");
        });
}


/**
 * 从Bilibili获取OAuthKey的验证状态
 * status示例：-4(Can't scan~), -2(Can't Match oauthKey~), (Scanning) -5(Can't confirm~), (成功) {"url": "https://passport.biligame.com/crossDomain?DedeUserID=...&DedeUserID__ckMd5=...&Expires=84600&SESSDATA=...&bili_jct=...&gourl=http%3A%2F%2Fwww.bilibili.com"}
 * 
 * @param {string} oauthkey 要验证的oauthkey,
 * @param {((status: number|object)=>void)} callback callback
 */
function getLoginInfo(oauthkey: string, callback: (status: number | object) => void) {
    bilibili.jsonCallPost("https://passport.bilibili.com/qrcode/getLoginInfo", null, { "oauthKey": oauthkey },
        function (res) {
            callback(res["data"]);
        }, function (err) {
            console.log("[Error][Login] Failed to get login info");
        });
}

export function registerApis(app: express.Application) {
    app.post('/login/cookies', function (request, response) {
        let uid = request.body["DedeUserID"];
        let cookie = "DedeUserID=" + uid + "; DedeUserID__ckMd5=" + request.body["DedeUserID__ckMd5"] + "; SESSDATA=" + request.body["SESSDATA"];
        bilibili.fetchBlacklist(cookie,
            function (suc, result) {
                if (suc) {
                    let token = generateToken();
                    response.cookie("token", token);
                    response.cookie("uid", uid);
                    response.cookie("bilibili_cookies", cookie);
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
            response.json(res);
        });
    });
    app.post('/login/getinfo', function (req, response) {
        getLoginInfo(req.body["oauthkey"], function (res) {
            response.json(res);
        });
    });
}
