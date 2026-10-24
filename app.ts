import express = require('express');
import cookieParser = require('cookie-parser');
import crypto = require('crypto');
import fs = require('fs');

import http = require('./src/http');
import bilibili = require('./src/bilibili');
import login = require('./src/login');
import website = require('./src/website_apis');

const RootDir = __dirname + "/..";
const PAGES = ["index", "user", "submit", "login", "eula", "licenses"];   // html/<page>.html.ejs

// a content hash appended to the CSS/JS links, so a deploy always reaches browsers instead of a cached copy
function assetVersion(): string {
    try {
        const hash = crypto.createHash('md5');
        for (const file of ['/html/css/app.css', '/html/js/app.js']) hash.update(fs.readFileSync(RootDir + file));
        return hash.digest('hex').slice(0, 10);
    } catch (e) { return String(Date.now()); }
}

export function createApp(): express.Application {
    const app = express();
    app.set('view engine', 'ejs');
    app.disable('x-powered-by');
    // behind Caddy: trust X-Forwarded-* from the local/private network, so req.secure and req.ip reflect the visitor
    app.set('trust proxy', 'loopback, linklocal, uniquelocal');
    app.locals.assetVersion = assetVersion();

    app.use(http.securityHeaders);
    app.use('/', express.static(RootDir + '/html', { index: false }));
    app.use(cookieParser());
    app.use(login.upgradeSessionCookies);
    app.use(express.json({ limit: '2mb' }));                       // a pack with 2000 long filters fits
    app.use(express.urlencoded({ extended: false, limit: '2mb' }));  // flat fields only: no ?a[b]=c objects

    // pages: only the known templates, looked up by name (never built from the raw URL; query strings are fine)
    function page(name: string, res: express.Response) {
        res.set('Cache-Control', 'no-cache');
        res.render(RootDir + '/html/' + name + '.html.ejs');
    }
    app.get('/', (req, res) => page('index', res));
    app.get(/^\/([a-z]+)\.html$/, (req, res, next) => {
        const name = req.params[0];
        if (PAGES.indexOf(name) < 0) return next();
        page(name, res);
    });

    login.registerApis(app);
    bilibili.registerApis(app);
    website.registerApis(app);

    app.use((req, res) => { res.status(404).type('text').send('Page Not Found.'); });
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (err && err.type === 'entity.too.large') { res.status(413).json({ code: -1, message: '内容太长了' }); return; }
        if (err && err.type === 'entity.parse.failed') { res.status(400).json({ code: -1, message: '请求格式不对' }); return; }
        http.sendError(res, err, req);
    });
    return app;
}

// one bad request must never take the process down; log and keep serving
process.on('unhandledRejection', err => console.log('[Error] unhandled rejection: ' + (err instanceof Error ? err.stack : err)));
process.on('uncaughtException', err => console.log('[Error] uncaught exception: ' + err.stack));

if (require.main === module) {
    createApp().listen(8000, process.env.HOST || "0.0.0.0");
    console.log("Server started.");
}
