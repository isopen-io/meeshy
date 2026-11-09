/**
 * L'ADRESSE de la voix gardée d'un talkie réveillé (#17142) — ce que le push porte pour
 * que l'extension de notification la télécharge SANS socket et sans jeton de session :
 * une capacité signée (HMAC-SHA256, clé dérivée de `JWT_SECRET`, domaine séparé) qui lie
 * `talkieId`, le destinataire et une échéance. Elle n'ouvre rien seule : la route
 * (`routes/talkie-audio.ts`) repasse la garde du `talkie:join` — le destinataire, aucune
 * coupure, la porte rejugée, la fenêtre de 60 s.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getJwtSecret } from '../../utils/secrets';
import { publicMediaUrlFromEnv } from '../attachments/publicMediaUrl';

export const talkieAudioPath = (talkieId: string): string => `/api/v1/talkie/${talkieId}/audio`;

/** Une clé PROPRE à cet usage, dérivée du secret maître : jamais `JWT_SECRET` lui-même comme clé de signature. */
const audioKey = (): Buffer => createHmac('sha256', getJwtSecret()).update('meeshy/talkie-audio/v1').digest();

const signature = (talkieId: string, toUserId: string, expiresAt: number): string =>
  createHmac('sha256', audioKey())
    .update(`talkie-audio:${talkieId.toLowerCase()}:${toUserId.toLowerCase()}:${expiresAt}`)
    .digest('base64url');

/** L'URL publique ABSOLUE que la NSE descend telle quelle (`attachmentUrl`). */
export function talkieAudioUrl(params: { readonly talkieId: string; readonly toUserId: string; readonly expiresAt: Date }): string {
  const expiresAt = Math.floor(params.expiresAt.getTime() / 1000);
  const token = signature(params.talkieId, params.toUserId, expiresAt);
  return publicMediaUrlFromEnv(`${talkieAudioPath(params.talkieId)}?e=${expiresAt}&t=${token}`);
}

export function verifyTalkieAudioToken(params: {
  readonly talkieId: string;
  readonly toUserId: string;
  readonly expiresAt: string | undefined;
  readonly token: string | undefined;
  readonly now: Date;
}): boolean {
  const expiresAt = Number(params.expiresAt);
  if (!Number.isInteger(expiresAt) || typeof params.token !== 'string') return false;
  if (expiresAt * 1000 < params.now.getTime()) return false;
  const expected = Buffer.from(signature(params.talkieId, params.toUserId, expiresAt));
  const given = Buffer.from(params.token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
