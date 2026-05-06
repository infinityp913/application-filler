import type { DetectedField } from '../types';

// Returns true if the field already has user content and should be skipped.
function isAlreadyFilled(el: Element): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value.trim().length > 0;
  }
  if (el instanceof HTMLSelectElement) {
    return el.selectedIndex > 0;
  }
  return (el.textContent?.trim().length ?? 0) > 0;
}

// Dispatch synthetic events so React/Vue/etc. pick up the programmatic write.
function dispatchInputEvents(el: Element): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }
  dispatchInputEvents(el);
}

function fillContentEditable(el: Element, value: string): void {
  el.focus();
  // execCommand keeps React synthetic event system in sync on contenteditable divs.
  document.execCommand('selectAll', false);
  document.execCommand('insertText', false, value);
  dispatchInputEvents(el);
}

function fillSelect(el: HTMLSelectElement, answer: string): boolean {
  const exact = Array.from(el.options).find(o => o.text.trim() === answer);
  const caseInsensitive = exact
    ?? Array.from(el.options).find(o => o.text.trim().toLowerCase() === answer.toLowerCase());
  const match = caseInsensitive;
  if (match) {
    el.value = match.value;
    dispatchInputEvents(el);
    return true;
  }
  return false;
}

// Handles ARIA combobox widgets (role="combobox" on a div).
// Strategy 1: if there's a real text input inside, fill it directly.
// Strategy 2: click to open the listbox, then click the matching option.
async function fillCombobox(el: Element, answer: string): Promise<boolean> {
  const inner = el.querySelector<HTMLInputElement>('input:not([type="hidden"]):not([disabled])');
  if (inner) {
    fillText(inner, answer);
    return true;
  }

  (el as HTMLElement).click();
  await new Promise<void>(r => setTimeout(r, 350));

  const listboxId = el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns');
  const listbox: Element | null = listboxId
    ? document.getElementById(listboxId)
    : (el.closest('[role="group"]') ?? el.parentElement)?.querySelector('[role="listbox"]') ?? null;

  if (!listbox) {
    document.body.click();
    return false;
  }

  const norm = (s: string) => s.trim().toLowerCase();
  const options = Array.from(listbox.querySelectorAll<Element>('[role="option"]'));
  const match = options.find(o => norm(o.textContent ?? '') === norm(answer))
    ?? options.find(o => norm(o.textContent ?? '').includes(norm(answer)));

  if (match) {
    (match as HTMLElement).click();
    return true;
  }

  document.body.click();
  return false;
}

export type FillResult =
  | { ok: true }
  | { ok: false; error: string };

export async function applyField(field: DetectedField, value: string): Promise<FillResult> {
  const root: Document | ShadowRoot = field.shadowHost
    ? (() => {
        const host = document.querySelector(field.shadowHost);
        return host?.shadowRoot ?? document;
      })()
    : document;

  const el = root.querySelector(field.selector);
  if (!el) return { ok: false, error: `Element not found: ${field.selector}` };

  if (isAlreadyFilled(el)) return { ok: true };

  switch (field.fieldType) {
    case 'text':
      fillText(el as HTMLInputElement, value);
      return { ok: true };

    case 'textarea':
      fillText(el as HTMLTextAreaElement, value);
      return { ok: true };

    case 'contenteditable':
      fillContentEditable(el, value);
      return { ok: true };

    case 'select': {
      if (el instanceof HTMLSelectElement) {
        const matched = fillSelect(el, value);
        if (!matched) {
          (el as HTMLElement).style.outline = '2px solid #f59e0b';
          return { ok: false, error: `No option matched "${value}" — manual fill needed` };
        }
        return { ok: true };
      }
      // ARIA combobox (div with role="combobox")
      const matched = await fillCombobox(el, value);
      if (!matched) {
        (el as HTMLElement).style.outline = '2px solid #f59e0b';
        return { ok: false, error: `No option matched "${value}" in combobox — manual fill needed` };
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown field type: ${field.fieldType}` };
  }
}
