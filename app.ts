import request = require('request');
import express = require('express');
import cookieParser = require('cookie-parser');
import bodyParser = require('body-parser');

import bilibili = require('./src/bilibili');
import login = require('./src/login');
import website = require('./src/website_apis');

var app = express();
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

login.registerApis(app);
bilibili.registerApis(app);
website.registerApis(app);

login.registerApis(app);
bilibili.registerApis(app);
website.registerApis(app);

var server = app.listen(8000, "localhost")
console.log("Server started.")
