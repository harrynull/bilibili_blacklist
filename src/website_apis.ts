import express = require('express');

import database = require('./database');
import bilibili = require('./bilibili');
import interfaces = require('./interface');

export function registerApis(app: express.Application) {
    app.get('/fetch_sharelist', function (req, response) {
        new database.Database(function (db) {
            db.find("sharelist", {}, function (res) {
                response.json(res);
                db.close();
            });
        });
    });
    app.post('/apply', function (req, response) {
        var query = { "_id": database.Database.getID(req.body["id"]) };
        new database.Database(function (db) {
            db.find("sharelist", query, function (res) {
                if (res.length == 0) {
                    response.json({ "code": -1, "message": "invalid id" });
                    db.close();
                    return;
                }
                for (var id in res[0]["filters"]) {
                    bilibili.addFilter(req.cookies.bilibili_cookies, res[0]["filters"][id].type, res[0]["filters"][id].filter, null);
                }
                db.updateOne("sharelist", query, { $inc: { "usage": 1 } }, {}, function () { db.close() });
                response.json({ "code": 0, "message": "success" });
            });
        });
    });
    app.get('/upvote/:id', function (req, response) {
        var query = { "_id": database.Database.getID(req.params.id) };
        new database.Database(function (db) {
            db.find("sharelist", query, function (res) {
                db.updateOne("sharelist", query, { $inc: { "vote": 1 } }, {}, function () { db.close() });
                //response.json({"code":0, "message":"success"});
                response.redirect("../index.html");
            });
        });
    });
    app.post('/comment', function (req, response) {
        new database.Database(function (db) {
            var closeDB = function () { db.close(); };
            var uid = parseInt(req.cookies.uid);
            db.find("users", { "uid": uid, "token": req.cookies.token }, function (res) {
                if (res.length == 0) {
                    response.json({ "code": -1, "message": "User Not Login" });
                    closeDB();
                    return;
                }
                var query = { "_id": database.Database.getID(req.body["id"]) };
                db.find("sharelist", query, function (res) {
                    var newComment = { "uid": uid, "content": req.body["content"] };
                    db.updateOne("sharelist", query, { $push: { "comments": newComment } }, {}, closeDB);
                    response.json({ "code": 0, "message": "success" });
                });
            });
        });
    });
    app.post('/submit', function (req, response) {
        new database.Database(function (db) {
            var closeDB = function () { db.close(); };
            db.find("users", { "uid": parseInt(req.cookies.uid), "token": req.cookies.token }, function (res) {
                if (res.length == 0) {
                    closeDB();
                    response.json({ "code": -1, "message": "User Not Login" });
                    return;
                }
                var jsonFilters: object;
                try { jsonFilters = JSON.parse(req.body["filters"]); }
                catch (exp) { closeDB(); response.json({ "code": -2, "message": "Invalid Input!" }); return; }
                let tags = req.body["tags"].split(", ");
                db.insertOne("sharelist",
                    {
                        "uid": req.cookies.uid,
                        "name": req.body["name"],
                        "description": req.body["description"],
                        "filters": jsonFilters,
                        "time": new Date().getTime(),
                        "tags": tags,
                        "usage": 0,
                        "comments": []
                    }, function () {
                        response.redirect("index.html");
                        db.updateOne("tags", { name: "tags" }, { $addToSet: { tags: {$each: tags} } }, { upsert: true }, closeDB);
                    }
                );
            });
        });
    });

    app.post('/del_item', function (req, response) {
        bilibili.jsonCallPost('https://api.bilibili.com/x/dm/filter/user/del', req.cookies.bilibili_cookies,
            { "ids": req.body["ids"], "jsonp": "jsonp", "csrf": "" },
            function (res) {
                response.json(res);
            },
            function (err) {
                response.send(err);
            }
        );
    })
    app.post('/share_user_blacklist', function (req, response) {
        bilibili.fetchBlacklist(req.cookies.bilibili_cookies, function (suc, res) {
            new database.Database(function (db) {
                db.find("users", { "uid": parseInt(req.cookies.uid), "token": req.cookies.token }, function (r) {
                    if (r.length == 0) {
                        response.json({ "code": -1, "message": "User Not Login" });
                        db.close();
                        return;
                    }
                    let filtered_uids = [];
                    for (let i of res) {
                        if (i.type == 2) filtered_uids.push(i.filter);
                    }

                    db.updateOne("user_sharelist", { uid: parseInt(req.cookies.uid) }, { $set: { data: filtered_uids } }, { upsert: true }, function (res) {
                        //response.json({code:0, message:"success"});
                        response.redirect("user.html");
                        db.close();
                    });
                });
            });

        });
    });

    app.get('/fetch_user_sharelist', function (req, response) {
        new database.Database(function (db) {
            db.find("user_sharelist", {}, function (res) {
                var user_blacklist: interfaces.UserBlacklist = {}
                for (let item of res) {
                    for (let uid of item.data) {
                        user_blacklist[uid] = user_blacklist[uid] ? user_blacklist[uid] + 1 : 1;
                    }
                }
                var user_blacklist_arr: interfaces.UserBlacklistItem[] = []
                for (let key in user_blacklist) user_blacklist_arr.push({ uid: key, num: user_blacklist[key] });
                response.json(user_blacklist_arr);
                db.close();
            });
        });
    });

    app.get('/tags', function (req, response) {
        new database.Database(function (db) {
            db.find("tags", { name: "tags" }, function (res) {
                if (res) response.json(res[0].tags);
                db.close();
            });
        });
    });
}
