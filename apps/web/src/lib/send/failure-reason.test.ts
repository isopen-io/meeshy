import { beforeAll, describe, expect, test } from 'bun:test';

import type { ApiFailure } from '@/lib/api/http';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { sendFailureReason as sendFailureReasonIn } from './failure-reason';

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
});

const sendFailureReason = (failure: ApiFailure | undefined) => sendFailureReasonIn(failure, 'fr');

const failure = (status: number, extra: Partial<ApiFailure> = {}): ApiFailure => ({
  ok: false,
  status,
  error: 'You are not a participant of this conversation',
  ...extra,
});

describe('sendFailureReason', () => {
  test('aucune erreur (échec HORS LIGNE) ⇒ aucune cause : le bandeau la dit déjà', () => {
    expect(sendFailureReason(undefined)).toBeUndefined();
  });

  test('la prose de la passerelle n’est JAMAIS servie telle quelle', () => {
    for (const status of [0, 401, 403, 429, 400, 500]) {
      expect(sendFailureReason(failure(status))).not.toContain('participant');
    }
  });

  test('chaque statut a sa cause, et le délai de garde se distingue du réseau', () => {
    expect(sendFailureReason(failure(0))).toBe('réseau indisponible');
    expect(sendFailureReason(failure(0, { code: 'TIMEOUT' }))).toBe('la passerelle n’a pas répondu');
    expect(sendFailureReason(failure(401))).toBe('session expirée — reconnectez-vous');
    expect(sendFailureReason(failure(403))).toBe('envoi refusé pour cette conversation');
    expect(sendFailureReason(failure(429))).toBe('trop de messages d’un coup — réessayez dans un instant');
    expect(sendFailureReason(failure(422))).toBe('message refusé');
    expect(sendFailureReason(failure(503))).toBe('la passerelle est indisponible');
  });

  /**
   * #5668 — la SEULE cause spécifique aux pièces jointes que ce client peut
   * VOIR : `UPLOAD_PARTIAL`, qu'il synthétise lui-même
   * (`perform-send.ts § uploadPhase`). Le `code`
   * `ATTACHMENT_RIGHT_NOT_PERMITTED` n'a PAS de branche ici — mesuré : la
   * route le lit pour choisir son statut puis appelle
   * `sendForbidden(reply, result.error)` sans `options.code`
   * (`messages-send.ts:364`), et `sendError` pose `code: undefined`
   * (`response.ts:89`), supprimé à la sérialisation. Un témoin écrit sur ce
   * code n'aurait mesuré que sa propre fixture.
   */
  test('UPLOAD_PARTIAL (statut 200 synthétique) ⇒ cause dédiée, jamais confondue avec un succès', () => {
    expect(sendFailureReason(failure(200, { code: 'UPLOAD_PARTIAL' }))).toBe('une pièce n’a pas pu être téléversée');
  });

  test('un 403 de la passerelle reste le refus générique — aucun code ne voyage avec lui', () => {
    expect(sendFailureReason(failure(403))).toBe('envoi refusé pour cette conversation');
    expect(sendFailureReason(failure(403, { code: 'ATTACHMENT_RIGHT_NOT_PERMITTED' }))).toBe(
      'envoi refusé pour cette conversation',
    );
  });

  /* #7740 — le mode lent des nouveaux comptes dans Meeshy Global : un refus
     TEMPORAIRE, qui dit pourquoi et combien de temps, jamais « trop de
     messages » (le nouveau venu n'a rien fait de trop). */
  test('le mode lent des nouveaux comptes dit pourquoi et le délai réel', () => {
    expect(sendFailureReason(failure(429, { code: 'NEWCOMER_SLOW_MODE', retryAfter: 18 }))).toBe(
      'bienvenue ! un message toutes les 30 s pour les nouveaux comptes — réessayez dans 18 s',
    );
    expect(sendFailureReason(failure(429, { code: 'NEWCOMER_SLOW_MODE' }))).toBe(
      'bienvenue ! un message toutes les 30 s pour les nouveaux comptes — réessayez dans un instant',
    );
  });
});

/* #7740 — la cause se dit dans la LANGUE D'INTERFACE du lecteur, jamais en
   français pour tous : c'est la phrase que l'annonce « Message non envoyé —
   {reason} » (déjà au catalogue) embarque. */
describe('sendFailureReason — dans la langue d’interface', () => {
  test('le mode lent des nouveaux comptes se dit en anglais, délai réel compris', () => {
    expect(sendFailureReasonIn(failure(429, { code: 'NEWCOMER_SLOW_MODE', retryAfter: 18 }), 'en')).toBe(
      'welcome! new accounts can send one message every 30 s — try again in 18 s',
    );
  });

  test('chaque cause change de texte d’une langue à l’autre et garde son délai', () => {
    const failures: readonly ApiFailure[] = [
      failure(0),
      failure(0, { code: 'TIMEOUT' }),
      failure(200, { code: 'UPLOAD_PARTIAL' }),
      failure(429, { code: 'NEWCOMER_SLOW_MODE', retryAfter: 18 }),
      failure(429, { code: 'NEWCOMER_SLOW_MODE' }),
      failure(401),
      failure(403),
      failure(429),
      failure(422),
      failure(503),
    ];
    for (const f of failures) {
      const french = sendFailureReasonIn(f, 'fr');
      for (const language of SUPPORTED_INTERFACE_LANGUAGES.filter((l) => l !== 'fr')) {
        const served = sendFailureReasonIn(f, language);
        expect(served).not.toBe(french);
        expect(served).not.toContain('{');
      }
    }
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      expect(sendFailureReasonIn(failure(429, { code: 'NEWCOMER_SLOW_MODE', retryAfter: 18 }), language)).toContain('18');
    }
  });
});
