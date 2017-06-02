var MongoClient = require('mongodb').MongoClient;
var DATABASE_ADDRESS = 'mongodb://localhost:27017/bilibili_blacklist';
exports.insert=function(db, table, data, callback) {
    var collection = db.collection(table);
    collection.insert(data, function(err, result) {
        if(err)
        {
            console.log('Error: '+ err);
            return;
        }
        callback(result);
    });
};
exports.select=function(db, table, where, callback) {
    var collection = this.db.collection(table);
    collection.find(where).toArray(function(err, result) {
        if(err)
        {
            console.log('Error:'+ err);
            return;
        }
        callback(result);
    });
};

exports.connect=function(callback){
    MongoClient.connect(DATABASE_ADDRESS, function(err, db) {
        if(err!=null) console.log(err);
        else callback(db);
    });
};
