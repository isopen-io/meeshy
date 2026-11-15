import { describe, expect, test } from 'bun:test';

import { hearing, isSpeaking, QUIET, SPEECH_ENTER, SPEECH_EXIT, SPEECH_HOLD_MS } from './call-speaking';

/**
 * LA LOI DE PAROLE D'UN PAIR (P9.6) — la même hystérésis que les vignettes d'un groupe
 * (`ActiveSpeakerDetector` iOS, Android) : on entre au-dessus de `SPEECH_ENTER`, on ne sort
 * qu'après `SPEECH_HOLD_MS` passé sous `SPEECH_EXIT`. Sans elle l'anneau clignoterait entre deux syllabes.
 */
describe('hearing — le niveau reçu du pair devient « il parle »', () => {
  test('personne ne parle au repos, et un niveau sous le seuil d’entrée n’allume rien', () => {
    expect(isSpeaking(QUIET)).toBe(false);
    expect(isSpeaking(hearing(QUIET, SPEECH_ENTER - 0.01, 0))).toBe(false);
  });

  test('le seuil d’entrée allume la parole', () => {
    expect(isSpeaking(hearing(QUIET, SPEECH_ENTER, 0))).toBe(true);
  });

  test('une fois allumée, la parole tient entre le seuil de sortie et celui d’entrée', () => {
    const on = hearing(QUIET, SPEECH_ENTER, 0);
    const between = (SPEECH_ENTER + SPEECH_EXIT) / 2;
    expect(isSpeaking(hearing(on, between, 400))).toBe(true);
    expect(isSpeaking(hearing(hearing(on, between, 400), between, 1000))).toBe(true);
  });

  test('un silence plus court que le maintien ne l’éteint pas ; plus long, il l’éteint', () => {
    const on = hearing(QUIET, SPEECH_ENTER, 0);
    expect(isSpeaking(hearing(on, 0, SPEECH_HOLD_MS))).toBe(true);
    expect(isSpeaking(hearing(on, 0, SPEECH_HOLD_MS + 1))).toBe(false);
  });

  test('aucune mesure (null) laisse s’écouler le maintien sans rien rallumer', () => {
    const on = hearing(QUIET, SPEECH_ENTER, 0);
    expect(isSpeaking(hearing(on, null, 500))).toBe(true);
    expect(isSpeaking(hearing(on, null, 900))).toBe(false);
    expect(isSpeaking(hearing(QUIET, null, 0))).toBe(false);
  });

  test('éteinte, la parole ne revient qu’au seuil d’entrée, pas à celui de sortie', () => {
    const off = hearing(hearing(QUIET, SPEECH_ENTER, 0), 0, 2000);
    expect(isSpeaking(hearing(off, SPEECH_EXIT, 2100))).toBe(false);
    expect(isSpeaking(hearing(off, SPEECH_ENTER, 2100))).toBe(true);
  });
});
