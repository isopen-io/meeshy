import * as meEndpoints from '@meeshy/shared/api/endpoints/me';
import * as relationsEndpoints from '@meeshy/shared/api/endpoints/relations';
import {
  BATTERY_ANNOUNCEMENT_KINDS,
  BATTERY_DEFAULT_RECEIVE_MODE,
  BATTERY_DEVICE_LABEL_MAX,
  BATTERY_ERROR_CODES,
  BATTERY_PHASES,
  BATTERY_RECEIVE_MODES,
  type BatteryReceiveMode,
} from '@meeshy/shared/types/battery-constants';
import type {
  BatteryAnnouncement,
  BatteryChangedEventData,
  BatteryClearedEventData,
  BatteryReaderState,
  BatteryServedPhase,
} from '@meeshy/shared/types/battery';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LA BATTERIE DE MES PROCHES ET DE MES SANGS, TELLE QUE LA PASSERELLE LA SERT** (#14147 ; contrat
 * `packages/shared/types/battery.ts`, spec `docs/superpowers/specs/2026-11-15-batterie-proches-design.md`).
 *
 * Le web REÇOIT et AFFICHE ; il n'émet aucun relevé (un navigateur n'a pas de batterie fiable, et le serveur ne
 * suit que le téléphone). Le serveur a déjà jugé : niveau, consentement, blocage, phase. Ce décodeur ne garde que
 * les champs du contrat, bornés comme le serveur les borne — et sans Zod : le schéma vit dans `battery.ts`, que ce
 * client ne lit qu'en TYPE ; les valeurs viennent de `battery-constants.ts`, écrit pour un client léger.
 */

export type BatteryDeps = { readonly source: DataSource; readonly transport: HttpTransport };

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const instantOf = (value: unknown): string | null => {
  const text = textOf(value);
  return text !== null && Number.isFinite(Date.parse(text)) ? text : null;
};
const percentOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
const minutesOf = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);

/** Les phases SERVIES : hors épisode (`normal`), rien ne l'est. */
const SERVED_PHASES: readonly BatteryServedPhase[] = BATTERY_PHASES.filter((phase): phase is BatteryServedPhase => phase !== 'normal');

export function decodeBatteryState(raw: unknown): BatteryReaderState | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  const phase = SERVED_PHASES.find((candidate) => candidate === wire?.phase);
  const level = percentOf(wire?.level);
  const measuredAt = instantOf(wire?.measuredAt);
  if (wire === null || userId === null || phase === undefined || level === null || measuredAt === null) return null;
  if (typeof wire.charging !== 'boolean' || typeof wire.lowPower !== 'boolean') return null;
  const estimatedMinutes = minutesOf(wire.estimatedMinutes);
  const deviceLabel = textOf(wire.deviceLabel);
  return {
    userId,
    phase,
    level,
    charging: wire.charging,
    lowPower: wire.lowPower,
    ...(estimatedMinutes === null ? {} : { estimatedMinutes }),
    measuredAt,
    ...(deviceLabel === null || deviceLabel.length > BATTERY_DEVICE_LABEL_MAX ? {} : { deviceLabel }),
  };
}

/** Une annonce d'un genre que ce client ne connaît pas est ignorée : le contrat le promet aux anciens clients. */
function decodeAnnouncement(raw: unknown): BatteryAnnouncement | null {
  const wire = objectOf(raw);
  const kind = BATTERY_ANNOUNCEMENT_KINDS.find((candidate) => candidate === wire?.kind);
  const at = instantOf(wire?.at);
  if (wire === null || kind === undefined || at === null) return null;
  const threshold = percentOf(wire.threshold);
  return { kind, level: percentOf(wire.level), ...(threshold === null ? {} : { threshold }), at };
}

export function decodeBatteryChanged(raw: unknown): BatteryChangedEventData | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  const state = decodeBatteryState(wire?.state);
  if (userId === null || state === null || state.userId !== userId) return null;
  const announcement = decodeAnnouncement(wire?.announcement);
  return { userId, state, ...(announcement === null ? {} : { announcement }) };
}

export function decodeBatteryCleared(raw: unknown): BatteryClearedEventData | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  if (userId === null) return null;
  const announcement = decodeAnnouncement(wire?.announcement);
  return { userId, ...(announcement === null ? {} : { announcement }) };
}

