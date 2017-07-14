require("should");
var request = require('supertest')
  , app     = require('../build/app.js').app
  , assert  = require("assert")
  , login   = require('../build/src/login.js');

describe('login', function() {
  describe('#generateToken()', function() {
    it('should return a string of number from 0-100000000000', function() {
      for(var i=0;i<100;i++){
        parseInt(login.generateToken()).should.be.within(0, 100000000000);
      }
    });
  });
});
