import crypto = require('crypto');
import bilibili = require('./bilibili');

/**
 * Bulk "add these filters to my Bilibili account" jobs (applying a pack, blocking a list of users).
 * A pack can hold over a thousand filters; firing them all at once trips Bilibili's risk control, so a job runs a
 * few requests at a time, backs off when Bilibili says "too frequent", and reports progress the page can poll.
 * Jobs live in memory and are forgotten a while after they finish.
 */

export interface JobItem { type: number; filter: string; }

export interface JobStatus {
    total: number; done: number; added: number; failed: number; finished: boolean;
    error: string;          // Bilibili's most common failure message, if any
    failedItems: string[];  // the filters that were not added (capped)
}

interface Job extends JobStatus { owner: string; finishedAt: number; errors: { [message: string]: number }; }

const CONCURRENCY = 3;
const KEEP_FINISHED_MS = 10 * 60 * 1000;
const MAX_FAILED_ITEMS = 2000;
// codes Bilibili uses for "slow down" / risk control
const THROTTLED = [-412, -509, -799, 36703];

const jobs = new Map<string, Job>();
setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs) if (job.finished && now - job.finishedAt > KEEP_FINISHED_MS) jobs.delete(id);
}, 60000).unref();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** True if this owner already has a job running (one at a time per account). */
export function running(owner: string): boolean {
    for (const job of jobs.values()) if (job.owner === owner && !job.finished) return true;
    return false;
}

/** Start a job; returns its id. `onFinish` runs once with the final status (e.g. to count a pack's usage). */
export function start(owner: string, cookie: string, csrf: string, items: JobItem[], onFinish?: (status: JobStatus) => void): string {
    const id = crypto.randomBytes(16).toString('hex');
    const job: Job = { owner, total: items.length, done: 0, added: 0, failed: 0, finished: false, error: '', failedItems: [], finishedAt: 0, errors: {} };
    jobs.set(id, job);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const item = items[next++];
            let ok = false, message = '';
            for (let attempt = 0; attempt < 2 && !ok; attempt++) {
                try {
                    const r = await bilibili.addFilter(cookie, csrf, item.type, item.filter);
                    ok = r.code === 0;
                    message = r.message || String(r.code);
                    if (!ok && THROTTLED.indexOf(r.code) >= 0) { await sleep(3000); continue; }
                    break;
                } catch (e) {
                    message = '网络错误';
                    await sleep(1000);
                }
            }
            job.done++;
            if (ok) job.added++;
            else {
                job.failed++;
                job.errors[message] = (job.errors[message] || 0) + 1;
                if (job.failedItems.length < MAX_FAILED_ITEMS) job.failedItems.push(item.filter);
            }
            await sleep(100);
        }
    }
    Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker)).finally(() => {
        job.error = Object.entries(job.errors).sort((a, b) => b[1] - a[1]).map(e => e[0])[0] || '';
        job.finished = true;
        job.finishedAt = Date.now();
        if (onFinish) try { onFinish(job); } catch (e) { console.log('[Error][Job] onFinish: ' + e); }
    });
    return id;
}

export function status(id: string, owner: string): JobStatus | null {
    const job = jobs.get(id);
    if (!job || job.owner !== owner) return null;
    const { total, done, added, failed, finished, error, failedItems } = job;
    return { total, done, added, failed, finished, error, failedItems: finished ? failedItems : [] };
}
