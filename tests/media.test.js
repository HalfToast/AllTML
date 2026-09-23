import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExternalAllowed } from '../src/media.js';

const ctx = ({ forbid = true, allowed = [], forbidden = [], groupId = null, avatar = 'athena.png' } = {}) => ({
    powerUserSettings: {
        forbid_external_media: forbid,
        external_media_allowed_overrides: allowed,
        external_media_forbidden_overrides: forbidden,
    },
    groupId,
    characterId: '0',
    characters: [{ avatar }],
});

test('follows the global setting', () => {
    assert.equal(isExternalAllowed(ctx({ forbid: true }), 'follow'), false);
    assert.equal(isExternalAllowed(ctx({ forbid: false }), 'follow'), true);
});

test('per-character overrides win over the global setting', () => {
    assert.equal(isExternalAllowed(ctx({ forbid: true, allowed: ['athena.png'] }), 'follow'), true);
    assert.equal(isExternalAllowed(ctx({ forbid: false, forbidden: ['athena.png'] }), 'follow'), false);
});

test('groups are keyed by group id', () => {
    assert.equal(isExternalAllowed(ctx({ forbid: true, allowed: ['42'], groupId: '42' }), 'follow'), true);
});

test('AllTML override modes ignore SillyTavern', () => {
    assert.equal(isExternalAllowed(ctx({ forbid: true }), 'allow'), true);
    assert.equal(isExternalAllowed(ctx({ forbid: false }), 'block'), false);
});

test('missing context data falls back like SillyTavern', () => {
    assert.equal(isExternalAllowed({}, 'follow'), true);
});
