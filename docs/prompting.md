# Getting models to write pages that render well

AllTML renders whatever the model writes, but some things work a lot better than others.

## What works best

- **One complete document per page**: `<!DOCTYPE html>`, `<html>`, `<head>` with a `<style>`, and `<body>`.
- **Fenced or not, both work.** Most models wrap pages in ```` ```html ````; that's fine.
- **All CSS in `<style>`, all JS in `<script>`**, inside the document. Relative files (`style.css`, `app.js`) don't exist.
- **Size to the content, not the window.** Prefer `max-width` and normal flow over `height: 100vh`. Pages that fill the window get capped to a scrollable box in chat.
- **Web fonts and images** only load when external media is allowed for the character. Ask for a font stack with good fallbacks (e.g. `'Cinzel', Georgia, serif`), or for inline SVG instead of image URLs.

## Copy-paste instruction

Add this to your system prompt, Author's Note, or a World Info entry:

```text
When asked for a visual page (character sheet, status panel, letter, UI), output ONE complete HTML document: <!DOCTYPE html>, <html>, <head> with all CSS in a single <style>, and <body>. Put any JavaScript in a <script> at the end of <body>. Do not reference external files. Use inline SVG for images. Give fonts generic fallbacks. Size the layout to its content (use max-width, avoid height:100vh). Keep narrative text outside the document.
```

## Things that won't work inside a page

- `alert()`, `confirm()`, `prompt()`: blocked by the sandbox
- Submitting forms or navigating to other pages
- Saving data between reloads: `localStorage` works while the page is open but isn't kept
- Reading anything from SillyTavern (character data, variables, chat): pages are fully isolated by design
- Rewriting the whole page with `document.write()` after it has loaded (update elements instead)
