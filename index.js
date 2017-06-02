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
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css'));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/login/cookies', function (req, response) {
    var cookie="DedeUserID="+req.body["DedeUserID"]+"; DedeUserID__ckMd5="+req.body["DedeUserID__ckMd5"]+"; SESSDATA="+req.body["SESSDATA"];
    bilibili.fetch_blacklist(cookie,
        function(suc, result) {
            if(suc){
                var token = login.generateToken();
                response.cookie("token", token);
                response.cookie("bilibili_cookies", cookie);
                response.redirect("/");
                login.storeToken(req.body["DedeUserID"], token);
            }else{
                response.json(result);
            }
        }
    );
})
app.get('/fetch_blacklist', function (req, response) {
    bilibili.fetch_blacklist(req.cookies.bilibili_cookies,
        function(suc, res) {
            response.json(res);
        }
    );
});

app.post('/add_item', function (req, response) {
    bilibili.jsonCallPost('https://api.bilibili.com/x/dm/filter/user/add', req.cookies.bilibili_cookies,
        {"type":req.body["type"],"filter":req.body["filter"],"jsonp":"jsonp","csrf":""},
        function(res){
            response.json(res);
        },
        function(err){
            response.send(err);
        }
    );
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
