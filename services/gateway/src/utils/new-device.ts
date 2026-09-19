/**
 * **« Nouvelle connexion » se juge sur l'APPAREIL, jamais sur la session qui
 * vient de naître** (#7035).
 *
 * ## Le défaut que cette loi remplace
 *
 * Les deux portes de connexion posaient :
 *
 * ```ts
 * // Notification login nouvel appareil (session non trustée = nouvel appareil)
 * if (!session.isTrusted) {
 * ```
 *
 * L'équivalence du commentaire est fausse. `session` est celle qui vient
 * d'être créée, et elle n'est JAMAIS de confiance à cet instant :
 * `markSessionTrusted` ne s'exécute qu'après, en arrière-plan, et seulement si
 * `rememberDevice` est demandé. La condition était donc vraie à *chaque*
 * connexion — mesuré sur le compte de recette : **60 notifications
 * `login_new_device` sur 100**, toutes depuis la même IP, la même ville et le
 * même appareil, noyant les quatre familles utiles sous le bruit.
 *
 * Une alerte qui crie tout le temps ne protège plus : c'est la dimension 1
 * (sécurité) autant que la 8 (expérience).
 *
 * ## Ce qui compose l'empreinte, et surtout ce qui n'en fait PAS partie
 *
 * - **Pas les VERSIONS** (`osVersion`, `browserVersion`) : une mise à jour d'iOS
 *   ferait alors crier « nouvel appareil » sur le téléphone de toujours. C'est
 *   le même défaut, déclenché une fois par mise à jour au lieu d'une fois par
 *   connexion.
 * - **Pas l'ADRESSE IP** : elle change en itinérance, en passant du Wi-Fi à la
 *   4G, en changeant de café. L'issue la nomme explicitement comme mauvais
 *   discriminant.
 * - **Le matériel et la pile logicielle**, eux, tiennent dans le temps : type,
 *   constructeur, modèle, système, navigateur.
 *
 * ## Fail-closed quand on ne sait rien
 *
 * Si l'agent utilisateur n'a rien donné, l'empreinte est vide. Deux inconnues
 * ne font pas une égalité : on ne peut pas affirmer que c'est le même appareil,
 * donc on ALERTE. Le repli sur l'agent utilisateur brut évite ce cas dans la
 * quasi-totalité des connexions réelles ; l'alerte reste le comportement de
 * dernier recours, parce que se taire à tort sur une vraie intrusion coûte plus
 * cher que crier une fois de trop.
 */

/** Les seules colonnes de session qui décrivent un APPAREIL de façon stable. */
export type DeviceIdentity = {
  readonly deviceType?: string | null;
  readonly deviceVendor?: string | null;
  readonly deviceModel?: string | null;
  readonly osName?: string | null;
  readonly browserName?: string | null;
  readonly userAgent?: string | null;
};

/**
 * La forme que `getRequestContext` rend — ses champs ne portent PAS les mêmes
 * noms que les colonnes de session (`type` vs `deviceType`, `os` vs `osName`…).
 *
 * La conversion vit ici, avec son témoin, parce qu'une correspondance muette
 * suffirait à rendre toute empreinte vide : chaque connexion serait alors jugée
 * « nouvel appareil », c'est-à-dire exactement le défaut qu'on corrige, sans
 * qu'aucun test de la loi ne tombe.
 */
export type RequestDeviceInfo = {
  readonly type?: string | null;
  readonly vendor?: string | null;
  readonly model?: string | null;
  readonly os?: string | null;
  readonly browser?: string | null;
};

export function deviceIdentityFromInfo(
  info: RequestDeviceInfo | null | undefined,
  userAgent: string | null | undefined
): DeviceIdentity {
  return {
    deviceType: info?.type ?? null,
    deviceVendor: info?.vendor ?? null,
    deviceModel: info?.model ?? null,
    osName: info?.os ?? null,
    browserName: info?.browser ?? null,
    userAgent: userAgent ?? null,
  };
}

const normalise = (valeur: string | null | undefined): string =>
  (valeur ?? '').trim().toLowerCase();

/**
 * L'empreinte d'un appareil : les cinq champs stables, joints. Vide — chaîne
 * `''` — quand aucun n'est connu, ce que `isLoginFromNewDevice` traite comme
 * « je ne sais pas », jamais comme « c'est le même ».
 */
export function deviceFingerprint(identity: DeviceIdentity): string {
  const parts = [
    normalise(identity.deviceType),
    normalise(identity.deviceVendor),
    normalise(identity.deviceModel),
    normalise(identity.osName),
    normalise(identity.browserName),
  ];
  return parts.some((p) => p !== '') ? parts.join('|') : '';
}

/**
 * Cette connexion vient-elle d'un appareil jamais vu pour ce compte ?
 *
 * @param previous Les sessions ANTÉRIEURES du compte — la session qui vient de
 *   naître doit en être exclue par l'appelant, sinon elle se reconnaîtrait
 *   elle-même et aucune alerte ne partirait jamais.
 */
export function isLoginFromNewDevice(
  previous: readonly DeviceIdentity[],
  current: DeviceIdentity
): boolean {
  const empreinte = deviceFingerprint(current);
  if (empreinte !== '') {
    return !previous.some((p) => deviceFingerprint(p) === empreinte);
  }
  // Rien d'identifiable : dernier recours sur l'agent utilisateur brut.
  const brut = normalise(current.userAgent);
  if (brut === '') return true;
  return !previous.some((p) => normalise(p.userAgent) === brut);
}
