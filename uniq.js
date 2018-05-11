var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var DATABASE_ADDRESS = 'mongodb://localhost:27017/bilibili_blacklist';
find=function(db, table, where, callback) {
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
updateOne=function(db, table, where, value, options, callback) {
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
connect=function(callback){
    MongoClient.connect(DATABASE_ADDRESS, function(err, db) {
        if(err!=null) console.log(err);
        else callback(db);
    });
};
connect(function (db) {
    find(db, "sharelist", {}, function (res) {
        for (let item of res) {
            console.log("process " + item)
            let filters = item.filters;
            var new_filters = []
            for(let i of filters){
                if(i.type==2) continue
		skip = false
                for(let j of new_filters){
                    if(j.filter==i.filter){skip=true;break;} 
                }
		if(skip) continue
                new_filters.push(i)
            }
            console.log("process done " + item)

            updateOne(db, "sharelist", {_id:item._id}, { $set: { "filters": new_filters } }, {}, null);
        }
    });
});
