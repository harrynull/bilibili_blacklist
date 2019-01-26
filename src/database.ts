import mongo = require('mongodb');
let DatabaseAddress = 'mongodb://localhost:27017/bilibili_blacklist';

type DatabaseCallback = ((database: Database) => void);
type OperationCallback<T> = ((result: T) => void) | null;

export class Database {

    private client!: mongo.MongoClient;
    private db!: mongo.Db;

    /**
     * Creates an instance of Database and automatically connects to the server.
     * @param {DatabaseCallback} afterDoneSuccessfully It will be executed after it connected to the server successfully.
     * @memberof Database
     */
    public constructor(afterDoneSuccessfully: DatabaseCallback) {
        let _this = this;
        (async function() {
            _this.client = await mongo.MongoClient.connect(DatabaseAddress, { useNewUrlParser: true });
            _this.db = _this.client.db();
            afterDoneSuccessfully(_this);
          })()
    }

    /**
     * Insert a document into a table.
     * 
     * @param {string} tableName the name of the table
     * @param {*} data the data you want to insert into.
     * @param {OperationCallback<mongo.InsertOneWriteOpResult>} afterDoneSuccessfully callback
     * @memberof Database
     */
    public insertOne(tableName: string, data: any, afterDoneSuccessfully: OperationCallback<mongo.InsertOneWriteOpResult>) {
        this.db.collection(tableName).insertOne(data, function (error, result) {
            if (error) {
                console.log('[Error][DB] Insert: ' + error);
            } else if (afterDoneSuccessfully) {
                afterDoneSuccessfully(result);
            }
        });
    }

    /**
     * Find a specific document in a table.
     * 
     * @param {string} tableName the name of the table 
     * @param {object} where the filter
     * @param {OperationCallback<any[]>} afterDoneSuccessfully callback
     * @memberof Database
     */
    public find(tableName: string, where: object, afterDoneSuccessfully: OperationCallback<any[]>) {
        this.db.collection(tableName).find(where).toArray(function (error, result) {
            if (error) {
                console.log('[Error][DB] Find: ' + error);
            } else if (afterDoneSuccessfully) {
                afterDoneSuccessfully(result);
            }
        });
    }

    /**
     * Update a specific document in a table
     * 
     * @param {string} tableName the name of the table 
     * @param {object} where the filter
     * @param {object} update the way you update it
     * @param {mongo.ReplaceOneOptions} options extra options
     * @param {OperationCallback<mongo.UpdateWriteOpResult>} afterDoneSuccessfully callback
     * @memberof Database
     */
    public updateOne(tableName: string, where: object, update: object, options: mongo.ReplaceOneOptions, afterDoneSuccessfully: OperationCallback<mongo.UpdateWriteOpResult>) {
        this.db.collection(tableName).updateOne(where, update, options, function (error, result) {
            if (error) {
                console.log('[Error][DB] Update: ' + error);
            } else if (afterDoneSuccessfully) {
                afterDoneSuccessfully(result);
            }
        });
    }

    /**
     * Delete a specific document in a table
     * 
     * @param {string} tableName the name of the table 
     * @param {object} where the filter
     * @param {OperationCallback<mongo.UpdateWriteOpResult>} afterDoneSuccessfully callback
     * @memberof Database
     */
    public deleteOne(tableName: string, where: object, afterDoneSuccessfully: OperationCallback<mongo.DeleteWriteOpResultObject>) {
        this.db.collection(tableName).deleteOne(where, function (error, result) {
            if (error) {
                console.log('[Error][DB] Delete: ' + error);
            } else if (afterDoneSuccessfully) {
                afterDoneSuccessfully(result);
            }
        });
    }
    /**
     * 验证用户在平台的登录状态
     * 
     * @param {string} uid user's uid
     * @param {string} token user's token
     * @param {((isLogin: boolean) => void)} callback the callback
     * @memberof Database
     */
    public verifyUser(uid: string, token: string, callback: ((isLogin: boolean) => void)) {
        this.find("users", { "uid": uid, "token": token }, function (res) {
            callback(res.length != 0);
        });
    }


    /**
     * close the connection to the server.
     * 
     * @memberof Database
     */
    public close() {
        this.client.close();
    }

    /**
     * convert a string id to Mongo Object ID
     * 
     * @static
     * @param {string} id string id
     * @returns 
     * @memberof Database
     */
    public static getID(id: string) {
        return new mongo.ObjectID(id);
    }

    public getRawDb(){ return this.db; }
}

