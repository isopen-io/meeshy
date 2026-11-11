import { describe, expect, test } from 'bun:test';

import type { CallCaption } from './call-captions';
import { callCaptionsFooter, captionFooterLine, EVENT_FOOTER_LINE, type FooterLine } from './call-captions-footer';

describe('le pied des sous-titres : ce que les phrases disent de leur traduction', () => {
  const line = (origin: string | null, served: string | null = null, awaiting = false): FooterLine => ({ event: false, origin, served, awaiting });

  test('une paire : « EN → FR », et la plus récente décide', () => {
    expect(callCaptionsFooter([line('EN', 'FR')])).toEqual({ kind: 'touchForOriginal', pair: 'EN → FR' });
    expect(callCaptionsFooter([line('EN', 'FR'), line('EN', null), line('EN', 'FR')])).toEqual({ kind: 'touchForOriginal', pair: 'EN → FR' });
  });

  test('plusieurs paires se comptent par langues distinctes : « Traduit · 3 langues »', () => {
    expect(callCaptionsFooter([line('ES', 'FR'), line('EN', 'FR')])).toEqual({ kind: 'translatedLanguages', count: 3 });
  });

  test('une traduction attendue parle d’abord : « EN · traduction en cours »', () => {
    expect(callCaptionsFooter([line('ES', 'FR'), line('EN', null, true)])).toEqual({ kind: 'translating', language: 'EN' });
  });

  test('des originaux seuls, ou rien, ne disent rien', () => {
    expect(callCaptionsFooter([line('EN'), line(null)])).toBeNull();
    expect(callCaptionsFooter([])).toBeNull();
  });

  test('une capture n’est pas une parole : elle ne parle jamais pour le pied', () => {
    expect(callCaptionsFooter([{ ...line('EN', 'FR', true), event: true }, EVENT_FOOTER_LINE])).toBeNull();
  });
});

describe('ce qu’une phrase apporte au pied', () => {
  const caption = (overrides: Partial<CallCaption> = {}): CallCaption => ({ id: 'w', speakerId: 'u', speakerName: 'Nadia', original: 'Hello', translated: 'Bonjour', pair: { from: 'en', to: 'fr' }, isFinal: true, at: 1, mine: false, ...overrides });

  test('traduite et lue traduite : la paire ; lue en original, seulement sa langue', () => {
    expect(captionFooterLine(caption(), 'translated', 0)).toEqual({ event: false, origin: 'EN', served: 'FR', awaiting: false });
    expect(captionFooterLine(caption(), 'original', 0)).toEqual({ event: false, origin: 'EN', served: null, awaiting: false });
  });

  test('l’original d’une langue étrangère attend sa traduction jusqu’à l’échéance', () => {
    const waiting = caption({ translated: null, pair: null, origin: { language: 'es', foreign: true, awaitingUntil: 100 } });
    expect(captionFooterLine(waiting, 'translated', 99)).toEqual({ event: false, origin: 'ES', served: null, awaiting: true });
    expect(captionFooterLine(waiting, 'translated', 100).awaiting).toBe(false);
  });

  test('ma parole ne dit aucune langue', () => {
    expect(captionFooterLine(caption({ mine: true, translated: null, pair: null }), 'translated', 0).origin).toBeNull();
  });
});
