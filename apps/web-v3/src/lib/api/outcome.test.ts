import { describe, expect, test } from 'bun:test';

import { sendFailureReason } from '@/lib/send/failure-reason';

import { isPermanentFailure, outcomeOf, RETRYABLE_CLIENT_STATUSES } from './outcome';

describe('outcomeOf', () => {
  test('ok:true ⇒ success', () => {
    expect(outcomeOf({ ok: true, data: {} })).toBe('success');
  });

  for (const status of [400, 403, 404]) {
    test(`status ${status} ⇒ permanent`, () => {
      expect(outcomeOf({ ok: false, status })).toBe('permanent');
    });
  }

  /**
   * RETRYABLE_CLIENT_STATUSES (revue-correction #5813, défaut majeur 1) —
   * 408/425/429 restent des 4xx, mais un rejeu À L'IDENTIQUE peut aboutir
   * sans aucun geste de l'utilisateur ailleurs : ils ne rentrent PAS dans la
   * règle générale « 4xx ⇒ permanent ».
   */
  for (const status of [0, 408, 425, 429, 500, 503]) {
    test(`status ${status} ⇒ transient`, () => {
      expect(outcomeOf({ ok: false, status })).toBe('transient');
    });
  }

  test('valeur non-objet ⇒ transient', () => {
    expect(outcomeOf(null)).toBe('transient');
    expect(outcomeOf(undefined)).toBe('transient');
    expect(outcomeOf('erreur')).toBe('transient');
  });
});

/**
 * `isPermanentFailure` (revue-correction #5813, défaut majeur 2) — un refus
 * PERMANENT (403 « vous n'êtes pas participant », 401 session expirée) ne
 * peut jamais aboutir en rejouant le MÊME appel : `perform-send.ts` posait
 * `markFailed` pour TOUTE issue non-ok sans jamais consulter `outcomeOf`,
 * alors qu'il avait été extrait précisément pour cette distinction.
 */
describe('isPermanentFailure', () => {
  for (const status of [400, 401, 403, 404]) {
    test(`status ${status} ⇒ permanent`, () => {
      expect(isPermanentFailure({ status })).toBe(true);
    });
  }

  /**
   * LE RANG DU TÉMOIN (revue-correction #5813, défaut majeur 1) — sur un 403,
   * la règle JUSTE et la règle FAUSSE (« tout 4xx est permanent ») rendent le
   * même verdict ; ce cas ne peut donc PAS épingler la régression. 429 est le
   * rang qui les distingue, et c'est le seul des trois atteignable en usage
   * réel (limiteur global de la passerelle, `rate-limiter.ts:56-58`).
   */
  for (const status of [0, 408, 425, 429, 500, 503]) {
    test(`status ${status} ⇒ PAS permanent (un rejeu peut aboutir)`, () => {
      expect(isPermanentFailure({ status })).toBe(false);
    });
  }

  test('undefined (hors ligne, D-16 — aucun appel parti) ⇒ PAS permanent', () => {
    expect(isPermanentFailure(undefined)).toBe(false);
  });
});

/**
 * COHÉRENCE CROISÉE (revue-correction #5813, défaut majeur 1) — le défaut
 * initial tenait exactement dans l'écart entre deux tables qui ne se
 * lisaient jamais : `sendFailureReason` promettait « réessayez » pour un 429
 * pendant qu'`isPermanentFailure` retirait le bouton qui permet de le faire.
 * Ce témoin lie les deux SOURCES directement, pour qu'elles ne puissent plus
 * rediverger sans le faire rougir — quel que soit le statut ajouté demain à
 * l'une ou l'autre.
 */
describe('cohérence — un statut que sendFailureReason dit "réessayer" n’est jamais permanent', () => {
  const RETRY_PHRASE_STATUSES = [408, 425, 429] as const;

  for (const status of RETRY_PHRASE_STATUSES) {
    test(`status ${status} : dans RETRYABLE_CLIENT_STATUSES ET pas permanent`, () => {
      expect(RETRYABLE_CLIENT_STATUSES.has(status)).toBe(true);
      expect(isPermanentFailure({ status })).toBe(false);
    });
  }

  test('le 429 que sendFailureReason invite explicitement à réessayer n’est jamais permanent', () => {
    const reason = sendFailureReason({ ok: false, status: 429, error: 'Rate limit exceeded' });
    expect(reason).toContain('réessayez');
    expect(isPermanentFailure({ status: 429 })).toBe(false);
  });
});
