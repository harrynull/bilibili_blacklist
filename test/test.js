require("should");
var assert  = require("assert")
  , login   = require('../build/src/login.js');

describe('login', function() {
  describe('#generateToken()', function() {
    it('should return a string of number from 0-100000000000', function() {
      for(var i=0;i<200;i++){
        parseInt(login._generateToken()).should.be.within(0, 100000000000);
      }
    });
  });
});
