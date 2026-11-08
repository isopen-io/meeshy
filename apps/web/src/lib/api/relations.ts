import * as relationsEndpoints from '@meeshy/shared/api/endpoints/relations';
import { RELATION_LEVELS, type RelationLevel } from '@meeshy/shared/types/relation';
import type { RelationRitualConsents, RelationRitualPhase } from '@meeshy/shared/types/socketio-events/relation';

import { unwrap } from './client';
import type { DataSource } from './config';
import { RELATION_LINKS_QUERY_KEY } from './friends-keys';
import type { ApiFailure, ApiResult, HttpTransport } from './http';

/**
 * **MES CERCLES, CÔTÉ PORT** (#13938) — miroir de `RelationsService`,
 * `RelationLink`, `RelationRitualStep` et `RelationRefusal` (MeeshySDK
 * `Relations/`, branche `lot/ui-cercles-ios-13938`).
 *
 * `GET relations.root` sert chaque lien d'au moins Connaissance
 * (`RelationLinkView`, `packages/shared/types/relation.ts`) : l'AUTRE personne
 * par son identifiant, jamais un nom, une présence ni un cool-down (RG-07).
 * L'écran nomme la personne par ses propres caches.
 *
 * **Le décodage est tolérant et FERMÉ.** Un niveau que ce client ne connaît pas
 * se lit `PUBLIC`, jamais un niveau plus haut ; une éligibilité illisible se lit
 * `null` ; une progression incomplète se lit zéro, absente, vide.
 *
 * **La clé vit dans la famille `['friends']`** : le temps réel invalide déjà la
 * famille sur les quatre événements de demande (`socket.ts`), donc une demande
 * de cran acceptée, refusée ou annulée relit aussi les cercles, sans un
 * événement de plus sur le chemin du démarrage.
 */

export type RelationDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type RelationEligibility = 'CLOSE' | 'BLOOD';

export type RelationProgress = {
  readonly activeWeeks: number;
  readonly needed: number | null;
  readonly missing: readonly string[];
};

export type RelationLink = {
  readonly userId: string;
  readonly effectiveLevel: RelationLevel;
  readonly grantedByMe: RelationLevel;
  readonly since: string | null;
  readonly progress: RelationProgress;
  readonly eligibleFor: RelationEligibility | null;
  /** Jusqu'à quand je ne peux pas redemander de monter (#14910), servi par `GET /relations/:userId` ; absent, la loi habituelle. */
  readonly raiseBlockedUntil?: string;
  /** La loi SERVEUR de montée (demande en suspens, éligibilité), servie par `GET /relations/:userId` ; absente, la loi locale décide. */
  readonly canRaise?: boolean;
};

export { RELATION_LINKS_QUERY_KEY } from './friends-keys';

/**
 * TRENTE SECONDES — la famille garde ses cinq minutes parce que le temps réel
 * porte ses changements ; un lien, lui, bouge aussi par sa PROGRESSION (une
 * semaine active de plus), qu'aucun événement n'annonce. Le cache persisté
 * peint toujours au premier rendu ; seule la revalidation silencieuse est plus
 * fréquente.
 */
export const RELATION_LINKS_STALE_TIME = 30_000;

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);

const levelOf = (value: unknown): RelationLevel => RELATION_LEVELS.find((level) => level === value) ?? 'PUBLIC';

const eligibilityOf = (value: unknown): RelationEligibility | null => (value === 'CLOSE' || value === 'BLOOD' ? value : null);

const countOf = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);

const flagOf = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function decodeProgress(raw: unknown): RelationProgress {
  const wire = objectOf(raw);
  const missing = Array.isArray(wire?.missing) ? wire.missing.filter((piece): piece is string => typeof piece === 'string' && piece !== '') : [];
  return { activeWeeks: countOf(wire?.activeWeeks) ?? 0, needed: countOf(wire?.needed), missing };
}

export function decodeRelationLink(raw: unknown): RelationLink | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  if (wire === null || userId === null) return null;
  const raiseBlockedUntil = textOf(wire.raiseBlockedUntil);
  const canRaise = flagOf(wire.canRaise);
  return {
    userId,
    effectiveLevel: levelOf(wire.effectiveLevel),
    grantedByMe: levelOf(wire.grantedByMe),
    since: textOf(wire.since),
    progress: decodeProgress(wire.progress),
    eligibleFor: eligibilityOf(wire.eligibleFor),
    ...(raiseBlockedUntil === null ? {} : { raiseBlockedUntil }),
    ...(canRaise === null ? {} : { canRaise }),
  };
}

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadRelationLinks(deps: RelationDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<readonly RelationLink[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: [] };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.root, ...withSignal(deps.signal) });
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? result.data : [];
  return { ok: true, data: rows.flatMap((row) => decodeRelationLink(row) ?? []) };
}

export function relationLinksQueryOptions(deps: RelationDeps) {
  return {
    queryKey: RELATION_LINKS_QUERY_KEY,
    staleTime: RELATION_LINKS_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadRelationLinks({ ...deps, ...withSignal(signal) })),
  };
}