/** `GET /relations/battery` — le rattrapage des épisodes en cours, à chaque socket accrochée. */
export async function loadBatterySnapshot(deps: BatteryDeps): Promise<ApiResult<readonly BatteryReaderState[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: [] };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.battery });
  if (!result.ok) return result;
  const items = objectOf(result.data)?.items;
  return { ok: true, data: (Array.isArray(items) ? items : []).flatMap((item) => decodeBatteryState(item) ?? []) };
}

/**
 * L'issue d'un relevé à la demande. `requested` ne promet RIEN au demandeur : le relevé ne lui revient que s'il
 * ouvre ou poursuit un épisode (`episodeOnly`) — et la même réponse part quand l'émetteur l'a exclu.
 */
export type BatteryPullOutcome = 'requested' | 'too-soon' | 'forbidden' | 'rate-limited' | 'offline' | 'failed';

export async function requestBatteryPull(deps: BatteryDeps, userId: string): Promise<BatteryPullOutcome> {
  if (__FIXTURES__ && deps.source === 'fixtures') return 'failed';
  const result = await deps.transport.request<unknown>({ method: 'POST', path: relationsEndpoints.byUserIdBatteryPull(userId) });
  if (result.ok) return 'requested';
  if (result.code === BATTERY_ERROR_CODES.PULL_TOO_SOON) return 'too-soon';
  if (result.code === BATTERY_ERROR_CODES.PULL_FORBIDDEN) return 'forbidden';
  if (result.code === BATTERY_ERROR_CODES.RATE_LIMITED || result.status === 429) return 'rate-limited';
  return result.status === 0 ? 'offline' : 'failed';
}

/** Mes réglages pour une personne : ce que JE lui partage, ce que je reçois de SA batterie. */
export type BatteryPersonSettings = { readonly shared: boolean; readonly receive: BatteryReceiveMode };

const decodePersonSettings = (raw: unknown): BatteryPersonSettings => {
  const wire = objectOf(raw);
  return {
    shared: wire?.shared === true,
    receive: BATTERY_RECEIVE_MODES.find((mode) => mode === wire?.receive) ?? BATTERY_DEFAULT_RECEIVE_MODE,
  };
};

export const batteryPersonSettingsQueryKey = (userId: string) => ['relations', 'battery-settings', userId] as const;

export async function loadBatteryPersonSettings(deps: BatteryDeps, userId: string, signal?: AbortSignal): Promise<ApiResult<BatteryPersonSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { shared: false, receive: BATTERY_DEFAULT_RECEIVE_MODE } };
  const result = await deps.transport.request<unknown>({
    method: 'GET',
    path: relationsEndpoints.byUserIdBatterySettings(userId),
    ...(signal === undefined ? {} : { signal }),
  });
  return result.ok ? { ok: true, data: decodePersonSettings(result.data) } : result;
}

export async function saveBatteryPersonSettings(
  deps: BatteryDeps,
  userId: string,
  update: { readonly shared: boolean } | { readonly receive: BatteryReceiveMode },
): Promise<ApiResult<BatteryPersonSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Indisponible en démonstration' };
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: relationsEndpoints.byUserIdBatterySettings(userId), body: update });
  return result.ok ? { ok: true, data: decodePersonSettings(result.data) } : result;
}

/** Le partage GLOBAL de ma batterie — vrai par défaut : un champ absent ne le coupe pas. */
export type BatteryEmitterSettings = { readonly sharingEnabled: boolean };

const decodeEmitterSettings = (raw: unknown): BatteryEmitterSettings => ({ sharingEnabled: objectOf(raw)?.sharingEnabled !== false });

export const BATTERY_EMITTER_SETTINGS_QUERY_KEY = ['me', 'battery-settings'] as const;

export async function loadBatteryEmitterSettings(deps: BatteryDeps, signal?: AbortSignal): Promise<ApiResult<BatteryEmitterSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { sharingEnabled: true } };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: meEndpoints.deviceBatterySettings, ...(signal === undefined ? {} : { signal }) });
  return result.ok ? { ok: true, data: decodeEmitterSettings(result.data) } : result;
}

export async function saveBatteryEmitterSettings(deps: BatteryDeps, sharingEnabled: boolean): Promise<ApiResult<BatteryEmitterSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Indisponible en démonstration' };
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: meEndpoints.deviceBatterySettings, body: { sharingEnabled } });
  return result.ok ? { ok: true, data: decodeEmitterSettings(result.data) } : result;
}
