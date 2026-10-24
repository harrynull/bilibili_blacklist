import express = require('express');

/**
 * Small HTTP toolkit shared by the routes: an error type that carries a status and a user-facing message,
 * a wrapper that turns thrown/rejected errors into a JSON answer (so a bad request can neither hang nor crash
 * the process), input coercion helpers, a per-IP rate limiter and the security headers.
 */

/** An error with an HTTP status and a message that is safe to show to the visitor (Chinese, for the UI). */
export class HttpError extends Error {
    constructor(public status: number, message: string, public code = -1) { super(message); }
}

type Handler = (req: express.Request, res: express.Response) => unknown | Promise<unknown>;

/** Wrap a route handler: anything it throws, synchronously or asynchronously, becomes a JSON error response. */
export function route(handler: Handler): express.RequestHandler {
    return function (req, res) {
        Promise.resolve().then(() => handler(req, res)).catch(err => sendError(res, err, req));
    };
}

export function sendError(res: express.Response, err: any, req?: express.Request) {
    if (!(err instanceof HttpError)) console.log('[Error] ' + (req ? req.method + ' ' + req.path + ': ' : '') + (err && err.stack || err));
    if (res.headersSent) return;
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : '服务器出错了，请稍后再试';
    res.status(status).json({ code: err instanceof HttpError ? err.code : -1, message: message });
}

/* ---------------- input coercion ----------------
   Query strings, form bodies, JSON bodies and cookie-parser's "j:" cookies can all produce arrays or objects where
   a string is expected; every value a route uses goes through one of these first. */

export function str(value: unknown, opts: { name: string, max: number, min?: number, optional?: boolean, trim?: boolean }): string {
    if (value === undefined || value === null || value === '') {
        if (opts.optional) return '';
        throw new HttpError(400, '缺少' + opts.name);
    }
    if (typeof value !== 'string' && typeof value !== 'number') throw new HttpError(400, opts.name + '格式不对');
    let s = String(value);
    if (opts.trim !== false) s = s.trim();
    if (s.length < (opts.min === undefined ? (opts.optional ? 0 : 1) : opts.min)) throw new HttpError(400, opts.name + '不能为空');
    if (s.length > opts.max) throw new HttpError(400, opts.name + '不能超过 ' + opts.max + ' 个字');
    return s;
}

export function int(value: unknown, opts: { name: string, min: number, max: number, def?: number }): number {
    if ((value === undefined || value === null || value === '') && opts.def !== undefined) return opts.def;
    if (typeof value !== 'string' && typeof value !== 'number') throw new HttpError(400, opts.name + '格式不对');
    const n = Number(value);
    if (!Number.isInteger(n) || n < opts.min || n > opts.max) throw new HttpError(400, opts.name + '格式不对');
    return n;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], def: T): T {
    return typeof value === 'string' && (allowed as readonly string[]).indexOf(value) >= 0 ? value as T : def;
}

/** Ids are the 24-hex-digit form of the old MongoDB ObjectIds; anything else cannot exist, so it is a 404. */
export function objectId(value: unknown): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{24}$/.test(value)) throw new HttpError(404, '找不到这个屏蔽词包');
    return value;
}

/** A cookie value, or '' when absent or not a plain string. */
export function cookie(req: express.Request, name: string): string {
    const v = req.cookies ? req.cookies[name] : undefined;
    return typeof v === 'string' ? v : '';
}

/* ---------------- rate limiting ----------------
   Fixed one-minute windows per client IP and bucket, in memory (one process, one server). req.ip is the visitor's
   address because app.ts trusts Caddy's X-Forwarded-For. */

const windows = new Map<string, { start: number, count: number }>();
setInterval(() => {
    const now = Date.now();
    for (const [key, w] of windows) if (now - w.start > 60000) windows.delete(key);
}, 60000).unref();

export function rateLimit(bucket: string, perMinute: number): express.RequestHandler {
    return function (req, res, next) {
        const key = bucket + ' ' + req.ip;
        const now = Date.now();
        let w = windows.get(key);
        if (!w || now - w.start > 60000) { w = { start: now, count: 0 }; windows.set(key, w); }
        if (++w.count > perMinute) {
            res.set('Retry-After', String(Math.ceil((w.start + 60000 - now) / 1000)));
            res.status(429).json({ code: -429, message: '操作太频繁了，请稍等一分钟再试' });
            return;
        }
        next();
    };
}

/* ---------------- security headers ---------------- */

export function securityHeaders(req: express.Request, res: express.Response, next: express.NextFunction) {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    // no script-src here: the Vue build compiles its templates at runtime (needs eval), so a script policy would be
    // mostly theatre; these directives are the ones that hold without it
    res.set('Content-Security-Policy', "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'");
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
    next();
}
