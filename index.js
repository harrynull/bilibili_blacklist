var request = require('request');
var express = require('express');
var app = express();
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var database = require('./utils/database.js');
var bilibili = require('./utils/bilibili.js');
var login = require('./utils/login.js');

app.use('/', express.static(__dirname + '/www'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js'));
app.use('/js', express.static(__dirname + '/node_modules/vue/dist'));
app.use('/js', express.static(__dirname + '/node_modules/vue-resource/dist'));
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist'));
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css'));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/login/cookies', function (req, response) {
    var uid=req.body["DedeUserID"];
    var cookie="DedeUserID="+uid+"; DedeUserID__ckMd5="+req.body["DedeUserID__ckMd5"]+"; SESSDATA="+req.body["SESSDATA"];
    bilibili.fetch_blacklist(cookie,
        function(suc, result) {
            if(suc){
                var token = login.generateToken();
                response.cookie("token", token);
                response.cookie("uid", uid);
                response.cookie("bilibili_cookies", cookie);
                response.redirect("../index.html");
                login.storeToken(uid, token);
            }else{
                response.json(result);
            }
        }
    );
});
app.get('/login/getoauth', function (req, response) {
    login.getOAuthKey(function(res){
        response.json(res);
    });
});
app.post('/login/getinfo', function (req, response) {
    login.getLoginInfo(req.body["oauthkey"], function(res){
        response.json(res);
    });
});
app.get('/fetch_blacklist', function (req, response) {
    bilibili.fetch_blacklist(req.cookies.bilibili_cookies,
        function(suc, res) {
            response.json(res);
        }
    );
});
app.get('/fetch_sharelist', function (req, response) {
    database.connect(function(db){
        database.find(db, "sharelist", {}, function(res){
            response.json(res);
            db.close();
        });
    });
});
app.get('/view/:id', function (req, response) {
    database.connect(function(db){
        database.find(db, "sharelist", {"_id": database.ObjectId(req.params.id)}, function(res){
            response.json(res);
            db.close();
        });
    });
});
app.post('/apply', function (req, response) {
    var query={"_id": database.ObjectId(req.body["id"])};
    database.connect(function(db){
        database.find(db, "sharelist", query, function(res){
            if(res.length==0){
                response.json({"code":-1, "message":"invalid id"});
                db.close();
                return;
            }
            for(var id in res[0]["filters"]){
                bilibili.add_filter(req.cookies.bilibili_cookies, res[0]["filters"][id].type, res[0]["filters"][id].filter, null);
            }
            database.update(db, "sharelist", query, {$inc: {"usage": 1}}, function(){db.close()});
            response.json({"code":0, "message":"success"});
        });
    });
});
app.get('/upvote/:id', function (req, response) {
    var query={"_id": database.ObjectId(req.params.id)};
    database.connect(function(db){
        database.find(db, "sharelist", query, function(res){
            database.update(db, "sharelist", query, {$inc: {"vote": 1}}, function(){db.close()});
            //response.json({"code":0, "message":"success"});
            response.redirect("../index.html");
        });
    });
});
app.post('/comment', function (req, response) {
    database.connect(function(db){
        var closeDB=function(){db.close();};
        var uid=parseInt(req.cookies.uid);
        database.find(db, "users", {"uid": uid, "token": req.cookies.token},function(res){
            if(res.length==0) {
                response.json({"code":-1, "message":"User Not Login"});
                closeDB();
                return;
            }
            var query={"_id": database.ObjectId(req.body["id"])};
            database.find(db, "sharelist", query, function(res){
                var newComment={"uid":uid, "content":req.body["content"]};
                database.update(db, "sharelist", query, {$push: {"comments": newComment}}, closeDB);
                response.json({"code":0, "message":"success"});
            });
        });
    });
});
app.post('/submit', function (req, response) {
    database.connect(function(db){
        var closeDB=function(){db.close();};
        database.find(db, "users", {"uid": parseInt(req.cookies.uid), "token": req.cookies.token},function(res){
            if(res.length==0) {
                response.json({"code":-1, "message":"User Not Login"});
                closeDB();
                return;
            }
            var jsonFilters;
            try{jsonFilters=JSON.parse(req.body["filters"]);}
            catch(exp){closeDB();response.json({"code":-2, "message":"Invalid Input!"});return;}
            database.insert(db, "sharelist",
                {
                    "uid": req.cookies.uid,
                    "name": req.body["name"],
                    "description": req.body["description"],
                    "filters": jsonFilters,
                    "time": new Date().getTime(),
                    "vote": 0,
                    "usage": 0,
                    "comments": []
                }, function(){
                    //response.json({"code":0, "message":"success"});
                    response.redirect("index.html");
                    closeDB();
                }
            );
        });
    });
});
app.post('/add_item', function (req, response) {
    bilibili.add_filter(req.cookies.bilibili_cookies, req.body["type"], req.body["filter"], function(suc, result){
        //response.json(result);
        response.redirect("index.html");
    });
})
app.post('/del_item', function (req, response) {
    bilibili.jsonCallPost('https://api.bilibili.com/x/dm/filter/user/del', req.cookies.bilibili_cookies,
        {"ids":req.body["ids"],"jsonp":"jsonp","csrf":""},
        function(res){
            response.json(res);
        },
        function(err){
            response.send(err);
        }
    );
})

var server = app.listen(8000)
console.log("Server started.")
