/**
 * @typedef {{type: 'prose', text: string}} ProseSegment
 * @typedef {{type: 'html', html: string, fenced: boolean, unterminated: boolean}} HtmlSegment
 * @typedef {ProseSegment | HtmlSegment} Segment
 */

const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})[ \t]*([^\s`~]*)/;
const FENCE_CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;
// lookahead so the match length is just the indentation
const DOC_START = /^[ \t]*(?=<!doctype\s+html|<html(?:[\s>]|$))/i;
const DOCTYPE_START = /^[ \t]*<!doctype\s+html/i;
const DOC_END = /<\/html\s*>/i;
const HAS_DOCUMENT = /<!doctype\s+html|<html[\s>]/i;
const HAS_STYLE_OR_SCRIPT = /<(?:style|script)[\s>]/i;

/**
 * Splits raw message text into prose and renderable HTML segments.
 * @param {string} text Raw message text
 * @param {object} [options]
 * @param {boolean} [options.renderDocuments=true] Render complete HTML documents, unfenced or in ```html / bare ``` blocks
 * @param {boolean} [options.renderFencedBlocks=true] Render ```html blocks containing <style> or <script>
 * @param {boolean} [options.streaming=false] Message is still streaming; any ```html block counts
 * @returns {Segment[]}
 */
export function detect(text, { renderDocuments = true, renderFencedBlocks = true, streaming = false } = {}) {
    /** @type {Segment[]} */
    const segments = [];
    const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
    let prose = [];

    const flushProse = () => {
        pushProse(segments, prose.join('\n'));
        prose = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const start = renderDocuments ? DOC_START.exec(lines[i]) : null;
        if (start) {
            flushProse();
            const page = readDocument(lines, i, start[0].length);
            segments.push({ type: 'html', html: page.html, fenced: false, unterminated: false });
            // anything after </html> on the same line is prose
            if (page.tail) prose.push(page.tail);
            i = page.lastLine;
            continue;
        }

        const open = FENCE_OPEN.exec(lines[i]);
        if (!open) {
            prose.push(lines[i]);
            continue;
        }

        const fence = open[1];
        let end = i + 1;
        while (end < lines.length && !isClosingFence(lines[end], fence)) {
            end++;
        }
        const unterminated = end >= lines.length;
        const body = lines.slice(i + 1, end).join('\n');
        const lang = open[2].toLowerCase();
        const render = lang === 'html'
            ? shouldRenderFenced(body, { renderDocuments, renderFencedBlocks, streaming })
            : lang === '' && renderDocuments && startsAsDocument(body, streaming);

        flushProse();
        if (render) {
            segments.push({ type: 'html', html: body, fenced: true, unterminated });
        } else {
            // not ours, keep it as-is so nothing inside gets picked up as a document
            pushProse(segments, lines.slice(i, end + 1).join('\n'));
        }
        i = end;
    }
    flushProse();
    return segments;
}

function isClosingFence(line, fence) {
    const close = FENCE_CLOSE.exec(line);
    return !!close && close[1][0] === fence[0] && close[1].length >= fence.length;
}

function shouldRenderFenced(body, { renderDocuments, renderFencedBlocks, streaming }) {
    if (streaming) {
        return renderDocuments || renderFencedBlocks;
    }
    if (renderDocuments && HAS_DOCUMENT.test(body)) {
        return true;
    }
    return renderFencedBlocks && HAS_STYLE_OR_SCRIPT.test(body);
}

/**
 * Bare ``` blocks only count as a page if they open with the doctype or <html>.
 * While streaming, a partial "<!DOC" is enough.
 * @param {string} body
 * @param {boolean} streaming
 * @returns {boolean}
 */
function startsAsDocument(body, streaming) {
    const opening = body.trimStart();
    if (DOC_START.test(opening)) {
        return true;
    }
    if (!streaming || !opening) {
        return false;
    }
    const head = opening.slice(0, 15).toLowerCase();
    return '<!doctype html'.startsWith(head) || '<html'.startsWith(head);
}

/**
 * Reads an unfenced document from `lines[first]` up to the last </html> before the next document.
 * Last, not first, because scripts sometimes have "</html>" in a string.
 * @param {string[]} lines
 * @param {number} first Index of the line where the document starts
 * @param {number} indent Characters of indentation before the document on that line
 * @returns {{html: string, tail: string, lastLine: number}} `tail` is the rest of `lines[lastLine]` after </html>
 */
function readDocument(lines, first, indent) {
    // doctype always starts a new doc, <html> only once this one has closed
    let closed = DOC_END.test(lines[first]);
    let next = first + 1;
    for (; next < lines.length; next++) {
        if (DOCTYPE_START.test(lines[next]) || (closed && DOC_START.test(lines[next]))) break;
        closed ||= DOC_END.test(lines[next]);
    }
    const text = lines.slice(first, next).join('\n').slice(indent);
    let endIndex = -1;
    for (const match of text.matchAll(new RegExp(DOC_END, 'gi'))) {
        endIndex = match.index + match[0].length;
    }
    if (endIndex < 0) {
        return { html: text, tail: '', lastLine: next - 1 };
    }
    // lines after </html> go back to the main loop
    const rest = text.slice(endIndex).split('\n');
    return { html: text.slice(0, endIndex), tail: rest[0], lastLine: next - rest.length };
}

// merges into the previous prose segment, skips blank text
function pushProse(segments, text) {
    if (!text.trim()) {
        return;
    }
    const last = segments.at(-1);
    if (last?.type === 'prose') {
        last.text += `\n${text}`;
    } else {
        segments.push({ type: 'prose', text });
    }
}
