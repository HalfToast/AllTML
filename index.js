import { detect } from './src/detect.js';
import { repair } from './src/repair.js';
import { renderMessage, ROOT_CLASS } from './src/render.js';
import { sweepFrames } from './src/frame.js';
import { isExternalAllowed } from './src/media.js';
import { loadSettings, bindSettingsPanel } from './src/settings.js';
import { hashString } from './src/util.js';

// e.g. "third-party/AllTML", depends on where it was installed
const EXTENSION_PATH = new URL('.', import.meta.url).pathname
    .replace(/^.*\/scripts\/extensions\//, '')
    .replace(/\/$/, '');

/** @type {import('./src/settings.js').Settings} */
let settings;
/** @type {((messageElement: Element) => void) | null} */
let addCopyToCodeBlocks = null;
/** @type {number|null} */
let streamingId = null;
// impersonate streams into the input box, not a message
let ignoreStream = false;
/** @type {WeakMap<Element, string>} */
const failedKeys = new WeakMap();

const getContext = () => SillyTavern.getContext();

function readTheme() {
    const style = getComputedStyle(document.body);
    return {
        color: style.getPropertyValue('--SmartThemeBodyColor').trim(),
        fontFamily: style.getPropertyValue('--mainFontFamily').trim(),
    };
}

/**
 * Renders (or un-renders) one message element if its content or settings changed.
 * @param {Element} messageElement A .mes element
 */
function processMessage(messageElement) {
    if (!messageElement.hasAttribute('mesid')) return;
    const mesText = messageElement.querySelector('.mes_text');
    if (!mesText || mesText.querySelector('.edit_textarea')) return;

    const ctx = getContext();
    const id = Number(messageElement.getAttribute('mesid'));
    const message = ctx.chat[id];
    if (!message) return;

    const existing = mesText.querySelector(`:scope > .${ROOT_CLASS}`);
    const raw = message.extra?.display_text ?? message.mes ?? '';
    const streaming = streamingId === id;
    const externalAllowed = isExternalAllowed(ctx, settings.externalResources);
    const key = hashString(JSON.stringify([raw, streaming, externalAllowed, settings]));
    if (existing?.getAttribute('data-key') === key || failedKeys.get(mesText) === key) return;

    const active = settings.enabled && (!message.is_user || settings.renderUserMessages);
    const segments = active ? detect(raw, {
        renderDocuments: settings.renderDocuments,
        renderFencedBlocks: settings.renderFencedBlocks,
        streaming,
    }) : [];

    if (!segments.some((segment) => segment.type === 'html')) {
        if (existing) restore(ctx, id, message);
        return;
    }

    try {
        renderMessage(mesText, {
            segments,
            key,
            streaming,
            formatProse: (text) => ctx.messageFormatting(text, message.name, message.is_system, message.is_user, id),
            repair,
            frame: { scripts: settings.runScripts, externalAllowed, theme: readTheme() },
            showControlBar: settings.showControlBar,
            cachePrefix: `${id}:${hashString(raw)}`,
        });
    } catch (error) {
        console.error('[AllTML] Could not render message', id, error);
        failedKeys.set(mesText, key);
        restore(ctx, id, message);
        return;
    }
    // own try so a broken copy button doesn't undo a good render
    if (!streaming) {
        try {
            addCopyToCodeBlocks?.(mesText);
        } catch (error) {
            console.warn('[AllTML] Could not add copy buttons to code blocks', id, error);
        }
    }
}

function restore(ctx, id, message) {
    try {
        ctx.updateMessageBlock(id, message);
    } catch (error) {
        console.error('[AllTML] Could not restore message', id, error);
    }
}

/**
 * @param {Iterable<Element>} messageElements
 */
function processMessages(messageElements) {
    for (const messageElement of messageElements) {
        if (!messageElement.isConnected) continue;
        try {
            processMessage(messageElement);
        } catch (error) {
            console.error('[AllTML] Could not process message', messageElement.getAttribute('mesid'), error);
        }
    }
    sweepFrames();
}

function processAll() {
    processMessages(document.querySelectorAll('#chat > .mes'));
}

function processById(id) {
    const messageElement = document.querySelector(`#chat > .mes[mesid="${id}"]`);
    if (messageElement) processMessages([messageElement]);
}

function watchChat() {
    const chat = document.getElementById('chat');
    if (!chat) {
        console.warn('[AllTML] #chat not found; relying on events only');
        return;
    }
    new MutationObserver((records) => {
        const affected = new Set();
        for (const record of records) {
            const target = record.target instanceof Element ? record.target : null;
            if (!target || target.closest(`.${ROOT_CLASS}`)) continue;
            const messageElement = target.closest('.mes');
            if (messageElement) affected.add(messageElement);
            for (const node of record.addedNodes) {
                if (!(node instanceof Element)) continue;
                if (node.classList.contains('mes')) affected.add(node);
                else node.querySelectorAll('.mes').forEach((m) => affected.add(m));
            }
        }
        // sync on purpose, swap out ST's render before it gets painted
        if (affected.size) processMessages(affected);
    }).observe(chat, { childList: true, subtree: true });
}

function wireEvents() {
    const { eventSource, eventTypes } = getContext();
    const endStream = () => {
        ignoreStream = false;
        if (streamingId === null) return;
        const id = streamingId;
        streamingId = null;
        processById(id);
    };

    // skip dry runs like ST does, they never stream and can fire mid-generation
    eventSource.on(eventTypes.GENERATION_STARTED, (type, _params, dryRun) => {
        if (dryRun) return;
        ignoreStream = type === 'impersonate';
    });
    eventSource.on(eventTypes.STREAM_TOKEN_RECEIVED, () => {
        if (streamingId === null && !ignoreStream) streamingId = getContext().chat.length - 1;
    });
    eventSource.on(eventTypes.GENERATION_ENDED, endStream);
    eventSource.on(eventTypes.GENERATION_STOPPED, endStream);
    eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, (id) => {
        endStream();
        processById(id);
    });
    for (const type of [eventTypes.USER_MESSAGE_RENDERED, eventTypes.MESSAGE_UPDATED, eventTypes.MESSAGE_SWIPED]) {
        eventSource.on(type, (id) => processById(id));
    }
    for (const type of [eventTypes.CHAT_CHANGED, eventTypes.MORE_MESSAGES_LOADED]) {
        eventSource.on(type, () => {
            streamingId = null;
            ignoreStream = false;
            processAll();
        });
    }
    eventSource.on(eventTypes.APP_READY, () => {
        warnAboutConflicts();
        processAll();
    });
}

async function initSettingsPanel() {
    const ctx = getContext();
    const html = await ctx.renderExtensionTemplateAsync(EXTENSION_PATH, 'settings');
    const container = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', html);
    bindSettingsPanel(container.querySelector('.alltml-settings'), settings, () => {
        getContext().saveSettingsDebounced();
        processAll();
    });
}

function warnAboutConflicts() {
    // Tavern Helper sets this global when it's running
    if (typeof window.TavernHelper !== 'undefined') {
        globalThis.toastr?.warning(
            'JS-Slash-Runner (Tavern Helper) also renders HTML in messages. Turn off its message rendering or AllTML to avoid pages rendering twice.',
            'AllTML',
            { timeOut: 10000 },
        );
    }
}

(async function init() {
    settings = loadSettings(getContext().extensionSettings);
    try {
        addCopyToCodeBlocks = (await import('../../../../script.js')).addCopyToCodeBlocks ?? null;
    } catch (error) {
        console.warn('[AllTML] Code-block copy buttons unavailable in re-rendered prose', error);
    }
    try {
        await initSettingsPanel();
    } catch (error) {
        console.error('[AllTML] Could not load the settings panel', error);
    }
    watchChat();
    wireEvents();
    processAll();
})();
