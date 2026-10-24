require("should");
var login = require("../build/src/login.js");

describe("QR login cookie extraction", function () {
    var url = "https://passport.biligame.com/x/passport-login/web/crossDomain?DedeUserID=123&DedeUserID__ckMd5=abc&Expires=1&SESSDATA=s%2C1%2Cx&bili_jct=j99&gourl=https%3A%2F%2Fwww.bilibili.com";

    it("prefers Set-Cookie headers and keeps values encoded", function () {
        var c = login.extractLoginCookies("", [
            "SESSDATA=from%2Cheader; Path=/; Domain=bilibili.com; HttpOnly",
            "bili_jct=jh; Path=/", "DedeUserID=7; Path=/", "DedeUserID__ckMd5=m; Path=/", "sid=zzz; Path=/"]);
        c.should.eql({ SESSDATA: "from%2Cheader", bili_jct: "jh", DedeUserID: "7", DedeUserID__ckMd5: "m" });
    });

    it("falls back to the crossDomain URL", function () {
        login.extractLoginCookies(url, undefined).should.eql({ DedeUserID: "123", DedeUserID__ckMd5: "abc", SESSDATA: "s%2C1%2Cx", bili_jct: "j99" });
    });

    it("works when bili_jct is the last parameter (the old page regex did not)", function () {
        login.extractLoginCookies("https://x/?DedeUserID=1&DedeUserID__ckMd5=2&SESSDATA=3&bili_jct=4", []).bili_jct.should.equal("4");
    });

    it("merges both sources and reports what is missing by leaving it out", function () {
        var c = login.extractLoginCookies("https://x/?DedeUserID=1", ["SESSDATA=s"]);
        c.should.eql({ SESSDATA: "s", DedeUserID: "1" });
    });
});
