export const MODULE_NAME = 'alltml';

export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    runScripts: true,
    externalResources: 'follow',
    renderDocuments: true,
    renderFencedBlocks: true,
    renderUserMessages: true,
    showControlBar: true,
});

const EXTERNAL_MODES = ['follow', 'allow', 'block'];

/**
 * @typedef {{enabled: boolean, runScripts: boolean, externalResources: 'follow'|'allow'|'block',
 *   renderDocuments: boolean, renderFencedBlocks: boolean, renderUserMessages: boolean, showControlBar: boolean}} Settings
 */

/**
 * Fills in missing or invalid settings.
 * @param {object} store SillyTavern's extensionSettings object
 * @returns {Settings} The live settings object stored in `store`
 */
export function loadSettings(store) {
    const current = store[MODULE_NAME] && typeof store[MODULE_NAME] === 'object' ? store[MODULE_NAME] : {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (typeof current[key] !== typeof value) {
            current[key] = value;
        }
    }
    if (!EXTERNAL_MODES.includes(current.externalResources)) {
        current.externalResources = DEFAULT_SETTINGS.externalResources;
    }
    store[MODULE_NAME] = current;
    return current;
}

/**
 * @param {Element} root Panel root
 * @param {Settings} settings
 * @param {(key: string) => void} onChange
 */
export function bindSettingsPanel(root, settings, onChange) {
    for (const input of root.querySelectorAll('[data-alltml-setting]')) {
        const key = input.getAttribute('data-alltml-setting');
        if (input.type === 'checkbox') {
            input.checked = !!settings[key];
        } else {
            input.value = settings[key];
        }
        input.addEventListener('change', () => {
            settings[key] = input.type === 'checkbox' ? input.checked : input.value;
            onChange(key);
        });
    }
}
