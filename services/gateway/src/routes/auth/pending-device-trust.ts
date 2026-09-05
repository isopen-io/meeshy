import crypto from 'crypto';

/**
 * La préférence « se souvenir de cet appareil », RETENUE PAR LE SERVEUR entre
 * les deux étapes d'une connexion à second facteur (#4471).
 *
 * Elle est exprimée à l'étape 1 (`POST /login`, corps `rememberDevice`) et
 * consommée à l'étape 2 (`POST /login/2fa`), où elle a un effet mesurable :
 * `markSessionTrusted` — qui pose `UserSession.isTrusted` et repousse
 * `expiresAt` — et un `expiresIn` de 365 jours au lieu de 24 heures.
 *
 * La passerelle la RENVOYAIT à l'étape 1 (« echo of the requested device-trust
 * preference, to be replayed on POST /login/2fa ») en attendant que le client
 * la rejoue. Deux défauts, en sens contraires :
 *
 * 1. **Personne ne la rejouait.** Mesuré des deux côtés : le corps envoyé à
 *    l'étape 2 est `{ twoFactorToken, code }`, et aucune clé de session ne
 *    porte ce champ. La personne qui cochait la case ne l'obtenait jamais.
 * 2. **N'importe qui pouvait l'accorder.** L'étape 2 lisait `rememberDevice`
 *    dans le CORPS de la requête, sans AUCUN lien avec l'étape 1 : présenter
 *    `rememberDevice: true` suffisait à s'octroyer 365 jours de confiance.
 *
 * La loi appliquée ici est celle que le dépôt tient déjà sur le lien magique
 * (`routes/magic-link.ts` : « Use rememberDevice from SERVER-SIDE storage (not
 * from client request) », `MagicLinkToken.rememberDevice`) : **c'est le serveur
 * qui se souvient.** Conséquence voulue : aucun client n'a rien à transporter,
 * donc TOUT producteur d'étape 1 — formulaire comme lien magique — est servi
 * par la même mémoire, sans qu'aucune asymétrie puisse se rouvrir entre eux.
 *
 * La mémoire est indexée par l'EMPREINTE du jeton temporaire, jamais par le
 * jeton lui-même — même discipline que `phoneVerificationCode`, qui n'en
 * stocke que le SHA-256. Sa durée de vie est celle du jeton (cinq minutes).
 */

const KEY_PREFIX = 'auth:2fa:device-trust:';
const TRUSTED = '1';

/** La vie du jeton temporaire posé par `AuthService.authenticate()`. */
export const PENDING_DEVICE_TRUST_TTL_SECONDS = 5 * 60;

/**
 * Le strict nécessaire de `CacheStore`. Le contexte des routes le fournit ;
 * les bancs d'essai en montent des doubles partiels, d'où la validation
 * d'exécution ci-dessous plutôt qu'une assertion de type.
 */
export type PendingDeviceTrustStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
};

const isUsableStore = (store: unknown): store is PendingDeviceTrustStore =>
  typeof store === 'object' &&
  store !== null &&
  typeof (store as Record<string, unknown>).get === 'function' &&
  typeof (store as Record<string, unknown>).set === 'function' &&
  typeof (store as Record<string, unknown>).del === 'function';

const keyFor = (twoFactorToken: string): string =>
  `${KEY_PREFIX}${crypto.createHash('sha256').update(twoFactorToken).digest('hex')}`;

/**
 * Retenir la préférence pour le jeton qui vient d'être émis.
 *
 * On n'écrit QUE l'acceptation : l'absence de trace vaut refus. Une mémoire
 * indisponible dégrade donc vers la session courte — jamais vers la confiance
 * prolongée, qui est le sens dangereux.
 */
export async function rememberPendingDeviceTrust(params: {
  readonly store: unknown;
  readonly twoFactorToken: string | undefined;
  readonly rememberDevice: boolean | undefined;
}): Promise<void> {
  const { store, twoFactorToken, rememberDevice } = params;

  if (!rememberDevice || !twoFactorToken || !isUsableStore(store)) return;

  try {
    await store.set(keyFor(twoFactorToken), TRUSTED, PENDING_DEVICE_TRUST_TTL_SECONDS);
  } catch {
    // Une mémoire muette ne doit pas refuser la connexion : la personne
    // obtiendra une session de 24 heures au lieu de 365 jours.
  }
}

/**
 * Relire la préférence, et l'oublier.
 *
 * L'effacement est ce qui rend la confiance NON REJOUABLE : un jeton présenté
 * deux fois n'accorde la session longue qu'une seule fois.
 */
export async function consumePendingDeviceTrust(params: {
  readonly store: unknown;
  readonly twoFactorToken: string | undefined;
}): Promise<boolean> {
  const { store, twoFactorToken } = params;

  if (!twoFactorToken || !isUsableStore(store)) return false;

  const key = keyFor(twoFactorToken);

  try {
    const stored = await store.get(key);
    if (stored !== TRUSTED) return false;
    await store.del(key);
    return true;
  } catch {
    return false;
  }
}
