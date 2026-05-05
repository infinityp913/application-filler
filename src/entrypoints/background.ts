import { fillField } from '../lib/claudeClient';
import type { DetectedField, FillMode, MessageToBackground, StoredSettings } from '../types';

// In-session fill state — not persisted, cleared on worker restart
const fillState = {
  filling: false,
  current: 0,
  total: 0,
  filled: 0,
  skipped: 0,
};

async function setBadge(tabId: number, text: string, color?: string): Promise<void> {
  try {
    await browser.action.setBadgeText({ text, tabId });
    if (color) await browser.action.setBadgeBackgroundColor({ color, tabId });
  } catch {
    // Badge API unavailable in this context — non-fatal
  }
}

async function detectAllFrameFields(tabId: number): Promise<DetectedField[]> {
  let frameIds: number[] = [0];
  try {
    const frames = await browser.webNavigation.getAllFrames({ tabId });
    if (frames?.length) frameIds = frames.map(f => f.frameId);
  } catch {
    // webNavigation unavailable — main frame only
  }

  const all: DetectedField[] = [];
  for (const frameId of frameIds) {
    try {
      const fields = await browser.tabs.sendMessage(
        tabId,
        { type: 'DETECT_FIELDS' },
        { frameId }
      ) as DetectedField[];
      if (fields?.length) {
        all.push(...fields.map(f => frameId === 0 ? f : { ...f, frameId }));
      }
    } catch {
      // No content script in this frame — skip
    }
  }
  return all;
}

async function runFill(tabId: number, mode: FillMode): Promise<void> {
  if (fillState.filling) return;

  const stored = await browser.storage.local.get({ personal: '', startup: '', apiKey: '' });
  const personal = (stored as StoredProfile & StoredSettings).personal ?? '';
  const startup = (stored as StoredProfile & StoredSettings).startup ?? '';
  const apiKey = (stored as StoredProfile & StoredSettings).apiKey ?? '';

  if (!apiKey) {
    await setBadge(tabId, '!key', '#ef4444');
    console.warn('[AppFiller] No API key set');
    return;
  }

  let fields: DetectedField[] = [];
  try {
    fields = await detectAllFrameFields(tabId);
  } catch (err) {
    console.error('[AppFiller] DETECT_FIELDS failed', err);
    return;
  }

  if (!fields?.length) {
    await setBadge(tabId, '0');
    console.log('[AppFiller] No fillable fields found');
    return;
  }

  fillState.filling = true;
  fillState.current = 0;
  fillState.total = fields.length;
  fillState.filled = 0;
  fillState.skipped = 0;
  console.log(`[AppFiller] Starting fill: ${fields.length} fields, mode=${mode}`);

  let filled = 0;
  let skipped = 0;

  try {
    for (const field of fields) {
      fillState.current++;
      await setBadge(tabId, `${fillState.current}/${fillState.total}`, '#6366f1');
      console.log(`[AppFiller] Field ${fillState.current}/${fillState.total}: "${field.fieldLabel}"`);

      try {
        const answer = await fillField(field, personal, startup, mode, apiKey);
        console.log(`[AppFiller]   → answer: "${answer.slice(0, 60)}"`);

        const frameOptions = field.frameId !== undefined ? { frameId: field.frameId } : {};
        const result = await browser.tabs.sendMessage(tabId, {
          type: 'APPLY_FIELD',
          selector: field.selector,
          shadowHost: field.shadowHost,
          fieldType: field.fieldType,
          value: answer,
        }, frameOptions);

        if (result?.ok) {
          filled++;
          fillState.filled = filled;
        } else {
          console.warn(`[AppFiller]   → apply failed: ${result?.error}`);
          skipped++;
          fillState.skipped = skipped;
        }
      } catch (err) {
        console.error(`[AppFiller]   → error on "${field.fieldLabel}":`, err);
        skipped++;
        fillState.skipped = skipped;
      }
    }
  } finally {
    fillState.filling = false;
  }

  await setBadge(tabId, '✓', '#22c55e');
  console.log(`[AppFiller] Done: ${filled} filled, ${skipped} skipped of ${fields.length}`);
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: MessageToBackground, _sender) => {
    if (message.type === 'FILL_PAGE') {
      browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id) runFill(tab.id, message.mode).catch(err => {
          console.error('[AppFiller] runFill crashed:', err);
          fillState.filling = false;
        });
      });
      return false;
    }

    if (message.type === 'GET_FILL_STATUS') {
      return Promise.resolve({ ...fillState });
    }
  });
});
