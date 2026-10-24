/* Bilibili 屏蔽词分享平台 — front end (Vue 3, no build step). */
(function () {
'use strict';
const { createApp, reactive, ref, computed, watch, onMounted, onBeforeUnmount, nextTick } = Vue;

/* ------------------------------------------------------------------ helpers */

const SITE_TITLE = 'B站弹幕屏蔽词分享平台';
const VIEW_TITLES = { 'home-view': '', 'users-view': '用户黑名单', 'mine-view': '我的屏蔽', 'submit-view': '分享屏蔽词包', 'login-view': '登录', 'not-found': '页面不存在' };
const TYPE_LABEL = ['文本', '正则', '用户'];
const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
// overlays remember what had focus when they opened and hand it back when they close
function rememberFocus() {
    const el = document.activeElement;
    return () => requestAnimationFrame(() => { if (el && el.isConnected && el !== document.body) el.focus({ preventScroll: true }); });
}
const SAFETY = [
    { label: '几乎不误伤', cls: 'safe-0', hint: '只会挡掉目标弹幕' },
    { label: '可能轻微误伤', cls: 'safe-1', hint: '偶尔挡掉正常弹幕' },
    { label: '可能严重误伤', cls: 'safe-2', hint: '会挡掉不少正常弹幕' },
];

const icons = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M7 21H4V10h3zM7 10l4.5-7a2.2 2.2 0 0 1 2.9 2.6L13.5 9H19a2 2 0 0 1 2 2.3l-1.2 7.6A2.5 2.5 0 0 1 17.3 21H7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M17 3h3v11h-3zM17 14l-4.5 7a2.2 2.2 0 0 1-2.9-2.6L10.5 15H5a2 2 0 0 1-2-2.3l1.2-7.6A2.5 2.5 0 0 1 6.7 3H17"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 6.5v11l9-5.5z"/></svg>',
};

function readCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
}
function storage(kind) { try { return window[kind]; } catch (e) { return null; } }
function loadJSON(kind, key, fallback) {
    try { const v = storage(kind) && storage(kind).getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function saveJSON(kind, key, value) { try { storage(kind).setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ } }

const fmt = n => (n || 0).toLocaleString('zh-CN');
const fmtDate = t => { if (!t) return ''; const d = new Date(t); return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
const cleanTags = item => (item.tags || []).filter(t => t && t.trim());
const safetyOf = item => SAFETY[item['safe-level']] || null;
function votes(item) {
    let up = 0, down = 0;
    for (const c of item.comments || []) { if (c.like === true) up++; else if (c.like === false) down++; }
    return { up, down, total: up + down };
}
function ratingText(item) {
    const v = votes(item);
    return v.total ? '好评 ' + Math.round(v.up / v.total * 100) + '%（' + v.total + '）' : '暂无评价';
}
function preview(item, budget) {
    const out = []; let used = 0;
    for (const f of item.filters || []) {
        if (out.length && used + String(f.filter).length > (budget || 56)) break;
        out.push(f); used += String(f.filter).length;
        if (out.length >= 10) break;
    }
    return out;
}

/* ------------------------------------------------------------------ api */

async function check(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r; }
// some endpoints (the ones that call Bilibili) never answer when Bilibili fails, so every request gets a timeout
function request(url, init, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 20000);
    return fetch(url, Object.assign({ credentials: 'same-origin', signal: ctrl.signal }, init)).finally(() => clearTimeout(t));
}
const api = {
    async get(url, params, timeoutMs) {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        const r = await check(await request(url + qs, {}, timeoutMs));
        return r.json();
    },
    async postJSON(url, body, timeoutMs) {
        const r = await check(await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs));
        const text = await r.text();
        try { return JSON.parse(text); } catch (e) { return text; }
    },
    async postForm(url, data, timeoutMs) {
        return check(await request(url, { method: 'POST', body: new URLSearchParams(data) }, timeoutMs));
    },
};

/* ------------------------------------------------------------------ app state */

const session = reactive({ uid: null, loggedIn: false });
function refreshSession() {
    session.uid = readCookie('uid');
    session.loggedIn = !!readCookie('bilibili_cookies') && !!readCookie('token');
}
refreshSession();
function logout() {
    for (const name of ['uid', 'token', 'bilibili_cookies', 'csrf']) {
        document.cookie = name + '=; Max-Age=0; path=/';
        document.cookie = name + '=; Max-Age=0';
    }
    refreshSession();
    toast('已退出登录');
}

const router = reactive({ path: '/', query: {} });
function parseHash() {
    const raw = location.hash.replace(/^#/, '') || window.__INITIAL_ROUTE__ || '/';
    const i = raw.indexOf('?');
    router.path = (i < 0 ? raw : raw.slice(0, i)) || '/';
    router.query = Object.fromEntries(new URLSearchParams(i < 0 ? '' : raw.slice(i + 1)));
}
function go(path, query, replace) {
    const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString() : '';
    const hash = '#' + path + (qs ? '?' + qs : '');
    if (replace) { history.replaceState(null, '', hash); parseHash(); } else location.hash = hash;
}
// detail links carry the list's sort/tags/page so closing the panel returns to the same view
function detailHref(id) {
    const qs = new URLSearchParams(Object.entries(router.query).filter(([k, v]) => ['sort', 'tags', 'page'].includes(k) && v)).toString();
    return '#/list/' + id + (qs ? '?' + qs : '');
}
window.addEventListener('hashchange', parseHash);
parseHash();

const toasts = reactive([]);
let toastSeq = 0;
// errors and toasts that offer an action (undo) stay until dismissed; plain confirmations fade on their own
function dismissToast(t) { const i = toasts.indexOf(t); if (i >= 0) toasts.splice(i, 1); }
function toast(text, opts) {
    const t = Object.assign({ id: ++toastSeq, text, kind: 'ok', sub: '', action: null, key: null }, opts || {});
    if (t.key) toasts.filter(x => x.key === t.key).forEach(dismissToast);
    toasts.push(t);
    if (t.kind !== 'err' && !t.action) setTimeout(() => dismissToast(t), t.sub ? 6000 : 3500);
}
const fail = (what, e) => toast(what + '失败', { kind: 'err', sub: e && e.message === 'HTTP 404' ? '找不到这个屏蔽词包' : '请检查网络后重试' });

const dialog = reactive({ name: null, resolve: null, data: null });
function openDialog(name, data) {
    return new Promise(resolve => { dialog.name = name; dialog.data = data || null; dialog.resolve = resolve; });
}
function closeDialog(result) { const r = dialog.resolve; dialog.name = null; dialog.resolve = null; if (r) r(result); }

/* apply / export, shared by the list and the detail panel */
const applied = reactive(loadJSON('sessionStorage', 'apply_status', {}));
function onceFlag(key, legacyCookie) {
    if (readCookie(legacyCookie) || loadJSON('localStorage', key, false)) return false;
    saveJSON('localStorage', key, true);
    return true;
}
async function applyPack(item) {
    if (!session.loggedIn) { if (await openDialog('login-required')) go('/login'); return; }
    if (applied[item._id]) return;
    try {
        await api.postJSON('apply', { id: item._id });
        applied[item._id] = true;
        saveJSON('sessionStorage', 'apply_status', applied);
        item.usage = (item.usage || 0) + 1;
        if (onceFlag('bbl.syncGuide', 'tip')) openDialog('sync-guide');
        else toast('已应用到账号', { sub: '在 B 站播放器的屏蔽设定里点“同步屏蔽列表”后生效' });
    } catch (e) { fail('应用', e); }
}
async function exportPack(item) {
    try {
        const res = await api.get('export_list', { id: item._id });
        if (res.code !== 0) throw new Error('HTTP 404');
        const url = URL.createObjectURL(new Blob([res.data], { type: 'text/xml' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: 'blacklist_' + item._id + '.xml' });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        item.usage = (item.usage || 0) + 1;
        if (onceFlag('bbl.importGuide', 'tip_export')) openDialog('import-guide');
        else toast('已导出 XML');
    } catch (e) { fail('导出', e); }
}

/* tags (shared by the list filter and the submit form) */
const allTags = ref([]);
let tagsLoaded = null;
function loadTags() {
    if (!tagsLoaded) tagsLoaded = api.get('tags').then(t => { allTags.value = (t || []).filter(x => x && x.trim()); }).catch(() => { tagsLoaded = null; });
    return tagsLoaded;
}

/* ------------------------------------------------------------------ components */

const app = createApp({
    setup() {
        const menuOpen = ref(false);
        watch(() => router.path, () => { menuOpen.value = false; });
        const detailId = computed(() => router.path.startsWith('/list/') ? decodeURIComponent(router.path.slice(6)) : null);
        const view = computed(() => {
            if (router.path === '/' || detailId.value) return 'home-view';
            return ({ '/users': 'users-view', '/mine': 'mine-view', '/submit': 'submit-view', '/login': 'login-view' })[router.path] || 'not-found';
        });
        // client-side route changes reset nothing: retitle the document and move focus to the new view
        const mainEl = ref(null);
        watch(view, (v, old) => {
            document.title = (VIEW_TITLES[v] ? VIEW_TITLES[v] + ' | ' : '') + SITE_TITLE;
            window.scrollTo(0, 0);
            if (old) nextTick(() => mainEl.value && mainEl.value.focus({ preventScroll: true }));
        }, { immediate: true });
        // while a drawer or dialog is open, everything behind it is inert (no tabbing out of the overlay)
        const backgroundInert = computed(() => !!detailId.value || !!dialog.name);
        const isActive = p => (p === '/' ? view.value === 'home-view' : router.path === p);
        return { session, menuOpen, view, detailId, isActive, logout, icons, mainEl, backgroundInert };
    },
    template: `
<a class="skip-link" href="#main" @click.prevent="mainEl.focus()" :inert="backgroundInert">跳到正文</a>
<header class="site-header" :inert="backgroundInert">
  <div class="shell">
    <a class="brand" href="#/">
      <svg class="brand-mark" viewBox="0 0 28 28" aria-hidden="true"><path d="M0 0H28V20L20 28H0Z" fill="#14171c"/><rect x="6" y="7.5" width="11" height="2.5" fill="#fff" opacity=".55"/><rect x="6" y="12.5" width="16" height="3.5" fill="#ffd400"/><rect x="6" y="18.5" width="8" height="2.5" fill="#fff" opacity=".55"/></svg>
      <span>B站屏蔽词分享</span>
    </a>
    <button class="btn icon ghost menu-toggle" :aria-expanded="menuOpen" aria-controls="site-nav" @click="menuOpen = !menuOpen" v-html="icons.menu" aria-label="菜单"></button>
    <nav id="site-nav" class="nav" :class="{ open: menuOpen }" aria-label="主导航">
      <a class="nav-link" :class="{ active: isActive('/') }" :aria-current="isActive('/') ? 'page' : null" href="#/">屏蔽词包</a>
      <a class="nav-link" :class="{ active: isActive('/users') }" :aria-current="isActive('/users') ? 'page' : null" href="#/users">用户黑名单</a>
      <a class="nav-link" :class="{ active: isActive('/mine') }" :aria-current="isActive('/mine') ? 'page' : null" href="#/mine">我的屏蔽</a>
      <span class="divider" role="presentation"></span>
      <a class="btn secondary small" href="#/submit">分享屏蔽词包</a>
      <span class="divider" role="presentation"></span>
      <span v-if="session.loggedIn" class="account">
        <span>UID {{ session.uid }}</span>
        <button class="btn ghost small" @click="logout">退出</button>
      </span>
      <a v-else class="btn primary small" href="#/login">登录</a>
    </nav>
  </div>
</header>
<main id="main" ref="mainEl" tabindex="-1" :inert="backgroundInert">
  <component :is="view" />
</main>
<detail-panel v-if="detailId" :id="detailId" />
<footer class="site-footer" :inert="backgroundInert">
  <div class="shell">
    <span>非哔哩哔哩官方网站，与哔哩哔哩无关。屏蔽词包以 CC0 协议发布。</span>
    <nav aria-label="页脚">
      <a href="eula.html">用户协议与问答</a>
      <a href="licenses.html">开源许可</a>
      <a href="https://github.com/harrynull/bilibili_blacklist" rel="noopener">GitHub</a>
    </nav>
  </div>
</footer>
<toast-stack />
<app-dialog />`,
});

/* --- the danmaku screen in the hero: comments fly by, the blocked ones get struck out --- */
app.component('danmaku-screen', {
    setup() {
        const SAMPLE = [
            ['前排', 1], ['这段作画太顶了', 0], ['第一！', 1], ['BGM 是什么？', 0], ['2333333', 1], ['泪目', 0],
            ['空降 08:15', 1], ['名场面来了', 0], ['许愿下周更新', 1], ['这个转场绝了', 0], ['打卡', 1], ['合影留念', 0],
            ['只有我一个人在看吗', 1], ['UP 主辛苦了', 0], ['前方高能', 1], ['原来是这样', 0], ['我是第一个看完的', 1], ['笑死', 0],
            ['刚刚投递', 1], ['细节拉满', 0],
        ];
        const lanes = 4;
        const items = ref([]);
        const blocked = ref(0);
        const reduce = reduceMotion();
        const lanesEl = ref(null);
        const paused = ref(false);                   // the visitor's pause button (WCAG 2.2.2: moving content needs one)
        const hidden = ref(document.hidden);
        const frozen = computed(() => paused.value || hidden.value);
        let timer = null, seq = 0, cursor = 0;
        const laneFree = new Array(lanes).fill(0);   // clock time at which the lane's entry point is clear again
        const SPEED = 130;                           // px per second, the same for every comment (like the real player)
        // a clock that stops while paused or while the tab is hidden, so the CSS animations and the timers stay in step
        let clock = 0, lastTick = performance.now(), sinceSpawn = 0;
        const events = [];
        const now = () => clock;
        const at = (delay, fn) => events.push({ at: clock + delay, fn });
        function tick() {
            const t = performance.now(), dt = t - lastTick; lastTick = t;
            if (frozen.value) return;
            clock += dt; sinceSpawn += dt;
            for (let i = events.length - 1; i >= 0; i--) if (events[i].at <= clock) events.splice(i, 1)[0].fn();
            if (sinceSpawn >= 450) { sinceSpawn = 0; spawn(); }
        }
        const onVisibility = () => { hidden.value = document.hidden; };

        function geometry() {
            const el = lanesEl.value; const width = (el && el.clientWidth) || 640;
            const font = 16;
            return { width, font };
        }
        function makeItem(lane, startX) {
            const { width, font } = geometry();
            const [text, bad] = SAMPLE[cursor++ % SAMPLE.length];
            const textW = text.length * font * 1.02 + 8;
            const travel = width + textW;                 // from just off the right edge to just off the left edge
            const duration = travel / SPEED * 1000;
            const done = startX / travel;                 // fraction of the trip already covered
            const item = { id: ++seq, text, bad, hit: false, color: Math.random() < 0.15 ? (Math.random() < 0.5 ? 'c-yellow' : 'c-cyan') : '',
                style: { top: (lane / lanes * 100) + '%', animationDuration: duration + 'ms', animationDelay: -(done * duration) + 'ms', '--travel': -travel + 'px' } };
            items.value.push(item);
            // strike blocked comments as they pass the middle of the screen
            if (bad) at(Math.max(200, (0.5 + Math.random() * 0.12 - done) * duration), () => { item.hit = true; blocked.value++; });
            at((1 - done) * duration + 100, () => { items.value = items.value.filter(i => i !== item); });
            // the next comment may enter this lane once this one has fully entered plus a gap
            const clearIn = Math.max(0, (textW + 56 - startX) / SPEED * 1000);
            laneFree[lane] = now() + clearIn;
        }
        function spawn() {
            if (!lanesEl.value) return;
            const free = [];
            for (let l = 0; l < lanes; l++) if (laneFree[l] <= now()) free.push(l);
            if (free.length) makeItem(free[Math.floor(Math.random() * free.length)], 0);
        }
        onMounted(() => {
            if (reduce) {
                // static layout: two comments per lane, the blocked ones shown already struck out
                items.value = SAMPLE.slice(0, lanes * 2).map(([text, bad], i) => ({ id: i, text, bad, hit: !!bad, color: '',
                    style: { top: (Math.floor(i / 2) / lanes * 100) + '%', left: (i % 2 ? 54 : 8) + (Math.floor(i / 2) % 2) * 6 + '%' } }));
                blocked.value = items.value.filter(i => i.bad).length;
                return;
            }
            // measure after the first frame (the app root is hidden until mounting finishes), then start with a busy
            // screen: one or two comments already part-way across in each lane
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const { width } = geometry();
                for (let l = 0; l < lanes; l++) {
                    if (Math.random() < 0.6) makeItem(l, width * (0.6 + Math.random() * 0.25));
                    makeItem(l, width * (0.12 + Math.random() * 0.25));
                    laneFree[l] = Math.max(laneFree[l], now() + Math.random() * 1500);
                }
                lastTick = performance.now();
                timer = setInterval(tick, 100);
            }));
            document.addEventListener('visibilitychange', onVisibility);
        });
        onBeforeUnmount(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); });
        return { items, blocked, reduce, lanesEl, fmt, paused, frozen, icons };
    },
    template: `
<div class="screen" :class="{ static: reduce, paused: frozen }">
  <i class="corner c1" aria-hidden="true"></i><i class="corner c2" aria-hidden="true"></i>
  <div class="screen-top" aria-hidden="true"><span class="live">DANMAKU MONITOR · {{ reduce ? 'DEMO' : (frozen ? 'PAUSED' : 'LIVE') }}</span><span>BLOCKED <b>{{ String(blocked).padStart(3, '0') }}</b></span></div>
  <div class="screen-lanes" ref="lanesEl" role="img" aria-label="示意：视频弹幕滚动时，命中屏蔽词的弹幕被划掉">
    <span v-for="i in items" :key="i.id" class="dm" :class="[i.color, { hit: i.hit }]" :style="i.style" aria-hidden="true">{{ i.text }}</span>
  </div>
  <div class="screen-bar">
    <button v-if="!reduce" type="button" class="screen-btn" :aria-pressed="paused" @click="paused = !paused"><span v-html="paused ? icons.play : icons.pause"></span>{{ paused ? '继续播放' : '暂停弹幕' }}</button>
    <span v-else class="screen-label">弹幕示意</span>
  </div>
</div>`,
});

