// Route-level tests with Bilibili stubbed out. Each block reproduces an issue found in the security review.
require("should");
var fs = require("fs"), os = require("os"), path = require("path");
var request = require("supertest");

var dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbl-api-"));
process.env.COOKIE_PATH = "/bilibili";
var db = require("../build/src/database.js");
var bilibili = require("../build/src/bilibili.js");
var login = require("../build/src/login.js");
var app = require("../build/app.js").createApp();

var USER = "uid=4242; token=probe; bilibili_cookies=SESSDATA%3Dx; csrf=c";
// every test request comes from its own client address, so the per-IP rate limits only bite in the test about them
var ipSeq = 0;
var _request = request;
request = function (app) {
    var agent = _request(app);
    ["get", "post"].forEach(function (m) {
        var orig = agent[m].bind(agent);
        agent[m] = function (url) { return orig(url).set("X-Forwarded-For", "198.51.100." + (++ipSeq % 250)); };
    });
    return agent;
};
var packId;

function stubBilibili(opts) {
    bilibili.getFilters = async function () { if (opts.filtersFail) throw new bilibili.BiliError(-101, "not logged in"); return opts.filters || []; };
    bilibili.addFilter = async function (cookie, csrf, type, filter) { (opts.added = opts.added || []).push([type, filter]); return opts.addResult ? opts.addResult(filter) : { code: 0, message: "" }; };
}

async function waitJob(agent, job) {
    for (var i = 0; i < 100; i++) {
        var r = await agent.get("/job").query({ id: job }).set("Cookie", USER);
        if (r.body.finished) return r.body;
        await new Promise(function (res) { setTimeout(res, 100); });
    }
    throw new Error("job did not finish");
}

