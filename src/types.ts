export interface DetectedField {
  fieldLabel: string;
  fieldType: 'text' | 'textarea' | 'select' | 'contenteditable' | 'unknown';
  currentValue: string;
  selector: string;
  shadowHost?: string;
  frameId?: number;
  context: string;
  options?: { label: string; value: string }[];
  wordLimit?: number;
  charLimit?: number;
}

export type FillMode = 'job' | 'accelerator';

export type MessageToBackground =
  | { type: 'FILL_PAGE'; mode: FillMode }
  | { type: 'GET_FILL_STATUS' };

export type MessageToContent =
  | { type: 'DETECT_FIELDS' }
  | { type: 'APPLY_FIELD'; selector: string; value: string; shadowHost?: string; fieldType: DetectedField['fieldType'] };

export type BackgroundResponse =
  | { type: 'FIELDS'; fields: DetectedField[] }
  | { type: 'APPLY_RESULT'; ok: boolean; error?: string }
  | { type: 'FILL_STATUS'; filling: boolean; current: number; total: number };

export interface StoredProfile {
  personal: string;
  startup: string;
}

export interface StoredSettings {
  apiKey: string;
}
