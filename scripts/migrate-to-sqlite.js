#!/usr/bin/env node
/*
 * Import data into the SQLite database used by bilibili_blacklist.
 *
 *   # one-time migration from an existing MongoDB (needs the dev dependency `mongodb`)
 *   node scripts/migrate-to-sqlite.js --from-mongo mongodb://localhost:27017/bilibili_blacklist
 *
 *   # seed a fresh install with the public share lists (what the old Dockerfile did with mongoimport)
 *   node scripts/migrate-to-sqlite.js --from-json https://harrynull.tech/bilibili/fetch_sharelist
 *
 * Options:
 *   --db <path>   SQLite file (default: $SQLITE_PATH or ./bilibili_blacklist.db)
 *   --force       replace documents in tables that already contain data
 *
 * Run `npm run build` first; the schema comes from build/src/database.js.
 * Documents are stored exactly as JSON.stringify() rendered them for the API (ObjectIds become hex strings),
 * so responses stay byte-identical after the migration.
 */
'use strict';

const path = require('path');

const TABLES = ['users', 'sharelist', 'user_sharelist', 'tags'];

function parseArgs(argv) {
    const args = { force: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--force') args.force = true;
        else if (a === '--from-mongo' || a === '--from-json' || a === '--db') args[a.slice(2)] = argv[++i];
        else throw new Error('unknown argument ' + a);
    }
    if (!args['from-mongo'] === !args['from-json']) throw new Error('specify exactly one of --from-mongo or --from-json');
    return args;
}

function openTarget(dbPath) {
    process.env.SQLITE_PATH = dbPath;
    const { Database } = require(path.join(__dirname, '..', 'build', 'src', 'database.js'));
    new Database(function () { });          // creates the tables and indexes
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(dbPath);
}

function importDocs(db, table, docs, force) {
    const existing = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    if (existing > 0 && !force) throw new Error(`table ${table} already has ${existing} rows (use --force to overwrite)`);
    const insert = db.prepare(`INSERT OR REPLACE INTO ${table} (id, doc) VALUES (?, ?)`);
    db.exec('BEGIN');
    try {
        for (const doc of docs) {
            const json = JSON.stringify(doc);
            const plain = JSON.parse(json);
            if (plain._id === undefined || plain._id === null) throw new Error(`document without _id in ${table}`);
            insert.run(String(plain._id), json);
        }
        db.exec('COMMIT');
    } catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
    return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

async function fromMongo(db, url, force) {
    let mongo;
    try { mongo = require('mongodb'); } catch (e) { throw new Error('install the dev dependency first: npm install mongodb@3'); }
    const client = await mongo.MongoClient.connect(url, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        const source = client.db();
        for (const table of TABLES) {
            const docs = await source.collection(table).find({}).toArray();   // natural order is preserved
            const n = importDocs(db, table, docs, force);
            console.log(`${table}: ${docs.length} documents read, ${n} rows in SQLite`);
        }
    } finally {
        await client.close();
    }
}

async function fromJson(db, source, force) {
    let text;
    if (/^https?:\/\//.test(source)) {
        const res = await fetch(source);
        if (!res.ok) throw new Error(`GET ${source} failed: ${res.status}`);
        text = await res.text();
    } else {
        text = require('fs').readFileSync(source, 'utf8');
    }
    const docs = JSON.parse(text);
    if (!Array.isArray(docs)) throw new Error('expected a JSON array of share lists');
    const n = importDocs(db, 'sharelist', docs, force);
    console.log(`sharelist: ${docs.length} documents read, ${n} rows in SQLite`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const dbPath = args.db || process.env.SQLITE_PATH || 'bilibili_blacklist.db';
    const db = openTarget(dbPath);
    if (args['from-mongo']) await fromMongo(db, args['from-mongo'], args.force);
    else await fromJson(db, args['from-json'], args.force);
    db.close();
    console.log('done: ' + dbPath);
}

main().catch(function (e) {
    console.error('migration failed: ' + e.message);
    process.exit(1);
});
