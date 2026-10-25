import { GAME_PHOTO_ROUTES } from '@meeshy/shared/types/game-routes';
import { PHOTO_INVITATIONS, type PhotoInvitations } from '@meeshy/shared/types/game-photo-settings';
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

/**
 * L'ACCUSÉ DE PRÉSENTATION ET LE SIGNAL « IMMORTALISÉE » (#10174, L18 ; § 5.16.2 ; D22 b de #10182) : des
 * identifiants d'étape, au plus 64, idempotents — jamais une image ni une date de prise. Face à un ANCIEN
 * serveur (404), l'accusé s'abandonne sans bruit (`local: true`) : l'étape reste présentée sur cet appareil.
 */
const isIsoText = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

const isStepDates = (key: 'presentedAt' | 'keptAt') => (value: unknown): boolean =>
  Array.isArray(value) && value.every((entry: unknown) => shape(entry, { stepId: (v) => typeof v === 'string', [key]: isIsoText }));

export type PhotoPresentedOutcome = { readonly presented: readonly { readonly stepId: string; readonly presentedAt: string }[]; readonly local: boolean };
export type PhotoKeptOutcome = { readonly kept: readonly { readonly stepId: string; readonly keptAt: string }[]; readonly local: boolean };

export async function postPhotoMomentsPresented(transport: HttpTransport, requestId: string, stepIds: readonly string[]): Promise<ApiResult<PhotoPresentedOutcome>> {
  const result = await transport.request<unknown>({ method: 'POST', path: `${API_PREFIX}${GAME_PHOTO_ROUTES.photoPresented}`, body: { requestId, stepIds } });
  if (!result.ok) return result.status === 404 ? { ok: true, data: { presented: [], local: true } } : result;
  if (!shape(result.data, { presented: isStepDates('presentedAt') })) return { ok: false, status: 502, error: 'La réponse du jeu est illisible — étapes présentées', code: 'MALFORMED_PAYLOAD' };
  return { ok: true, data: { presented: result.data['presented'] as PhotoPresentedOutcome['presented'], local: false } };
}

export async function postPhotoMomentsKept(transport: HttpTransport, requestId: string, stepIds: readonly string[]): Promise<ApiResult<PhotoKeptOutcome>> {
  const result = await transport.request<unknown>({ method: 'POST', path: `${API_PREFIX}${GAME_PHOTO_ROUTES.photoKept}`, body: { requestId, stepIds } });
  if (!result.ok) return result.status === 404 ? { ok: true, data: { kept: [], local: true } } : result;
  if (!shape(result.data, { kept: isStepDates('keptAt') })) return { ok: false, status: 502, error: 'La réponse du jeu est illisible — étapes immortalisées', code: 'MALFORMED_PAYLOAD' };
  return { ok: true, data: { kept: result.data['kept'] as PhotoKeptOutcome['kept'], local: false } };
}

/** « Me proposer d'immortaliser » (§ 5.16.3) : une préférence de COMPTE, `PUT`, locale devant un ancien serveur. */
export type PhotoInvitationsOutcome = { readonly invitations: PhotoInvitations; readonly local: boolean };

export async function putPhotoInvitations(transport: HttpTransport, requestId: string, invitations: PhotoInvitations): Promise<ApiResult<PhotoInvitationsOutcome>> {
  const result = await transport.request<unknown>({ method: 'PUT', path: `${API_PREFIX}${GAME_PHOTO_ROUTES.photoInvitations}`, body: { requestId, invitations } });
  if (!result.ok) return result.status === 404 ? { ok: true, data: { invitations, local: true } } : result;
  if (!shape(result.data, { invitations: isOneOf(PHOTO_INVITATIONS) })) return { ok: false, status: 502, error: 'La réponse du jeu est illisible — invitations photo', code: 'MALFORMED_PAYLOAD' };
  return { ok: true, data: { invitations: result.data['invitations'] as PhotoInvitations, local: false } };
}
