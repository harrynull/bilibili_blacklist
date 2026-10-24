require("should");
var fs = require("fs"), os = require("os"), path = require("path");

var dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbl-test-"));
var db = require("../build/src/database.js");

describe("database (sqlite)", function () {
    before(function () { db.useDatabase(path.join(dir, "test.db")); });
    after(function () { fs.rmSync(dir, { recursive: true, force: true }); });

    it("inserts with an ObjectId-style _id first and finds by equality", function () {
        var id = db.insertOne("sharelist", { uid: "42", name: "a", usage: 0, tags: ["x", "y"], comments: [] }).insertedId;
        id.should.match(/^[0-9a-f]{24}$/);
        var docs = db.find("sharelist", { _id: id });
        docs.length.should.equal(1);
        Object.keys(docs[0])[0].should.equal("_id");
        docs[0].name.should.equal("a");
        db.find("sharelist", { uid: "42" }).length.should.equal(1);
        db.find("sharelist", { uid: 42 }).length.should.equal(0, "string and number must not match (same as MongoDB)");
        db.findOne("sharelist", { uid: "42" }).name.should.equal("a");
        (db.findOne("sharelist", { uid: "nope" }) === null).should.be.true();
    });

    it("matches $in against array fields", function () {
        db.insertOne("sharelist", { uid: "1", name: "b", usage: 5, tags: ["z"], comments: [] });
        db.find("sharelist", { tags: { $in: ["y"] } }).map(function (d) { return d.name; }).should.eql(["a"]);
        db.find("sharelist", { tags: { $in: ["y", "z"] } }).length.should.equal(2);
        db.find("sharelist", { tags: { $in: ["nope"] } }).length.should.equal(0);
    });

    it("never matches undefined or NaN (missing cookies)", function () {
        db.updateOne("users", { uid: 7 }, { $set: { token: "t" } }, { upsert: true });
        db.find("users", { uid: NaN, token: undefined }).length.should.equal(0);
        db.find("users", { uid: 7, token: "t" }).length.should.equal(1);
    });

    it("supports $set, $inc, $push and $addToSet/$each, with upsert", function () {
        var id = db.find("sharelist", { name: "a" })[0]._id;
        db.updateOne("sharelist", { _id: id }, { $inc: { usage: 1 } });
        db.updateOne("sharelist", { _id: id }, { $push: { comments: { uid: 1, content: "hi", like: true } } });
        var doc = db.find("sharelist", { _id: id })[0];
        doc.usage.should.equal(1);
        doc.comments.should.eql([{ uid: 1, content: "hi", like: true }]);

        db.updateOne("tags", { name: "tags" }, { $addToSet: { tags: { $each: ["x", "y"] } } }, { upsert: true });
        db.updateOne("tags", { name: "tags" }, { $addToSet: { tags: { $each: ["y", "z"] } } }, { upsert: true });
        var tags = db.find("tags", { name: "tags" });
        tags.length.should.equal(1);
        tags[0].tags.should.eql(["x", "y", "z"]);
        Object.keys(tags[0]).should.eql(["_id", "name", "tags"]);

        db.updateOne("user_sharelist", { uid: 3 }, { $set: { data: ["1"] } }, { upsert: true });
        db.updateOne("user_sharelist", { uid: 3 }, { $set: { data: ["1", "2"] } }, { upsert: true });
        var us = db.find("user_sharelist", { uid: 3 });
        us.length.should.equal(1);
        us[0].data.should.eql(["1", "2"]);
    });

    it("pages with sort, _id tie-break and total count", function () {
        db.insertOne("sharelist", { uid: "1", name: "c", usage: 5, tags: ["z"], comments: [] });
        var page = db.findPage("sharelist", {}, "usage", "desc", 0, 2);
        page.total.should.equal(3);
        page.data.map(function (d) { return d.name; }).should.eql(["b", "c"], "ties broken by creation order");
        db.findPage("sharelist", {}, "usage", "desc", 2, 2).data.map(function (d) { return d.name; }).should.eql(["a"]);
        db.findPage("sharelist", { tags: { $in: ["z"] } }, "usage", "asc", 0, 20).total.should.equal(2);
        db.findPage("sharelist", {}, "bad field; drop table", "desc", 0, 20).data.map(function (d) { return d.name; })
            .should.eql(["a", "b", "c"], "invalid sort fields are ignored");
    });

    it("deletes one document", function () {
        var id = db.find("sharelist", { name: "c" })[0]._id;
        db.deleteOne("sharelist", { _id: id }).deletedCount.should.equal(1);
        db.find("sharelist", {}).length.should.equal(2);
    });

    it("throws (instead of hanging or matching) on unsupported operators and object values", function () {
        (function () { db.find("sharelist", { usage: { $gt: 1 } }); }).should.throw(/unsupported filter/);
        (function () { db.find("users", { token: { $ne: "" } }); }).should.throw(/unsupported filter/);
        (function () { db.find("sharelist", { _id: { a: 1, b: 2 } }); }).should.throw(/unsupported filter/);
        (function () { db.find("users", { token: ["a"] }); }).should.throw(/unsupported/);
        (function () { db.find("sharelist", { tags: { $in: [{ $ne: 1 }] } }); }).should.throw(/unsupported filter value/);
    });
});
