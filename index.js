var request = require('request');
var express = require('express');
var app = express();
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var database = require('./utils/database.js');
var bilibili = require('./utils/bilibili.js');

app.use('/', express.static(__dirname + '/www'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js'));
app.use('/js', express.static(__dirname + '/node_modules/vue/dist'));
app.use('/js', express.static(__dirname + '/node_modules/vue-resource/dist'));
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css'));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/login/cookies', function (req, res) {
    res.cookie("bilibili_cookies", "DedeUserID="+req.body["DedeUserID"]+"; DedeUserID__ckMd5="+req.body["DedeUserID__ckMd5"]+"; SESSDATA="+req.body["SESSDATA"]);
    res.redirect("/");
})
app.get('/fetch_blacklist', function (req, res) {
    bilibili.fetch_blacklist(req.cookies.bilibili_cookies,
        function(suc, res) {
            if(!suc)
            {
                console.log(res);
                res.send(res);
            }
            else res.json(res);
        }
    );
});

app.post('/add_item', function (req, res) {
    request.post(
        {
            url: 'https://api.bilibili.com/x/dm/filter/user/add',
            headers: {'Cookie': req.cookies.bilibili_cookies},
            form: {"type":req.body["type"],"filter":req.body["filter"],"jsonp":"jsonp","csrf":""}
            //type:0/1/2 filter:content jsonp:jsonp csrf:
        }, function (error, response, body) {
            if (!error && response.statusCode == 200){
                res.json(JSON.parse(body));
            }else{
                res.send("unknown error");
            }
        }
    );
})
app.post('/del_item', function (req, res) {
    request.post(
        {
            url: 'https://api.bilibili.com/x/dm/filter/user/del',
            headers: {'Cookie': req.cookies.bilibili_cookies},
            form: {"ids":req.body["ids"],"jsonp":"jsonp","csrf":""}
            //ids:889648 jsonp:jsonp csrf:
        }, function (error, response, body) {
            if (!error && response.statusCode == 200)
                res.json(JSON.parse(body));
            else
                res.send("unknown error");
        }
    );
})

var server = app.listen(8000)
