import { describe, expect, test } from 'bun:test';

import { callCaptionsFooter } from './call-captions-footer';

describe('le pied des sous-titres : « EN → FR · toucher = original »', () => {
  const line = (languages: string | null, event = false) => ({ languages, event });

  test('la dernière phrase traduite dit sa paire', () => {
    expect(callCaptionsFooter([line('EN → FR')])).toBe('EN → FR');
  });

  test('la plus récente traduite décide de la paire', () => {
    expect(callCaptionsFooter([line('ES → FR'), line('EN → FR'), line(null)])).toBe('EN → FR');
  });

  test('des originaux seuls, ou rien, ne disent rien', () => {
    expect(callCaptionsFooter([line(null), line(null)])).toBeNull();
    expect(callCaptionsFooter([])).toBeNull();
  });

  test('une capture n’est pas une parole : elle ne parle jamais pour le pied', () => {
    expect(callCaptionsFooter([line('EN → FR', true)])).toBeNull();
  });
});
