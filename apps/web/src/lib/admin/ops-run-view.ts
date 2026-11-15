import type { ServerOperation, ServerOperationRun, ServerOperationStatus } from '@meeshy/shared/types/admin-ops';

import { cooldownOf, operationRunning } from './host-metrics';

/**
 * **LA CARTE D'UNE OPÉRATION SERVEUR, MODÈLE DE VUE** (#10467) — fonctions PURES, lues par
 * `AdminOperationsActions`. Entre le dépôt d'une demande et la première écriture du relais, le
 * statut relu montre encore le passage d'AVANT : la demande acceptée se dit donc « en file »
 * tout de suite, bouton fermé, relecture rapprochée, jusqu'à ce que le statut servi porte SON
 * identifiant — au plus `AWAITED_RUN_MAX_MS`, puis le statut servi fait foi. Les délais se
 * calculent contre l'heure que le rendu remet : rien n'est figé à l'ouverture. Hors de sa
 * fenêtre horaire (#11452), `availableAt` porte déjà la prochaine ouverture : le bouton se
 * ferme comme sous le délai, et la carte dit que c'est la fenêtre qui attend.
 */
export const AWAITED_RUN_MAX_MS = 120_000;
export const OPS_STATUS_REFRESH_MS = { watching: 5000, idle: 30_000 } as const;

type Runs = ServerOperationStatus['runs'];
export type OpsStatusView = Pick<ServerOperationStatus, 'runs' | 'availableAt' | 'relayInstalled'> & Partial<Pick<ServerOperationStatus, 'windows'>>;

export function awaitedRunOf({ operation, requestId, queuedAt, now }: { readonly operation: ServerOperation; readonly requestId: string; readonly queuedAt: string | null; readonly now: Date }): ServerOperationRun {
  return { requestId, operation, status: 'queued', requestedBy: '', requestedAt: queuedAt ?? now.toISOString(), startedAt: null, finishedAt: null, reclaimedBytes: null, code: null };
}

/** Le statut servi porte l'identifiant de la demande attendue : elle n'a plus à être simulée. */
export function awaitedServed(awaited: ServerOperationRun | null, runs: Runs | undefined): boolean {
  return awaited !== null && runs?.[awaited.operation]?.requestId === awaited.requestId;
}

function shownRun(operation: ServerOperation, runs: Runs, awaited: ServerOperationRun | null): ServerOperationRun | null {
  const served = runs[operation];
  if (awaited === null || awaited.operation !== operation || awaitedServed(awaited, runs)) return served;
  return awaited;
}

export function opsStatusRefreshMs({ awaited, runs }: { readonly awaited: ServerOperationRun | null; readonly runs: Runs | undefined }): number {
  const watching = awaited !== null || (runs !== undefined && Object.values(runs).some(operationRunning));
  return watching ? OPS_STATUS_REFRESH_MS.watching : OPS_STATUS_REFRESH_MS.idle;
}

export type OperationCardModel = {
  readonly run: ServerOperationRun | null;
  readonly running: boolean;
  readonly waitMs: number;
  /** L'attente vient de la fenêtre horaire fermée, pas (seulement) du délai. */
  readonly outsideWindow: boolean;
  readonly lastAt: string | null;
  readonly canPress: boolean;
};

export function operationCardOf({ operation, status, awaited, now, online }: { readonly operation: ServerOperation; readonly status: OpsStatusView; readonly awaited: ServerOperationRun | null; readonly now: Date; readonly online: boolean }): OperationCardModel {
  const run = shownRun(operation, status.runs, awaited);
  const running = operationRunning(run);
  const waitMs = cooldownOf(status.availableAt[operation], now);
  const outsideWindow = waitMs > 0 && status.windows?.[operation]?.open === false;
  return { run, running, waitMs, outsideWindow, lastAt: run?.finishedAt ?? run?.requestedAt ?? null, canPress: online && status.relayInstalled && !running && waitMs === 0 };
}
