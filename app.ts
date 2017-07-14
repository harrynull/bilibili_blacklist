import request = require('request');
import express = require('express');
var app = express();
import cookieParser = require('cookie-parser');
import bodyParser = require('body-parser');

import database = require('./src/database');
import bilibili = require('./src/bilibili');
import login = require('./src/login');
import interfaces = require('./src/interface');

app.set('view engine', 'ejs');

let RootDir = __dirname + "/.."
app.use('/', express.static(RootDir + '/html'));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', function (req, res) {
    res.render(RootDir + '/html/index.html.ejs');
});
app.get('*.html', function (req, res) {
    res.render(RootDir + '/html' + req.url + ".ejs", function (err: Error, html: string) {
        if(!err) res.send(html);
        else {res.status(404); res.send("Page Not Found."); }
    });
});

app.post('/login/cookies', function (request, response) {
    let uid = request.body["DedeUserID"];
    let cookie = "DedeUserID=" + uid + "; DedeUserID__ckMd5=" + request.body["DedeUserID__ckMd5"] + "; SESSDATA=" + request.body["SESSDATA"];
    bilibili.fetchBlacklist(cookie,
        function (suc, result) {
            if (suc) {
                let token = login.generateToken();
                response.cookie("token", token);
                response.cookie("uid", uid);
                response.cookie("bilibili_cookies", cookie);
                response.redirect("../index.html");
                login.storeToken(uid, token);
            } else {
                response.json(result);
            }
        }
    );
});
app.get('/login/getoauth', function (req, response) {
    login.getOAuthKey(function (res) {
        response.json(res);
    });
});
app.post('/login/getinfo', function (req, response) {
    login.getLoginInfo(req.body["oauthkey"], function (res) {
        response.json(res);
    });
});

app.get('/fetch_blacklist', function (req, response) {
    bilibili.fetchBlacklist(req.cookies.bilibili_cookies,
        function (suc, res) {
            response.json(res);
        }
    );
});
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
                response.json({ "code": -1, "message": "User Not Login" });
                closeDB();
                return;
            }
            var jsonFilters;
            try { jsonFilters = JSON.parse(req.body["filters"]); }
            catch (exp) { closeDB(); response.json({ "code": -2, "message": "Invalid Input!" }); return; }
            db.insertOne("sharelist",
                {
                    "uid": req.cookies.uid,
                    "name": req.body["name"],
                    "description": req.body["description"],
                    "filters": jsonFilters,
                    "time": new Date().getTime(),
                    "vote": 0,
                    "usage": 0,
                    "comments": []
                }, function () {
                    //response.json({"code":0, "message":"success"});
                    response.redirect("index.html");
                    closeDB();
                }
            );
        });
    });
});
app.post('/add_item', function (req, response) {
    bilibili.addFilter(req.cookies.bilibili_cookies, req.body["type"], req.body["filter"], function (suc, result) {
        //response.json(result);
        response.redirect("index.html");
    });
})
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

    }
    );
})

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

})
var server = app.listen(8000)
console.log("Server started.")
