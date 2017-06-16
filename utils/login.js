var database = require('./database.js');
var bilibili = require('./bilibili.js');

// 验证用户在平台的登录状态
// 参数: db: Database, uid: Int, token: String, callback: function(isLogin: bool)
exports.verifyUser=function(db, uid, token, callback){
    database.find(db, "users", {"uid": uid, "token": token}, function(res){
        callback(res.length!=0);
    });
}

// 生成Token
// 参数：无
// 返回：token: String
exports.generateToken=function(){
    return ""+parseInt(Math.random()*100000000000)
}

// 修改数据库中的Token
// 参数: uid(String), token(String)
exports.storeToken=function(uid, token){
    database.connect(function(db){
        database.updateOne(db, "users", {uid: parseInt(uid)}, 
            {$set: {token: token}}, {upsert: true, safe: true}, function(){db.close();});
    });
}

// 从Bilibili获取OAuthKey
// 输入：callback: function(OAuthKey: String)
// OAuthKey示例: {"data":{"url":"https://passport.bilibili.com/qrcode/h5/login?oauthKey=...","oauthKey":"..."}}
exports.getOAuthKey=function(callback){
    bilibili.jsonCall("https://passport.bilibili.com/qrcode/getLoginUrl", null,
    function(res){
        callback(res["data"]);
    }, function(err){
        console.log("[Error][Login] Failed to get OAuthKey");
    });
}

// 从Bilibili获取OAuthKey的验证状态
// 输入：oauthkey: 要验证的oauthkey, callback: function(status: Int/Object)
// status示例：-4(Can't scan~), -2(Can't Match oauthKey~), (Scanning) -5(Can't confirm~), (Success) {"url": "https://passport.biligame.com/crossDomain?DedeUserID=...&DedeUserID__ckMd5=...&Expires=84600&SESSDATA=...&bili_jct=...&gourl=http%3A%2F%2Fwww.bilibili.com"}
exports.getLoginInfo=function(oauthkey, callback){
    bilibili.jsonCallPost("https://passport.bilibili.com/qrcode/getLoginInfo", null, {"oauthKey": oauthkey},
    function(res){
        callback(res["data"]);
    }, function(err){
        console.log("[Error][Login] Failed to get login info");
    });
}