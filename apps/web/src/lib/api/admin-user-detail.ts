import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord, asText } from './admin';
import { unwrap } from './client';
import type { ApiResult } from './http';

/**
 * **LE DÉTAIL D'UN MEMBRE** (#6819, #8005) — `GET admin.usersByUserId`,
 * gardé par `canViewUserDetails` (BIGBOSS, ADMIN, MODERATOR, AUDIT).
 *
 * La charge est servie **NUE** : `sendSuccess(reply, sanitizedUser)`
 * (`routes/admin/users.ts`), sans enveloppe — à la différence de la LISTE,
 * dont la `pagination` voyage DANS `data`. Lire ici un `charge.user` rendrait
 * `null` sur une charge parfaitement valide.
 *
 * ## Ce que ce décodeur REFUSE de garder, et pourquoi
 *
 * Sous `canViewSensitiveData`, `sanitizeUser` ajoute à la forme publique :
 * `twoFactorBackupCodesRemaining` (le NOMBRE de codes de secours, jamais leurs
 * empreintes), `lastLoginIp`, `lastLoginLocation`, `lastLoginDevice`,
 * `registrationIp`, `registrationLocation`, `registrationDevice`,
 * `registrationCountry` — et, sur la fiche, le bloc `adminMetadata` (#8005).
 *
 * **Ce qu'on GARDE** (#8876, la fiche dit enfin d'où et d'où l'on se connecte) :
 * le lieu, l'appareil et le pays d'inscription, le nombre de codes de secours
 * restants, et le bloc `adminMetadata` champ par champ. Les données
 * d'administration ne sont plus déshydratées sur le disque (`estClefNonPersistable`,
 * #8876) : le risque qui les faisait jeter n'existe plus.
 *
 * **Ce qu'on REFUSE toujours** : les adresses IP (`lastLoginIp`,
 * `registrationIp`) — la fiche n'a aucune phrase à leur consacrer, et une donnée
 * qu'aucun écran ne lit n'a pas à traverser le navigateur —, les empreintes
 * `twoFactorBackupCodes` et tout jeton. DEUX GARDES POUR UNE RÈGLE : le type ne
 * les DÉCLARE pas, **et** l'objet se construit champ par champ. Le second point
 * n'est pas décoratif — un `...spread` de la charge satisferait le type tout en
 * recopiant chaque champ que la passerelle ajoutera demain, en silence.
 *
 * ## L'état d'un compte se lit en TROIS champs, jamais en un statut calculé
 *
 * `isActive`, `deactivatedAt` et `deletedAt` sont servis séparément et le
 * restent. La raison est mesurée (#6822) : `DELETE /admin/users/:userId`
 * n'écrit **que** `isActive:false` — ni `deletedAt`, ni `deletedBy`, ni
 * `deactivatedAt`. Un compte supprimé arrive donc avec `deletedAt: null`, et
 * rien ne le distingue d'une suspension. Calculer ici un statut unique
 * inventerait une certitude que la charge ne porte pas ; l'écran DIT ce qu'il
 * sait (`accountStateOf`), et pas davantage.
 */
export type AdminUserDetail = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly bio: string;
  readonly avatar: string;
  /** La bannière du profil — la chaîne vide quand il n'en a pas. */
  readonly banner: string;
  /** Le taux de complétion du profil (0–100) tel que servi, `null` s'il ne l'est pas. */
  readonly profileCompletionRate: number | null;
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

  /** Les lieux et appareils de connexion et d'inscription — sous `canViewSensitiveData` (chaîne vide sinon). */
  readonly registrationCountry: string;
  readonly lastLoginLocation: string;
  readonly lastLoginDevice: string;
  readonly registrationLocation: string;
  readonly registrationDevice: string;
  /**
   * Le NOMBRE de codes de secours du second facteur — `null` quand la passerelle
   * ne le sert pas (rôle sans donnée sensible) : ce n'est pas zéro, c'est un
   * chiffre qu'on ne nous remet pas.
   */
  readonly twoFactorBackupCodesRemaining: number | null;
  /** Le bloc de métadonnées de compte (#8005) — `null` quand il n'est pas servi : l'écran ne le dessine alors pas. */
  readonly adminMetadata: AdminMemberMetadata | null;
  /** Les compteurs de liens de la ligne (`_count`) — `null` quand ils ne sont pas servis. */
  readonly counts: AdminMemberCounts | null;
};

/**
 * LE BLOC `adminMetadata` (#8005) — ce qui aide à COMPRENDRE un compte sans ouvrir
 * la base. Jamais la VALEUR d'un changement d'e-mail ou de téléphone en attente
 * (`hasPending*` dit qu'il existe), jamais la liste des comptes bloqués
 * (`blockedCount` en dit la taille).
 */
export type AdminMemberMetadata = {
  readonly deviceLocale: string | null;
  readonly deviceCountry: string | null;
  readonly birthDate: string | null;
  readonly ageVerifiedAt: string | null;
  readonly voiceProfileConsentAt: string | null;
  readonly voiceDataConsentAt: string | null;
  readonly dataProcessingConsentAt: string | null;
  readonly analyticsConsentAt: string | null;
  readonly voiceCloningEnabledAt: string | null;
  readonly termsAcceptedAt: string | null;
  readonly termsVersion: string | null;
  readonly onboardingCompletedAt: string | null;
  readonly currentStreakDays: number;
  readonly longestStreakDays: number;
  readonly engagementScore: number;
  readonly meeshBalance: number;
  readonly blockedCount: number;
  readonly hasPendingEmail: boolean;
  readonly hasPendingPhone: boolean;
};