describe("API", function () {
    this.timeout(20000);
    before(function () {
        db.useDatabase(path.join(dir, "api.db"));
        db.updateOne("users", { uid: 4242 }, { $set: { token_hash: login._hashToken("probe"), token_expires: Date.now() + 3600e3 } }, { upsert: true });
        packId = db.insertOne("sharelist", { uid: "1", name: "p", description: "", tags: ["t"], usage: 0, comments: [], "safe-level": "0",
            filters: [{ type: 0, filter: 'a</item><item enabled="true">u=evil' }, { type: 1, filter: "^x&y$" }, { type: 2, filter: "deadbeef" }] }).insertedId;
    });
    after(function () { fs.rmSync(dir, { recursive: true, force: true }); });

    describe("1. a failing Bilibili call cannot crash the server", function () {
        it("share_user_blacklist answers 502 when Bilibili rejects the cookies", async function () {
            stubBilibili({ filtersFail: true });
            var r = await request(app).post("/share_user_blacklist").set("Cookie", USER);
            r.status.should.equal(502);
            r.body.message.should.match(/B 站/);
            (await request(app).get("/tags")).status.should.equal(200);
        });
        it("and stores only user-type hashes on success", async function () {
            stubBilibili({ filters: [{ id: 1, type: 2, filter: "abc123" }, { id: 2, type: 0, filter: "text" }, { id: 3, type: 2, filter: "bad hash!" }] });
            var r = await request(app).post("/share_user_blacklist").set("Cookie", USER);
            r.body.should.eql({ code: 0, count: 1 });
            db.findOne("user_sharelist", { uid: 4242 }).data.should.eql(["abc123"]);
        });
    });

    describe("2. object-shaped input is answered, never left hanging", function () {
        it("/list?id[$ne]=x is a 404", async function () {
            (await request(app).get("/list?id%5B%24ne%5D=x").timeout(3000)).status.should.equal(404);
        });
        it("a JSON-cookie token cannot widen the login check", async function () {
            var r = await request(app).post("/comment").set("Cookie", 'uid=4242; token=j:{"$in":["probe","x"]}').send({ id: packId, content: "hi" }).timeout(3000);
            r.status.should.equal(401);
        });
        it("bodies with nested objects are rejected as bad input", async function () {
            var r = await request(app).post("/comment").set("Cookie", USER).send({ id: { $in: [packId] }, content: "hi" }).timeout(3000);
            r.status.should.equal(404);
        });
    });

    describe("3. packs: validated on submit, escaped on export, only text/regex applied", function () {
        it("export escapes XML and leaves out user entries", async function () {
            var r = await request(app).get("/export_list").query({ id: packId });
            r.body.data.should.containEql("t=a&lt;/item&gt;&lt;item enabled=&quot;true&quot;&gt;u=evil</item>");
            r.body.data.should.containEql("r=^x&amp;y$</item>");
            r.body.data.should.not.containEql("deadbeef");
        });
        it("submit rejects user-type filters, bad regexes and oversized fields", async function () {
            var base = { name: "n", tags: "a, b", "safe-level": "1" };
            var bad = [
                [{ filters: JSON.stringify([{ type: 2, filter: "deadbeef" }]) }, /文本或正则/],
                [{ filters: JSON.stringify([{ type: 1, filter: "(" }]) }, /正则/],
                [{ filters: JSON.stringify([]) }, /至少/],
                [{ filters: "not json" }, /格式/],
                [{ filters: JSON.stringify([{ type: 0, filter: "x" }]), name: "x".repeat(61) }, /名称/],
            ];
            for (var i = 0; i < bad.length; i++) {
                var r = await request(app).post("/submit").set("Cookie", USER).type("form").send(Object.assign({}, base, bad[i][0]));
                r.status.should.equal(400);
                r.body.message.should.match(bad[i][1]);
            }
        });
        it("submit stores a clean pack", async function () {
            var r = await request(app).post("/submit").set("Cookie", USER).type("form")
                .send({ name: " 新包 ", description: "d", tags: "a, b，a", "safe-level": "1", filters: JSON.stringify([{ type: 0, filter: "x" }, { type: "1", filter: "^y$" }, { type: 0, filter: "x" }]) });
            r.status.should.equal(200);
            var doc = db.findOne("sharelist", { _id: r.body.id });
            doc.name.should.equal("新包");
            doc.uid.should.equal("4242");
            doc.tags.should.eql(["a", "b"]);
            doc.filters.should.eql([{ type: 0, filter: "x" }, { type: 1, filter: "^y$" }]);
        });
        it("submit needs a login", async function () {
            (await request(app).post("/submit").type("form").send({ name: "n", filters: "[]" })).status.should.equal(401);
        });
        it("apply runs as a paced job and skips user entries", async function () {
            var stub = { addResult: function (f) { return f === "^x&y$" ? { code: 36005, message: "已存在" } : { code: 0 }; } };
            stubBilibili(stub);
            var agent = request(app);
            var r = await agent.post("/apply").set("Cookie", USER).send({ id: packId });
            r.body.total.should.equal(2);
            var st = await waitJob(agent, r.body.job);
            st.should.containEql({ total: 2, done: 2, added: 1, failed: 1, finished: true, error: "已存在" });
            st.failedItems.should.eql(["^x&y$"]);
            stub.added.map(function (a) { return a[0]; }).should.eql([0, 1]);
            db.findOne("sharelist", { _id: packId }).usage.should.be.above(0);
        });
        it("block_users validates the hashes", async function () {
            stubBilibili({});
            (await request(app).post("/block_users").set("Cookie", USER).send({ hashes: ["ok1", "<script>"] })).status.should.equal(400);
            var r = await request(app).post("/block_users").set("Cookie", USER).send({ hashes: ["ab12", "cd34"] });
            (await waitJob(request(app), r.body.job)).added.should.equal(2);
        });
        it("a job is only visible to its owner", async function () {
            stubBilibili({});
            var r = await request(app).post("/block_users").set("Cookie", USER).send({ hashes: ["ab12"] });
            (await request(app).get("/job").query({ id: r.body.job }).set("Cookie", "uid=1")).status.should.equal(404);
        });
    });

    describe("4. pages come from a fixed list", function () {
        it("query strings work", async function () {
            (await request(app).get("/user.html?from=singlemessage")).status.should.equal(200);
        });
        it("unknown names and traversal are 404", async function () {
            (await request(app).get("/nope.html")).status.should.equal(404);
            (await request(app).get("/../html/eula.html")).status.should.equal(404);
            (await request(app).get("/..%2fhtml%2feula.html")).status.should.equal(404);
        });
        it("pages link versioned assets and are not cached", async function () {
            var r = await request(app).get("/");
            r.headers["cache-control"].should.equal("no-cache");
            r.text.should.match(/js\/app\.js\?v=[0-9a-f]{10}/);
        });
    });

    describe("6. rate limits", function () {
        it("too many submits in a minute get a 429", async function () {
            var statuses = [];
            for (var i = 0; i < 8; i++) statuses.push((await request(app).post("/submit").set("X-Forwarded-For", "203.0.113.9").type("form").send({})).status);
            statuses.should.containEql(429);
        });
    });

    describe("7. security headers", function () {
        it("are sent, with HSTS only over HTTPS", async function () {
            var r = await request(app).get("/tags");
            r.headers["x-content-type-options"].should.equal("nosniff");
            r.headers["x-frame-options"].should.equal("SAMEORIGIN");
            r.headers["content-security-policy"].should.match(/frame-ancestors 'self'/);
            (r.headers["strict-transport-security"] === undefined).should.be.true();
            (r.headers["x-powered-by"] === undefined).should.be.true();
            (await request(app).get("/tags").set("X-Forwarded-Proto", "https")).headers["strict-transport-security"].should.match(/max-age/);
        });
    });

    describe("8. the old admin endpoint is gone", function () {
        it("/remove is a 404", async function () {
            (await request(app).get("/remove").set("Cookie", "uid=-1; token=x")).status.should.equal(404);
        });
    });

    describe("sessions", function () {
        it("login cookies are HttpOnly/SameSite and scoped; logout clears them", async function () {
            stubBilibili({ filters: [] });
            var r = await request(app).post("/login/cookies").set("X-Forwarded-Proto", "https").type("form")
                .send({ DedeUserID: "77", DedeUserID__ckMd5: "m", SESSDATA: "s%2C1", bili_jct: "j" });
            r.status.should.equal(200);
            var set = r.headers["set-cookie"].join("\n");
            set.should.match(/bilibili_cookies=[^;]+; Path=\/bilibili; HttpOnly; Secure; SameSite=Lax/);
            set.should.match(/uid=77; Path=\/bilibili; Secure; SameSite=Lax/);
            (await request(app).post("/logout")).headers["set-cookie"].join("\n").should.match(/bilibili_cookies=; Path=\/bilibili; Expires=Thu, 01 Jan 1970/);
        });
        it("the session token is random, stored only as a hash, and works until logout", async function () {
            stubBilibili({ filters: [] });
            var r = await request(app).post("/login/cookies").type("form").send({ DedeUserID: "78", DedeUserID__ckMd5: "m", SESSDATA: "s", bili_jct: "j" });
            var token = /(?:^|\n)token=([^;]+)/.exec(r.headers["set-cookie"].join("\n"))[1];
            token.should.match(/^[A-Za-z0-9_-]{43}$/);
            var user = db.findOne("users", { uid: 78 });
            user.token_hash.should.equal(login._hashToken(token));
            JSON.stringify(user).should.not.containEql(token);
            user.token_expires.should.be.above(Date.now() + 29 * 24 * 3600e3);
            var me = "uid=78; token=" + token;
            (await request(app).post("/comment").set("Cookie", me).send({ id: packId, content: "hi" })).status.should.equal(200);
            await request(app).post("/logout").set("Cookie", me);
            (await request(app).post("/comment").set("Cookie", me).send({ id: packId, content: "hi" })).status.should.equal(401);
        });
        it("expired and old plain-text tokens are rejected", async function () {
            db.updateOne("users", { uid: 79 }, { $set: { token_hash: login._hashToken("old"), token_expires: Date.now() - 1 } }, { upsert: true });
            db.updateOne("users", { uid: 80 }, { $set: { token: "12345" } }, { upsert: true });
            (await request(app).post("/comment").set("Cookie", "uid=79; token=old").send({ id: packId, content: "hi" })).status.should.equal(401);
            (await request(app).post("/comment").set("Cookie", "uid=80; token=12345").send({ id: packId, content: "hi" })).status.should.equal(401);
        });
        it("login rejects cookie values that would smuggle extra cookies", async function () {
            var r = await request(app).post("/login/cookies").type("form").send({ DedeUserID: "77", DedeUserID__ckMd5: "m", SESSDATA: "s; evil=1", bili_jct: "j" });
            r.status.should.equal(400);
        });
    });
});
