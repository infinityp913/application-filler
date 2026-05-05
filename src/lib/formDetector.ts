import type { DetectedField } from '../types';

// ── Selector generation ────────────────────────────────────────────────────

function cssSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body) {
    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (!parent) break;
    const siblings = Array.from(parent.children).filter(c => c.tagName === node!.tagName);
    if (siblings.length === 1) {
      parts.unshift(tag);
    } else {
      const idx = siblings.indexOf(node) + 1;
      parts.unshift(`${tag}:nth-of-type(${idx})`);
    }
    node = parent;
  }
  return parts.join(' > ');
}

// ── Label inference ────────────────────────────────────────────────────────

function inferLabel(el: Element, root: Document | ShadowRoot = document): string {
  const ariaLabel = el.getAttribute('aria-label')?.trim();
  if (ariaLabel) return ariaLabel;

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy.split(' ')
      .map(id => (root as Document).getElementById?.(id)?.textContent?.trim())
      .filter(Boolean).join(' ');
    if (text) return text;
  }

  const id = el.getAttribute('id');
  if (id) {
    const label = root.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label) return label.textContent?.trim() ?? '';
  }

  const wrapping = el.closest('label');
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as Element;
    clone.querySelectorAll('input,select,textarea').forEach(c => c.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }

  const placeholder = el.getAttribute('placeholder')?.trim();
  if (placeholder) return placeholder;

  const name = el.getAttribute('name')?.trim();
  if (name) return name.replace(/[_-]/g, ' ');

  // Walk up the DOM: find the nearest preceding sibling element that looks like a label.
  // Known gap: raw DOM text node labels (e.g. YC category select) are not findable via
  // previousElementSibling. Claude still infers the answer from context + option labels.
  let node: Element | null = el;
  for (let depth = 0; depth < 7 && node; depth++, node = node.parentElement) {
    let sib = node.previousElementSibling;
    while (sib) {
      if (!sib.querySelector('input,select,textarea,[contenteditable],[role="combobox"]')) {
        const text = sib.textContent?.trim();
        if (text && text.length > 2 && text.length < 300) return text;
      }
      sib = sib.previousElementSibling;
    }
  }

  return '(unknown)';
}

// ── Context extraction ─────────────────────────────────────────────────────

function truncateAtWordBoundary(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const cut = str.lastIndexOf(' ', maxLen);
  return cut > 0 ? str.slice(0, cut) : str.slice(0, maxLen);
}

function extractContext(el: Element): string {
  const fieldset = el.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend')?.textContent?.trim();
    if (legend) return truncateAtWordBoundary(legend, 500);
  }

  let node: Element | null = el;
  for (let depth = 0; depth < 3 && node; depth++, node = node.parentElement) {
    let sib = node.previousElementSibling;
    while (sib) {
      const tag = sib.tagName.toLowerCase();
      if (['label', 'p', 'span', 'div'].includes(tag)) {
        const text = sib.textContent?.trim();
        if (text) return truncateAtWordBoundary(text, 500);
      }
      sib = sib.previousElementSibling;
    }
  }

  node = el.parentElement;
  for (let depth = 0; depth < 3 && node; depth++, node = node.parentElement) {
    const heading = node.querySelector('h1,h2,h3');
    if (heading) {
      const text = heading.textContent?.trim();
      if (text) return truncateAtWordBoundary(text, 500);
    }
  }

  return truncateAtWordBoundary(document.title, 500);
}

// ── Limit detection ───────────────────────────────────────────────────────

const WORD_RE = /\b(\d+)\s*words?\b/i;
const CHAR_RE = /\b(\d+)\s*(?:characters?|chars?)\b/i;

function scanTextForLimit(text: string): { wordLimit?: number; charLimit?: number } {
  const wm = text.match(WORD_RE);
  if (wm) return { wordLimit: parseInt(wm[1], 10) };
  const cm = text.match(CHAR_RE);
  if (cm) return { charLimit: parseInt(cm[1], 10) };
  return {};
}

