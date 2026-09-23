/**
 * FNV-1a, 32 bit. Used to tell if a message needs re-rendering.
 * @param {string} str
 * @returns {string} 8 lowercase hex characters
 */
export function hashString(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Random id for frames and nonces. Not randomUUID, that's missing over plain http.
 * @returns {string} 32 lowercase hex characters
 */
export function randomId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Download name from the page's <title>.
 * @param {string} html
 * @returns {string}
 */
export function fileNameFromHtml(html) {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
    const base = title
        .replace(/<[^>]*>/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    return `${base || 'alltml-page'}.html`;
}
