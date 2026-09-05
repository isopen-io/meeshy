/**
 * Forme minimale d'un participant porteur d'un avatar : avatar local optionnel
 * (`Participant.avatar`) + avatar du compte utilisateur lié optionnel (`User.avatar`).
 * Couvre les participants enregistrés, anonymes et les `sender` de message.
 */
export type AvatarBearingParticipant = {
  readonly avatar?: string | null;
  readonly user?: { readonly avatar?: string | null } | null;
};

/**
 * Forme minimale d'un participant porteur d'un nom d'affichage : `displayName`
 * local optionnel (`Participant.displayName`) + `displayName` du compte utilisateur
 * lié optionnel (`User.displayName`).
 */
export type DisplayNameBearingParticipant = {
  readonly displayName?: string | null;
  readonly user?: { readonly displayName?: string | null } | null;
};

const isNonBlank = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Source unique de la résolution de l'avatar à afficher pour un participant.
 *
 * Ordre canonique : avatar **local** du participant (priorité — ex. avatar par
 * conversation) → avatar du **compte utilisateur** lié → `null` (aucune photo).
 *
 * Une chaîne **vide ou blanche** est traitée comme « pas d'avatar » (et non comme
 * une URL valide) : un `avatar: ''` local retombe donc sur l'avatar du compte, et
 * deux valeurs blanches renvoient `null`. Sans cette normalisation, `??` laissait
 * fuir la chaîne vide et le client rendait un `<img src="">` parasite (rechargement
 * de la page courante). Aligne cette source unique sur `getUserDisplayName` (web).
 *
 * Centralise une décision produit jusqu'ici réécrite à la main dans la gateway,
 * supprimant par construction les divergences (fallback local oublié, ordre inversé).
 */
export const resolveParticipantAvatar = (
  participant?: AvatarBearingParticipant | null,
): string | null =>
  [participant?.avatar, participant?.user?.avatar].find(isNonBlank) ?? null;

/**
 * Source unique de la résolution du nom d'affichage porté par un participant.
 *
 * Ordre canonique : `displayName` **local** du participant → `displayName` du
 * **compte utilisateur** lié → `null`. Miroir strict de `resolveParticipantAvatar`
 * pour la même famille de bugs : une chaîne **vide ou blanche** est traitée comme
 * absente, ce qui restaure le fallback compte que `??` court-circuitait (un
 * `displayName: ''` local retombe sur le nom du compte au lieu de le masquer).
 *
 * Ne couvre QUE le niveau `displayName` (local → compte). Les fallbacks
 * `firstName lastName` / `username` restent la responsabilité du client via
 * `getUserDisplayName`, exactement comme aujourd'hui.
 */
export const resolveParticipantDisplayName = (
  participant?: DisplayNameBearingParticipant | null,
): string | null =>
  [participant?.displayName, participant?.user?.displayName].find(isNonBlank) ?? null;

export type AnonymousSenderIdentity = {
  readonly displayName: string;
  readonly username: string;
};

/**
 * Identité d'un auteur SANS COMPTE dans le fil : le nom DONNÉ au formulaire
 * d'entrée prime en nom affiché, le pseudo `ano_…` descend en handle — chacun
 * à sa place, comme pour un inscrit (displayName + @username). Avant ce
 * résolveur, la bulle montrait le pseudo en nom et un handle vide.
 */
export const resolveAnonymousSenderIdentity = (participant: {
  readonly displayName?: string | null;
  readonly anonymousSession?: {
    readonly profile?: {
      readonly firstName?: string | null;
      readonly lastName?: string | null;
    } | null;
  } | null;
}): AnonymousSenderIdentity => {
  const pseudo = participant.displayName?.trim() ?? '';
  const givenName = [
    participant.anonymousSession?.profile?.firstName,
    participant.anonymousSession?.profile?.lastName,
  ]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ');
  return { displayName: givenName || pseudo, username: pseudo };
};

/**
 * Forme minimale d'un rang `Participant` sérialisable vers le fil. Structurelle
 * — la fabrique ne dépend pas du client Prisma, elle ne lit que ce qu'elle
 * déclare ici. Tout champ ABSENT de ce type l'est aussi de la sortie : c'est la
 * seule garantie qui empêche l'état privé par paire (`bannedAt`, `leftAt`,
 * `deletedForMe`, `nickname`, `shareLinkId`, `sessionTokenHash`,
 * `anonymousSession`) de partir sur un chemin sans sérialiseur.
 */
export type SerializableParticipantRow = {
  readonly id: string;
  readonly userId?: string | null;
  readonly type?: string | null;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
  readonly role?: string | null;
  readonly language?: string | null;
  readonly isActive?: boolean | null;
  readonly isOnline?: boolean | null;
  readonly lastActiveAt?: Date | null;
  readonly joinedAt?: Date | null;
  readonly permissions?: {
    readonly canSendMessages?: boolean | null;
    readonly canSendFiles?: boolean | null;
    readonly canSendImages?: boolean | null;
  } | null;
  readonly user?: {
    readonly id?: string | null;
    readonly username?: string | null;
    readonly firstName?: string | null;
    readonly lastName?: string | null;
    readonly displayName?: string | null;
    readonly avatar?: string | null;
    readonly role?: string | null;
    readonly systemLanguage?: string | null;
    readonly regionalLanguage?: string | null;
    readonly customDestinationLanguage?: string | null;
    readonly createdAt?: Date | null;
    readonly updatedAt?: Date | null;
  } | null;
};

/**
 * Visibilité de présence telle que la rend `resolveForTargets(viewer, ids)` :
 * deux drapeaux, ou RIEN quand la cible n'a pas de compte (un anonyme n'a pas
 * de `userId`). L'entrée absente MASQUE, sauf pour un viewer ADMIN/BIGBOSS —
 * l'appelant le dit par `PresenceMissingEntryPolicy`.
 * @see utils/presence-visibility.ts, `PresenceMissingEntryPolicy`
 */
