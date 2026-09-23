# AllTML

Renders the HTML pages your model writes as actual pages inside SillyTavern chat.

Character sheets, status panels, letters, maps, little widgets. When a model writes a full HTML/CSS page you get the page, not a code block, a half-rendered mess, or `CSS ERROR: property missing ':'`.

## Why

SillyTavern runs every message through Markdown, sanitises it, and rewrites the CSS so it can't leak into the rest of the app. Fine for normal chat, but it wrecks full pages:

- Models wrap pages in ```` ```html ```` fences, so you just get a code block.
- Remove the fences and blank lines, indentation and `*` characters get turned into Markdown, corrupting the CSS.
- `<html>`, `<head>`, `<body>` and `<script>` are stripped, and `body { … }` rules no longer apply.
- If the (now corrupted) CSS fails to parse, the whole style block becomes `CSS ERROR: …`.

AllTML grabs each page from the original message text and puts it in its own sandboxed iframe instead.

## Features

- Full HTML documents render, fenced or not.
- ```` ```html ```` blocks with `<style>` or `<script>` render too. Plain code examples stay code.
- Fixes the usual breakage: a missing `</style>` or `</script>`, a missing closing ```` ``` ````, or a response cut off mid-tag. Unclosed `<div>`s are left to the browser like in any normal file.
- Scripts work. Pages run in a sandbox with no access to SillyTavern, your chats, settings or API keys. See [docs/security.md](docs/security.md).
- Frames size to the page, so no inner scrollbars, and `@media` rules still work on mobile.
- Respects "Forbid External Media", per-character overrides included.
- While a message streams you get a small placeholder, and the page shows up once it's done.
- Source / Fullscreen / Save .html buttons under each page.
- Display only. Your chat files are never touched, so turning AllTML off puts everything back how it was.

## Install

1. In SillyTavern, open **Extensions** (the stacked-blocks icon) → **Install extension**.
2. Paste `https://github.com/HalfToast/AllTML` and click **Install**.
3. Reload if prompted. You'll find **AllTML** in the Extensions panel.

Requires SillyTavern **1.19.0** or newer (tested on 1.19.0).

## What gets rendered

| In the message | Rendered? |
|---|---|
| A complete document (`<!DOCTYPE html>` or `<html>` at the start of a line), fenced or not | ✅ |
| ```` ```html ```` block containing `<style>` or `<script>` | ✅ |
| ```` ```html ```` block with plain markup only (e.g. an example) | ❌ stays a code block |
| Other fences (```` ```css ````, ```` ```js ````, bare ```` ``` ````) | ❌ |
| Small inline HTML like `<span style="color:red">` | ❌ SillyTavern already handles it |

Text before and after a page is formatted by SillyTavern as usual. A message can contain several pages.

## Settings

| Setting | Default | What it does |
|---|---|---|
| Enable AllTML | on | Master switch |
| Run scripts inside pages | on | Lets pages run JavaScript inside the sandbox. Off = HTML/CSS only |
| Render complete HTML documents | on | See table above |
| Render ```` ```html ```` blocks that contain `<style>`/`<script>` | on | See table above |
| Render pages in your own messages too | on | Also render pages in user messages |
| Show Source / Fullscreen / Save buttons | on | The small bar under each page |
| External resources | Follow SillyTavern | Whether pages may load web fonts, images and CDN scripts |

## Buttons under each page

- **Source**: shows the page's HTML (after repairs) and what was repaired, with a Copy button.
- **Fullscreen**: opens the page in a large overlay, still sandboxed.
- **Save .html**: downloads the page as a file.
- ⚠ appears if the page's scripts threw errors; hover to read them.
- *repaired* appears if AllTML fixed something; hover to see what.

## Troubleshooting

**The fonts look wrong / images are missing.**
SillyTavern forbids external media by default, and AllTML follows that. Allow it for one character with the **Ext. Media** button in the character panel (next to Description), or globally by unchecking **User Settings → Forbid External Media**. You can also set AllTML's **External resources** to *Always allow*.

**A page shows as a code block.**
It's probably a ```` ```html ```` block with no `<style>`, `<script>` or `<!DOCTYPE html>`/`<html>`. AllTML treats those as code examples. Ask the model for a complete document (see [docs/prompting.md](docs/prompting.md)).

**A page is in a fixed-height box with its own scrollbar.**
The page sizes something to the window height (like `height: 100vh`), which would grow forever inside a chat, so AllTML caps it and lets it scroll. Fullscreen looks best for these.

**A page resets itself / loses what I clicked.**
Some pages rebuild themselves after loading with `document.open()`/`document.write()` instead of updating their elements. AllTML's navigation guard can't tell that apart from navigating away, so it puts the original page back (up to 3 times, then the page is stopped and replaced with a short notice). Pages that just change text, attributes or elements in place are fine. See [docs/prompting.md](docs/prompting.md) for getting models to avoid this.

**Pages render twice or look odd with JS-Slash-Runner / Tavern Helper installed.**
That extension renders HTML in messages too, so turn off its message rendering or disable AllTML. AllTML warns you when it spots it, but it only checks for Tavern Helper's global object so it can miss odd setups.

**Regex scripts don't affect a page.**
Regex scripts set to "alter display" only apply to the text around a page, not to the HTML inside it.

## Privacy & security

Pages run in a sandboxed iframe with a strict Content-Security-Policy. They can't access SillyTavern, submit forms, open pop-ups or navigate your tab. With external media forbidden, the policy blocks web fonts, images, scripts and network requests, and AllTML removes tags that would make the page navigate or prefetch on its own. With **Run scripts** on, a page's script can still navigate its own frame to a web address, so blocking the network is best effort. Details: [docs/security.md](docs/security.md).

## Development

AllTML is plain ES modules with no build step and no dependencies.

- **Tests:** `npm test` runs the unit tests with Node's built-in test runner (Node 18 or newer; nothing to install).
- **Harness:** serve the repo root with any static server (for example `python3 -m http.server 8765`) and open `/dev/harness.html`. It mounts sample pages outside SillyTavern for checking frames, sizing, the sandbox and rendering in a browser.

## License

[MIT](LICENSE) © HalfToast
