import { detectFields } from '../lib/formDetector';
import { applyField } from '../lib/fieldFiller';
import type { MessageToContent } from '../types';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  main() {
    browser.runtime.onMessage.addListener((message: MessageToContent, _sender, sendResponse) => {
      if (message.type === 'DETECT_FIELDS') {
        sendResponse(detectFields());
        return false;
      }

      if (message.type === 'APPLY_FIELD') {
        const { selector, value, shadowHost, fieldType } = message;
        const result = applyField({ selector, value: '', shadowHost, fieldType, fieldLabel: '', currentValue: '', context: '' }, value);
        sendResponse(result);
        return false;
      }
    });
  },
});
