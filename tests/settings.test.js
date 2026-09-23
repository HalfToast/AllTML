import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, loadSettings } from '../src/settings.js';

test('empty store gets defaults', () => {
    const store = {};
    const settings = loadSettings(store);
    assert.deepEqual(settings, { ...DEFAULT_SETTINGS });
    assert.equal(store.alltml, settings);
});

test('valid saved values are kept', () => {
    const store = { alltml: { runScripts: false, externalResources: 'allow' } };
    const settings = loadSettings(store);
    assert.equal(settings.runScripts, false);
    assert.equal(settings.externalResources, 'allow');
    assert.equal(settings.enabled, true);
});

test('wrong types and unknown modes are reset', () => {
    const settings = loadSettings({ alltml: { enabled: 'yes', externalResources: 'sometimes' } });
    assert.equal(settings.enabled, true);
    assert.equal(settings.externalResources, 'follow');
});

test('non-object saved value is replaced', () => {
    const store = { alltml: 'garbage' };
    assert.deepEqual(loadSettings(store), { ...DEFAULT_SETTINGS });
});
