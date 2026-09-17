import { type AdminDeps, asCount, asRecord, asText } from './admin';
import type { ApiResult } from './http';

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
  /**
   * LE TROISIÈME RANG DU PRISME (#6862, lot C) — `sanitizeUser` le sert depuis
   * toujours (`user-sanitization.service.ts`) ; ce décodeur ne le déclarait
   * pas, donc il le JETAIT. Tant que la fiche n'affichait que des libellés,
   * l'absence ne se voyait nulle part. Elle se voit maintenant : la modale de
   * lecture rend le fil dans le Prisme DU MEMBRE, et un prisme amputé de son
   * rang 3 sert l'original là où une traduction existe — le symptôme n'est pas
   * une erreur, c'est une traduction qui a l'air manquante.
   */
  readonly customDestinationLanguage: string;

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
    customDestinationLanguage: asText(charge.customDestinationLanguage),

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

export const adminUserDetailQueryKey = (userId: string) => ['admin', 'user', userId] as const;

/**
 * L'identifiant est ENCODÉ parce qu'il vient de l'URL que le visiteur a
 * ouverte, jamais d'une liste : il traverse le routeur tel qu'il a été tapé.
 * Sans encodage, un identifiant portant `/`, `?` ou `#` réécrirait le chemin
 * demandé — au mieux une requête qui échoue, au pire une AUTRE route de
 * l'administration atteinte avec les droits de celle-ci.
 */
export async function loadAdminUserDetail(
  params: AdminDeps & { readonly userId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminUserDetail>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const membre = decodeAdminUserDetail(result.data);
  /**
   * La requête a RÉUSSI et la charge est illisible : ce n'est ni un 404 — qui
   * dirait que le membre n'existe pas — ni une panne réseau. `status: 0` est
   * la convention du port pour ce cas précis (`app-preferences.ts`,
   * `communities.ts`), et la distinction compte : l'écran ne doit pas annoncer
   * « ce membre n'existe pas » quand il veut dire « je n'ai pas su lire ».
   */
  return membre === null ? { ok: false, status: 0, error: 'Membre illisible' } : { ok: true, data: membre };
}

/**
 * **CINQ SECONDES DE FRAÎCHEUR, ET AUCUN NOUVEL ESSAI.**
 *
 * La fraîcheur est courte — contrairement aux permissions, qui ne bougent pas
 * pendant qu'on regarde un écran (`adminIdentityQueryOptions`, 5 min) : ici
 * l'administrateur AGIT sur le membre affiché, et chaque geste invalide cette
 * clé. Une fenêtre longue lui montrerait l'état d'avant son propre geste en
 * revenant depuis la liste.
 *
 * `retry: false` pour la raison qu'`admin.ts` a déjà écrite : un 403 relancé
 * trois fois remplirait les journaux d'audit de refus. Un refus de droit n'est
 * pas une panne passagère — le rejouer ne le fera pas céder.
 */
export function adminUserDetailQueryOptions(deps: AdminDeps, userId: string) {
  return {
    queryKey: adminUserDetailQueryKey(userId),
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }): Promise<AdminUserDetail> => {
      const resultat = await loadAdminUserDetail({ ...deps, userId, ...(signal === undefined ? {} : { signal }) });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    staleTime: 5 * 1000,
    retry: false,
  };
}
