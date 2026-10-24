import request = require('request');
import express = require('express');
import cookieParser = require('cookie-parser');
import bodyParser = require('body-parser');
import crypto = require('crypto');
import fs = require('fs');

import bilibili = require('./src/bilibili');
import login = require('./src/login');
import website = require('./src/website_apis')

var app = express();
app.set('view engine', 'ejs');

let RootDir = __dirname + "/.."

// a content hash appended to the CSS/JS links, so a deploy always reaches browsers instead of a cached copy
function assetVersion(): string {
    try {
        const hash = crypto.createHash('md5');
        for (const file of ['/html/css/app.css', '/html/js/app.js']) hash.update(fs.readFileSync(RootDir + file));
        return hash.digest('hex').slice(0, 10);
    } catch (e) { return String(Date.now()); }
}
app.locals.assetVersion = assetVersion();

app.use('/', express.static(RootDir + '/html'));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', function (req, res) {
    res.set('Cache-Control', 'no-cache');
    res.render(RootDir + '/html/index.html.ejs');
});
app.get('*.html', function (req, res) {
    res.render(RootDir + '/html' + req.url + ".ejs", function (err: Error, html: string) {
        if (!err) { res.set('Cache-Control', 'no-cache'); res.send(html); }
        else {res.status(404); res.send("Page Not Found."); }
    });
});

login.registerApis(app);
bilibili.registerApis(app);
website.registerApis(app);

var server = app.listen(8000, process.env.HOST || "0.0.0.0")
console.log("Server started.")
