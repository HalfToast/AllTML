import { buildSrcdoc } from './srcdoc.js';
import { stripAutoNavigation } from './sanitize.js';
import { randomId } from './util.js';

const DEFAULT_HEIGHT = 300;
const MAX_HEIGHT = 200000;
const RUNAWAY_WINDOW_MS = 1000;
const RUNAWAY_STEPS = 20;
const MAX_NAV_RESTORES = 3;
// no scripts, so this one can't navigate anywhere
const STOPPED_PAGE = `<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
    '<p style="font:14px sans-serif;color:#888">AllTML stopped this page because it kept trying to navigate away.</p>';

/**
 * @typedef {object} FrameOptions
 * @property {string} html Repaired page HTML
 * @property {boolean} scripts Allow page scripts
 * @property {boolean} externalAllowed Allow web fonts/images/scripts
 * @property {{color?: string, fontFamily?: string}} theme
 * @property {'inline'|'fullscreen'} mode
 * @property {string} [cacheKey] Remembers the height across re-renders (inline only)
 * @property {(message: string) => void} [onError]
 */

/** @type {Map<string, {iframe: HTMLIFrameElement, options: FrameOptions, height: number, growth: number[], locked: boolean}>} */
const frames = new Map();
/** @type {Map<string, number>} */
const heightCache = new Map();
/** @type {WeakMap<Element, () => void>} */
const pendingLoads = new WeakMap();
/** @type {IntersectionObserver|null} */
let lazyObserver = null;
let listening = false;

/**
 * Creates a sandboxed iframe for one page inside `container`.
 * @param {Element} container
 * @param {FrameOptions} options
 * @returns {HTMLIFrameElement}
 */
export function mountFrame(container, options) {
    ensureListener();
    const frameId = randomId();
    const iframe = document.createElement('iframe');
    iframe.className = 'alltml-frame';
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('title', 'AllTML page');
    frames.set(frameId, { iframe, options, height: 0, growth: [], locked: false });

    const { html, removed } = stripAutoNavigation(options.html);
    if (removed) {
        console.warn(`[AllTML] Removed ${removed} navigation/prefetch tag(s) from a page.`);
    }

    // CSP can't stop a page navigating its own frame, so put it back when it does.
    // `armed` ignores the about:blank load new iframes fire before load(), lazy frames always hit it
    let armed = false;
    let expectingLoad = false;
    let restoreCount = 0;
    const load = () => {
        armed = true;
        expectingLoad = true;
        iframe.srcdoc = buildSrcdoc(html, {
            frameId,
            parentOrigin: window.location.origin,
            scripts: options.scripts,
            externalAllowed: options.externalAllowed,
            nonce: randomId(),
            theme: options.theme,
        });
    };

    iframe.addEventListener('load', () => {
        if (!armed) return;
        if (expectingLoad) {
            expectingLoad = false;
            return;
        }
        if (restoreCount >= MAX_NAV_RESTORES) {
            // disarm or the notice's own load looks like another navigation
            armed = false;
            console.warn('[AllTML] A page kept trying to navigate away; stopping it.');
            iframe.srcdoc = STOPPED_PAGE;
            return;
        }
        restoreCount++;
        console.warn('[AllTML] A page tried to navigate away; restoring it.');
        load();
    });

    if (options.mode === 'inline') {
        iframe.style.height = `${heightCache.get(options.cacheKey) ?? DEFAULT_HEIGHT}px`;
        container.append(iframe);
        loadWhenNearView(iframe, load);
    } else {
        iframe.classList.add('alltml-frame-fullscreen');
        container.append(iframe);
        load();
    }
    return iframe;
}

/**
 * Shows a page in a large overlay, still sandboxed.
 * @param {Omit<FrameOptions, 'mode'|'cacheKey'>} options
 */
export function openFullscreen(options) {
    if (document.querySelector('.alltml-overlay')) return;
    // <dialog> so it goes in the top layer. On mobile ST a fixed div collapsed to a 32px strip
    // (<html> has translateZ(0) and zero height there)
    const overlay = document.createElement('dialog');
    overlay.className = 'alltml-overlay';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'alltml-button alltml-overlay-close';
    close.innerHTML = '<i class="fa-solid fa-xmark"></i> Close';
    const body = document.createElement('div');
    body.className = 'alltml-overlay-body';
    overlay.append(close, body);
    document.body.append(overlay);
    overlay.showModal();
    mountFrame(body, { ...options, mode: 'fullscreen', cacheKey: undefined });

    // capture phase, ST's own Escape handler stops generation
    const onKey = (event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        event.preventDefault();
        dismiss();
    };
    function dismiss() {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        sweepFrames();
    }
    close.addEventListener('click', dismiss);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) dismiss();
    });
    // Escape via the dialog itself
    overlay.addEventListener('cancel', (event) => {
        event.preventDefault();
        dismiss();
    });
    document.addEventListener('keydown', onKey, true);
    close.focus();
}

// forget frames that left the DOM
export function sweepFrames() {
    for (const [id, entry] of frames) {
        if (!entry.iframe.isConnected) {
            frames.delete(id);
            lazyObserver?.unobserve(entry.iframe);
            pendingLoads.delete(entry.iframe);
        }
    }
}

function loadWhenNearView(iframe, load) {
    if (typeof IntersectionObserver !== 'function') {
        load();
        return;
    }
    const root = document.getElementById('chat');
    if (!lazyObserver || lazyObserver.root !== root) {
        lazyObserver?.disconnect();
        lazyObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                lazyObserver.unobserve(entry.target);
                const pending = pendingLoads.get(entry.target);
                pendingLoads.delete(entry.target);
                pending?.();
            }
        }, { root, rootMargin: '100% 0px' });
    }
    pendingLoads.set(iframe, load);
    lazyObserver.observe(iframe);
}

function ensureListener() {
    if (listening) return;
    listening = true;
    window.addEventListener('message', onMessage);
}

/** @param {MessageEvent} event */
function onMessage(event) {
    const data = event.data;
    if (!data || data.alltml !== 1 || typeof data.id !== 'string') return;
    const entry = frames.get(data.id);
    // must come from the frame that owns the id
    if (!entry || event.source !== entry.iframe.contentWindow) return;

    switch (data.type) {
        case 'resize':
            onResize(entry, data.height);
            break;
        case 'openLink':
            openLink(data.url);
            break;
        case 'scrollTo':
            scrollToInFrame(entry, data.top);
            break;
        case 'error':
            entry.options.onError?.(String(data.message ?? 'Script error'));
            break;
    }
}

function onResize(entry, rawHeight) {
    if (entry.options.mode !== 'inline' || entry.locked) return;
    const height = Math.min(Math.ceil(Number(rawHeight)), MAX_HEIGHT);
    if (!Number.isFinite(height) || height < 0 || height === entry.height) return;
    if (isRunaway(entry, height)) {
        lockHeight(entry);
        return;
    }
    applyHeight(entry, height);
}

// vh-sized pages grow whenever the frame does, so catch the loop
function isRunaway(entry, height) {
    const now = performance.now();
    if (height > entry.height) {
        entry.growth = entry.growth.filter((time) => now - time < RUNAWAY_WINDOW_MS);
        entry.growth.push(now);
    } else {
        entry.growth = [];
    }
    return entry.growth.length >= RUNAWAY_STEPS;
}

function lockHeight(entry) {
    entry.locked = true;
    const chat = document.getElementById('chat');
    const available = chat?.clientHeight || window.innerHeight;
    applyHeight(entry, Math.max(200, Math.round(available * 0.9)));
    entry.iframe.classList.add('alltml-frame-locked');
    console.warn('[AllTML] A page kept growing (it probably sizes itself to the window height), so it now scrolls inside a fixed-height frame.');
}

function applyHeight(entry, height) {
    const chat = document.getElementById('chat');
    const pinnedToBottom = !!chat && chat.scrollHeight - chat.scrollTop - chat.clientHeight < 4;
    entry.height = height;
    entry.iframe.style.height = `${height}px`;
    if (entry.options.cacheKey) {
        heightCache.set(entry.options.cacheKey, height);
    }
    if (pinnedToBottom) {
        chat.scrollTop = chat.scrollHeight;
    }
}

function openLink(url) {
    let parsed;
    try {
        parsed = new URL(String(url));
    } catch {
        return;
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        window.open(parsed.href, '_blank', 'noopener,noreferrer');
    }
}

function scrollToInFrame(entry, top) {
    const offset = Number(top);
    if (entry.options.mode !== 'inline' || entry.locked || !Number.isFinite(offset)) return;
    // only if the user is actually using this frame
    if (document.activeElement !== entry.iframe) return;
    const chat = document.getElementById('chat');
    const frameTop = entry.iframe.getBoundingClientRect().top;
    if (chat) {
        chat.scrollBy({ top: frameTop - chat.getBoundingClientRect().top + offset - 16, behavior: 'smooth' });
    } else {
        window.scrollBy({ top: frameTop + offset - 16, behavior: 'smooth' });
    }
}
