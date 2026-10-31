/**
 * D-5 (#13947, lot #13954) — UN contrôle du plancher de version, lu par tous
 * ses sites : l'admission de session REST (`middleware/auth.ts`), le handshake
 * socket (`socketio/handlers/AuthHandler.ts`), les routes de cercles
 * (`appVersionFloorPreHandler`) et la porte des stories (`routes/posts/core.ts`).
 * `isBelowFloor` est une fonction pure sans point d'accrochage : sans ce module,
 * chaque site réécrirait la lecture de l'en-tête et le choix du plancher.
 *
 * Règles (inchangées) : plancher vide ⇒ porte désarmée ; version ABSENTE ⇒ jamais
 * bloqué (le web n'envoie pas d'en-tête de version) ; web/pwa/coque ⇒ jamais jugés.
 * Sous le plancher de SA plateforme ⇒ `426 UPGRADE_REQUIRED` + `minVersion` +
 * `storeUrl`.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { SERVER_EVENTS, type ErrorEventData } from '@meeshy/shared/types/socketio-events';
import { sendUpgradeRequired } from '../utils/response';
import { getAppStoreUrl, getAppVersionFloorFor, isBelowFloor } from '../utils/appVersion';

export const UPGRADE_REQUIRED_MESSAGE = 'App version outdated - update the app';
export const UPGRADE_REQUIRED_CODE = 'UPGRADE_REQUIRED';

export type ClientVersionClaim = {
  readonly version: string | undefined;
  readonly platform: string | undefined;
};

export type UpgradeRequirement = {
  readonly minVersion: string;
  readonly storeUrl: string;
};

const text = (raw: unknown): string | undefined => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

type Headers = Readonly<Record<string, string | readonly string[] | undefined>>;

const NATIVE_PLATFORMS: ReadonlySet<string> = new Set(['ios', 'android']);

/**
 * Le relevé de session (`X-Meeshy-*`, `handshake.auth.client`) est AUSSI posé
 * par le web, qui y déclare sa version 2.0.x — parfois sans plateforme (coque
 * hors Android). Il ne juge donc qu'une plateforme NATIVE déclarée : sans elle,
 * la version est tue et le web n'est jamais bloqué, même sous plancher global.
 */
const nativeOnly = (claim: ClientVersionClaim): ClientVersionClaim =>
  NATIVE_PLATFORMS.has(claim.platform?.toLowerCase() ?? '') ? claim : { version: undefined, platform: claim.platform };

/**
 * `X-App-Version` / `X-App-Platform` (posés par les seuls binaires natifs ;
 * sans plateforme, le plancher global juge, comme la porte des stories), repli
 * sur le relevé de session `X-Meeshy-*`, natif seulement.
 */
export function readRestVersionClaim(headers: Headers): ClientVersionClaim {
  const platform = text(headers['x-app-platform']) ?? text(headers['x-meeshy-platform']);
  const appVersion = text(headers['x-app-version']);
  return appVersion !== undefined
    ? { version: appVersion, platform }
    : nativeOnly({ version: text(headers['x-meeshy-version']), platform });
}

/**
 * `handshake.auth.client` — la plateforme est lue BRUTE : `readClientSessionAuth`
 * écarte `android` (hors `CLIENT_PLATFORMS`, réservé à la coque), ce qui ferait
 * juger l'application native sur le plancher global. Natif seulement.
 */
export function readSocketVersionClaim(auth: unknown): ClientVersionClaim {
  const declared = auth !== null && typeof auth === 'object' ? (auth as Record<string, unknown>).client : undefined;
  const fields = declared !== null && typeof declared === 'object' && !Array.isArray(declared)
    ? (declared as Record<string, unknown>)
    : {};
  return nativeOnly({ version: text(fields.appVersion), platform: text(fields.platform) });
}

export function upgradeRequirementFor(claim: ClientVersionClaim): UpgradeRequirement | null {
  const floor = getAppVersionFloorFor(claim.platform);
  return isBelowFloor(claim.version, floor)
    ? { minVersion: floor, storeUrl: getAppStoreUrl(claim.platform) }
    : null;
}

/** Rend `true` si le 426 est parti (l'appelant sort). */
export function rejectBelowAppVersionFloor(request: FastifyRequest, reply: FastifyReply): boolean {
  const requirement = upgradeRequirementFor(readRestVersionClaim(request.headers));
  if (requirement === null) return false;
  sendUpgradeRequired(reply, UPGRADE_REQUIRED_MESSAGE, { details: { ...requirement } });
  return true;
}

/** `preHandler` des routes de cercles : sous le plancher, la route n'est pas atteinte. */
export async function appVersionFloorPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
  return rejectBelowAppVersionFloor(request, reply) ? reply : undefined;
}

type SocketLike = {
  readonly handshake: { readonly auth: unknown };
  emit(event: typeof SERVER_EVENTS.ERROR, data: ErrorEventData): unknown;
  disconnect(close?: boolean): unknown;
};

/**
 * Refus EN BANDE d'un handshake sous le plancher : `error` { code
 * UPGRADE_REQUIRED, minVersion, storeUrl } puis fermeture — le client monte
 * l'écran « Mettre à jour Meeshy » au lieu de se reconnecter en boucle.
 * Rend `true` si la socket est refusée (l'appelant sort).
 */
export function refuseSocketBelowAppVersionFloor(socket: SocketLike): boolean {
  const requirement = upgradeRequirementFor(readSocketVersionClaim(socket.handshake.auth));
  if (requirement === null) return false;
  socket.emit(SERVER_EVENTS.ERROR, { message: UPGRADE_REQUIRED_MESSAGE, code: UPGRADE_REQUIRED_CODE, ...requirement });
  socket.disconnect(true);
  return true;
}
