import { describe, expect, test } from 'bun:test';

import type { ServerOperationRun, ServerOperationStatus } from '@meeshy/shared/types/admin-ops';

import { AWAITED_RUN_MAX_MS, OPS_STATUS_REFRESH_MS, awaitedRunOf, awaitedServed, operationCardOf, opsStatusRefreshMs } from './ops-run-view';

/**
 * LA CARTE D'UNE OPÉRATION SERVEUR (#10467) — le modèle de vue PUR : une demande acceptée se
 * dit « en file » tout de suite, jusqu'à ce que le statut servi porte SON identifiant, et les
 * délais se calculent contre l'heure que le rendu lui remet.
 */
const NOW = new Date('2026-10-13T00:46:00.000Z');
const PREVIOUS: ServerOperationRun = {
  requestId: 'r1',
  operation: 'backup',
  status: 'succeeded',
  requestedBy: 'u',
  requestedAt: '2026-10-12T22:40:00.000Z',
  startedAt: '2026-10-12T22:40:01.000Z',
  finishedAt: '2026-10-12T22:40:22.000Z',
  reclaimedBytes: null,
  code: null,
};
const status = (over: Partial<Pick<ServerOperationStatus, 'runs' | 'availableAt' | 'relayInstalled'>> = {}): Pick<ServerOperationStatus, 'runs' | 'availableAt' | 'relayInstalled'> => ({
  relayInstalled: true,
  runs: { backup: PREVIOUS, 'image-prune': null },
  availableAt: { backup: null, 'image-prune': null },
  ...over,
});
const accepted = awaitedRunOf({ operation: 'backup', requestId: '72e8db95', queuedAt: NOW.toISOString(), now: NOW });

describe('une demande acceptée se dit « en file » dès l’acceptation (#10467)', () => {
  test('la demande acceptée devient un passage « en file » daté de l’acceptation, ou de l’heure courante si le serveur ne la date pas', () => {
    expect(accepted).toEqual({ requestId: '72e8db95', operation: 'backup', status: 'queued', requestedBy: '', requestedAt: NOW.toISOString(), startedAt: null, finishedAt: null, reclaimedBytes: null, code: null });
    expect(awaitedRunOf({ operation: 'backup', requestId: 'x', queuedAt: null, now: NOW }).requestedAt).toBe(NOW.toISOString());
  });

  test('tant que le statut servi montre encore le passage d’avant, la carte dit « en file », bouton fermé, datée de l’acceptation', () => {
    const card = operationCardOf({ operation: 'backup', status: status(), awaited: accepted, now: NOW, online: true });
    expect(card.run?.status).toBe('queued');
    expect(card.run?.requestId).toBe('72e8db95');
    expect(card.running).toBe(true);
    expect(card.canPress).toBe(false);
    expect(card.lastAt).toBe(NOW.toISOString());
    expect(awaitedServed(accepted, status().runs)).toBe(false);
  });

  test('la demande en attente ne touche pas la carte de l’autre opération', () => {
    const card = operationCardOf({ operation: 'image-prune', status: status(), awaited: accepted, now: NOW, online: true });
    expect(card.run).toBeNull();
    expect(card.running).toBe(false);
    expect(card.canPress).toBe(true);
  });

  test('dès que le statut servi porte SON identifiant, le passage servi fait foi', () => {
    const served = status({ runs: { backup: { ...accepted, status: 'running', startedAt: '2026-10-13T00:46:03.000Z' }, 'image-prune': null } });
    expect(awaitedServed(accepted, served.runs)).toBe(true);
    const card = operationCardOf({ operation: 'backup', status: served, awaited: accepted, now: NOW, online: true });
    expect(card.run?.status).toBe('running');
    expect(card.running).toBe(true);
    const done = status({ runs: { backup: { ...accepted, status: 'succeeded', finishedAt: '2026-10-13T00:46:22.000Z' }, 'image-prune': null } });
    expect(operationCardOf({ operation: 'backup', status: done, awaited: accepted, now: NOW, online: true })).toMatchObject({ running: false, canPress: true, lastAt: '2026-10-13T00:46:22.000Z' });
  });

  test('le statut se relit à 5 s tant qu’une demande attend ou qu’un passage servi est en cours, 30 s sinon ; l’attente cède au plus après 2 min', () => {
    expect(opsStatusRefreshMs({ awaited: accepted, runs: status().runs })).toBe(5000);
    expect(opsStatusRefreshMs({ awaited: null, runs: { backup: { ...PREVIOUS, status: 'running' }, 'image-prune': null } })).toBe(5000);
    expect(opsStatusRefreshMs({ awaited: null, runs: status().runs })).toBe(30_000);
    expect(opsStatusRefreshMs({ awaited: null, runs: undefined })).toBe(30_000);
    expect(OPS_STATUS_REFRESH_MS).toEqual({ watching: 5000, idle: 30_000 });
    expect(AWAITED_RUN_MAX_MS).toBe(120_000);
  });

  test('hors ligne ou sans relais, le bouton reste fermé même sans passage en cours', () => {
    expect(operationCardOf({ operation: 'image-prune', status: status(), awaited: null, now: NOW, online: false }).canPress).toBe(false);
    expect(operationCardOf({ operation: 'image-prune', status: status({ relayInstalled: false }), awaited: null, now: NOW, online: true }).canPress).toBe(false);
  });
});

describe('les délais se lisent contre l’heure du rendu (#10467)', () => {
  test('la même carte, lue deux heures plus tard, ne dit plus « dans 34 secondes » : le délai s’écoule et le bouton s’ouvre', () => {
    const cooled = status({ availableAt: { backup: new Date(NOW.getTime() + 34_000).toISOString(), 'image-prune': null } });
    const early = operationCardOf({ operation: 'backup', status: cooled, awaited: null, now: NOW, online: true });
    expect(early.waitMs).toBe(34_000);
    expect(early.canPress).toBe(false);
    const later = operationCardOf({ operation: 'backup', status: cooled, awaited: null, now: new Date(NOW.getTime() + 2 * 60 * 60 * 1000), online: true });
    expect(later.waitMs).toBe(0);
    expect(later.canPress).toBe(true);
    expect(later.lastAt).toBe(PREVIOUS.finishedAt);
  });
});
