import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helperSource } from '../src/helper.js';

test('helper source is valid JavaScript', () => {
    assert.doesNotThrow(() => new Function(helperSource({ frameId: 'abc', parentOrigin: 'http://localhost:8000' })));
});

test('helper embeds the frame id and parent origin', () => {
    const src = helperSource({ frameId: 'abc', parentOrigin: 'http://localhost:8000' });
    assert.ok(src.includes('"id":"abc"'));
    assert.ok(src.includes('"origin":"http://localhost:8000"'));
});

test('opaque parent origin falls back to *', () => {
    assert.ok(helperSource({ frameId: 'a', parentOrigin: 'null' }).includes('"origin":"*"'));
    assert.ok(helperSource({ frameId: 'a', parentOrigin: '' }).includes('"origin":"*"'));
});

test('helper source can never close its own script tag', () => {
    const src = helperSource({ frameId: '</script><script>alert(1)</script>', parentOrigin: 'x' });
    assert.doesNotMatch(src, /<\/script/i);
});
