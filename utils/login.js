var database = require('./database.js');
var bilibili = require('./bilibili.js');

// 生成Token
// 参数：无
// 返回：String
exports.generateToken=function(){
    return ""+parseInt(Math.random()*100000000000)
}

// 储存Token
// 参数: uid(String), token(String)
// 返回：无
exports.storeToken=function(uid, token){
    database.connect(function(db){
        uid = parseInt(uid);
        database.find(db, "users", {"uid": uid}, function(res){
            var closeDatabase=function(){db.close();};
            if(res.length==0){
                database.insert(db, "users", {"uid": uid, "token": token}, closeDatabase);
            }else{
                database.updateOne(db, "users", {"uid": uid}, {$set: {"token": token}}, closeDatabase);
            }
        });
    });
}

exports.getOAuthKey=function(callback){
    bilibili.jsonCall("https://passport.bilibili.com/qrcode/getLoginUrl", null,
    function(res){
        callback(res["data"]);
    }, function(err){
        console.log("[Error][Login] Failed to get OAuthKey");
    });
}
exports.getLoginInfo=function(oauthkey, callback){
    bilibili.jsonCallPost("https://passport.bilibili.com/qrcode/getLoginInfo", null, {"oauthKey": oauthkey},
    function(res){
        callback(res["data"]);
    }, function(err){
        console.log("[Error][Login] Failed to get login info");
    });
}