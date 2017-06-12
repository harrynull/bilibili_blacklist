var mongodb = require('mongodb');
exports.ObjectId = mongodb.ObjectId;
var MongoClient = mongodb.MongoClient;
var DATABASE_ADDRESS = 'mongodb://localhost:27017/bilibili_blacklist';
exports.insert=function(db, table, data, callback) {
    var collection = db.collection(table);
    collection.insert(data, function(err, result) {
        if(err)
        {
            console.log('[Error][DB] Insert: '+ err);
            return;
        }
        if(callback) callback(result);
    });
};
exports.find=function(db, table, where, callback) {
    var collection = db.collection(table);
    collection.find(where).toArray(function(err, result) {
        if(err)
        {
            console.log('[Error][DB] Find: '+ err);
            return;
        }
        if(callback) callback(result);
    });
};
exports.updateOne=function(db, table, where, value, options, callback) {
    var collection = db.collection(table);
    collection.updateOne(where, value, options, function(err, result) {
        if(err)
        {
            console.log('[Error][DB] Update: '+ err);
            return;
        }
        if(callback) callback(result);
    });
};

exports.connect=function(callback){
    MongoClient.connect(DATABASE_ADDRESS, function(err, db) {
        if(err!=null) console.log(err);
        else callback(db);
    });
};
