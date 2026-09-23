/**
 * Script injected at the top of every page. Runs in the sandbox, so postMessage is all it has.
 * @param {{frameId: string, parentOrigin: string}} options
 * @returns {string} JavaScript source
 */
export function helperSource({ frameId, parentOrigin }) {
    const origin = parentOrigin && parentOrigin !== 'null' ? parentOrigin : '*';
    // escape < so nothing can close the <script>
    const config = JSON.stringify({ id: frameId, origin }).replace(/</g, '\\u003c');
    return `(${helperMain.toString()})(${config});`;
}

/**
 * Gets stringified into the frame, so it can't use anything outside its own body.
 * @param {{id: string, origin: string}} config
 */
function helperMain(config) {
    const send = (type, data) => {
        try {
            window.parent.postMessage(Object.assign({ alltml: 1, type: type, id: config.id }, data), config.origin);
        } catch (e) { /* parent's gone */ }
    };

    // no storage in the sandbox, and pages that use it tend to crash, so fake it
    ['localStorage', 'sessionStorage'].forEach((name) => {
        try {
            if (window[name]) return;
        } catch (e) { /* denied */ }
        const data = new Map();
        const storage = {
            getItem: (key) => (data.has(String(key)) ? data.get(String(key)) : null),
            setItem: (key, value) => { data.set(String(key), String(value)); },
            removeItem: (key) => { data.delete(String(key)); },
            clear: () => { data.clear(); },
            key: (index) => { const keys = Array.from(data.keys()); return index < keys.length ? keys[index] : null; },
            get length() { return data.size; },
        };
        try {
            Object.defineProperty(window, name, { value: storage, configurable: true });
        } catch (e) { /* give up */ }
    });

    // 100vh here is the iframe's height, so min-height:100vh would grow forever
    const relax = (el) => {
        if (!el) return;
        el.style.setProperty('min-height', '0');
        el.style.setProperty('height', 'auto');
    };
    relax(document.documentElement);

    let lastHeight = -1;
    let queued = false;
    const measure = () => {
        const root = document.documentElement;
        const content = Math.ceil(root.getBoundingClientRect().height);
        // scrollHeight never goes below the frame height, only use it for real overflow
        const overflow = root.scrollHeight > window.innerHeight ? root.scrollHeight : 0;
        return Math.max(content, overflow);
    };
    const report = () => {
        queued = false;
        const height = measure();
        if (height !== lastHeight) {
            lastHeight = height;
            send('resize', { height: height });
        }
    };
    // not rAF, it's paused in offscreen frames
    const schedule = () => {
        if (!queued) {
            queued = true;
            setTimeout(report, 16);
        }
    };
    const start = () => {
        relax(document.documentElement);
        relax(document.body);
        if (typeof ResizeObserver === 'function') {
            const observer = new ResizeObserver(schedule);
            observer.observe(document.documentElement);
            if (document.body) observer.observe(document.body);
        }
        schedule();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
    window.addEventListener('load', schedule);

    // #anchors scroll, http(s) links get opened by the parent, anything else does nothing
    window.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        // composedPath for links in shadow roots, event.target would be the host
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
        const link = path.find((node) => node instanceof Element && node.matches('a[href], area[href], a[*|href]'));
        if (!link) return;
        const href = (link.getAttribute('href') || link.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '').trim();
        if (/^javascript:/i.test(href)) return;
        event.preventDefault();
        if (href.startsWith('#')) {
            let target = document.body;
            if (href.length > 1) {
                let id = href.slice(1);
                try { id = decodeURIComponent(id); } catch (e) { /* use as-is */ }
                target = document.getElementById(id) || document.getElementsByName(id)[0];
            }
            if (target) {
                target.scrollIntoView({ block: 'start' });
                send('scrollTo', { top: target.getBoundingClientRect().top + window.scrollY });
            }
            return;
        }
        let url;
        try {
            url = new URL(href);
        } catch (e) {
            return;
        }
        if (url.protocol === 'https:' || url.protocol === 'http:') {
            send('openLink', { url: url.href });
        }
    });

    let errorCount = 0;
    const reportError = (message) => {
        if (errorCount >= 5) return;
        errorCount++;
        send('error', { message: String(message).slice(0, 300) });
    };
    window.addEventListener('error', (event) => reportError(event.message || 'Script error'));
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        reportError(reason && reason.message ? reason.message : reason);
    });
}
