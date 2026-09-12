import { describe, expect, test } from 'bun:test';

import type { OutboxEntry } from '@/lib/send/outbox-store';
import type { LocalMessage } from '@/lib/send/local-message';

import {
  nextSyncPillExpiry,
  resolveSyncPill,
  STALE_INFLIGHT_MS,
  syncPillLabel,
  TERMINAL_DISPLAY_WINDOW_MS,
} from './sync-pill';

const T0 = Date.parse('2026-09-11T10:00:00Z');

/** Une entrée d'outbox réduite à ce que la LOI lit — le reste ne la regarde pas. */
const entree = (delivery: 'pending' | 'failed', startedAt: number): OutboxEntry =>
  ({
    message: { id: 'm', clientMessageId: 'c' } as unknown as LocalMessage,
    delivery,
    attempts: 1,
    startedAt,
  }) as OutboxEntry;

/**
 * LA PRIORITÉ EST UN ORDRE D'URGENCE, PAS UN ORDRE DE LECTURE — c'est le seul
 * invariant qu'une réécriture casserait sans qu'aucun écran ne le dise, donc
 * c'est celui qu'on épingle : `failed` > `offline` > `syncing` > `hidden`
 * (`SyncPillViewModel.derive`).
 */
describe('resolveSyncPill — la priorité', () => {
  test('file vide et réseau présent : la pastille n’existe pas', () => {
    expect(resolveSyncPill({ entries: [], online: true, now: T0 }).kind).toBe('hidden');
  });

  test('un envoi frais en vol : « syncing »', () => {
    const etat = resolveSyncPill({ entries: [entree('pending', T0)], online: true, now: T0 });
    expect(etat.kind).toBe('syncing');
    expect(etat.entries).toHaveLength(1);
  });

  test('hors ligne SANS rien en file : la pastille le dit quand même', () => {
    expect(resolveSyncPill({ entries: [], online: false, now: T0 }).kind).toBe('offline');
  });

  /**
   * L'INVARIANT QUI COMPTE : un échec doit SURVIVRE à une reconnexion. Si
   * `offline` l'emportait, l'échec disparaîtrait au moment précis où
   * l'utilisateur peut enfin agir dessus.
   */
  test('un échec l’emporte sur le hors-ligne', () => {
    const etat = resolveSyncPill({
      entries: [entree('failed', T0), entree('pending', T0)],
      online: false,
      now: T0,
    });
    expect(etat.kind).toBe('failed');
  });

  test('un envoi en vol depuis plus de 4 s bascule en « offline » MÊME en ligne', () => {
    const juste = resolveSyncPill({
      entries: [entree('pending', T0 - STALE_INFLIGHT_MS)],
      online: true,
      now: T0,
    });
    expect(juste.kind).toBe('syncing');

    const coince = resolveSyncPill({
      entries: [entree('pending', T0 - STALE_INFLIGHT_MS - 1)],
      online: true,
      now: T0,
    });
    expect(coince.kind).toBe('offline');
  });
});

/**
 * LA PÉREMPTION EST PAR ENTRÉE, JAMAIS PAR PASTILLE (#4660) — une ligne morte
 * périmée sort SANS emporter le travail encore vivant.
 */
describe('resolveSyncPill — la péremption des lignes terminales', () => {
  test('un échec de plus de soixante secondes ne tient plus la pastille', () => {
    const dedans = resolveSyncPill({
      entries: [entree('failed', T0 - TERMINAL_DISPLAY_WINDOW_MS)],
      online: true,
      now: T0,
    });
    expect(dedans.kind).toBe('failed');

    const dehors = resolveSyncPill({
      entries: [entree('failed', T0 - TERMINAL_DISPLAY_WINDOW_MS - 1)],
      online: true,
      now: T0,
    });
    expect(dehors.kind).toBe('hidden');
  });

  test('un échec périmé ne fait PAS virer au rouge une pastille qui a du travail vivant', () => {
    const etat = resolveSyncPill({
      entries: [entree('failed', T0 - TERMINAL_DISPLAY_WINDOW_MS - 1), entree('pending', T0)],
      online: true,
      now: T0,
    });
    expect(etat.kind).toBe('syncing');
    expect(etat.entries).toHaveLength(1);
  });

  test('nextSyncPillExpiry n’arme RIEN quand aucune ligne n’a d’échéance', () => {
    expect(nextSyncPillExpiry({ entries: [entree('pending', T0)], now: T0 })).toBeNull();
    expect(nextSyncPillExpiry({ entries: [], now: T0 })).toBeNull();
  });

  test('nextSyncPillExpiry rend la PLUS PROCHE échéance à venir', () => {
    const echeance = nextSyncPillExpiry({
      entries: [entree('failed', T0 - 10_000), entree('failed', T0 - 30_000)],
      now: T0,
    });
    expect(echeance).toBe(T0 - 30_000 + TERMINAL_DISPLAY_WINDOW_MS);
  });
});

/**
 * LE LIBELLÉ DÉCRIT L'ACTION, PAS L'OBJET — et une ligne terminale perd le
 * verbe actif (`SyncPillLabels.operationLabel`, sensible au statut).
 */
describe('syncPillLabel', () => {
  test('en cours, le verbe est actif', () => {
    expect(syncPillLabel(resolveSyncPill({ entries: [entree('pending', T0)], online: true, now: T0 }))).toBe(
      'Envoi de message',
    );
  });

  test('échoué, le verbe n’est plus actif', () => {
    const dit = syncPillLabel(resolveSyncPill({ entries: [entree('failed', T0)], online: true, now: T0 }));
    expect(dit).toBe('Envoi échoué');
    expect(dit).not.toContain('Envoi de');
  });

  test('hors ligne, la pastille compte ce qui attend', () => {
    expect(
      syncPillLabel(resolveSyncPill({ entries: [entree('pending', T0), entree('pending', T0)], online: false, now: T0 })),
    ).toBe('Hors ligne — 2 en attente');
    expect(syncPillLabel(resolveSyncPill({ entries: [], online: false, now: T0 }))).toBe('Hors ligne');
  });

  test('cachée, elle ne dit rien du tout', () => {
    expect(syncPillLabel(resolveSyncPill({ entries: [], online: true, now: T0 }))).toBe('');
  });
});
