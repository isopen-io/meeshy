import { beforeAll, describe, expect, test } from 'bun:test';

import { PRIVACY_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences';
import { CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';

import { fixtureAppPreferences } from '@/lib/api/fixtures-app-preferences';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { callStatusKey, canRetry } from './call-view';

/**
 * « APPELS HORS CONTACTS » (#8073) — l'appelant que la passerelle refuse lit
 * un motif clair, dans sa langue, et ne se voit pas proposer de réessayer un
 * appel qui sera refusé de la même façon.
 */

const refused = { kind: 'ended', reason: 'failed', detail: CALL_ERROR_CODES.CALLEE_REFUSES_NON_CONTACTS } as const;
const base = { callId: null, direction: 'outgoing' as const, media: 'audio' as const };

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
});

describe('refus « Appels hors contacts »', () => {
  test('l’écran nomme le motif au lieu de « Échec de l’appel »', () => {
    expect(callStatusKey({ ...base, phase: refused })).toBe('call.ended.refusedNonContacts');
  });

  test('un échec ordinaire garde son libellé', () => {
    expect(callStatusKey({ ...base, phase: { kind: 'ended', reason: 'failed', detail: 'NO_ACK' } })).toBe('call.ended.failed');
  });

  test('« Réessayer » n’est pas proposé pour un refus de principe', () => {
    expect(canRetry({ direction: 'outgoing', phase: refused })).toBe(false);
    expect(canRetry({ direction: 'outgoing', phase: { kind: 'ended', reason: 'failed', detail: 'NO_ACK' } })).toBe(true);
  });

  test('le motif est traduit dans les sept langues d’interface', () => {
    const texts = SUPPORTED_INTERFACE_LANGUAGES.map((language) => translate(language, 'call.ended.refusedNonContacts'));
    expect(texts.every((text) => text.length > 0 && text !== 'call.ended.refusedNonContacts')).toBe(true);
    expect(new Set(texts).size).toBe(SUPPORTED_INTERFACE_LANGUAGES.length);
  });

  test('par défaut, tout le monde peut faire sonner — le réglage ne se ferme que si on le coupe', () => {
    expect(PRIVACY_PREFERENCE_DEFAULTS.acceptCallsFromNonContacts).toBe(true);
    expect(fixtureAppPreferences().acceptCallsFromNonContacts).toBe(true);
  });
});