export type AdminMemberCounts = {
  readonly shareLinks: number;
  readonly trackingLinks: number;
  readonly affiliateTokens: number;
  readonly affiliateRelations: number;
  readonly referredRelations: number;
  readonly sentFriendRequests: number;
  readonly receivedFriendRequests: number;
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

const asNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

function decodeMetadata(raw: unknown): AdminMemberMetadata | null {
  const bloc = asRecord(raw);
  if (bloc === null) return null;
  return {
    deviceLocale: asTextOrNull(bloc.deviceLocale),
    deviceCountry: asTextOrNull(bloc.deviceCountry),
    birthDate: asDate(bloc.birthDate),
    ageVerifiedAt: asDate(bloc.ageVerifiedAt),
    voiceProfileConsentAt: asDate(bloc.voiceProfileConsentAt),
    voiceDataConsentAt: asDate(bloc.voiceDataConsentAt),
    dataProcessingConsentAt: asDate(bloc.dataProcessingConsentAt),
    analyticsConsentAt: asDate(bloc.analyticsConsentAt),
    voiceCloningEnabledAt: asDate(bloc.voiceCloningEnabledAt),
    termsAcceptedAt: asDate(bloc.termsAcceptedAt),
    termsVersion: asTextOrNull(bloc.termsVersion),
    onboardingCompletedAt: asDate(bloc.onboardingCompletedAt),
    currentStreakDays: asCount(bloc.currentStreakDays),
    longestStreakDays: asCount(bloc.longestStreakDays),
    engagementScore: asNumber(bloc.engagementScore),
    meeshBalance: asNumber(bloc.meeshBalance),
    blockedCount: asCount(bloc.blockedCount),
    hasPendingEmail: bloc.hasPendingEmail === true,
    hasPendingPhone: bloc.hasPendingPhone === true,
  };
}

function decodeCounts(raw: unknown): AdminMemberCounts | null {
  const compte = asRecord(raw);
  if (compte === null) return null;
  return {
    shareLinks: asCount(compte.createdShareLinks),
    trackingLinks: asCount(compte.createdTrackingLinks),
    affiliateTokens: asCount(compte.createdAffiliateTokens),
    affiliateRelations: asCount(compte.affiliateRelations),
    referredRelations: asCount(compte.referredRelations),
    sentFriendRequests: asCount(compte.sentFriendRequests),
    receivedFriendRequests: asCount(compte.receivedFriendRequests),
  };
}

export function decodeAdminUserDetail(raw: unknown): AdminUserDetail | null {
  const charge = asRecord(raw);
  if (charge === null || typeof charge.id !== 'string' || charge.id === '') return null;

  const username = asText(charge.username);
  const twoFactorEnabledAt = asDate(charge.twoFactorEnabledAt);

  return {
    id: charge.id,
    username,
    // Le nom affiché TEL QUE SERVI, vide s'il manque : le décodeur ne fabrique aucun
    // libellé. `personLabel` compose le nom lisible (nom affiché, puis « Prénom
    // Nom », puis `@pseudo`) — c'est lui seul qui décide du repli.
    displayName: asText(charge.displayName).trim(),
    firstName: asText(charge.firstName),
    lastName: asText(charge.lastName),
    bio: asText(charge.bio),
    avatar: asText(charge.avatar),
    banner: asText(charge.banner),
    profileCompletionRate: typeof charge.profileCompletionRate === 'number' ? charge.profileCompletionRate : null,
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

    registrationCountry: asText(charge.registrationCountry),
    lastLoginLocation: asText(charge.lastLoginLocation),
    lastLoginDevice: asText(charge.lastLoginDevice),
    registrationLocation: asText(charge.registrationLocation),
    registrationDevice: asText(charge.registrationDevice),
    twoFactorBackupCodesRemaining:
      typeof charge.twoFactorBackupCodesRemaining === 'number' ? asCount(charge.twoFactorBackupCodesRemaining) : null,
    adminMetadata: decodeMetadata(charge.adminMetadata),
    counts: decodeCounts(charge._count),
  };
}

/**
 * LA RÉPONSE D'UNE ÉCRITURE, LUE COMME UNE FICHE — chaque écriture du compte rend
 * le membre à jour, sanitisé, sous la MÊME forme que `GET` : on la décode donc
 * par le même décodeur, qui lui fait hériter des mêmes refus (aucune IP, aucune
 * empreinte, aucun jeton).
 */
export function memberFromResult(result: ApiResult<unknown>): ApiResult<AdminUserDetail> {
  if (!result.ok) return result;
  const membre = decodeAdminUserDetail(result.data);
  return membre === null ? { ok: false, status: 0, error: 'Membre illisible' } : { ok: true, data: membre };
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
    path: adminEndpoints.usersByUserId(params.userId),
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
    /* `unwrap` garde le STATUT du refus (`ApiError`) : un 403 se dit comme un refus, un 404 comme
       un membre introuvable — jamais les deux comme « une panne ». */
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }): Promise<AdminUserDetail> =>
      unwrap(await loadAdminUserDetail({ ...deps, userId, ...(signal === undefined ? {} : { signal }) })),
    staleTime: 5 * 1000,
    retry: false,
  };
}
