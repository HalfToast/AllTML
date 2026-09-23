# AllTML security model

AllTML shows pages written by an AI model, and those pages can contain JavaScript. Here's why that's OK and what a page can and can't do.

## The sandbox

Every page is shown in an `<iframe sandbox="allow-scripts">` built from the message text (`srcdoc`). The important part is what's **missing**: `allow-same-origin`. Without it the page gets its own anonymous origin, separate from SillyTavern's, so a page **cannot**:

- read or change SillyTavern's page, chats, characters or settings
- read SillyTavern's cookies or browser storage (where things like API keys and session data live)
- make logged-in requests to SillyTavern's server
- navigate or redirect your SillyTavern tab
- open pop-up windows or show `alert()` / `confirm()` dialogs
- submit forms

A page **can** do anything a normal web page does inside its own box: run scripts, animate, respond to clicks, draw on a canvas, keep state while it's open.

## Content-Security-Policy

AllTML adds a Content-Security-Policy as the first thing in every page, before any of the AI's content. If the page includes its own policy, the browser enforces both, so a page can only make the rules stricter.

| Resource | External media forbidden | External media allowed |
|---|---|---|
| Scripts | with **Run scripts** on: inline, and `eval` is allowed (`'unsafe-eval'`); off: none (see below) | + `https:` when **Run scripts** is on |
| Styles | inline + `data:` | + `https:` |
| Images, audio, video, fonts | `data:` / `blob:` only | + `https:` |
| Network requests from scripts | none | `https:` only |
| Forms, `<base>`, nested frames, plugins | never | never |

"External media" follows SillyTavern's **Forbid External Media** setting (including per-character overrides) unless you override it in AllTML's settings. With it forbidden, the policy blocks every web font, image, stylesheet, script and network request, so none of those can reveal your IP address.

Some tags make a browser navigate or contact a server without going through the policy: `<meta http-equiv="refresh">` and resource hints such as `<link rel="preconnect">`, `dns-prefetch`, `prefetch`, `prerender` and `modulepreload`. AllTML removes these from every page before showing it.

With **Run scripts** turned off, the policy blocks every script in the page. AllTML's own small helper (below) is still allowed through a one-time random code (a CSP nonce), so pages keep sizing correctly.

## AllTML's helper

AllTML injects one small script into each page. It:

- reports the page's height so the frame can fit it
- relaxes `min-height`/`height` on `html` and `body` so pages built for full-window display don't grow forever
- provides in-memory `localStorage`/`sessionStorage` (the sandbox has no real storage; nothing is saved)
- turns `#section` links into in-page scrolling and opens web links in a new tab
- reports script errors so AllTML can show a ⚠ icon

## Navigation guard

If a page navigates its own frame away (setting `location.href`, or a link the helper doesn't catch), AllTML notices and puts the original page back, up to 3 times. After that the page is stopped and replaced with a short notice that runs no scripts.

## Messages from pages

The only way a page can talk to SillyTavern is `postMessage`. AllTML accepts only four message types, `resize`, `openLink`, `scrollTo` and `error`, and only from the exact frame that the message's ID belongs to. Links are opened only if they're `http:` or `https:`. Nothing a page sends is ever run as code.

## Things to keep in mind

- **A page can still show you anything.** It could, for example, draw a fake login form. The sandbox stops it from *doing* anything to SillyTavern, but use common sense about what you type into AI-generated pages.
- **With external media allowed, pages can load resources from the web.** That's how web fonts and CDN libraries work, and it also means those servers see your IP address. Leave it forbidden if that matters to you.
- **With Run scripts on, blocking external resources is best effort.** A page's script can still reach the web in ways a Content-Security-Policy doesn't cover, such as navigating its own frame to a URL. AllTML detects a page navigating away and restores it (up to 3 times, then the page is stopped), but by then the request has already been made. For the strongest isolation from the network, turn off **Run scripts** as well as forbidding external media.
- **Save .html** downloads the page as-is. Opened directly in your browser, it runs outside AllTML's sandbox, like any HTML file you download.
