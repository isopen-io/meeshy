import { baseDeLaPasserelle } from './links';
import { DELAI_DE_REPONSE_MS } from './passerelle';

/**
 * L'ENREGISTREMENT D'APPAREIL PUSH (#5391) — trois routes RÉELLES, lues dans
 * `services/gateway/src/routes/push-tokens.ts` :
 *
 *   • `POST /users/register-device-token` (`:72`, `onRequest:
 *     [fastify.authenticate]`, refuse explicitement un jeton qui n'est pas un
 *     COMPTE — `!authContext.registeredUser`, `:152` : un invité ne s'abonne
 *     jamais, cohérent avec un écran `connecte`) — upsert sur
 *     `(userId, token, type)`, corps `{ token, type: 'fcm', platform: 'web',
 *     deviceId?, deviceName? }` ;
 *   • `DELETE /users/register-device-token` (`:264`, même garde) — par
 *     `token` OU `deviceId` (JAMAIS un corps vide depuis la v3 : il
 *     supprimerait TOUS les tokens du compte, y compris ceux d'iOS/Android) ;
 *   • `GET /users/me/devices` (`:355`, même garde) — la liste, filtrée côté
 *     appelant par `deviceId`/`platform`/`isActive` (§ 3.2 de la
 *     spécification) : c'est ainsi que la porte SAIT si CET appareil est
 *     abonné, sans second store.
 *
 * Ce module ne peint rien et ne décide rien — comme `lib/api/preferences.ts`,
 * dont il reprend le patron (`IssueDuGeste` à quatre genres, `appelle`/`issue`
 * identiques) : il dit ce que la passerelle a répondu. La porte
 * (`app/connecte/prefs-porte.ts`) et le module de participation
 * (`lib/realtime/push-abonnement.ts`) décident de l'état peint.
 */

export type IssueDuGestePush =
  | { readonly genre: 'fait' }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'refus'; readonly statut: number }
  | { readonly genre: 'panne' };

const DELAI_MS = DELAI_DE_REPONSE_MS;

const enTetes = (jeton: string): Record<string, string> => ({
  accept: 'application/json',
  authorization: `Bearer ${jeton}`,
});

const issue = (reponse: Response | null): IssueDuGestePush => {
  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };
  if (reponse.ok) return { genre: 'fait' };
  return reponse.status >= 500 ? { genre: 'panne' } : { genre: 'refus', statut: reponse.status };
};

export type Recuperateur = (url: string, options: RequestInit) => Promise<Response>;

const appelle = async (url: string, options: RequestInit, recuperer?: Recuperateur): Promise<IssueDuGestePush> =>
  issue(
    await (recuperer ?? ((u, o) => fetch(u, o)))(url, {
      ...options,
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI_MS),
    }).catch(() => null),
  );

export type ArgumentsDeLenregistrement = {
  readonly jeton: string;
  readonly token: string;
  readonly deviceId: string;
  readonly deviceName?: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
};

export const enregistreLeJetonPush = async ({
  jeton,
  token,
  deviceId,
  deviceName,
  base,
  recuperer,
}: ArgumentsDeLenregistrement): Promise<IssueDuGestePush> =>
  appelle(
    `${base ?? baseDeLaPasserelle()}/api/v1/users/register-device-token`,
    {
      method: 'POST',
      headers: { ...enTetes(jeton), 'content-type': 'application/json' },
      body: JSON.stringify({ token, type: 'fcm', platform: 'web', deviceId, deviceName: deviceName ?? 'Web v3' }),
    },
    recuperer,
  );

export type ArgumentsDuRetrait = {
  readonly jeton: string;
  readonly deviceId: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
};

export const retireLeJetonPush = async ({ jeton, deviceId, base, recuperer }: ArgumentsDuRetrait): Promise<IssueDuGestePush> =>
  appelle(
    `${base ?? baseDeLaPasserelle()}/api/v1/users/register-device-token`,
    {
      method: 'DELETE',
      headers: { ...enTetes(jeton), 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    },
    recuperer,
  );

/** Ce que `GET /users/me/devices` sert d'une ligne — inconnu tant qu'un schéma ne l'a pas relu. */
export type AppareilServi = Readonly<Record<string, unknown>>;

export type IssueDesAppareils =
  | { readonly genre: 'liste'; readonly appareils: readonly AppareilServi[] }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'refus'; readonly statut: number }
  | { readonly genre: 'panne' };

const issueDesAppareils = async (reponse: Response | null): Promise<IssueDesAppareils> => {
  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };
  if (!reponse.ok) return reponse.status >= 500 ? { genre: 'panne' } : { genre: 'refus', statut: reponse.status };

  const corps = await reponse.json().catch(() => null);
  const liste = corps !== null && typeof corps === 'object' ? (corps as { readonly data?: unknown }).data : null;
  return Array.isArray(liste) ? { genre: 'liste', appareils: liste as readonly AppareilServi[] } : { genre: 'panne' };
};

export type ArgumentsDeLaListe = {
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
};

export const appareilsDuLecteur = async ({ jeton, base, recuperer }: ArgumentsDeLaListe): Promise<IssueDesAppareils> =>
  issueDesAppareils(
    await (recuperer ?? ((u, o) => fetch(u, o)))(`${base ?? baseDeLaPasserelle()}/api/v1/users/me/devices`, {
      method: 'GET',
      headers: enTetes(jeton),
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI_MS),
    }).catch(() => null),
  );
