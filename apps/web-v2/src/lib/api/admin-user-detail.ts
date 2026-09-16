import { asCount, asRecord, asText } from './admin';

/**
 * **LE DÉTAIL D'UN MEMBRE** (#6819) — `GET /api/v1/admin/users/:userId`,
 * gardé par `canViewUserDetails` (BIGBOSS, ADMIN, MODERATOR, AUDIT).
 *
 * La charge est servie **NUE** : `sendSuccess(reply, sanitizedUser)`
 * (`routes/admin/users.ts:219`), sans enveloppe — à la différence de la LISTE,
 * dont la `pagination` voyage DANS `data`. Lire ici un `charge.user` rendrait
 * `null` sur une charge parfaitement valide.
 *
 * ## Ce que ce décodeur REFUSE de garder, et pourquoi
 *
 * Sous `canViewSensitiveData`, `sanitizeUser` ajoute à la forme publique :
 * `twoFactorBackupCodes`, `lastLoginIp`, `lastLoginLocation`,
 * `lastLoginDevice`, `registrationIp`, `registrationLocation`,
 * `registrationDevice`, `registrationCountry`.
 *
 * **Le cache des requêtes est PERSISTÉ dans `localStorage`**
 * (`query-client.ts` déshydrate tout succès) et **aucun mécanisme d'exemption
 * n'existe**. Ce qu'on décode ici finit donc écrit sur le disque du
 * navigateur — celui d'un administrateur, qui consulte des comptes qui ne sont
 * pas les siens, et dont le stockage survit à la déconnexion. Des codes de
 * secours de second facteur et des empreintes de connexion y seraient une
 * fuite durable, sans rapport avec le service rendu par l'écran.
 *
 * DEUX GARDES POUR UNE RÈGLE (même dispositif que le port de la sécurité du
 * compte, #6720) : le type ne les DÉCLARE pas, **et** l'objet se construit
 * champ par champ. Le second point n'est pas décoratif — un `...spread` de la
 * charge satisferait le type tout en recopiant chaque champ que la passerelle
 * ajoutera demain, en silence.
 *
 * Ce qui reste est ce qu'un administrateur doit voir pour agir : l'identité,
 * le rôle, l'état du compte, ses vérifications, ses langues. Le numéro de
 * téléphone en fait partie — c'est une donnée d'IDENTITÉ, que `sanitizeUser`
 * masque déjà pour qui n'y a pas droit, et non une empreinte de traçage.
 *
 * ## L'état d'un compte se lit en TROIS champs, jamais en un statut calculé
 *
 * `isActive`, `deactivatedAt` et `deletedAt` sont servis séparément et le
 * restent. La raison est mesurée (#6822) : `DELETE /admin/users/:userId`
 * n'écrit **que** `isActive:false` — ni `deletedAt`, ni `deletedBy`, ni
 * `deactivatedAt`. Un compte supprimé arrive donc avec `deletedAt: null`, et
 * rien ne le distingue d'une suspension. Calculer ici un statut unique
 * inventerait une certitude que la charge ne porte pas ; l'écran DIT ce qu'il
 * sait, et pas davantage.
 */
export type AdminUserDetail = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly bio: string;
  readonly avatar: string;
  readonly email: string;
  readonly phoneNumber: string;
  readonly role: string;
  readonly timezone: string;
  readonly systemLanguage: string;
  readonly regionalLanguage: string;

  readonly isActive: boolean;
  readonly isOnline: boolean;
  readonly deactivatedAt: string | null;
  readonly deletedAt: string | null;
  readonly deletedBy: string | null;

  readonly lockedUntil: string | null;
  readonly lockedReason: string | null;
  readonly failedLoginAttempts: number;
  readonly lastPasswordChange: string | null;

  /** La DATE d'activation, telle que servie — `null` si le second facteur n'a
   * jamais été posé. */
  readonly twoFactorEnabledAt: string | null;
  /** Le FAIT, projeté depuis la date : ce qu'un écran affiche est « activé ou
   * non », jamais un horodatage à interpréter au rendu. */
  readonly twoFactorEnabled: boolean;

  readonly emailVerifiedAt: string | null;
  readonly phoneVerifiedAt: string | null;
  readonly lastActiveAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/** Une chaîne SERVIE ou rien — jamais la chaîne vide, qui ressortirait comme
 * une valeur affichable alors qu'elle dit une absence. */
const asTextOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/**
 * Une date SERVIE est une chaîne ISO ou rien — même contrat que
 * `asTextOrNull`, mais un NOM qui dit ce que le champ est. La distinction
 * n'est pas cosmétique : `deletedBy` porte un identifiant d'administrateur et
 * `lockedReason` un motif rédigé. Les faire passer par `asDate` aurait
 * fonctionné — toute chaîne non vide survit — tout en affirmant dans le code
 * que ces champs sont des horodatages. Un helper mal nommé se propage par
 * copie, et le premier à s'en servir pour formater une date au rendu aurait
 * eu raison de le croire.
 */
const asDate = asTextOrNull;

export function decodeAdminUserDetail(raw: unknown): AdminUserDetail | null {
  const charge = asRecord(raw);
  if (charge === null || typeof charge.id !== 'string' || charge.id === '') return null;

  const username = asText(charge.username);
  const twoFactorEnabledAt = asDate(charge.twoFactorEnabledAt);

  return {
    id: charge.id,
    username,
    // Le nom affiché retombe sur le pseudo — jamais un détail sans nom dans un
    // écran dont le métier est de dire DE QUI l'on parle.
    displayName: asText(charge.displayName) || username,
    firstName: asText(charge.firstName),
    lastName: asText(charge.lastName),
    bio: asText(charge.bio),
    avatar: asText(charge.avatar),
    email: asText(charge.email),
    phoneNumber: asText(charge.phoneNumber),
    role: asText(charge.role) || 'USER',
    timezone: asText(charge.timezone),
    systemLanguage: asText(charge.systemLanguage),
    regionalLanguage: asText(charge.regionalLanguage),

    // `isActive` est VRAI sauf si la charge dit explicitement le contraire :
    // une clé absente ne doit pas désactiver un compte à l'écran. `isOnline`
    // suit la règle inverse — la présence se PROUVE, elle ne se suppose pas,
    // et la passerelle la masque déjà à qui n'a pas `canViewPresence` en la
    // servant comme « hors ligne ».
    isActive: charge.isActive !== false,
    isOnline: charge.isOnline === true,
    deactivatedAt: asDate(charge.deactivatedAt),
    deletedAt: asDate(charge.deletedAt),
    /** L'IDENTIFIANT de qui a supprimé, pas une date. */
    deletedBy: asTextOrNull(charge.deletedBy),

    lockedUntil: asDate(charge.lockedUntil),
    /** Un motif RÉDIGÉ, pas une date. */
    lockedReason: asTextOrNull(charge.lockedReason),
    failedLoginAttempts: asCount(charge.failedLoginAttempts),
    lastPasswordChange: asDate(charge.lastPasswordChange),

    twoFactorEnabledAt,
    twoFactorEnabled: twoFactorEnabledAt !== null,

    emailVerifiedAt: asDate(charge.emailVerifiedAt),
    phoneVerifiedAt: asDate(charge.phoneVerifiedAt),
    lastActiveAt: asDate(charge.lastActiveAt),
    createdAt: asDate(charge.createdAt),
    updatedAt: asDate(charge.updatedAt),
  };
}
