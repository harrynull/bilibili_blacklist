import sqlite = require('node:sqlite');
import crypto = require('crypto');

/**
 * SQLite-backed document store with the same small API the app used with MongoDB.
 *
 * Every collection is a table `(id TEXT PRIMARY KEY, doc TEXT)` where `doc` is the document serialized as
 * JSON (including `_id`), so API responses are byte-identical to what MongoDB returned. Only the query and
 * update operators this app uses are supported; anything else throws instead of silently doing the wrong thing.
 * Every function is synchronous (node:sqlite is) and throws on error, so a route either answers or fails with a 500;
 * nothing is left hanging. Values in filters must be plain strings/numbers/booleans: routes validate their input first,
 * and anything object-shaped that slips through (e.g. `?id[$ne]=x`) is rejected here as well.
 *
 * The database file defaults to ./bilibili_blacklist.db and can be changed with the SQLITE_PATH env variable.
 */

export interface InsertResult { insertedId: string; }
export interface UpdateResult { matchedCount: number; modifiedCount: number; upsertedId: string | null; }
export interface DeleteResult { deletedCount: number; }
export interface PageResult { total: number; data: any[]; }

const TABLES = ['users', 'sharelist', 'user_sharelist', 'tags'];

var conn: sqlite.DatabaseSync | undefined;

export function open(): sqlite.DatabaseSync {
    if (conn) return conn;
    const db = new sqlite.DatabaseSync(process.env.SQLITE_PATH || 'bilibili_blacklist.db');
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
    for (const table of TABLES) {
        db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, doc TEXT NOT NULL CHECK (json_valid(doc)))`);
    }
    // indexes for the lookups done on every request
    db.exec(`CREATE INDEX IF NOT EXISTS users_uid ON users (json_extract(doc, '$."uid"'));
             CREATE INDEX IF NOT EXISTS user_sharelist_uid ON user_sharelist (json_extract(doc, '$."uid"'));`);
    conn = db;
    return db;
}

/** Switch to another database file (tests). */
export function useDatabase(path: string) {
    if (conn) conn.close();
    conn = undefined;
    process.env.SQLITE_PATH = path;
}

function checkTable(tableName: string) {
    if (TABLES.indexOf(tableName) < 0) throw new Error('unknown table ' + tableName);
}

/** JSON path for a top-level field, quoted so names like "safe-level" work. */
function fieldPath(field: string) {
    return '$."' + field.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** undefined cannot be bound; MongoDB treated it like null (which never matches the fields we query). */
function bindable(value: any) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return isFinite(value) ? value : null;    // NaN (a missing uid cookie) matches nothing
    if (typeof value === 'string') return value;
    throw new Error('unsupported filter value of type ' + typeof value);
}

const PROCESS_UNIQUE = crypto.randomBytes(5).toString('hex');
var idCounter = crypto.randomBytes(3).readUIntBE(0, 3);

/**
 * A new id in MongoDB ObjectId layout (4-byte timestamp, 5-byte process id, 3-byte counter, as 24 hex chars),
 * so ids keep sorting by creation order like the existing ones.
 */
export function newId(): string {
    const ts = ('00000000' + Math.floor(Date.now() / 1000).toString(16)).slice(-8);
    idCounter = (idCounter + 1) % 0x1000000;
    return ts + PROCESS_UNIQUE + ('000000' + idCounter.toString(16)).slice(-6);
}

/**
 * Translate the subset of MongoDB filters used by the app into SQL:
 *   { field: value }            equality (`_id` maps to the id column)
 *   { field: { $in: [...] } }   matches if the field (or any element of an array field) is in the list
 */
function compileFilter(where: any): { sql: string, params: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];
    for (const key of Object.keys(where || {})) {
        const value = where[key];
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            const ops = Object.keys(value);
            if (ops.length != 1 || ops[0] != '$in' || !Array.isArray(value.$in)) {
                throw new Error('unsupported filter on ' + key + ': ' + JSON.stringify(value));
            }
            const list: any[] = value.$in.map(bindable);
            if (list.length == 0) { clauses.push('0'); continue; }
            const marks = list.map(() => '?').join(', ');
            if (key == '_id') {
                clauses.push(`id IN (${marks})`);
                params.push(...list.map(String));
            } else {
                clauses.push(`EXISTS (SELECT 1 FROM json_each(doc, ?) WHERE value IN (${marks}))`);
                params.push(fieldPath(key), ...list);
            }
        } else if (Array.isArray(value)) {
            throw new Error('unsupported array equality filter on ' + key);
        } else if (key == '_id') {
            clauses.push('id = ?');
            const v = bindable(value);
            params.push(v === null ? null : String(v));
        } else {
            clauses.push('json_extract(doc, ?) = ?');
            params.push(fieldPath(key), bindable(value));
        }
    }
    return { sql: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params: params };
}

function sameValue(a: any, b: any) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** Apply the MongoDB update operators the app uses: $set, $inc, $push, $addToSet (with optional $each). */
function applyUpdate(doc: any, update: any) {
    for (const op of Object.keys(update)) {
        const fields = update[op];
        for (const key of Object.keys(fields)) {
            if (key == '_id') throw new Error('cannot update _id');
            const value = fields[key];
            switch (op) {
                case '$set':
                    doc[key] = value;
                    break;
                case '$inc':
                    doc[key] = (doc[key] === undefined ? 0 : doc[key]) + value;
                    break;
                case '$push':
                case '$addToSet': {
                    if (doc[key] === undefined) doc[key] = [];
                    if (!Array.isArray(doc[key])) throw new Error(op + ' on non-array field ' + key);
                    const items = (value !== null && typeof value === 'object' && Array.isArray(value.$each)) ? value.$each : [value];
                    for (const item of items) {
                        if (op == '$push' || !doc[key].some((existing: any) => sameValue(existing, item))) doc[key].push(item);
                    }
                    break;
                }
                default:
                    throw new Error('unsupported update operator ' + op);
            }
        }
    }
    return doc;
}

/** Insert a document into a table. An ObjectId-style `_id` is generated if the document has none. */
export function insertOne(tableName: string, data: any): InsertResult {
    checkTable(tableName);
    const id = data._id !== undefined ? String(data._id) : newId();
    const doc = Object.assign({ _id: id }, data, { _id: id });
    open().prepare(`INSERT INTO ${tableName} (id, doc) VALUES (?, ?)`).run(id, JSON.stringify(doc));
    return { insertedId: id };
}

/** All documents in a table matching the filter, in insertion order. */
export function find(tableName: string, where: object): any[] {
    checkTable(tableName);
    const filter = compileFilter(where);
    const rows = open().prepare(`SELECT doc FROM ${tableName} ${filter.sql} ORDER BY rowid`).all(...filter.params);
    return rows.map((row: any) => JSON.parse(row.doc));
}

/** The first matching document, or null. */
export function findOne(tableName: string, where: object): any | null {
    checkTable(tableName);
    const filter = compileFilter(where);
    const row = open().prepare(`SELECT doc FROM ${tableName} ${filter.sql} ORDER BY rowid LIMIT 1`).get(...filter.params) as any;
    return row ? JSON.parse(row.doc) : null;
}

/**
 * One page of matching documents plus the total count.
 * Sorting by `sort` (a top-level field) in direction `dir` ("asc"/"desc"/1/-1); ties are broken by _id,
 * i.e. creation order. Without a sort the natural (insertion) order is used.
 */
export function findPage(tableName: string, where: object, sort: string | undefined, dir: string | number | undefined,
                         skip: number, limit: number): PageResult {
    checkTable(tableName);
    const db = open();
    const filter = compileFilter(where);
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM ${tableName} ${filter.sql}`).get(...filter.params) as any).n;
    let order = 'ORDER BY rowid';
    const params = filter.params.slice();
    if (sort && dir !== undefined && /^[A-Za-z0-9_\-]+$/.test(sort)) {
        const descending = ['desc', 'descending', '-1'].indexOf(String(dir).toLowerCase()) >= 0;
        order = `ORDER BY json_extract(doc, ?) ${descending ? 'DESC' : 'ASC'}, id ASC`;
        params.push(fieldPath(sort));
    }
    params.push(limit, skip);
    const rows = db.prepare(`SELECT doc FROM ${tableName} ${filter.sql} ${order} LIMIT ? OFFSET ?`).all(...params);
    return { total: Number(total), data: rows.map((row: any) => JSON.parse(row.doc)) };
}

