/**
 * Undoes ST's "Stream fade-in", which leaves every word in its own span. That empties <style>
 * blocks and makes each word a separate flex/grid item.
 * @param {Element} root
 */
export function unwrapTextSegments(root) {
    const spans = root.querySelectorAll('span.text_segment');
    if (!spans.length) return;
    const parents = new Set();
    for (const span of spans) {
        // ST sets the span's innerText, which turns "\n" into <br>
        const text = Array.from(span.childNodes, (node) => node.nodeName === 'BR' ? '\n' : node.textContent).join('');
        if (span.parentNode) parents.add(span.parentNode);
        span.replaceWith(text);
    }
    for (const parent of parents) parent.normalize();
}
