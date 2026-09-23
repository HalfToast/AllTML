import { mountFrame, openFullscreen } from './frame.js';
import { fileNameFromHtml } from './util.js';

export const ROOT_CLASS = 'alltml-root';
// the helper caps each load at 5 too, this is for pages that keep reloading
const MAX_ERRORS = 5;

/**
 * @typedef {object} RenderParams
 * @property {import('./detect.js').Segment[]} segments
 * @property {string} key Stored on the root so unchanged messages are skipped
 * @property {boolean} streaming Show placeholders instead of pages
 * @property {(text: string) => string} formatProse SillyTavern's formatter for prose
 * @property {(html: string) => {html: string, fixes: string[]}} repair
 * @property {{scripts: boolean, externalAllowed: boolean, theme: {color?: string, fontFamily?: string}}} frame
 * @property {boolean} showControlBar
 * @property {string} cachePrefix Prefix for per-page height cache keys
 */

/**
 * @param {Element} mesText The message's .mes_text element
 * @param {RenderParams} params
 */
export function renderMessage(mesText, params) {
    const root = element('div', ROOT_CLASS);
    root.dataset.key = params.key;
    params.segments.forEach((segment, index) => {
        if (segment.type === 'prose') {
            const prose = element('div', 'alltml-prose');
            prose.innerHTML = params.formatProse(segment.text);
            root.append(prose);
        } else if (params.streaming) {
            root.append(createPlaceholder(segment.html));
        } else {
            root.append(createBlock(segment, `${params.cachePrefix}:${index}`, params));
        }
    });
    mesText.replaceChildren(root);
}

function createPlaceholder(html) {
    const placeholder = element('div', 'alltml-placeholder');
    const label = element('span');
    label.textContent = `AllTML · receiving page… ${(html.length / 1024).toFixed(1)} KB`;
    placeholder.append(element('i', 'fa-solid fa-spinner fa-spin'), label);
    return placeholder;
}

/**
 * @param {import('./detect.js').HtmlSegment} segment
 * @param {string} cacheKey
 * @param {RenderParams} params
 */
function createBlock(segment, cacheKey, params) {
    const { html, fixes: repairFixes } = params.repair(segment.html);
    const fixes = segment.unterminated ? ['Closing ``` fence was missing', ...repairFixes] : repairFixes;
    const block = element('div', 'alltml-block');
    const frameWrap = element('div', 'alltml-frame-wrap');
    block.append(frameWrap);

    const errors = [];
    /** @type {HTMLElement|null} */
    let warning = null;
    const frameOptions = {
        html,
        ...params.frame,
        onError: (message) => {
            if (errors.length >= MAX_ERRORS) return;
            errors.push(message);
            if (warning) {
                warning.hidden = false;
                warning.title = `Script errors in this page:\n${errors.join('\n')}`;
            }
        },
    };
    mountFrame(frameWrap, { ...frameOptions, mode: 'inline', cacheKey });

    if (params.showControlBar) {
        const bar = element('div', 'alltml-bar');
        const source = element('div', 'alltml-source');
        source.hidden = true;
        warning = element('span', 'alltml-errors fa-solid fa-triangle-exclamation');
        warning.hidden = true;
        bar.append(warning);
        if (fixes.length) {
            const fixed = element('span', 'alltml-fixed');
            fixed.textContent = 'repaired';
            fixed.title = fixes.join('\n');
            bar.append(fixed);
        }
        bar.append(
            button('fa-code', 'Source', () => toggleSource(source, html, fixes)),
            button('fa-expand', 'Fullscreen', () => openFullscreen({ ...frameOptions, onError: undefined })),
            button('fa-download', 'Save .html', () => downloadHtml(html)),
        );
        block.append(bar, source);
    }
    return block;
}

function toggleSource(source, html, fixes) {
    if (!source.childElementCount) {
        if (fixes.length) {
            const list = element('ul');
            for (const fix of fixes) {
                const item = element('li');
                item.textContent = fix;
                list.append(item);
            }
            source.append(list);
        }
        const copy = button('fa-copy', 'Copy', async () => {
            const copied = await copyText(html);
            const toast = globalThis.toastr;
            copied ? toast?.success('Page source copied') : toast?.error('Could not copy the page source');
        });
        const pre = element('pre');
        const code = element('code');
        code.textContent = html;
        pre.append(code);
        source.append(copy, pre);
    }
    source.hidden = !source.hidden;
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // no clipboard API over plain http (LAN setups)
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.append(area);
        area.select();
        const copied = document.execCommand('copy');
        area.remove();
        return copied;
    }
}

function downloadHtml(html) {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileNameFromHtml(html);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function button(icon, label, onClick) {
    const el = element('button', 'alltml-button');
    el.type = 'button';
    el.title = label;
    el.append(element('i', `fa-solid ${icon}`), ` ${label}`);
    el.addEventListener('click', (event) => {
        event.stopPropagation();
        onClick();
    });
    return el;
}

/**
 * @param {string} tag
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function element(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
}