/**
 * Update the first document matching the filter. With `{ upsert: true }` a new document is created
 * from the filter's equality fields plus the update when nothing matches.
 */
export function updateOne(tableName: string, where: any, update: object, options?: { upsert?: boolean }): UpdateResult {
    checkTable(tableName);
    const db = open();
    const filter = compileFilter(where);
    db.exec('BEGIN IMMEDIATE');
    try {
        let result: UpdateResult;
        const row = db.prepare(`SELECT id, doc FROM ${tableName} ${filter.sql} ORDER BY rowid LIMIT 1`).get(...filter.params) as any;
        if (row) {
            const before = row.doc;
            const after = JSON.stringify(applyUpdate(JSON.parse(row.doc), update));
            if (after !== before) db.prepare(`UPDATE ${tableName} SET doc = ? WHERE id = ?`).run(after, row.id);
            result = { matchedCount: 1, modifiedCount: after !== before ? 1 : 0, upsertedId: null };
        } else if (options && options.upsert) {
            const id = where._id !== undefined && where._id !== null && typeof where._id !== 'object' ? String(where._id) : newId();
            const doc: any = { _id: id };
            for (const key of Object.keys(where)) {
                const value = where[key];
                if (key != '_id' && !(value !== null && typeof value === 'object')) doc[key] = value;
            }
            applyUpdate(doc, update);
            db.prepare(`INSERT INTO ${tableName} (id, doc) VALUES (?, ?)`).run(id, JSON.stringify(doc));
            result = { matchedCount: 0, modifiedCount: 0, upsertedId: id };
        } else {
            result = { matchedCount: 0, modifiedCount: 0, upsertedId: null };
        }
        db.exec('COMMIT');
        return result;
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}

/** Delete the first document matching the filter. */
export function deleteOne(tableName: string, where: object): DeleteResult {
    checkTable(tableName);
    const db = open();
    const filter = compileFilter(where);
    const row = db.prepare(`SELECT id FROM ${tableName} ${filter.sql} ORDER BY rowid LIMIT 1`).get(...filter.params) as any;
    if (row) db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(row.id);
    return { deletedCount: row ? 1 : 0 };
}
