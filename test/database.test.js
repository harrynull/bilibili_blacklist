require("should");
var fs = require("fs"), os = require("os"), path = require("path");

var dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbl-test-"));
process.env.SQLITE_PATH = path.join(dir, "test.db");
var database = require("../build/src/database.js");

function withDb(fn) { new database.Database(fn); }
function find(db, table, where) { var out; db.find(table, where, function (r) { out = r; }); return out; }

describe("database (sqlite)", function () {
    after(function () { fs.rmSync(dir, { recursive: true, force: true }); });

    it("inserts with an ObjectId-style _id first and finds by equality", function () {
        withDb(function (db) {
            var id;
            db.insertOne("sharelist", { uid: "42", name: "a", usage: 0, tags: ["x", "y"], comments: [] }, function (r) { id = r.insertedId; });
            id.should.match(/^[0-9a-f]{24}$/);
            var docs = find(db, "sharelist", { _id: id });
            docs.length.should.equal(1);
            Object.keys(docs[0])[0].should.equal("_id");
            docs[0].name.should.equal("a");
            find(db, "sharelist", { uid: "42" }).length.should.equal(1);
            find(db, "sharelist", { uid: 42 }).length.should.equal(0, "string and number must not match (same as MongoDB)");
        });
    });

    it("matches $in against array fields", function () {
        withDb(function (db) {
            db.insertOne("sharelist", { uid: "1", name: "b", usage: 5, tags: ["z"], comments: [] }, null);
            find(db, "sharelist", { tags: { $in: ["y"] } }).map(function (d) { return d.name; }).should.eql(["a"]);
            find(db, "sharelist", { tags: { $in: ["y", "z"] } }).length.should.equal(2);
            find(db, "sharelist", { tags: { $in: ["nope"] } }).length.should.equal(0);
        });
    });

    it("never matches undefined or NaN (missing cookies)", function () {
        withDb(function (db) {
            db.updateOne("users", { uid: 7 }, { $set: { token: "t" } }, { upsert: true }, null);
            find(db, "users", { uid: NaN, token: undefined }).length.should.equal(0);
            find(db, "users", { uid: 7, token: "t" }).length.should.equal(1);
        });
    });

    it("supports $set, $inc, $push and $addToSet/$each, with upsert", function () {
        withDb(function (db) {
            var id = find(db, "sharelist", { name: "a" })[0]._id;
            db.updateOne("sharelist", { _id: id }, { $inc: { usage: 1 } }, {}, null);
            db.updateOne("sharelist", { _id: id }, { $push: { comments: { uid: 1, content: "hi", like: true } } }, {}, null);
            var doc = find(db, "sharelist", { _id: id })[0];
            doc.usage.should.equal(1);
            doc.comments.should.eql([{ uid: 1, content: "hi", like: true }]);

            db.updateOne("tags", { name: "tags" }, { $addToSet: { tags: { $each: ["x", "y"] } } }, { upsert: true }, null);
            db.updateOne("tags", { name: "tags" }, { $addToSet: { tags: { $each: ["y", "z"] } } }, { upsert: true }, null);
            var tags = find(db, "tags", { name: "tags" });
            tags.length.should.equal(1);
            tags[0].tags.should.eql(["x", "y", "z"]);
            Object.keys(tags[0]).should.eql(["_id", "name", "tags"]);

            db.updateOne("user_sharelist", { uid: 3 }, { $set: { data: ["1"] } }, { upsert: true }, null);
            db.updateOne("user_sharelist", { uid: 3 }, { $set: { data: ["1", "2"] } }, { upsert: true }, null);
            var us = find(db, "user_sharelist", { uid: 3 });
            us.length.should.equal(1);
            us[0].data.should.eql(["1", "2"]);
        });
    });

    it("pages with sort, _id tie-break and total count", function () {
        withDb(function (db) {
            db.insertOne("sharelist", { uid: "1", name: "c", usage: 5, tags: ["z"], comments: [] }, null);
            var page;
            db.findPage("sharelist", {}, "usage", "desc", 0, 2, function (r) { page = r; });
            page.total.should.equal(3);
            page.data.map(function (d) { return d.name; }).should.eql(["b", "c"], "ties broken by creation order");
            db.findPage("sharelist", {}, "usage", "desc", 2, 2, function (r) { page = r; });
            page.data.map(function (d) { return d.name; }).should.eql(["a"]);
            db.findPage("sharelist", { tags: { $in: ["z"] } }, "usage", "asc", 0, 20, function (r) { page = r; });
            page.total.should.equal(2);
            db.findPage("sharelist", {}, "bad field; drop table", "desc", 0, 20, function (r) { page = r; });
            page.data.map(function (d) { return d.name; }).should.eql(["a", "b", "c"], "invalid sort fields are ignored");
        });
    });

    it("deletes one document and rejects unsupported operators", function () {
        withDb(function (db) {
            var id = find(db, "sharelist", { name: "c" })[0]._id;
            var res;
            db.deleteOne("sharelist", { _id: id }, function (r) { res = r; });
            res.deletedCount.should.equal(1);
            find(db, "sharelist", {}).length.should.equal(2);
            var called = false;
            db.find("sharelist", { usage: { $gt: 1 } }, function () { called = true; });
            called.should.equal(false, "unsupported filters log an error instead of returning wrong results");
        });
    });
});
