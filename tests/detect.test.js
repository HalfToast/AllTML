import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detect } from '../src/detect.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const htmlSegments = (segments) => segments.filter((s) => s.type === 'html');

test('empty or missing text gives no segments', () => {
    assert.deepEqual(detect(''), []);
    assert.deepEqual(detect(null), []);
});

test('fenced full document becomes one html segment', () => {
    const segments = detect(fixture('profile-fenced.txt'));
    assert.equal(segments.length, 1);
    const [page] = segments;
    assert.equal(page.type, 'html');
    assert.equal(page.fenced, true);
    assert.equal(page.unterminated, false);
    assert.ok(page.html.startsWith('<!DOCTYPE html>'));
    assert.ok(page.html.trimEnd().endsWith('</html>'));
});

test('unfenced full document becomes one html segment', () => {
    const segments = detect(fixture('profile-unfenced.txt'));
    assert.equal(segments.length, 1);
    assert.equal(segments[0].type, 'html');
    assert.equal(segments[0].fenced, false);
});

test('prose around a page is preserved in order', () => {
    const text = `She slides a card across the table.\n\n${fixture('profile-unfenced.txt')}\n\n*She waits for your reaction.*`;
    const segments = detect(text);
    assert.deepEqual(segments.map((s) => s.type), ['prose', 'html', 'prose']);
    assert.match(segments[0].text, /slides a card/);
    assert.match(segments[2].text, /She waits/);
    assert.ok(segments[1].html.endsWith('</html>'));
});

test('two pages in one message', () => {
    const page = '<!DOCTYPE html>\n<html><body><p>One</p></body></html>';
    const text = `${page}\nBetween the pages.\n${page.replace('One', 'Two')}`;
    const segments = detect(text);
    assert.deepEqual(segments.map((s) => s.type), ['html', 'prose', 'html']);
    assert.match(segments[0].html, /One/);
    assert.match(segments[2].html, /Two/);
});

test('missing closing fence runs to the end and is flagged', () => {
    const segments = detect('Intro\n```html\n<style>p{color:red}</style>\n<p>hi</p>');
    assert.deepEqual(segments.map((s) => s.type), ['prose', 'html']);
    assert.equal(segments[1].unterminated, true);
    assert.match(segments[1].html, /<p>hi<\/p>$/);
});

test('fenced html without style, script or document marker stays prose', () => {
    const text = 'Here is an example:\n```html\n<p>Example</p>\n```';
    const segments = detect(text);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].type, 'prose');
    assert.match(segments[0].text, /```html/);
});

test('fenced html fragment with style renders', () => {
    const segments = detect('```html\n<style>.a{color:red}</style>\n<div class="a">x</div>\n```');
    assert.equal(htmlSegments(segments).length, 1);
    assert.equal(segments[0].fenced, true);
});

test('other fence languages are never rendered and shield their content', () => {
    const segments = detect('```css\n<html>\n```\nAfter');
    assert.equal(segments.length, 1);
    assert.equal(segments[0].type, 'prose');
    assert.match(segments[0].text, /```css/);
});

test('bare fence around a full document renders', () => {
    const segments = detect('Here it is:\n```\n<!DOCTYPE html>\n<html><body>x</body></html>\n```');
    assert.deepEqual(segments.map((s) => s.type), ['prose', 'html']);
    assert.equal(segments[1].fenced, true);
    assert.ok(segments[1].html.startsWith('<!DOCTYPE html>'));
});

test('bare fence starting with <html> renders', () => {
    assert.equal(htmlSegments(detect('```\n  <html lang="en"><body>x</body></html>\n```')).length, 1);
});

test('bare fence renders only when the document is the whole block', () => {
    assert.equal(htmlSegments(detect('```\n<style>p{}</style><p>x</p>\n```')).length, 0);
    assert.equal(htmlSegments(detect('```\nconst page = "<!DOCTYPE html><html></html>";\n```')).length, 0);
});

test('bare fence documents follow the renderDocuments setting', () => {
    const text = '```\n<!DOCTYPE html>\n<html><body>x</body></html>\n```';
    assert.equal(htmlSegments(detect(text, { renderDocuments: false })).length, 0);
});

