require("should");
var login = require('../build/src/login.js');

describe('login', function() {
  describe('#generateToken()', function() {
    it('returns 256-bit URL-safe random tokens that do not repeat', function() {
      var seen = new Set();
      for (var i = 0; i < 200; i++) {
        var t = login._generateToken();
        t.should.match(/^[A-Za-z0-9_-]{43}$/);
        seen.add(t);
      }
      seen.size.should.equal(200);
    });
  });
});
