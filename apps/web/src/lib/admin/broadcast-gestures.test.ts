import { describe, expect, test } from 'bun:test';

import {
  BROADCAST_POLL_MS,
  broadcastGestures,
  broadcastPollInterval,
  deliveryProgress,
  inAppStateOf,
  recipientsToReach,
} from './broadcast-gestures';

/**
 * **CE QU'ON PEUT FAIRE D'UNE DIFFUSION, SELON OÙ ELLE EN EST** (#8876, #6731) —
 * la table des gestes est celle des gardes de la passerelle (`routes/admin/
 * broadcasts.ts`) : on ne dessine que ce qui a un effet. Il n'y a pas
 * d'annulation : la passerelle n'en sert aucune.
 */
const facts = (overrides: Partial<{ status: string; inAppSentAt: string | null; inAppCompletedAt: string | null }> = {}) => ({
  status: 'DRAFT',
  inAppSentAt: null,
  inAppCompletedAt: null,
  ...overrides,
});

describe('broadcastGestures', () => {
  test('un brouillon se prépare (traduit), se modifie, se supprime', () => {
    expect(broadcastGestures(facts({ status: 'DRAFT' }))).toEqual(['prepare', 'edit', 'delete']);
  });

  test('une diffusion prête s’envoie, se publie dans l’application, se supprime — mais ne se modifie plus', () => {
    const gestures = broadcastGestures(facts({ status: 'READY' }));

    expect(gestures).toEqual(['send', 'publishInApp', 'delete']);
    expect(gestures).not.toContain('edit');
  });

  test('une diffusion prête déjà publiée dans l’application ne se republie pas', () => {
    expect(broadcastGestures(facts({ status: 'READY', inAppSentAt: '2026-09-29T13:00:00.000Z' }))).toEqual(['send', 'delete']);
  });

  test('une diffusion envoyée se publie dans l’application si elle ne l’a pas été', () => {
    expect(broadcastGestures(facts({ status: 'SENT' }))).toEqual(['publishInApp']);
  });

  test('une diffusion envoyée ET publiée n’offre plus aucun geste', () => {
    expect(broadcastGestures(facts({ status: 'SENT', inAppSentAt: '2026-09-29T13:00:00.000Z' }))).toEqual([]);
  });

  test('un envoi en cours n’offre aucun geste', () => {
    expect(broadcastGestures(facts({ status: 'SENDING' }))).toEqual([]);
  });

  test('un échec n’offre aucun geste : la passerelle n’a ni reprise ni suppression pour lui', () => {
    expect(broadcastGestures(facts({ status: 'FAILED' }))).toEqual([]);
  });

  test('un statut inconnu n’offre rien : fail-closed', () => {
    expect(broadcastGestures(facts({ status: 'ARCHIVED' }))).toEqual([]);
    expect(broadcastGestures(facts({ status: 'TRANSLATING' }))).toEqual([]);
  });
});

describe('inAppStateOf', () => {
  test('jamais publiée, en cours, ou publiée', () => {
    expect(inAppStateOf(facts())).toBe('never');
    expect(inAppStateOf(facts({ inAppSentAt: '2026-09-29T13:00:00.000Z' }))).toBe('running');
    expect(inAppStateOf(facts({ inAppSentAt: '2026-09-29T13:00:00.000Z', inAppCompletedAt: '2026-09-29T13:05:00.000Z' }))).toBe('done');
  });
});

describe('broadcastPollInterval', () => {
  test('toutes les 10 secondes tant que l’envoi par e-mail tourne', () => {
    expect(BROADCAST_POLL_MS).toBe(10_000);
    expect(broadcastPollInterval(facts({ status: 'SENDING' }))).toBe(10_000);
  });

  test('et tant que la publication dans l’application tourne, quel que soit le statut', () => {
    expect(broadcastPollInterval(facts({ status: 'SENT', inAppSentAt: '2026-09-29T13:00:00.000Z' }))).toBe(10_000);
  });

  test('jamais au repos', () => {
    expect(broadcastPollInterval(facts({ status: 'DRAFT' }))).toBe(false);
    expect(broadcastPollInterval(facts({ status: 'SENT' }))).toBe(false);
    expect(broadcastPollInterval(facts({ status: 'SENT', inAppSentAt: '2026-09-29T13:00:00.000Z', inAppCompletedAt: '2026-09-29T13:05:00.000Z' }))).toBe(false);
  });

  test('pas de données, pas de relance', () => {
    expect(broadcastPollInterval(undefined)).toBe(false);
  });

  test('l’intervalle se règle (témoins)', () => {
    expect(broadcastPollInterval(facts({ status: 'SENDING' }), 20)).toBe(20);
  });
});

describe('recipientsToReach', () => {
  test('le nombre rapporté par la préparation prime quand on le connaît', () => {
    expect(recipientsToReach({ totalRecipients: 1204 }, { recipientCount: 1300 })).toBe(1300);
  });

  test('sinon le total que la ligne porte', () => {
    expect(recipientsToReach({ totalRecipients: 1204 }, undefined)).toBe(1204);
  });
});

describe('deliveryProgress', () => {
  test('envoyés + échecs sur destinataires, borné à 1', () => {
    expect(deliveryProgress({ status: 'SENDING', totalRecipients: 200, sentCount: 40, failedCount: 10 })).toBe(0.25);
    expect(deliveryProgress({ status: 'SENDING', totalRecipients: 10, sentCount: 10, failedCount: 5 })).toBe(1);
  });

  test('une diffusion envoyée est à 100 % même si des comptes ont été ignorés', () => {
    expect(deliveryProgress({ status: 'SENT', totalRecipients: 200, sentCount: 150, failedCount: 10 })).toBe(1);
  });

  test('sans destinataire, zéro — jamais NaN', () => {
    expect(deliveryProgress({ status: 'SENDING', totalRecipients: 0, sentCount: 0, failedCount: 0 })).toBe(0);
  });
});
