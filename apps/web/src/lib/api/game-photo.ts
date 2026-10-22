import { GAME_PHOTO_ROUTES } from '@meeshy/shared/types/game-routes';
import { GLORY_ATMOSPHERES, type GloryAtmosphere } from '@meeshy/shared/types/glory-atmospheres';

import { isBool, isOneOf, shape } from './game-guards';
import type { ApiResult, HttpTransport } from './http';

/**
 * LES ÉCRITURES DES RÉGLAGES PHOTO (#10163, L10b) — `GAME_PHOTO_ROUTES` (L10a), lues dans le contrat, jamais
 * recopiées. La LECTURE passe par l'extension `photo` du bloc `game` (`game-v2.ts`) : aucune requête de plus.
 *
 * `setFrameAtmosphere` : choisir son atmosphère INSTALLE son pack dans la même écriture (§ 5.12) ; la réponse
 * dit si le registre connaissait le pack (`packInstalled`). Face à un ANCIEN serveur, 404 n'est pas un refus :
 * le choix et l'installation restent locaux et optimistes (`local: true`), et la loi sert « atmosphère choisie,
 * pack non installé » (§ 5.4) tant que l'étagère ne retrouve pas l'installation.
 */

export type FrameAtmosphereOutcome = { readonly atmosphere: GloryAtmosphere; readonly packInstalled: boolean; readonly local: boolean };

const API_PREFIX = '/api/v1';

const isOutcome = (value: unknown): value is { readonly atmosphere: GloryAtmosphere; readonly packInstalled: boolean } =>
  shape(value, { atmosphere: isOneOf(GLORY_ATMOSPHERES), packInstalled: isBool });

export async function setFrameAtmosphere(transport: HttpTransport, requestId: string, atmosphere: GloryAtmosphere): Promise<ApiResult<FrameAtmosphereOutcome>> {
  const result = await transport.request<unknown>({ method: 'PUT', path: `${API_PREFIX}${GAME_PHOTO_ROUTES.frameAtmosphere}`, body: { requestId, atmosphere } });
  if (!result.ok) return result.status === 404 ? { ok: true, data: { atmosphere, packInstalled: false, local: true } } : result;
  if (!isOutcome(result.data)) return { ok: false, status: 502, error: 'La réponse du jeu est illisible — atmosphère des cadres', code: 'MALFORMED_PAYLOAD' };
  return { ok: true, data: { ...result.data, local: false } };
}
