// Minimal typings for Node's built-in SQLite module (Node >= 22.13), covering what this project uses.
// The project's TypeScript/@types/node versions predate `node:sqlite`.
declare module 'node:sqlite' {
    type SQLValue = null | number | bigint | string | Uint8Array;
    class StatementSync {
        run(...params: any[]): { changes: number | bigint; lastInsertRowid: number | bigint };
        get(...params: any[]): unknown;
        all(...params: any[]): unknown[];
    }
    class DatabaseSync {
        constructor(path: string, options?: { open?: boolean; readOnly?: boolean });
        exec(sql: string): void;
        prepare(sql: string): StatementSync;
        close(): void;
    }
}
