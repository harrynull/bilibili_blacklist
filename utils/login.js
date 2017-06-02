var database = require('./database.js');

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
        var uid = parseInt(uid);
        database.find(db, "users", {"uid": uid}, function(res){
            var closeDatabase=function(){db.close();};
            if(res.length==0){
                database.insert(db, "users", {"uid": uid, "token": token}, closeDatabase);
            }else{
                database.update(db, "users", {"uid": uid}, {$set: {"token": token}}, closeDatabase);
            }
        });
    });
}