import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repair } from '../src/repair.js';

test('valid document is left untouched', () => {
    const html = readFileSync(new URL('./fixtures/profile-unfenced.txt', import.meta.url), 'utf8');
    assert.deepEqual(repair(html), { html, fixes: [] });
});

test('missing </style> is inserted before </head>', () => {
    const input = '<html><head><style>\nbody{color:red}\n</head>\n<body><p>x</p></body></html>';
    const { html, fixes } = repair(input);
    assert.equal(html, '<html><head><style>\nbody{color:red}\n</style>\n</head>\n<body><p>x</p></body></html>');
    assert.deepEqual(fixes, ['Added 1 missing </style>']);
});

test('missing </style> in a fragment is inserted before the first tag line', () => {
    const { html } = repair('<style>\n.card{color:red}\n<div class="card">hi</div>');
    assert.equal(html, '<style>\n.card{color:red}\n</style>\n<div class="card">hi</div>');
});

test('missing </style> with no following markup is appended', () => {
    assert.equal(repair('<style>\n.a{color:red}').html, '<style>\n.a{color:red}</style>\n');
});

test('only the unclosed style is fixed', () => {
    const { html, fixes } = repair('<style>a{}</style>\n<style>\nb{}\n<div>x</div>');
    assert.equal(html, '<style>a{}</style>\n<style>\nb{}\n</style>\n<div>x</div>');
    assert.deepEqual(fixes, ['Added 1 missing </style>']);
});

test('missing </script> is inserted before the first tag line', () => {
    const { html, fixes } = repair('<script>\nconst x = 1;\n<div>after</div>');
    assert.equal(html, '<script>\nconst x = 1;\n</script>\n<div>after</div>');
    assert.deepEqual(fixes, ['Added 1 missing </script>']);
});

test('cut-off trailing tag is trimmed', () => {
    const { html, fixes } = repair('<div>ok</div>\n<div class="ca');
    assert.equal(html, '<div>ok</div>');
    assert.deepEqual(fixes, ['Removed a cut-off tag at the end']);
});

test('cut-off tag and unclosed style are both fixed, in order', () => {
    const { html, fixes } = repair('<style>\np{}\n<div>hi</div>\n<sp');
    assert.equal(html, '<style>\np{}\n</style>\n<div>hi</div>');
    assert.deepEqual(fixes, ['Removed a cut-off tag at the end', 'Added 1 missing </style>']);
});

test('comparisons inside closed scripts are not touched', () => {
    const input = '<script>if (a < b) { go(); }</script>';
    assert.deepEqual(repair(input), { html: input, fixes: [] });
});

test('unclosed ordinary elements are left to the browser', () => {
    assert.deepEqual(repair('<div><p>x'), { html: '<div><p>x', fixes: [] });
});

test('null input is safe', () => {
    assert.deepEqual(repair(null), { html: '', fixes: [] });
});
