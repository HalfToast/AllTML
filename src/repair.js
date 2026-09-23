// CSS lines never start with a tag, so that's where an unclosed <style> should end
const TAG_LINE = /^[ \t]*<\/?[a-zA-Z]/m;
const MAX_FIXES_PER_TAG = 50;

/**
 * Fixes what the browser can't recover from on its own. Unclosed divs etc are left to the browser.
 * @param {string} html
 * @returns {{html: string, fixes: string[]}}
 */
export function repair(html) {
    const input = String(html ?? '');
    try {
        const fixes = [];
        let output = trimCutOffTag(input);
        if (output !== input) {
            fixes.push('Removed a cut-off tag at the end');
        }
        for (const tag of ['style', 'script']) {
            const result = closeRawTextElement(output, tag);
            if (result.count) {
                output = result.html;
                fixes.push(`Added ${result.count} missing </${tag}>`);
            }
        }
        return { html: output, fixes };
    } catch (error) {
        console.error('[AllTML] repair failed', error);
        return { html: input, fixes: [] };
    }
}

/**
 * Drops a cut-off tag at the end, e.g. `<div class="ca`
 * @param {string} html
 * @returns {string}
 */
function trimCutOffTag(html) {
    const lastOpen = html.lastIndexOf('<');
    if (lastOpen === -1 || html.indexOf('>', lastOpen) !== -1) {
        return html;
    }
    return /^<\/?[a-zA-Z!]/.test(html.slice(lastOpen)) ? html.slice(0, lastOpen).trimEnd() : html;
}

/**
 * Closes unclosed <style>/<script>, otherwise the rest of the page gets eaten as CSS/JS.
 * @param {string} html
 * @param {'style'|'script'} tag
 * @returns {{html: string, count: number}}
 */
function closeRawTextElement(html, tag) {
    const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
    const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');
    let output = html;
    let count = 0;

    while (count < MAX_FIXES_PER_TAG) {
        // openers before the last close tag are fine, the first one after it isn't
        openRe.lastIndex = lastMatchEnd(output, closeRe);
        const open = openRe.exec(output);
        if (!open) {
            break;
        }
        const contentStart = open.index + open[0].length;
        const boundary = TAG_LINE.exec(output.slice(contentStart));
        const insertAt = boundary ? contentStart + boundary.index : output.length;
        output = `${output.slice(0, insertAt)}</${tag}>\n${output.slice(insertAt)}`;
        count++;
    }
    return { html: output, count };
}

function lastMatchEnd(text, re) {
    re.lastIndex = 0;
    let end = 0;
    let match;
    while ((match = re.exec(text))) {
        end = match.index + match[0].length;
    }
    return end;
}
