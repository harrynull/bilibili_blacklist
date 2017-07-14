var database = require('./utils/database.js');
database.connect(function (db) {
    database.find(db, "sharelist", {}, function (res) {
        for (let item of res) {
            console.log("process " + item)
            let filters = item.filters;
            var new_filters = []
            for(let i of filters){
                if(i.type==2) continue
                for(let j of new_filters){
                    if(j.filter==i.filter) continue
                }
                new_filters.push(i)
            }
            console.log(new_filters)
            console.log("process done " + item)

            database.updateOne(db, "sharelist", {_id:item._id}, { $set: { "filters": new_filters } }, {}, null);
        }
    });
});