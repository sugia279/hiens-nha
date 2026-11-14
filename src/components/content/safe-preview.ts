/** Safe Markdown subset: construct DOM nodes; HTML/MDX always remains literal text. */
export function renderMarkdown(
  target: HTMLElement,
  source: string,
  base = '/',
) {
  target.replaceChildren();
  const document = target.ownerDocument;
  function inline(parent: HTMLElement, text: string) {
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g;
    let at = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(at, match.index)));
      const token = match[0];
      if (token.startsWith('`')) {
        const el = document.createElement('code');
        el.textContent = token.slice(1, -1);
        parent.append(el);
      } else if (token.startsWith('**')) {
        const el = document.createElement('strong');
        el.textContent = token.slice(2, -2);
        parent.append(el);
      } else {
        const parts = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
        let safe = false;
        try {
          const url = new URL(parts[2]!, location.origin);
          safe =
            url.protocol === 'https:' ||
            (parts[2]!.startsWith(base) &&
              !parts[2]!.startsWith('//') &&
              !parts[2]!.includes('\\'));
        } catch {}
        if (safe) {
          const a = document.createElement('a');
          a.textContent = parts[1]!;
          a.href = parts[2]!;
          a.rel = 'noopener noreferrer';
          parent.append(a);
        } else parent.append(document.createTextNode(token));
      }
      at = match.index + token.length;
    }
    parent.append(document.createTextNode(text.slice(at)));
  }
  let code: HTMLPreElement | null = null;
  for (const line of source.split('\n')) {
    if (line.startsWith('```')) {
      if (code) {
        target.append(code);
        code = null;
      } else code = document.createElement('pre');
      continue;
    }
    if (code) {
      code.append(document.createTextNode(line + '\n'));
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);
    const el = document.createElement(
      heading ? 'h' + heading[1]!.length : quote ? 'blockquote' : 'p',
    );
    inline(el, heading ? heading[2]! : quote ? quote[1]! : line);
    if (!line) el.append(document.createElement('br'));
    target.append(el);
  }
  if (code) target.append(code);
}