/**
 * **LA PORTE DE MONTÉE** (#14910) — `GET /relations/:userId` sert `canRaise` (la
 * loi serveur : demande en suspens, éligibilité) et `raiseBlockedUntil` (toujours
 * `null` aujourd'hui : le cool-down ne se dit qu'au refus, RG-07). Une passerelle
 * d'avant ne sert ni l'un ni l'autre : `null` laisse la loi locale décider.
 */
/**
 * `accessLevel` (#16623) : le niveau auquel la passerelle JUGE les outils de cercle de la
 * paire — le lien réel, sauf entre deux comptes de l'équipe. Une passerelle d'avant ne le
 * sert pas : il retombe sur `effectiveLevel`, et une valeur illisible vaut `PUBLIC`.
 */
export type RaiseGate = {
  readonly canRaise: boolean | null;
  readonly raiseBlockedUntil: string | null;
  readonly accessLevel: RelationLevel;
};

export const relationRaiseGateQueryKey = (userId: string) => [...RELATION_LINKS_QUERY_KEY, 'raise-gate', userId] as const;

export async function loadRelationRaiseGate(deps: RelationDeps & { readonly signal?: AbortSignal }, userId: string): Promise<ApiResult<RaiseGate>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { canRaise: null, raiseBlockedUntil: null, accessLevel: 'PUBLIC' } };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.byUserId(userId), ...withSignal(deps.signal) });
  if (!result.ok) return result;
  const wire = objectOf(result.data);
  const accessLevel = wire !== null && 'accessLevel' in wire ? levelOf(wire.accessLevel) : levelOf(wire?.effectiveLevel);
  return { ok: true, data: { canRaise: flagOf(wire?.canRaise), raiseBlockedUntil: textOf(wire?.raiseBlockedUntil), accessLevel } };
}

export function relationRaiseGateQueryOptions(deps: RelationDeps, userId: string) {
  return {
    queryKey: relationRaiseGateQueryKey(userId),
    staleTime: RELATION_LINKS_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadRelationRaiseGate({ ...deps, ...withSignal(signal) }, userId)),
  };
}

/**
 * **BAISSER MON ACCORD, OU ANNULER LE LIEN** (#14910) — `POST /relations/:userId/level`.
 * `PUBLIC` annule le lien. Silencieux côté passerelle : l'autre n'est pas prévenu.
 * Rend la vue du lien servie (`null` si illisible).
 */
export async function lowerRelation(
  deps: RelationDeps,
  request: { readonly userId: string; readonly level: RelationLevel },
): Promise<ApiResult<RelationLink | null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Indisponible en démonstration' };
  const result = await deps.transport.request<unknown>({ method: 'POST', path: relationsEndpoints.byUserIdLevel(request.userId), body: { level: request.level } });
  return result.ok ? { ok: true, data: decodeRelationLink(result.data) } : result;
}

/**
 * Ce que rend une phase du rituel : `start` {token, holdWindowMs}, `hold`
 * {held, holdWindowMs}, `confirm` {completed}. Chaque phase n'en sert qu'une
 * partie ; un champ illisible se lit `null`, jamais une valeur inventée.
 */
export type RitualStep = {
  readonly token: string | null;
  readonly holdWindowMs: number | null;
  readonly held: boolean | null;
  readonly completed: boolean | null;
};

export function decodeRitualStep(raw: unknown): RitualStep {
  const wire = objectOf(raw);
  const window = countOf(wire?.holdWindowMs);
  return { token: textOf(wire?.token), holdWindowMs: window === 0 ? null : window, held: flagOf(wire?.held), completed: flagOf(wire?.completed) };
}

export type RitualRequest = {
  readonly userId: string;
  readonly phase: RelationRitualPhase;
  readonly token?: string;
  readonly consents?: RelationRitualConsents;
};

export async function runRitualPhase(deps: RelationDeps, request: RitualRequest): Promise<ApiResult<RitualStep>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Rituel indisponible en démonstration' };
  const body = {
    phase: request.phase,
    ...(request.token === undefined ? {} : { token: request.token }),
    ...(request.consents === undefined ? {} : { consents: request.consents }),
  };
  const result = await deps.transport.request<unknown>({ method: 'POST', path: relationsEndpoints.byUserIdRitual(request.userId), body });
  return result.ok ? { ok: true, data: decodeRitualStep(result.data) } : result;
}

/**
 * Les refus TYPÉS du lien et du rituel (`RitualCode`, `RelationRequestRefusalCode`,
 * `services/gateway/src/services/relations/bloodRitual.ts`), lus sur le `code`
 * machine d'un refus — jamais sur la phrase, que la passerelle écrit en français.
 */
export const RELATION_REFUSALS = [
  'RELATION_RITUAL_NO_REQUEST',
  'RELATION_RITUAL_INVALID',
  'RELATION_RITUAL_NOT_SYNCHRONISED',
  'RELATION_RITUAL_LAPSED',
  'RELATION_RITUAL_BUSY',
  'RELATION_RITUAL_REQUIRED',
  'RELATION_CONSENT_REQUIRED',
  'RELATION_PHASE_SKIP',
  'RELATION_NOT_ELIGIBLE',
  'RELATION_COOLDOWN',
] as const;

export type RelationRefusal = (typeof RELATION_REFUSALS)[number];

export const relationRefusalOf = (failure: ApiFailure): RelationRefusal | null =>
  RELATION_REFUSALS.find((code) => code === failure.code) ?? null;