/* --- home: hero + browse --- */
app.component('home-view', {
    setup() {
        const state = reactive({ loading: true, error: false, total: 0, lastPage: 0, items: [] });
        const sort = computed(() => router.query.sort === 'time' ? 'time' : 'usage');
        const page = computed(() => Math.max(0, parseInt(router.query.page || '1', 10) - 1) || 0);
        const tags = computed(() => (router.query.tags || '').split(',').filter(Boolean));
        const quickTags = computed(() => allTags.value.slice(0, 8));
        const listTop = ref(null);

        // page and sort changes get their own history entries (so Back works); tag edits replace the current one
        function setQuery(patch, push) {
            const q = Object.assign({ sort: sort.value === 'usage' ? '' : 'time', tags: tags.value.join(','), page: page.value ? page.value + 1 : '' }, patch);
            go('/', q, !push);
        }
        async function load() {
            state.loading = true; state.error = false;
            try {
                const res = await api.get('sharelist', { page: page.value, filter: tags.value.join(','), sort: sort.value, dir: 'desc' });
                state.total = res.total; state.lastPage = res.last_page;
                state.items = (res.data || []).filter(i => i.filters && i.filters.length);
                home.cache = state.items;
            } catch (e) { state.error = true; }
            state.loading = false;
        }
        // a string key, so opening or closing the detail panel (which rewrites the query) doesn't reload the list
        watch(() => sort.value + '|' + page.value + '|' + tags.value.join(','), load);
        onMounted(() => { load(); loadTags(); });

        function toggleTag(t) {
            const next = tags.value.includes(t) ? tags.value.filter(x => x !== t) : tags.value.concat(t);
            setQuery({ tags: next.join(','), page: '' });
        }
        function setTags(list) { setQuery({ tags: list.join(','), page: '' }); }
        function gotoPage(p) {
            setQuery({ page: p ? p + 1 : '' }, true);
            nextTick(() => listTop.value && listTop.value.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }));
        }
        const pages = computed(() => {
            const last = state.lastPage, cur = page.value, out = [];
            if (last <= 1) return out;
            const add = p => out.push(p);
            add(0);
            const start = Math.max(1, cur - 2), end = Math.min(last - 2, cur + 2);
            if (start > 1) out.push('gap-a');
            for (let p = start; p <= end; p++) add(p);
            if (end < last - 2) out.push('gap-b');
            add(last - 1);
            return out;
        });
        return { state, sort, page, tags, quickTags, allTags, listTop, setQuery, toggleTag, setTags, gotoPage, pages,
            applied, applyPack, exportPack, fmt, ratingText, safetyOf, cleanTags, preview, session, detailHref, votes };
    },
    template: `
<div class="top-band"><div class="shell">
  <p class="kicker" aria-hidden="true">DANMAKU FILTER EXCHANGE <span class="zh">// 弹幕屏蔽词分享</span></p>
  <div class="hero-head">
    <p class="hero-title">屏蔽弹幕</p>
    <p class="hero-text">大家整理的 B 站弹幕屏蔽词。点“应用”会写进你的 B 站账号，不想登录也可以导出 XML，在播放器里手动导入。<a href="#/submit">分享屏蔽词包</a></p>
  </div>
  <section class="strip" aria-label="弹幕示意"><danmaku-screen /></section>
</div></div>

<section class="section" ref="browse" id="browse">
  <div class="shell">
    <div class="section-head" ref="listTop">
      <div class="titled"><span class="en" aria-hidden="true">Filter packs</span><h1>屏蔽词包</h1><span class="hint" v-if="!state.loading && !state.error">{{ fmt(state.total) }} 个<span v-if="tags.length">，含任一所选标签</span></span></div>
      <div class="segmented" role="group" aria-label="排序">
        <button :aria-pressed="sort === 'usage'" @click="setQuery({ sort: '', page: '' }, true)">最多使用</button>
        <button :aria-pressed="sort === 'time'" @click="setQuery({ sort: 'time', page: '' }, true)">最新发布</button>
      </div>
    </div>

    <div class="list-card">
    <div class="toolbar">
      <div class="grow"><tag-picker :model-value="tags" @update:model-value="setTags" :options="allTags" placeholder="按标签筛选，例如 刷屏、剧透" /></div>
      <div class="chip-row" aria-label="常用标签">
        <span class="label">常用 <span class="en" aria-hidden="true">/ Tags</span></span>
        <button v-for="t in quickTags" :key="t" class="chip" :aria-pressed="tags.includes(t)" @click="toggleTag(t)">{{ t }}</button>
      </div>
    </div>

    <div class="pack-list" aria-live="polite" :aria-busy="state.loading">
      <div v-if="state.loading" class="loading">加载中…</div>
      <div v-else-if="state.error" class="empty">
        <h2>列表没加载出来</h2>
        <p>可能是网络问题，稍后再试一次。</p>
        <button class="btn secondary" @click="setQuery({})">重新加载</button>
      </div>
      <div v-else-if="!state.items.length" class="empty">
        <h2>没有带这些标签的屏蔽词包</h2>
        <p>换个标签试试，或者把你的屏蔽词分享出来。</p>
        <button class="btn secondary" @click="setTags([])">清除标签</button>
      </div>
      <template v-else>
      <div class="pack-head" aria-hidden="true"><span>名称</span><span class="num">使用</span><span class="num">评价</span><span></span></div>
      <ul>
        <li class="pack" v-for="item in state.items" :key="item._id">
          <div>
            <div class="pack-title">
              <h2 class="pack-name"><a :href="detailHref(item._id)">{{ item.name }}</a></h2>
              <span class="tags" v-if="cleanTags(item).length"><span class="tag" v-for="t in cleanTags(item)" :key="t">{{ t }}</span></span>
              <span v-if="safetyOf(item)" class="safety" :class="safetyOf(item).cls">{{ safetyOf(item).label }}</span>
            </div>
            <p class="pack-desc" v-if="item.description">{{ item.description }}</p>
            <ul class="struck" :aria-label="'部分屏蔽词，共 ' + item.filters.length + ' 条'">
              <li v-for="(f, i) in preview(item)" :key="i" :class="{ re: f.type == 1 }">{{ f.filter }}</li>
              <li class="more" v-if="item.filters.length > preview(item).length"><a :href="detailHref(item._id)">共 {{ fmt(item.filters.length) }} 条</a></li>
            </ul>
          </div>
          <div class="pack-num"><b>{{ fmt(item.usage) }}</b><span class="en">Uses</span></div>
          <div class="pack-num"><b>{{ votes(item).total ? Math.round(votes(item).up / votes(item).total * 100) + '%' : '—' }}</b>{{ votes(item).total ? votes(item).total + ' 人' : '暂无' }}</div>
          <div class="pack-meta"><span><b>{{ fmt(item.usage) }}</b> 次使用</span><span>{{ ratingText(item) }}</span></div>
          <div class="pack-actions">
            <button class="btn" :class="applied[item._id] ? 'done' : 'primary'" :disabled="applied[item._id]" @click="applyPack(item)" :aria-label="(applied[item._id] ? '已应用 ' : '应用 ') + item.name">{{ applied[item._id] ? '已应用' : '应用' }}</button>
            <button class="btn" @click="exportPack(item)" :aria-label="'导出 ' + item.name">导出</button>
          </div>
        </li>
      </ul>
      </template>
    </div>
    </div>

    <nav class="pager" v-if="pages.length && !state.loading" aria-label="分页">
      <button :disabled="page === 0" @click="gotoPage(page - 1)">上一页</button>
      <template v-for="p in pages" :key="p">
        <span v-if="typeof p === 'string'" class="gap">…</span>
        <button v-else :aria-current="p === page ? 'page' : null" @click="gotoPage(p)">{{ p + 1 }}</button>
      </template>
      <button :disabled="page + 1 >= state.lastPage" @click="gotoPage(page + 1)">下一页</button>
    </nav>
  </div>
</section>`,
});
const home = { cache: [] };

