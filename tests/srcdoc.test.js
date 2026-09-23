import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsp, buildSrcdoc } from '../src/srcdoc.js';

const directive = (csp, name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `));
const base = { frameId: 'f1', parentOrigin: 'http://localhost:8000', scripts: true, externalAllowed: false, nonce: 'n0nce', theme: {} };

test('scripts on, external blocked', () => {
    const csp = buildCsp({ scripts: true, externalAllowed: false, nonce: 'n0nce' });
    assert.equal(directive(csp, 'default-src'), "default-src 'none'");
    assert.equal(directive(csp, 'script-src'), "script-src 'unsafe-inline' 'unsafe-eval'");
    assert.equal(directive(csp, 'style-src'), "style-src 'unsafe-inline' data:");
    assert.equal(directive(csp, 'img-src'), 'img-src data: blob:');
    assert.equal(directive(csp, 'media-src'), 'media-src data: blob:');
    assert.equal(directive(csp, 'font-src'), 'font-src data: blob:');
    assert.equal(directive(csp, 'connect-src'), "connect-src 'none'");
    assert.doesNotMatch(csp, /nonce-/);
});

test('scripts off allows only the nonce', () => {
    const csp = buildCsp({ scripts: false, externalAllowed: true, nonce: 'n0nce' });
    assert.equal(directive(csp, 'script-src'), "script-src 'nonce-n0nce'");
});

test('external allowed adds https: everywhere it applies', () => {
    const csp = buildCsp({ scripts: true, externalAllowed: true, nonce: 'n0nce' });
    assert.equal(directive(csp, 'script-src'), "script-src 'unsafe-inline' 'unsafe-eval' https:");
    assert.equal(directive(csp, 'style-src'), "style-src 'unsafe-inline' data: https:");
    assert.equal(directive(csp, 'font-src'), 'font-src data: blob: https:');
    assert.equal(directive(csp, 'connect-src'), 'connect-src https:');
});

test('dangerous directives are always none', () => {
    for (const externalAllowed of [true, false]) {
        const csp = buildCsp({ scripts: true, externalAllowed, nonce: 'x' });
        for (const name of ['form-action', 'base-uri', 'frame-src', 'object-src']) {
            assert.equal(directive(csp, name), `${name} 'none'`);
        }
    }
});

test('existing doctype is correctly wrapped, CSP and helper precede page content', () => {
    const out = buildSrcdoc('<!DOCTYPE html>\n<html lang="en"><head><style>p{}</style></head></html>', base);
    assert.ok(out.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"'));
    assert.ok(out.indexOf('Content-Security-Policy') < out.indexOf('<html lang="en">'));
    assert.ok(out.indexOf('<script nonce="n0nce">') < out.indexOf('<style>p{}'));
});

test('regression: HTML comments that look like doctypes do not hide CSP', () => {
    // <!--> closes a comment
    const out1 = buildSrcdoc('<!--><title>--><!doctype html><p>x</p>', base);
    assert.ok(out1.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"'));

    // so does <!--->
    const out2 = buildSrcdoc('<!---><title>--><!doctype html><p>x</p>', base);
    assert.ok(out2.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"'));

    // and --!>
    const out3 = buildSrcdoc('<!-- --!><title>--><!doctype html><p>x</p>', base);
    assert.ok(out3.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"'));
});

test('performance: complex comment structures do not cause ReDoS', () => {
    // blows up a naive regex
    const start = Date.now();
    const out = buildSrcdoc('<!---->'.repeat(40) + '<p>', base);
    const elapsed = Date.now() - start;
    assert.ok(typeof out === 'string');
    assert.ok(elapsed < 1000, `took ${elapsed}ms, should be instant`);
});

test('a doctype is added when missing', () => {
    const out = buildSrcdoc('<style>p{}</style><p>x</p>', base);
    assert.ok(out.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"'));
    assert.ok(out.endsWith('<style>p{}</style><p>x</p>'));
});

test('theme values are sanitised and use zero specificity', () => {
    const out = buildSrcdoc('<p>x</p>', { ...base, theme: { color: 'red;}</style><script>alert(1)', fontFamily: '"Noto Sans", sans-serif' } });
    assert.ok(out.includes('<style>:where(html){color:red/stylescriptalert(1);font-family:"Noto Sans", sans-serif}</style>'));
    assert.equal(out.match(/<script/g).length, 1);
});

test('no theme style when no theme values', () => {
    assert.doesNotMatch(buildSrcdoc('<p>x</p>', base), /:where\(html\)/);
});
