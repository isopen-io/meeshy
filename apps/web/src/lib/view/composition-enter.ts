const PROCESS_KEY_CODE = 229;

export type CompositionKeyEvent = Pick<KeyboardEvent, 'key' | 'isComposing' | 'keyCode'>;

export const enterConfirmsComposition = (event: CompositionKeyEvent): boolean =>
  event.key === 'Enter' && (event.isComposing || event.keyCode === PROCESS_KEY_CODE);