test('streaming bare fence shows as a page once it starts like a document', () => {
    assert.equal(htmlSegments(detect('Intro\n```\n<!DOC', { streaming: true })).length, 1);
    assert.equal(htmlSegments(detect('Intro\n```\n', { streaming: true })).length, 0);
    assert.equal(htmlSegments(detect('Intro\n```\nconst x', { streaming: true })).length, 0);
});

test('tilde fences work', () => {
    const segments = detect('~~~html\n<style>p{}</style><p>x</p>\n~~~');
    assert.equal(htmlSegments(segments).length, 1);
});

test('inline fragments and mentions are left to SillyTavern', () => {
    assert.equal(htmlSegments(detect('<span style="color:red">hi</span>')).length, 0);
    assert.equal(htmlSegments(detect('Use the `<html>` tag, then <html> later in a sentence.')).length, 0);
});

test('uppercase doctype is detected', () => {
    const segments = detect('<!DOCTYPE HTML>\n<HTML><BODY>x</BODY></HTML>');
    assert.equal(htmlSegments(segments).length, 1);
});

test('CRLF line endings are handled', () => {
    const segments = detect('Hi\r\n```html\r\n<style>p{}</style>\r\n<p>x</p>\r\n```\r\nBye');
    assert.deepEqual(segments.map((s) => s.type), ['prose', 'html', 'prose']);
    assert.equal(segments[1].unterminated, false);
});

test('settings can turn each rule off', () => {
    const off = { renderDocuments: false, renderFencedBlocks: false };
    assert.equal(htmlSegments(detect(fixture('profile-unfenced.txt'), off)).length, 0);
    assert.equal(htmlSegments(detect('```html\n<style>p{}</style>\n```', { renderFencedBlocks: false })).length, 0);
});

test('streaming renders any html fence, even before its style arrives', () => {
    const segments = detect('Intro\n```html\n<div', { streaming: true });
    assert.deepEqual(segments.map((s) => s.type), ['prose', 'html']);
});

test('an unfenced document ends at its last </html>, not the first', () => {
    const text = '<!DOCTYPE html>\n<html><body><script>const s = "</html>";</script><p>after</p></body></html>\nBye';
    const segments = detect(text);
    assert.deepEqual(segments.map((s) => s.type), ['html', 'prose']);
    assert.match(segments[0].html, /<p>after<\/p>/);
    assert.ok(segments[0].html.endsWith('</body></html>'));
    assert.equal(segments[1].text.trim(), 'Bye');
});

test('fence-looking lines inside an unfenced document do not split it', () => {
    const text = '<!DOCTYPE html>\n<html><body><pre>\n```js\ncode\n```\n</pre></body></html>';
    const segments = detect(text);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].type, 'html');
    assert.equal(segments[0].fenced, false);
    assert.match(segments[0].html, /code/);
    assert.ok(segments[0].html.endsWith('</html>'));
});

test('an unfenced document followed by a fenced one gives two pages', () => {
    const text = '<!DOCTYPE html><html><body>A</body></html>\nBetween\n```html\n<!DOCTYPE html><html><body>B</body></html>\n```\nEnd';
    const segments = detect(text);
    assert.deepEqual(segments.map((s) => s.type), ['html', 'prose', 'html', 'prose']);
    assert.equal(segments[0].fenced, false);
    assert.match(segments[0].html, /A/);
    assert.equal(segments[1].text.trim(), 'Between');
    assert.equal(segments[2].fenced, true);
    assert.match(segments[2].html, /B/);
});

test('a code fence after an unfenced document still shields its content', () => {
    const text = '<!DOCTYPE html><html><body>A</body></html>\n```css\n<html>\n```';
    const segments = detect(text);
    assert.deepEqual(segments.map((s) => s.type), ['html', 'prose']);
    assert.match(segments[1].text, /```css\n<html>\n```/);
});

test('an <html> line only starts a new document after the previous one closed', () => {
    const segments = detect('<html><body>One</body></html>\nText\n<html><body>Two</body></html>');
    assert.deepEqual(segments.map((s) => s.type), ['html', 'prose', 'html']);
    const unclosed = detect('<!DOCTYPE html><p>One\n<!DOCTYPE html>\n<html><body>Two</body></html>');
    assert.deepEqual(unclosed.map((s) => s.type), ['html', 'html']);
    assert.equal(unclosed[0].html, '<!DOCTYPE html><p>One');
});
