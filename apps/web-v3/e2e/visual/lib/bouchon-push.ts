import type { IncomingMessage } from 'node:http';

type Reponse = (corps: unknown, statut?: number) => void;

export type AppareilDeBouchon = {
  id: string;
  deviceName: string;
  platform: string;
  lastUsedAt: string | null;
  deviceId?: string;
  type?: string;
  isActive?: boolean;
  token?: string;
};

/**
 * EXTRAIT de `bouchon-compte.ts` (patron `bouchon-preferences.ts`) — LE
 * PUSH WEB (#5391), `POST`/`DELETE /api/v1/users/register-device-token`,
 * copiées sur `services/gateway/src/routes/push-tokens.ts:72,264`.
 *
 * Appelé DEPUIS `routesDuCompte` (`bouchon-compte.ts`), APRÈS sa garde
 * d'authentification (porteur `Bearer` exigé, membre vérifié) — ce module
 * ne la rejoue pas. `GET`/`DELETE /api/v1/users/me/devices` restent dans
 * `bouchon-compte.ts` : ils existaient déjà avant ce travail et lisent le
 * MÊME tableau `etat.appareils`, jamais un second magasin.
 */

/**
 * `POST /users/register-device-token` (`:72`) — upsert sur
 * `(userId, token, type)`, ici approximé par `(token, type)` : le bouchon ne
 * porte qu'un seul lecteur authentifié à la fois (`etat.creanceDe`, la garde
 * du bouchon), donc `userId` est constant sur toute la durée d'un test.
 * `type` par défaut `'fcm'` quand `platform === 'web'` (`push-tokens.ts:164`).
 */
const enregistre = (
  appareils: AppareilDeBouchon[],
  corps: { readonly token?: unknown; readonly type?: unknown; readonly platform?: unknown; readonly deviceId?: unknown; readonly deviceName?: unknown },
  json: Reponse,
): void => {
  const token = typeof corps.token === 'string' ? corps.token : null;
  const platform = typeof corps.platform === 'string' ? corps.platform : null;
  if (token === null || platform === null) {
    json({ success: false, error: 'Invalid request data' }, 400);
    return;
  }
  const type = typeof corps.type === 'string' ? corps.type : platform === 'web' ? 'fcm' : 'apns';
  const deviceId = typeof corps.deviceId === 'string' ? corps.deviceId : undefined;
  const deviceName = typeof corps.deviceName === 'string' ? corps.deviceName : undefined;

  // Un autre TOKEN sur le MÊME appareil devient inactif (`push-tokens.ts:222-234`,
  // « a device holds ONE live token per type »).
  if (deviceId !== undefined) {
    appareils.forEach((appareil) => {
      if (appareil.deviceId === deviceId && appareil.type === type) appareil.isActive = false;
    });
  }

  const existant = appareils.find((appareil) => appareil.token === token && appareil.type === type);
  if (existant !== undefined) {
    Object.assign(existant, { platform, deviceId, deviceName, isActive: true });
    json({ success: true, data: { id: existant.id, type, platform, deviceName: deviceName ?? null, isNew: false, message: 'Device token updated successfully' } });
    return;
  }

  const id = `pt-${appareils.length + 1}`;
  appareils.push({ id, deviceName: deviceName ?? '', platform, lastUsedAt: null, deviceId, type, isActive: true, token });
  json({ success: true, data: { id, type, platform, deviceName: deviceName ?? null, isNew: true, message: 'Device token registered successfully' } });
};

/**
 * `DELETE /users/register-device-token` (`:264`) — par `token` OU
 * `deviceId` (jamais les deux, jamais aucun depuis la v3 : un corps VIDE
 * supprimerait TOUS les tokens du compte, y compris iOS/Android).
 */
const retire = (
  appareils: AppareilDeBouchon[],
  corps: { readonly token?: unknown; readonly deviceId?: unknown },
  json: Reponse,
): void => {
  const token = typeof corps.token === 'string' ? corps.token : null;
  const deviceId = typeof corps.deviceId === 'string' ? corps.deviceId : null;

  const cible = (appareil: AppareilDeBouchon): boolean =>
    (token !== null && appareil.token === token) || (deviceId !== null && appareil.deviceId === deviceId);

  const retires = token === null && deviceId === null ? [...appareils] : appareils.filter(cible);
  retires.forEach((appareil) => {
    const rang = appareils.indexOf(appareil);
    if (rang !== -1) appareils.splice(rang, 1);
  });

  json({
    success: true,
    data: { deletedCount: retires.length, message: retires.length > 0 ? `Successfully unregistered ${retires.length} device token(s)` : 'No matching tokens found' },
  });
};

export const routesDuPush =
  (appareils: AppareilDeBouchon[]) =>
  ({ requete, url, corps, json }: { readonly requete: IncomingMessage; readonly url: URL; readonly corps: Buffer; readonly json: Reponse }): boolean => {
    if (url.pathname !== '/api/v1/users/register-device-token') return false;

    const soumis = ((): Record<string, unknown> => {
      try {
        return JSON.parse(corps.toString('utf8') || '{}') as Record<string, unknown>;
      } catch {
        return {};
      }
    })();

    if (requete.method === 'POST') {
      enregistre(appareils, soumis, json);
      return true;
    }
    if (requete.method === 'DELETE') {
      retire(appareils, soumis, json);
      return true;
    }
    return false;
  };
