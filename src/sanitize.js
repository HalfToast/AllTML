// resource hints hit the network on their own and CSP doesn't reliably cover them
const PREFETCH_RELS = ['preconnect', 'dns-prefetch', 'prefetch', 'prerender', 'modulepreload'];
const MAX_PASSES = 3;

/**
 * Strips `<meta http-equiv="refresh">` and resource-hint `<link>`s. Chromium only blocks meta
 * refresh when scripts are off, and our frames always have allow-scripts.
 * Returns the input untouched if there's nothing to strip.
 * @param {string} html Page HTML
 * @returns {{html: string, removed: number}} `removed` counts navigation/prefetch tags
 */
export function stripAutoNavigation(html) {
    // no <meta or <link, nothing to do
    if (!/<(?:meta|link)[\s/>]/i.test(html)) {
        return { html, removed: 0 };
    }
    let current = html;
    let removed = 0;
    // re-serialising isn't always stable, so go again until it's clean (nav guard in frame.js is the backstop)
    for (let pass = 0; pass < MAX_PASSES; pass++) {
        // doctype to match buildSrcdoc
        const doc = new DOMParser().parseFromString(`<!DOCTYPE html>${current}`, 'text/html');
        const tags = findAll(doc, 'meta[http-equiv], link[rel]').filter(isAutoNavigation);
        if (!tags.length) {
            break;
        }
        tags.forEach((tag) => tag.remove());
        // DOMParser reads <noscript> as markup but the frame reads it as text, so re-serialising
        // could turn text into a live tag. It never shows with scripts on anyway.
        findAll(doc, 'noscript').forEach((element) => element.remove());
        removed += tags.length;
        current = doc.documentElement.outerHTML;
    }
    return { html: current, removed };
}

/**
 * querySelectorAll that also looks in <template>s, since `<template shadowrootmode>` becomes
 * a real shadow root in the frame.
 * @param {Document} doc
 * @param {string} selector
 * @returns {Element[]}
 */
function findAll(doc, selector) {
    const found = [];
    const roots = [doc];
    for (let i = 0; i < roots.length; i++) {
        found.push(...roots[i].querySelectorAll(selector));
        roots[i].querySelectorAll('template').forEach((template) => roots.push(template.content));
    }
    return found;
}

/**
 * @param {Element} element A meta[http-equiv] or link[rel]
 * @returns {boolean}
 */
function isAutoNavigation(element) {
    if (element.localName === 'meta') {
        return element.getAttribute('http-equiv').trim().toLowerCase() === 'refresh';
    }
    const rels = element.getAttribute('rel').toLowerCase().split(/\s+/);
    return rels.some((rel) => PREFETCH_RELS.includes(rel));
}
