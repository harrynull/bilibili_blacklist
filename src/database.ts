import mongo = require('mongodb');
let DatabaseAddress = 'mongodb://localhost:27017/bilibili_blacklist';

type DatabaseCallback = ((database: Database) => void);
type OperationCallback<T> = ((result: T) => void) | null;

export class Database {

    private db: mongo.Db;

    /**
     * Creates an instance of Database and automatically connects to the server.
     * @param {DatabaseCallback} afterDoneSuccessfully It will be executed after it connected to the server successfully.
     * @memberof Database
     */
    public constructor(afterDoneSuccessfully: DatabaseCallback) {
        let _this = this;
        mongo.MongoClient.connect(DatabaseAddress, function (error, db) {
            _this.db = db;
            if (error != null) {
                console.log('[Error][DB] Connect: ' + error);
            } else if (afterDoneSuccessfully) {
                afterDoneSuccessfully(_this);
            }
        });

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
        this.db.close();
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
}

