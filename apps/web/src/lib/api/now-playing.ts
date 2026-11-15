import * as relationsEndpoints from '@meeshy/shared/api/endpoints/relations';
import { NOW_PLAYING_CATEGORIES, NOW_PLAYING_SOURCE_MAX, NOW_PLAYING_TITLE_MAX } from '@meeshy/shared/types/now-playing-constants';
import type { NowPlayingChangedEventData, NowPlayingClearedEventData } from '@meeshy/shared/types/now-playing';

import type { ApiResult } from './http';
import type { RelationDeps } from './relations';

/**
 * **CE QU'ÉCOUTENT MES PROCHES ET MES SANGS, TEL QUE LE SERVEUR LE SERT** (#16729,
 * sous-lot `proche-sang-ecoute@web` de #13934 ; contrat
 * `packages/shared/types/now-playing.ts`).
 *
 * La passerelle a DÉJÀ tronqué chaque état au niveau du lecteur : un Proche ne
 * reçoit ni `title` ni `source`. Ce décodeur ne garde que les champs du contrat,
 * bornés comme le serveur les borne : un champ en trop ou trop long ne traverse
 * jamais jusqu'à l'écran, même si une passerelle future en servait davantage.
 */

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const instantOf = (value: unknown): string | null => {
  const text = textOf(value);
  return text !== null && Number.isFinite(Date.parse(text)) ? text : null;
};
const boundedOf = (value: unknown, max: number): string | null => {
  const text = textOf(value);
  return text !== null && text.length <= max ? text : null;
};

export function decodeNowPlayingChanged(raw: unknown): NowPlayingChangedEventData | null {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  const category = NOW_PLAYING_CATEGORIES.find((candidate) => candidate === wire?.category);
  const updatedAt = instantOf(wire?.updatedAt);
  const expiresAt = instantOf(wire?.expiresAt);
  if (userId === null || category === undefined || updatedAt === null || expiresAt === null) return null;
  const title = boundedOf(wire?.title, NOW_PLAYING_TITLE_MAX);
  const source = title === null ? null : boundedOf(wire?.source, NOW_PLAYING_SOURCE_MAX);
  return {
    userId,
    category,
    ...(title === null ? {} : { title }),
    ...(source === null ? {} : { source }),
    updatedAt,
    expiresAt,
  };
}

export function decodeNowPlayingCleared(raw: unknown): NowPlayingClearedEventData | null {
  const userId = textOf(objectOf(raw)?.userId);
  return userId === null ? null : { userId };
}

/** `GET /relations/now-playing` — le rattrapage, déjà tronqué, à chaque socket accrochée. */
export async function loadNowPlayingSnapshot(deps: RelationDeps): Promise<ApiResult<readonly NowPlayingChangedEventData[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: [] };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.nowPlaying });
  if (!result.ok) return result;
  const items = objectOf(result.data)?.items;
  return { ok: true, data: (Array.isArray(items) ? items : []).flatMap((item) => decodeNowPlayingChanged(item) ?? []) };
}
