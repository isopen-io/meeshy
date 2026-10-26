/**
 * #13102 — la tâche de traduction d'un TEXTE part protégée (`atRest`) quand
 * la conversation est au repos OU quand le message est destiné à disparaître
 * (vue unique, flamme, éphémère) : le translator n'en range rien.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { translationRequestRegime } from '../atRestTranslationSource';

describe('le régime d’une tâche de traduction de texte', () => {
  it('protégée pour une conversation server ou hybrid', () => {
    expect(translationRequestRegime({ encryptionMode: 'server' })).toEqual({ atRest: true });
    expect(translationRequestRegime({ encryptionMode: 'hybrid' })).toEqual({ atRest: true });
  });

  it('protégée pour un message à vue unique ou éphémère, même en clair', () => {
    expect(translationRequestRegime({ encryptionMode: null, isViewOnce: true })).toEqual({ atRest: true });
    expect(translationRequestRegime({ encryptionMode: null, ephemeralDuration: 30, expiresAt: new Date(Date.now() + 30_000) })).toEqual({ atRest: true });
  });

  it('ordinaire sinon : la trame reste celle d’avant', () => {
    expect(translationRequestRegime({ encryptionMode: null })).toEqual({});
  });
});