function detectLimit(el: Element): { wordLimit?: number; charLimit?: number } {
  // 1. maxlength attribute → hard char limit
  const maxlength = el.getAttribute('maxlength');
  if (maxlength) {
    const n = parseInt(maxlength, 10);
    if (n > 0 && n < 50_000) return { charLimit: n };
  }

  // 2. aria-describedby helper text
  const describedBy = el.getAttribute('aria-describedby');
  if (describedBy) {
    for (const id of describedBy.split(' ')) {
      const desc = document.getElementById(id);
      if (desc) {
        const result = scanTextForLimit(desc.textContent ?? '');
        if (result.wordLimit || result.charLimit) return result;
      }
    }
  }

  // 3. Nearby siblings (next and previous, up to 3 levels)
  let node: Element | null = el;
  for (let depth = 0; depth < 3 && node; depth++, node = node.parentElement) {
    for (const sib of [node.nextElementSibling, node.previousElementSibling]) {
      if (!sib || sib.querySelector('input,select,textarea')) continue;
      const result = scanTextForLimit(sib.textContent ?? '');
      if (result.wordLimit || result.charLimit) return result;
    }
  }

  return {};
}

// ── Field type detection ───────────────────────────────────────────────────

function getFieldType(el: Element): DetectedField['fieldType'] {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  if (el.getAttribute('contenteditable') === 'true') return 'contenteditable';
  if (el.getAttribute('role') === 'combobox') return 'select';
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (['text', 'email', 'url', 'tel', 'search', 'number', ''].includes(type)) return 'text';
  }
  return 'unknown';
}

function getCurrentValue(el: Element): string {
  if (el instanceof HTMLSelectElement) return el.options[el.selectedIndex]?.text ?? '';
  if ('value' in el) return (el as HTMLInputElement).value;
  return el.textContent?.trim() ?? '';
}

// ── Shadow DOM traversal ───────────────────────────────────────────────────

interface FoundField {
  el: Element;
  root: Document | ShadowRoot;
  shadowHostSelector?: string;
}

function getComboboxOptions(el: Element): { label: string; value: string }[] | null {
  const listboxId = el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns');
  const listbox = listboxId
    ? document.getElementById(listboxId)
    : (el.closest('[role="group"]') ?? el.parentElement)?.querySelector('[role="listbox"]');
  if (!listbox) return null;
  const opts = Array.from(listbox.querySelectorAll('[role="option"]'))
    .map(o => ({ label: o.textContent?.trim() ?? '', value: o.getAttribute('data-value') ?? o.textContent?.trim() ?? '' }))
    .filter(o => o.label);
  return opts.length ? opts : null;
}

function collectFromRoot(root: Document | ShadowRoot, hostSelector: string | null): FoundField[] {
  const results: FoundField[] = [];

  const candidates = root.querySelectorAll<Element>(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="reset"]):not([type="button"]):not([type="image"]):not([type="file"]), textarea, select, [contenteditable="true"], [role="combobox"]'
  );

  for (const el of candidates) {
    if (el instanceof HTMLElement) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    }
    if (el.hasAttribute('disabled')) continue;
    results.push({ el, root, shadowHostSelector: hostSelector ?? undefined });
  }

  root.querySelectorAll('*').forEach(host => {
    if (host.shadowRoot) {
      const hostSel = hostSelector ? `${hostSelector} > ${cssSelector(host)}` : cssSelector(host);
      collectFromRoot(host.shadowRoot, hostSel).forEach(r => results.push(r));
    }
  });

  return results;
}

// ── Main export ────────────────────────────────────────────────────────────

export function detectFields(): DetectedField[] {
  const found = collectFromRoot(document, null);
  const seen = new Set<string>();
  const fields: DetectedField[] = [];

  for (const { el, root, shadowHostSelector } of found) {
    const selector = cssSelector(el);
    const key = shadowHostSelector ? `${shadowHostSelector}::${selector}` : selector;
    if (seen.has(key)) continue;
    seen.add(key);

    const type = getFieldType(el);
    if (type === 'unknown') continue;

    const limits = detectLimit(el);
    const field: DetectedField = {
      fieldLabel: inferLabel(el, root),
      fieldType: type,
      currentValue: getCurrentValue(el),
      selector,
      context: extractContext(el),
      ...limits,
    };

    if (shadowHostSelector) field.shadowHost = shadowHostSelector;

    if (el instanceof HTMLSelectElement) {
      field.options = Array.from(el.options)
        .filter(o => o.value !== '')
        .map(o => ({ label: o.text.trim(), value: o.value }));
    } else if (el.getAttribute('role') === 'combobox') {
      const opts = getComboboxOptions(el);
      if (opts) field.options = opts;
    }

    fields.push(field);
  }

  return fields;
}