/* --- tag picker with suggestions --- */
app.component('tag-picker', {
    props: { modelValue: { type: Array, default: () => [] }, options: { type: Array, default: () => [] }, placeholder: String, allowNew: Boolean, inputId: String },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
        const text = ref(''); const open = ref(false); const active = ref(0);
        const matches = computed(() => {
            const q = text.value.trim().toLowerCase();
            return props.options.filter(o => !props.modelValue.includes(o) && (!q || o.toLowerCase().includes(q))).slice(0, 12);
        });
        watch(matches, () => { active.value = 0; });
        function add(t) {
            t = (t || '').trim().replace(/[,，]/g, '');
            if (!t || props.modelValue.includes(t)) { text.value = ''; return; }
            if (!props.allowNew && !props.options.includes(t)) return;
            emit('update:modelValue', props.modelValue.concat(t)); text.value = ''; open.value = false;
        }
        function remove(t) { emit('update:modelValue', props.modelValue.filter(x => x !== t)); }
        function onKey(e) {
            if (e.key === 'ArrowDown') { e.preventDefault(); open.value = true; active.value = Math.min(active.value + 1, matches.value.length - 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = Math.max(active.value - 1, 0); }
            else if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                if (e.key === 'Enter' || text.value) e.preventDefault();
                if (open.value && matches.value[active.value] && (!props.allowNew || !text.value || matches.value[active.value].toLowerCase() === text.value.trim().toLowerCase())) add(matches.value[active.value]);
                else add(text.value);
            }
            else if (e.key === 'Backspace' && !text.value && props.modelValue.length) remove(props.modelValue[props.modelValue.length - 1]);
            else if (e.key === 'Escape') open.value = false;
        }
        return { text, open, active, matches, add, remove, onKey, icons, blur: () => setTimeout(() => { open.value = false; }, 120) };
    },
    template: `
<div class="tag-picker">
  <button v-for="t in modelValue" :key="t" type="button" class="chip" aria-pressed="true" @click="remove(t)" :aria-label="'移除标签 ' + t">{{ t }} <span class="x" v-html="icons.x"></span></button>
  <input :id="inputId" v-model="text" :placeholder="modelValue.length ? '' : placeholder" @focus="open = true" @input="open = true" @blur="blur" @keydown="onKey"
         role="combobox" :aria-expanded="open && matches.length > 0" aria-autocomplete="list" autocomplete="off" />
  <div class="suggest" v-if="open && matches.length" role="listbox">
    <button v-for="(m, i) in matches" :key="m" type="button" role="option" :class="{ active: i === active }" :aria-selected="i === active" @mousedown.prevent="add(m)">{{ m }}</button>
  </div>
</div>`,
});