export type ParticipantPresenceVisibility = {
  readonly showOnline: boolean;
  readonly showLastSeenTimestamp: boolean;
};

export type SerializeParticipantOptions = {
  /**
   * Visibilité SERVIE pour la cible, résolue par l'appelant PAR VIEWER
   * (`resolveForTarget(s)`, puis `presenceFor` pour une entrée absente).
   * Absente ⇒ MASQUE : la fabrique ne révèle jamais par défaut — un appelant
   * qui l'omet sert `isOnline:false` / `lastActiveAt:null`, pas la colonne.
   */
  readonly presence?: ParticipantPresenceVisibility;
  /**
   * Présence VIVE du `SocketIOManager` quand on l'a : la colonne
   * `Participant.isOnline` peut être obsolète (heartbeat manqué, crash gateway,
   * déconnexion non détectée). Absente ⇒ la colonne fait foi.
   */
  readonly liveOnline?: boolean;
};

const ADMIN_ROLES = ['ADMIN', 'BIGBOSS'];

/**
 * SOURCE UNIQUE de la forme de fil déclarée par `conversationParticipantSchema`.
 *
 * Elle existe parce que la forme était réécrite à la main à chaque surface, et
 * que cette dispersion avait une conséquence mesurée (cycle 92 bis) : les trois
 * routes qui LISTENT des participants gardaient la présence, les deux qui en
 * MUTENT un passaient le rang Prisma brut et ne la gardaient pas. La garde
 * n'était pas oubliée — elle n'avait aucun endroit unique où être posée.
 *
 * Deux pièges que la fabrique ferme par construction :
 *
 * 1. **`role` porte DEUX taxonomies.** `Participant.role` est le rang DANS LA
 *    CONVERSATION (`creator|admin|moderator|member`) ; `conversationParticipantSchema.role`
 *    déclare le rôle GLOBAL (`USER|ADMIN|…`). Passer le rang brut servait donc
 *    `member` là où le contrat promet `USER`, en laissant `conversationRole` vide.
 * 2. **La présence ne sort jamais toute seule.** `isOnline`/`lastActiveAt` sont
 *    DÉCLARÉS par le schéma : sur un rang brut ils traversent sans garde. Ici
 *    ils ne sortent qu'à travers `options.presence`, et seulement quand elle
 *    le DIT (`showOnline === true`, `showLastSeenTimestamp === true`) : sans
 *    visibilité fournie, la fabrique sert `false` / `null`. Le défaut FERME —
 *    les trois appelants du gateway passent déjà `presenceFor` ; le quatrième,
 *    qui l'oublierait, ne fuit plus.
 */
export const serializeConversationParticipant = (
  participant: SerializableParticipantRow,
  options: SerializeParticipantOptions = {},
) => {
  const { presence, liveOnline } = options;
  const user = participant.user ?? null;
  const localName = participant.displayName ?? '';
  const joinedAt = participant.joinedAt ?? null;
  const language = participant.language ?? null;
  const isGlobalAdmin = ADMIN_ROLES.includes(user?.role ?? '');

  const effectiveOnline = liveOnline === undefined ? participant.isOnline ?? false : liveOnline;

  return {
    id: participant.id,
    participantId: participant.id,
    userId: participant.userId ?? null,
    type: participant.type ?? null,
    username: user?.username ?? localName,
    firstName: user?.firstName ?? localName,
    lastName: user?.lastName ?? '',
    displayName: participant.displayName ?? null,
    avatar: resolveParticipantAvatar(participant),
    role: user?.role ?? 'USER',
    conversationRole: participant.role ?? null,
    joinedAt,
    isOnline: presence?.showOnline === true ? effectiveOnline : false,
    lastActiveAt:
      presence?.showLastSeenTimestamp === true ? participant.lastActiveAt ?? null : null,
    systemLanguage: user?.systemLanguage ?? language,
    regionalLanguage: user?.regionalLanguage ?? language,
    customDestinationLanguage: user?.customDestinationLanguage ?? language,
    // `autoTranslateEnabled: true` était écrit EN DUR — un champ de contrat
    // qui ne disait rien de vrai (`User` ne porte aucune colonne de ce nom ;
    // le magasin réel est `UserPreferences.application`). #4161 avait retiré
    // le même littéral du profil PUBLIC ; ce chemin PARTICIPANT portait le
    // défaut identique, jamais compté par ce correctif. Retiré (#4643) plutôt
    // que servi depuis le magasin réel : la directive du 2026-08-25 sur la
    // présence est explicite — la co-participation à une conversation ne
    // donne accès à AUCUNE préférence personnelle d'un tiers, et
    // `autoTranslateEnabled` en est une, au même titre que `isOnline`.
    isActive: participant.isActive ?? false,
    createdAt: user?.createdAt ?? joinedAt,
    updatedAt: user?.updatedAt ?? joinedAt,
    isAnonymous: participant.type === 'anonymous',
    canSendMessages: participant.permissions?.canSendMessages ?? true,
    canSendFiles: participant.permissions?.canSendFiles ?? true,
    canSendImages: participant.permissions?.canSendImages ?? true,
    permissions: {
      canAccessAdmin: isGlobalAdmin,
      canManageUsers: isGlobalAdmin,
      canManageGroups: isGlobalAdmin,
      canManageConversations: isGlobalAdmin,
      canViewAnalytics: isGlobalAdmin,
      canModerateContent: isGlobalAdmin,
      canViewAuditLogs: isGlobalAdmin,
      canManageNotifications: isGlobalAdmin,
      canManageTranslations: isGlobalAdmin,
    },
  };
};
