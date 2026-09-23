import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashString, randomId, fileNameFromHtml } from '../src/util.js';

test('hashString matches FNV-1a 32-bit reference values', () => {
    assert.equal(hashString(''), '811c9dc5');
    assert.equal(hashString('a'), 'e40c292c');
});

test('hashString differs for different input', () => {
    assert.notEqual(hashString('<p>a</p>'), hashString('<p>b</p>'));
});

test('randomId returns 32 hex chars and is unique', () => {
    const a = randomId();
    const b = randomId();
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.notEqual(a, b);
});

test('fileNameFromHtml uses the page title', () => {
    assert.equal(fileNameFromHtml('<title>Athena — Character Profile</title>'), 'Athena-Character-Profile.html');
});

test('fileNameFromHtml falls back when there is no usable title', () => {
    assert.equal(fileNameFromHtml('<div>hi</div>'), 'alltml-page.html');
    assert.equal(fileNameFromHtml('<title> — </title>'), 'alltml-page.html');
});
