import * as relationsEndpoints from '@meeshy/shared/api/endpoints/relations';
import { RELATION_RITUAL_SHARES, type RelationRitualShare } from '@meeshy/shared/types/relation-person-settings';

import type { DataSource } from '@/lib/api/config';
import type { ApiResult, HttpTransport } from '@/lib/api/http';

/**
 * **LES PRÉFÉRENCES DE RÉCEPTION PAR PERSONNE** — `GET|PUT
 * /relations/:userId/settings` (`packages/shared/types/relation-person-settings.ts`).
 *
 * Une seule lecture sert toute la fiche d'un lien : le Bring (#13936) et le
 * talkie (#16638) sont deux champs du même objet, actifs par défaut, que JE
 * coupe pour une personne ; la catégorie de mon écoute (#16831) est un ACCORD,
 * refusé par défaut, que je donne ou retire. L'écriture est PARTIELLE et
 * STRICTE (un champ à la fois, jamais un champ inconnu) ; la réponse rend
 * l'objet entier.
 *
 * Les quatre partages du rituel (#16864) voyagent dans le même objet : refusés par
 * défaut, ils s'accordent hors rituel entre deux comptes de l'équipe seulement (le
 * serveur juge la paire) et se retirent toujours.
 *
 * Décodé à la main, TOLÉRANT : un champ absent ou illisible se lit à sa valeur
 * par défaut côté serveur — « non coupé », « non accordé ».
 */

export type PersonSettingsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const RECEPTION_BLOCKS = ['bringBlocked', 'talkieBlocked', 'listeningCategoryShared'] as const;
export type ReceptionBlock = (typeof RECEPTION_BLOCKS)[number];

export const TEAM_SHARES = RELATION_RITUAL_SHARES;
export type TeamShare = RelationRitualShare;

export type PersonSettingField = ReceptionBlock | TeamShare;

export type ReceptionSettings = Readonly<Record<PersonSettingField, boolean>>;

const FIELDS: readonly PersonSettingField[] = [...RECEPTION_BLOCKS, ...TEAM_SHARES];

const OPEN: ReceptionSettings = Object.fromEntries(FIELDS.map((field) => [field, false])) as ReceptionSettings;

const objectOf = (raw: unknown): Readonly<Record<string, unknown>> | null =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Readonly<Record<string, unknown>>) : null;

export function decodeReceptionSettings(raw: unknown): ReceptionSettings {
  const wire = objectOf(raw);
  return Object.fromEntries(FIELDS.map((field) => [field, wire?.[field] === true])) as ReceptionSettings;
}

export const personSettingsQueryKey = (userId: string) => ['relations', 'settings', userId] as const;

export async function loadReceptionSettings(deps: PersonSettingsDeps, userId: string, signal?: AbortSignal): Promise<ApiResult<ReceptionSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: OPEN };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.byUserIdSettings(userId), ...(signal === undefined ? {} : { signal }) });
  return result.ok ? { ok: true, data: decodeReceptionSettings(result.data) } : result;
}

export async function setPersonSetting(deps: PersonSettingsDeps, userId: string, field: PersonSettingField, value: boolean): Promise<ApiResult<ReceptionSettings>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: false, status: 0, error: 'Indisponible en démonstration' };
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: relationsEndpoints.byUserIdSettings(userId), body: { [field]: value } });
  return result.ok ? { ok: true, data: decodeReceptionSettings(result.data) } : result;
}

