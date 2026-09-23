import { helperSource } from './helper.js';

/**
 * Content-Security-Policy for one page. A page's own CSP can only tighten this.
 * @param {{scripts: boolean, externalAllowed: boolean, nonce: string}} options
 * @returns {string}
 */
export function buildCsp({ scripts, externalAllowed, nonce }) {
    const web = externalAllowed ? ' https:' : '';
    // a nonce makes browsers ignore 'unsafe-inline', so only use it with scripts off
    const scriptSrc = scripts ? `'unsafe-inline' 'unsafe-eval'${web}` : `'nonce-${nonce}'`;
    return [
        "default-src 'none'",
        `script-src ${scriptSrc}`,
        `style-src 'unsafe-inline' data:${web}`,
        `img-src data: blob:${web}`,
        `media-src data: blob:${web}`,
        `font-src data: blob:${web}`,
        `connect-src ${externalAllowed ? 'https:' : "'none'"}`,
        "form-action 'none'",
        "base-uri 'none'",
        "frame-src 'none'",
        "object-src 'none'",
    ].join('; ');
}

/**
 * CSP, theme and helper go in front of the page so they apply first. Always prepends a doctype,
 * the parser ignores any later one. (Don't try detecting an existing one, `<!-->` can hide it.)
 * @param {string} html Repaired page HTML
 * @param {object} options
 * @param {string} options.frameId
 * @param {string} options.parentOrigin
 * @param {boolean} options.scripts
 * @param {boolean} options.externalAllowed
 * @param {string} options.nonce
 * @param {{color?: string, fontFamily?: string}} [options.theme]
 * @returns {string}
 */
export function buildSrcdoc(html, { frameId, parentOrigin, scripts, externalAllowed, nonce, theme = {} }) {
    const injected =
        `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(buildCsp({ scripts, externalAllowed, nonce }))}">` +
        themeStyle(theme) +
        `<script nonce="${escapeAttribute(nonce)}">${helperSource({ frameId, parentOrigin })}</script>`;

    return `<!DOCTYPE html>${injected}${html}`;
}

/**
 * Zero-specificity defaults so unstyled pages match SillyTavern's theme; any page CSS wins.
 * @param {{color?: string, fontFamily?: string}} theme
 * @returns {string}
 */
function themeStyle({ color, fontFamily }) {
    const rules = [];
    if (color) rules.push(`color:${cssValue(color)}`);
    if (fontFamily) rules.push(`font-family:${cssValue(fontFamily)}`);
    return rules.length ? `<style>:where(html){${rules.join(';')}}</style>` : '';
}

const cssValue = (value) => String(value).replace(/[<>{};]/g, '');
const escapeAttribute = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