/* --- list detail panel (#/list/:id) --- */
app.component('detail-panel', {
    props: { id: String },
    setup(props) {
        const item = ref(null); const error = ref(false);
        const vote = ref(null); const text = ref(''); const posting = ref(false); const needVote = ref(false);
        const panel = ref(null);
        const restoreFocus = rememberFocus();      // the list link that opened the panel
        const prevTitle = document.title;
        async function load() {
            item.value = home.cache.find(i => i._id === props.id) || null;
            error.value = false;
            if (!item.value) {
                try { item.value = await api.get('list', { id: props.id }); } catch (e) { error.value = true; }
            }
            document.title = (item.value ? item.value.name : '找不到这个屏蔽词包') + ' | ' + SITE_TITLE;
        }
        watch(() => props.id, load);
        function close() { go('/', Object.fromEntries(Object.entries(router.query).filter(([k]) => ['sort', 'tags', 'page'].includes(k)))); }
        function onKey(e) { if (e.key === 'Escape' && !dialog.name) close(); }
        onMounted(() => { load(); document.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden'; nextTick(() => panel.value && panel.value.focus()); });
        onBeforeUnmount(() => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; document.title = prevTitle; restoreFocus(); });

        const comments = computed(() => (item.value && item.value.comments || []).filter(c => c.content && String(c.content).trim()));
        async function post() {
            if (!session.loggedIn) { if (await openDialog('login-required')) go('/login'); return; }
            if (vote.value === null) { needVote.value = true; return; }
            if (!text.value.trim()) return;
            posting.value = true;
            try {
                const res = await api.postJSON('comment', { id: item.value._id, content: text.value.trim(), like: vote.value ? 1 : 0 });
                if (res && res.code === -1) { toast('登录已过期', { kind: 'err', sub: '重新登录后再发表评价' }); return; }
                item.value.comments = (item.value.comments || []).concat({ uid: Number(session.uid), content: text.value.trim(), like: vote.value });
                text.value = ''; vote.value = null; needVote.value = false;
                toast('已发表评价');
            } catch (e) { fail('发表评价', e); }
            finally { posting.value = false; }
        }
        return { item, error, close, panel, comments, vote, text, post, posting, needVote, applied, applyPack, exportPack,
            fmt, fmtDate, votes, ratingText, safetyOf, cleanTags, TYPE_LABEL, icons, dialog };
    },
    template: `
<div class="scrim" @click="close"></div>
<div ref="panel" tabindex="-1" class="drawer" role="dialog" aria-modal="true" :aria-label="item ? item.name : '屏蔽词包详情'" :inert="!!dialog.name">
  <div class="drawer-head">
    <div class="titled"><span class="en" aria-hidden="true">Filter pack</span><h2>{{ item ? item.name : (error ? '找不到这个屏蔽词包' : '加载中…') }}</h2></div>
    <button class="btn icon ghost" @click="close" aria-label="关闭详情" v-html="icons.close"></button>
  </div>
  <div class="drawer-body" v-if="error">
    <p>它可能已经被删除了。回到列表看看别的吧。</p>
  </div>
  <div class="drawer-body" v-else-if="item">
    <p class="facts">
      <span><b>{{ fmt(item.usage) }}</b> 次使用</span>
      <span>{{ ratingText(item) }}</span>
      <span v-if="safetyOf(item)" class="safety" :class="safetyOf(item).cls">{{ safetyOf(item).label }}</span>
    </p>
    <p class="byline">
      <span>作者 <a :href="'https://space.bilibili.com/' + item.uid" target="_blank" rel="noopener">UID {{ item.uid }}</a></span>
      <span v-if="item.time">发布于 {{ fmtDate(item.time) }}</span>
      <span class="tags" v-if="cleanTags(item).length"><span class="tag" v-for="t in cleanTags(item)" :key="t">{{ t }}</span></span>
    </p>
    <div class="block" v-if="item.description && item.description.trim()">
      <h3>介绍</h3>
      <p class="desc">{{ item.description }}</p>
    </div>
    <div class="block">
      <h3>屏蔽词 <small>{{ fmt(item.filters.length) }} 条</small></h3>
      <div class="table-box scroll" tabindex="0" role="region" aria-label="全部屏蔽词">
        <table class="filter-table">
          <tr v-for="(f, i) in item.filters" :key="i">
            <td class="type"><span class="type-pill" :class="'t' + f.type">{{ TYPE_LABEL[f.type] || '文本' }}</span></td>
            <td class="val" :class="{ re: f.type == 1 }">{{ f.filter }}</td>
          </tr>
        </table>
      </div>
    </div>
    <div class="block">
      <h3>评价 <small>{{ comments.length ? comments.length + ' 条' : '还没有人评价' }}</small></h3>
      <ul class="comments" v-if="comments.length">
        <li v-for="(c, i) in comments" :key="i" :class="{ voted: c.like === true || c.like === false }">
          <span v-if="c.like === true || c.like === false" class="vote-icon" :class="c.like ? 'up' : 'down'" v-html="c.like ? icons.up : icons.down" role="img" :aria-label="c.like ? '好用' : '不好用'"></span>
          <div><div class="who"><a :href="'https://space.bilibili.com/' + c.uid" target="_blank" rel="noopener">UID {{ c.uid }}</a></div>{{ c.content }}</div>
        </li>
      </ul>
      <form class="composer" @submit.prevent="post">
        <div class="row" role="group" aria-label="这份屏蔽词好用吗">
          <button type="button" class="vote-btn up" :aria-pressed="vote === true" @click="vote = true; needVote = false"><span v-html="icons.up"></span>好用</button>
          <button type="button" class="vote-btn down" :aria-pressed="vote === false" @click="vote = false; needVote = false"><span v-html="icons.down"></span>不好用</button>
          <span class="error-text" v-if="needVote">先选择好用还是不好用</span>
        </div>
        <div class="row">
          <input class="input" style="flex: 1 1 220px; width: auto" v-model="text" maxlength="300" placeholder="说说用下来的感受，比如误伤了什么" aria-label="评价内容" />
          <button class="btn primary" :disabled="posting || !text.trim()">发表评价</button>
        </div>
      </form>
    </div>
  </div>
  <div class="drawer-foot" v-if="item">
    <button class="btn large" :class="applied[item._id] ? 'done' : 'primary'" :disabled="applied[item._id]" @click="applyPack(item)">{{ applied[item._id] ? '已应用到账号' : '应用到账号' }}</button>
    <button class="btn large" @click="exportPack(item)">导出 XML</button>
  </div>
</div>`,
});

/* --- my filters (#/mine) --- */
function useMyFilters() {
    const state = reactive({ loading: false, error: '', list: [] });
    async function load() {
        if (!session.loggedIn) return;
        state.loading = true; state.error = '';
        try {
            const res = await api.get('fetch_blacklist');
            if (!Array.isArray(res)) { state.error = 'expired'; state.list = []; }
            else state.list = res;
        } catch (e) { state.error = 'network'; }
        state.loading = false;
    }
    return { state, load };
}
app.component('mine-view', {
    setup() {
        const { state, load } = useMyFilters();
        const type = ref(0); const value = ref(''); const adding = ref(false); const removing = reactive({});
        const counts = computed(() => [0, 1, 2].map(t => state.list.filter(f => f.type == t).length));
        const regexError = computed(() => { if (type.value !== 1 || !value.value) return ''; try { new RegExp(value.value); return ''; } catch (e) { return '这个正则表达式写得不对，B 站会拒绝它'; } });
        async function add() {
            if (!value.value.trim() || regexError.value) return;
            adding.value = true;
            try {
                await api.postForm('add_item', { type: type.value, filter: value.value.trim() });
                toast('已添加', { sub: '在 B 站播放器的屏蔽设定里点“同步屏蔽列表”后生效' });
                value.value = '';
                setTimeout(load, 500);
            } catch (e) { fail('添加', e); }
            adding.value = false;
        }
        async function remove(f) {
            removing[f.id] = true;
            try {
                await api.postJSON('del_item', { ids: f.id });
                state.list = state.list.filter(x => x !== f);
                // deleting writes straight to the Bilibili account, so offer an undo instead of asking first
                toast('已删除“' + f.filter + '”', { key: 'mine-delete', action: { label: '撤销', run: () => restore(f) } });
            } catch (e) { fail('删除', e); }
            delete removing[f.id];
        }
        async function restore(f) {
            try {
                await api.postForm('add_item', { type: f.type, filter: f.filter });
                toast('已恢复“' + f.filter + '”');
                setTimeout(load, 500);
            } catch (e) { fail('恢复', e); }
        }
        onMounted(load);
        watch(() => session.loggedIn, load);
        return { session, state, load, type, value, add, adding, remove, removing, counts, regexError, TYPE_LABEL, icons };
    },
    template: `
<div class="shell page">
  <div class="page-title">
    <div class="titled"><span class="en" aria-hidden="true">My filters</span><h1>我的屏蔽</h1></div>
    <p>这里是你 B 站账号里现有的弹幕屏蔽词。改动会直接保存到 B 站，在播放器的屏蔽设定里点“同步屏蔽列表”就能生效。</p>
  </div>
  <div v-if="!session.loggedIn" class="panel empty">
    <h2>登录后查看你的屏蔽词</h2>
    <p>用 B 站手机客户端扫码登录，网站不会保存你的密码。</p>
    <a class="btn primary" href="#/login">登录</a>
  </div>
  <template v-else>
    <div class="panel">
      <h2>添加屏蔽词</h2>
      <p class="sub">文本会屏蔽包含这段文字的弹幕；正则按正则表达式匹配；用户填写弹幕发送者的 ID。</p>
      <form class="inline-form" @submit.prevent="add">
        <div class="segmented" role="group" aria-label="类型">
          <button type="button" v-for="(l, i) in TYPE_LABEL" :key="i" :aria-pressed="type === i" @click="type = i">{{ l }}</button>
        </div>
        <input class="input" :class="{ mono: type === 1 }" v-model="value" :placeholder="['例如：前方高能', '例如：^(2333+|哈{4,})$', '发送者 ID'][type]" aria-label="屏蔽内容" />
        <button class="btn primary" :disabled="adding || !value.trim() || !!regexError">添加</button>
      </form>
      <p class="error-text" v-if="regexError" style="margin-top: 8px">{{ regexError }}</p>
    </div>
    <div class="panel">
      <div class="section-head" style="margin-bottom: 12px">
        <div><h2>现有屏蔽词</h2><p v-if="!state.loading && !state.error">文本 {{ counts[0] }} 条，正则 {{ counts[1] }} 条，用户 {{ counts[2] }} 个</p></div>
        <a class="btn secondary small" href="#/submit" v-if="state.list.length">把它们分享成屏蔽词包</a>
      </div>
      <div v-if="state.loading" class="skeleton"><span style="width: 40%"></span><span style="width: 70%"></span></div>
      <div v-else-if="state.error === 'expired'" class="callout">
        <span v-html="icons.alert" style="display: contents"></span><div>B 站没有返回你的屏蔽列表，登录可能已经过期。<a href="#/login">重新登录</a></div>
      </div>
      <div v-else-if="state.error" class="callout"><span v-html="icons.alert" style="display: contents"></span><div>没能读取屏蔽列表，请检查网络后 <button type="button" class="link-btn" @click="load">重试</button>。</div></div>
      <div v-else-if="!state.list.length" class="empty"><h2>你还没有屏蔽词</h2><p>在上面添加，或者去 <a href="#/">屏蔽词包</a> 里挑一份应用。</p></div>
      <div v-else class="table-box">
        <table class="filter-table">
          <tr v-for="f in state.list" :key="f.id">
            <td class="type"><span class="type-pill" :class="'t' + f.type">{{ TYPE_LABEL[f.type] }}</span></td>
            <td class="val" :class="{ re: f.type == 1, mono: f.type == 2 }">{{ f.filter }}</td>
            <td class="act"><button class="btn danger small" :disabled="removing[f.id]" @click="remove(f)" :aria-label="'删除 ' + f.filter">删除</button></td>
          </tr>
        </table>
      </div>
    </div>
  </template>
</div>`,
});

/* --- user blacklist (#/users) --- */
app.component('users-view', {
    setup() {
        const min = ref(parseInt(router.query.min || '3', 10) || 3);
        const state = reactive({ loading: true, error: false, data: {} });
        const done = reactive(loadJSON('sessionStorage', 'apply_status', {}));
        const run = reactive({ active: false, done: 0, total: 0 });
        async function load() {
            state.loading = true; state.error = false;
            try { state.data = await api.get('fetch_user_sharelist', { filter: min.value }); } catch (e) { state.error = true; }
            state.loading = false;
        }
        let debounce = null;
        watch(min, () => { clearTimeout(debounce); debounce = setTimeout(() => { go('/users', { min: min.value === 3 ? '' : min.value }, true); load(); }, 250); });
        onMounted(load);
        const groups = computed(() => {
            const by = {};
            for (const [hash, n] of Object.entries(state.data || {})) { if (typeof n === 'number') (by[n] = by[n] || []).push(hash); }
            return Object.keys(by).map(Number).sort((a, b) => b - a).map(n => ({ n, hashes: by[n] }));
        });
        const total = computed(() => groups.value.reduce((s, g) => s + g.hashes.length, 0));
        const pending = computed(() => groups.value.flatMap(g => g.hashes).filter(h => !done[h]));

        async function blockAll() {
            if (!session.loggedIn) { if (await openDialog('login-required')) go('/login'); return; }
            if (!pending.value.length) return;
            if (!await openDialog('confirm-block-all', { count: pending.value.length, min: min.value })) return;
            const list = pending.value.slice();
            Object.assign(run, { active: true, done: 0, total: list.length });
            let failed = 0;
            for (const h of list) {
                try { await api.postForm('add_item', { type: 2, filter: h }); done[h] = true; } catch (e) { failed++; }
                run.done++;
            }
            saveJSON('sessionStorage', 'apply_status', done);
            run.active = false;
            if (failed) toast('有 ' + failed + ' 个用户没能屏蔽', { kind: 'err', sub: '可以稍后再点一次，已屏蔽的会自动跳过' });
            else if (onceFlag('bbl.syncGuide', 'tip')) openDialog('sync-guide');
            else toast('已屏蔽 ' + list.length + ' 个用户', { sub: '在 B 站播放器的屏蔽设定里点“同步屏蔽列表”后生效' });
        }
        async function share() {
            if (!session.loggedIn) { if (await openDialog('login-required')) go('/login'); return; }
            try { await api.postForm('share_user_blacklist', {}); toast('已上传你的用户黑名单', { sub: '统计每 20 分钟更新一次' }); }
            catch (e) { fail('上传', e); }
        }
        return { min, state, groups, total, pending, done, run, blockAll, share, fmt, session, load };
    },
    template: `
<div class="shell page">
  <div class="page-title">
    <div class="titled"><span class="en" aria-hidden="true">User blacklist</span><h1>用户黑名单</h1></div>
    <p>大家上传了自己屏蔽的弹幕发送者。一个人被越多网友屏蔽，越可能是刷屏或引战的账号。选一个门槛，把他们一次性加进你的屏蔽列表。</p>
  </div>
  <div class="panel">
    <div class="threshold">
      <label for="min">只看被至少 <output>{{ min }}</output> 位网友屏蔽的用户</label>
      <input id="min" type="range" min="1" max="20" v-model.number="min" />
    </div>
    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; align-items: center">
      <button class="btn primary" :disabled="run.active || !pending.length || state.loading" @click="blockAll">
        {{ run.active ? '正在屏蔽 ' + run.done + ' / ' + run.total : (pending.length ? '屏蔽这 ' + fmt(pending.length) + ' 个用户' : (total ? '已全部屏蔽' : '屏蔽这些用户')) }}
      </button>
      <button class="btn secondary" @click="share">上传我的用户黑名单</button>
      <span class="hint" v-if="!session.loggedIn">需要先 <a href="#/login">登录</a></span>
    </div>
    <div class="progress" v-if="run.active" style="margin-top: 14px"><span :style="{ width: (run.done / run.total * 100) + '%' }"></span></div>
  </div>
  <div class="panel">
    <div v-if="state.loading" class="skeleton"><span style="width: 30%"></span><span style="width: 90%"></span><span style="width: 80%"></span></div>
    <div v-else-if="state.error" class="empty"><h2>黑名单没加载出来</h2><p>可能是网络问题，稍后再试一次。</p><button class="btn secondary" @click="load">重新加载</button></div>
    <div v-else-if="!groups.length" class="empty"><h2>没有达到这个门槛的用户</h2><p>把门槛调低一些试试。</p></div>
    <div v-else>
      <section class="group" v-for="g in groups" :key="g.n">
        <h2>被 {{ g.n }} 位网友屏蔽 <span class="hint">{{ g.hashes.length }} 个</span></h2>
        <ul class="hash-list"><li v-for="h in g.hashes" :key="h" :class="{ done: done[h] }" :title="done[h] ? '已屏蔽' : null">{{ h }}<span v-if="done[h]" class="sr-only">，已屏蔽</span></li></ul>
      </section>
    </div>
  </div>
</div>`,
});

/* --- submit (#/submit) --- */
app.component('submit-view', {
    setup() {
        const form = reactive({ name: '', description: '', safe: 0, tags: [] });
        const filters = ref([]);
        const newType = ref(0); const newValue = ref('');
        const errors = reactive({}); const submitting = ref(false); const notice = ref('');
        const mine = useMyFilters();
        onMounted(() => { loadTags(); mine.load(); });
        watch(() => session.loggedIn, () => mine.load());
        const importable = computed(() => mine.state.list.filter(f => f.type != 2 && !filters.value.some(x => x.filter === f.filter)));
        const regexError = computed(() => { if (newType.value !== 1 || !newValue.value) return ''; try { new RegExp(newValue.value); return ''; } catch (e) { return '这个正则表达式写得不对'; } });
        function addFilter(type, value) {
            value = String(value || '').trim();
            if (!value) return false;
            if (filters.value.some(f => f.filter === value)) { notice.value = '“' + value + '”已经在列表里了'; return false; }
            filters.value.push({ type: Number(type), filter: value }); notice.value = ''; errors.filters = '';
            return true;
        }
        function addTyped() { if (!regexError.value && addFilter(newType.value, newValue.value)) newValue.value = ''; }
        function importAll() { for (const f of importable.value.slice()) addFilter(f.type, f.filter); }
        async function submit() {
            errors.name = form.name.trim() ? '' : '给屏蔽词包起个名字';
            errors.filters = filters.value.length ? '' : '至少添加一条屏蔽词';
            if (errors.name || errors.filters) return;
            submitting.value = true;
            try {
                await api.postForm('submit', {
                    name: form.name.trim(), description: form.description.trim(), filters: JSON.stringify(filters.value),
                    tags: form.tags.join(', '), 'safe-level': String(form.safe),
                });
                toast('已发布屏蔽词包', { sub: '在“最新发布”里可以看到它' });
                go('/', { sort: 'time' });
            } catch (e) { fail('发布', e); }
            submitting.value = false;
        }
        return { session, form, filters, newType, newValue, addTyped, addFilter, importAll, importable, mine, errors, submit, submitting, notice, regexError, allTags, SAFETY, TYPE_LABEL };
    },
    template: `
<div class="shell">
  <div class="page-title">
    <div class="titled"><span class="en" aria-hidden="true">Share a pack</span><h1>分享屏蔽词包</h1></div>
    <p>把你用着顺手的屏蔽词整理成一份，给它起个名字、写清楚屏蔽什么，别人就能一键用上。一份包最好只针对一类弹幕。</p>
  </div>
  <div v-if="!session.loggedIn" class="panel empty">
    <h2>登录后分享屏蔽词包</h2>
    <p>发布的屏蔽词包会显示你的 B 站 UID。</p>
    <a class="btn primary" href="#/login">登录</a>
  </div>
  <form v-else class="form-grid" @submit.prevent="submit" novalidate>
    <div class="stack">
      <div class="panel stack">
        <div class="field">
          <label for="f-name">名称</label>
          <input id="f-name" class="input" v-model="form.name" maxlength="60" placeholder="例如：抢前排弹幕" />
          <span class="error-text" v-if="errors.name">{{ errors.name }}</span>
        </div>
        <div class="field">
          <label for="f-desc">介绍 <span class="hint">（可选）</span></label>
          <textarea id="f-desc" class="textarea" v-model="form.description" maxlength="1000" placeholder="屏蔽哪类弹幕、会不会误伤，写给想用它的人看"></textarea>
        </div>
      </div>
      <div class="panel">
        <h2>屏蔽词 <span class="hint">{{ filters.length }} 条</span></h2>
        <p class="sub">支持文本和正则。用户屏蔽请到“用户黑名单”里分享。</p>
        <div class="inline-form">
          <div class="segmented" role="group" aria-label="类型">
            <button type="button" :aria-pressed="newType === 0" @click="newType = 0">文本</button>
            <button type="button" :aria-pressed="newType === 1" @click="newType = 1">正则</button>
          </div>
          <input class="input" :class="{ mono: newType === 1 }" v-model="newValue" @keydown.enter.prevent="addTyped" :placeholder="newType ? '例如：^(前排|第一)' : '例如：前方高能'" aria-label="屏蔽内容" />
          <button type="button" class="btn secondary" @click="addTyped" :disabled="!newValue.trim() || !!regexError">添加</button>
        </div>
        <p class="error-text" v-if="regexError || notice || errors.filters" style="margin-top: 8px">{{ regexError || notice || errors.filters }}</p>
        <div class="table-box scroll" v-if="filters.length" style="margin-top: 14px" tabindex="0" role="region" aria-label="已添加的屏蔽词">
          <table class="filter-table">
            <tr v-for="(f, i) in filters" :key="f.filter">
              <td class="type"><span class="type-pill" :class="'t' + f.type">{{ TYPE_LABEL[f.type] }}</span></td>
              <td class="val" :class="{ re: f.type == 1 }">{{ f.filter }}</td>
              <td class="act"><button type="button" class="btn ghost small" @click="filters.splice(i, 1)" :aria-label="'移除 ' + f.filter">移除</button></td>
            </tr>
          </table>
        </div>
      </div>
      <div class="panel stack">
        <div class="field">
          <span class="field-label">误伤程度</span>
          <div class="radio-cards" role="radiogroup" aria-label="误伤程度">
            <label class="radio-card" v-for="(s, i) in SAFETY" :key="i">
              <input type="radio" name="safe" :value="i" v-model="form.safe" />
              <strong class="safety" :class="s.cls">{{ s.label }}</strong><span>{{ s.hint }}</span>
            </label>
          </div>
        </div>
        <div class="field">
          <label for="f-tags">标签</label>
          <tag-picker input-id="f-tags" v-model="form.tags" :options="allTags" allow-new placeholder="分区、UP 主、弹幕类型，回车添加" />
          <span class="hint">好的标签能让别人更快找到它，例如 刷屏、剧透、动画区。</span>
        </div>
      </div>
      <div class="panel">
        <p class="hint" style="margin-bottom: 14px">发布后，屏蔽词包会以 <a href="https://creativecommons.org/publicdomain/zero/1.0/deed.zh" target="_blank" rel="noopener">CC0</a> 协议公开，并显示你的 UID {{ session.uid }}。</p>
        <button class="btn primary large" :disabled="submitting">{{ submitting ? '正在发布…' : '发布屏蔽词包' }}</button>
      </div>
    </div>
    <aside class="panel">
      <h2>从我的屏蔽词导入</h2>
      <p class="sub">你 B 站账号里现有的文本和正则屏蔽词。</p>
      <div v-if="mine.state.loading" class="skeleton"><span style="width: 60%"></span><span style="width: 80%"></span></div>
      <p v-else-if="mine.state.error" class="hint">没能读取你的屏蔽词，可以直接在左边手动添加。</p>
      <p v-else-if="!importable.length" class="hint">{{ mine.state.list.length ? '已经全部加进去了。' : '你的账号里还没有屏蔽词。' }}</p>
      <template v-else>
        <button type="button" class="btn secondary small" @click="importAll" style="margin-bottom: 10px">全部导入（{{ importable.length }}）</button>
        <div class="table-box scroll" tabindex="0" role="region" aria-label="可导入的屏蔽词">
          <table class="filter-table">
            <tr v-for="f in importable" :key="f.id">
              <td class="val" :class="{ re: f.type == 1 }">{{ f.filter }}</td>
              <td class="act"><button type="button" class="btn ghost small" @click="addFilter(f.type, f.filter)" :aria-label="'添加 ' + f.filter">添加</button></td>
            </tr>
          </table>
        </div>
      </template>
    </aside>
  </form>
</div>`,
});

/* --- login (#/login): QR code with automatic status checks, cookie login as a fallback --- */
app.component('login-view', {
    setup() {
        const oauth = reactive({ url: '', key: '' });
        const phase = ref('loading');   // loading | waiting | scanned | expired | error | done
        const qrSvg = ref('');
        const cookie = reactive({ DedeUserID: '', DedeUserID__ckMd5: '', SESSDATA: '', bili_jct: '' });
        const cookieBusy = ref(false);
        let poll = null, started = 0, alive = true;

        function renderQR(text) {
            const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
            qrSvg.value = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        }
        async function start() {
            stop(); phase.value = 'loading';
            try {
                const res = await api.get('login/getoauth', null, 10000);
                oauth.url = res.url; oauth.key = res.oauthKey;
                renderQR(res.url); phase.value = 'waiting'; started = Date.now();
                poll = setInterval(check, 3000);
            } catch (e) { phase.value = 'error'; }
        }
        function stop() { clearInterval(poll); poll = null; }
        async function check() {
            if (!alive || !oauth.key) return;
            if (Date.now() - started > 170000) { phase.value = 'expired'; stop(); return; }
            let res;
            try { res = await api.postJSON('login/getinfo', { oauthkey: oauth.key }, 8000); } catch (e) { return; }
            if (typeof res === 'number' || (typeof res === 'string' && /^-?\d+$/.test(res))) {
                const code = Number(res);
                if (code === -5) phase.value = 'scanned';
                else if (code === -2) { phase.value = 'expired'; stop(); }
                return;
            }
            const url = res && res.url;
            const m = url && /DedeUserID=(\d*?)&.*ckMd5=(.*?)&.*SESSDATA=(.*?)&.*bili_jct=(.*?)&/.exec(url);
            if (!m) return;
            stop(); phase.value = 'done';
            await finish({ DedeUserID: m[1], DedeUserID__ckMd5: m[2], SESSDATA: m[3], bili_jct: m[4] });
        }
        async function finish(data) {
            try {
                await api.postForm('login/cookies', data);
                refreshSession();
                if (!session.loggedIn) throw new Error('rejected');
                toast('已登录，UID ' + session.uid);
                go('/');
            } catch (e) {
                toast('登录没有成功', { kind: 'err', sub: 'B 站拒绝了这次登录，刷新二维码再试一次' });
                if (phase.value === 'done') phase.value = 'error';
            }
        }
        async function cookieLogin() { cookieBusy.value = true; await finish(Object.assign({}, cookie)); cookieBusy.value = false; }
        onMounted(() => { if (session.loggedIn) { go('/'); return; } start(); });
        onBeforeUnmount(() => { alive = false; stop(); });
        const stepIndex = computed(() => ({ waiting: 0, scanned: 1, done: 2 })[phase.value] ?? 0);
        return { phase, qrSvg, start, cookie, cookieLogin, cookieBusy, stepIndex, icons };
    },
    template: `
<div class="shell">
  <div class="login-wrap">
    <section class="panel">
      <h1>扫码登录</h1>
      <p class="sub">用哔哩哔哩手机客户端扫描二维码。网站拿不到你的密码。</p>
      <div class="qr-box">
        <div v-if="phase === 'loading'" class="hint">正在生成二维码…</div>
        <div v-else v-html="qrSvg" aria-label="登录二维码" role="img"></div>
        <div class="qr-overlay" v-if="phase === 'expired' || phase === 'error'">
          <div><p style="margin-bottom: 10px">{{ phase === 'expired' ? '二维码已过期' : '二维码没有生成出来' }}</p><button class="btn primary small" @click="start">刷新二维码</button></div>
        </div>
        <div class="qr-overlay" v-if="phase === 'scanned'"><p>已扫码，请在手机上点“确认登录”</p></div>
      </div>
      <ol class="steps">
        <li :class="{ current: stepIndex === 0, done: stepIndex > 0 }">打开哔哩哔哩手机客户端，点右上角的扫一扫</li>
        <li :class="{ current: stepIndex === 1, done: stepIndex > 1 }">扫码后在手机上确认登录</li>
        <li :class="{ current: stepIndex === 2 }">网站会自动完成登录，不用刷新页面</li>
      </ol>
      <p class="status-line" aria-live="polite">{{ { loading: '', waiting: '等待扫码…', scanned: '等待手机确认…', done: '正在登录…', expired: '', error: '' }[phase] }}</p>
    </section>
    <section class="panel">
      <h2>登录之前</h2>
      <p class="sub">登录后网站可以读取和修改你账号里的弹幕屏蔽词，这样才能一键应用屏蔽词包。</p>
      <div class="callout info"><span v-html="icons.info" style="display: contents"></span><div>数据库只记录你的 UID，不保存密码和 Cookie。使用本网站即表示你同意 <a href="eula.html">用户协议</a>，担心安全可以先看看 <a href="eula.html#qa">问答</a>。</div></div>
      <details class="more">
        <summary>扫码用不了？用 Cookie 登录</summary>
        <form class="cookie-form" @submit.prevent="cookieLogin">
          <p class="hint">在电脑浏览器登录 B 站后，从开发者工具的 Cookie 里复制这四项。</p>
          <div class="field" v-for="(k, i) in ['DedeUserID', 'DedeUserID__ckMd5', 'SESSDATA', 'bili_jct']" :key="k">
            <label :for="'ck-' + i">{{ k }}</label>
            <input :id="'ck-' + i" class="input mono" v-model="cookie[k]" :name="k" :type="i ? 'password' : 'text'" :inputmode="i ? null : 'numeric'" required autocomplete="off" spellcheck="false" />
          </div>
          <button class="btn primary" :disabled="cookieBusy">{{ cookieBusy ? '正在登录…' : '用 Cookie 登录' }}</button>
        </form>
      </details>
    </section>
  </div>
</div>`,
});

app.component('not-found', {
    template: `<div class="shell"><div class="empty" style="padding: 96px 0"><h1>这个页面不存在</h1><p>链接可能写错了。</p><a class="btn secondary" href="#/">回到屏蔽词包</a></div></div>`,
});

app.component('toast-stack', {
    setup() {
        function act(t) { dismissToast(t); t.action.run(); }
        return { toasts, icons, act, dismissToast };
    },
    template: `
<div class="toasts" role="status" aria-live="polite">
  <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">
    <span v-html="t.kind === 'err' ? icons.alert : icons.check"></span>
    <div class="t-body">{{ t.text }}<div class="t-sub" v-if="t.sub">{{ t.sub }}</div></div>
    <button v-if="t.action" type="button" class="t-action" @click="act(t)">{{ t.action.label }}</button>
    <button type="button" class="t-close" @click="dismissToast(t)" aria-label="关闭通知" v-html="icons.close"></button>
  </div>
</div>`,
});

app.component('app-dialog', {
    setup() {
        const primary = ref(null);
        let restoreFocus = null;
        watch(() => dialog.name, n => {
            if (n) { restoreFocus = rememberFocus(); nextTick(() => primary.value && primary.value.focus()); }
            else if (restoreFocus) { restoreFocus(); restoreFocus = null; }
        });
        function onKey(e) { if (e.key === 'Escape' && dialog.name) closeDialog(false); }
        onMounted(() => document.addEventListener('keydown', onKey));
        onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
        return { dialog, closeDialog, primary };
    },
    template: `
<div class="dialog-wrap" v-if="dialog.name" @click.self="closeDialog(false)">
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-body">
    <template v-if="dialog.name === 'login-required'">
      <h2 id="dlg-title">先登录 B 站账号</h2>
      <p id="dlg-body">应用屏蔽词、屏蔽用户和发表评价都需要登录，这样网站才能把屏蔽词写进你的账号。只想要文件的话，可以用“导出 XML”。</p>
      <div class="actions"><button class="btn ghost" @click="closeDialog(false)">取消</button><button ref="primary" class="btn primary" @click="closeDialog(true)">去登录</button></div>
    </template>
    <template v-else-if="dialog.name === 'sync-guide'">
      <h2 id="dlg-title">已应用到账号，还差一步</h2>
      <p id="dlg-body">屏蔽词已经写进你的 B 站账号。播放器要同步一次才会生效：</p>
      <ol><li>打开任意一个 B 站视频</li><li>点播放器右侧弹幕列表上方的“屏蔽设定”</li><li>点“同步屏蔽列表”</li></ol>
      <div class="actions"><button ref="primary" class="btn primary" @click="closeDialog(true)">知道了</button></div>
    </template>
    <template v-else-if="dialog.name === 'import-guide'">
      <h2 id="dlg-title">已导出 XML</h2>
      <p id="dlg-body">在 B 站播放器里导入这个文件：</p>
      <ol><li>打开任意一个 B 站视频，点“屏蔽设定”</li><li>在屏蔽列表里点右键，选“导入 xml 文件”</li><li>选择刚下载的文件</li></ol>
      <div class="actions"><button ref="primary" class="btn primary" @click="closeDialog(true)">知道了</button></div>
    </template>
    <template v-else-if="dialog.name === 'confirm-block-all'">
      <h2 id="dlg-title">屏蔽 {{ dialog.data.count }} 个用户？</h2>
      <p id="dlg-body">会把被至少 {{ dialog.data.min }} 位网友屏蔽的 {{ dialog.data.count }} 个用户加进你的 B 站屏蔽列表。之后可以在“我的屏蔽”里逐个删除。</p>
      <div class="actions"><button class="btn ghost" @click="closeDialog(false)">取消</button><button ref="primary" class="btn primary" @click="closeDialog(true)">屏蔽 {{ dialog.data.count }} 个用户</button></div>
    </template>
  </div>
</div>`,
});

app.mount('#app');
})();
