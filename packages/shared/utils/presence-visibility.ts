import type { RelationLevel } from '../types/relation.js';
import type { GlobalUserRoleType } from '../types/role-types.js';
import { resolveRelationAccess } from './relation-access.js';
import { PRESENCE_IDLE_WINDOW_MS } from './user-presence.js';

export type PresenceVisibilityInput = {
  readonly isSelf: boolean;
  readonly viewerRole: GlobalUserRoleType;
  /**
   * Niveau EFFECTIF du lien viewer/cible (minimum des deux accords). Remplace le
   * booléen d'amitié (#13927) : FRIEND sert « en ligne » seulement, CLOSE et
   * au-dessus la présence détaillée (#13928).
   */
  readonly relationLevel: RelationLevel;
  readonly targetShowOnlineStatus: boolean;
  readonly targetShowLastSeen: boolean;
  readonly targetIsDeactivated: boolean;
  readonly isBlockedEitherWay: boolean;
};

export type PresenceVisibility = {
  readonly showOnline: boolean;
  readonly showLastSeenTimestamp: boolean;
};

const HIDDEN: PresenceVisibility = { showOnline: false, showLastSeenTimestamp: false };

/**
 * La politique de présence ne connaît pas d'identifiants : `isSelf` décide de
 * l'identité, et ces deux étiquettes ne servent qu'à la dire à la loi d'accès.
 * Les DEUX drapeaux se lisent sous deux features distinctes (#13928) : « en
 * ligne » sous `presence.online` (dès Ami), la dernière vue sous
 * `presence.detailed` (dès Proche). L'Ami est BINAIRE.
 */
const VIEWER = 'viewer';
const TARGET = 'target';

/**
 * Politique pure de visibilité de la présence (lastActiveAt/isOnline).
 * Décide deux drapeaux ; l'appelant injecte la vraie valeur.
 *
 * Directive produit (2026-08-25), gravée verbatim : « Lorsqu'on n'est pas
 * ami (aucune connexion) : je veux supprimer ma présence en ligne — c'est
 * seulement quand on m'écrit / je réponds que la personne saura que je
 * suis en ligne, et personne ne doit savoir ma dernière connexion sur
 * l'application si on n'est pas ami. Les utilisateurs avec le rôle Admin
 * et supérieur peuvent constamment avoir l'état de présence de
 * l'utilisateur. »
 *
 * Privilégié = soi-même OU administrateur global (`isGlobalAdmin` :
 * ADMIN/BIGBOSS). Un MODERATOR n'est ni un ami ni un administrateur — la
 * directive ne cite que « Admin et supérieur » — donc il rejoint AUDIT,
 * ANALYST, USER, AGENT côté non-privilégié (revirement du 2026-08-25 :
 * jusque-là le bypass suivait `isGlobalModerator`).
 *
 * Autorisé = privilégié OU niveau effectif >= Ami (`relationLevel`, loi
 * `resolveRelationAccess`). L'AMI est BINAIRE (directive porteur 2026-10-31,
 * #13928) : il reçoit « en ligne » ou rien — jamais `lastActiveAt`, ni les
 * états intermédiaires (away/idle, « vu il y a ») qui en découlent. La
 * présence détaillée (règle 1/3/5) commence à PROCHE (`presence.detailed`). Le partage
 * d'une conversation N'EST PLUS un critère d'autorisation (`sharesConversation`
 * retiré du type ce même jour) : une conversation n'est pas une relation, et
 * deux inconnus qui échangent dans un salon ne se doivent aucune présence
 * hors de l'échange lui-même. Le seul signal qu'un non-ami reste autorisé à
 * recevoir est l'ACTIVITÉ — frappe (`typing:start`), message envoyé — et
 * elle voyage par ses propres événements Socket.IO, jamais par ce résolveur.
 *
 * @see docs/superpowers/specs/2026-06-30-profile-last-seen-visibility-design.md
 * @see services/gateway/decisions.md (entrée 2026-08-25 « Visibilité de la présence »)
 */
export const resolvePresenceVisibility = (input: PresenceVisibilityInput): PresenceVisibility => {
  if (input.targetIsDeactivated) return HIDDEN;

  const accessTo = (feature: 'presence.online' | 'presence.detailed') =>
    resolveRelationAccess({
      viewerId: VIEWER,
      targetId: input.isSelf ? VIEWER : TARGET,
      grantedByViewer: input.relationLevel,
      grantedByTarget: input.relationLevel,
      sharesCommunity: false,
      blockedEitherWay: input.isBlockedEitherWay,
      viewerMinor: 'unknown',
      targetMinor: 'unknown',
      viewerRole: input.viewerRole,
      feature,
    });

  const online = accessTo('presence.online');
  if (!online.allowed) return HIDDEN;

  if (online.reason === 'self' || online.reason === 'role') return { showOnline: true, showLastSeenTimestamp: true };
  if (!input.targetShowOnlineStatus) return HIDDEN;
  return { showOnline: true, showLastSeenTimestamp: accessTo('presence.detailed').allowed && input.targetShowLastSeen };
};

/**
 * « En ligne » servi SANS la date (l'Ami, binaire) : la garde anti-stale de 5 min
 * se calcule sur `lastActiveAt`, que l'Ami ne reçoit pas. Elle s'applique donc ICI,
 * avant le masquage : une ligne `isOnline: true` dont la dernière activité a plus de
 * 5 min (heartbeat perdu) ne sort jamais « en ligne » chez l'Ami, là où le Proche,
 * qui rend la date, ne verrait rien. Sans date connue, la valeur est inchangée.
 */
const servedOnlineValue = (
  profile: { isOnline: boolean | null; lastActiveAt?: Date | null },
  visibility: PresenceVisibility,
  now: number,
): boolean | null => {
  if (profile.isOnline !== true || visibility.showLastSeenTimestamp) return profile.isOnline;
  const last = profile.lastActiveAt ? new Date(profile.lastActiveAt).getTime() : Number.NaN;
  return Number.isNaN(last) || now - last <= PRESENCE_IDLE_WINDOW_MS ? true : false;
};

/**
 * Applique le résultat de visibilité sur un objet profil, sans mutation.
 * `showOnline:false` ⇒ `isOnline=null` (non montrable, pas de pastille).
 */
export const applyPresenceVisibility = <
  T extends { isOnline: boolean | null; lastActiveAt: Date | null },
>(
  profile: T,
  visibility: PresenceVisibility,
  now: number = Date.now(),
): Omit<T, 'isOnline' | 'lastActiveAt'> & { isOnline: boolean | null; lastActiveAt: Date | null } => ({
  ...profile,
  isOnline: visibility.showOnline ? servedOnlineValue(profile, visibility, now) : null,
  lastActiveAt: visibility.showLastSeenTimestamp ? profile.lastActiveAt : null,
});

const REVEALED: PresenceVisibility = { showOnline: true, showLastSeenTimestamp: true };

/**
 * Que faire d'une carte de visibilité qui ne porte AUCUNE entrée pour l'id
 * qu'on lui présente ? Le résolveur (`resolveForTargets`) rend une entrée par
 * id qu'on lui passe ; une entrée absente désigne donc une cible SANS COMPTE
 * (participant anonyme, sans `userId` ni préférences) — ou une anomalie.
 *
 * - `'hide'` — le défaut, et le seul régime pour un viewer ordinaire : une
 *   porte de confidentialité refuse ce qu'elle ne sait pas (directive du
 *   2026-08-25 : hors amitié, soi ou ADMIN+, aucune présence).
 * - `'reveal'` — réservé à l'appelant qui a ÉTABLI que le viewer est
 *   privilégié (ADMIN/BIGBOSS) : la cible sans compte, que la loi ne peut pas
 *   résoudre faute de `userId`, lui est révélée comme le serait un inscrit.
 *
 * La résolution aveugle au viewer (« préférences seules »), qui révélait toute
 * entrée absente, a été SUPPRIMÉE du gateway — une garde de source
 * (`presence-visibility-viewer-aware-guard.test.ts`) rougit si son identifiant
 * réapparaît, ce fichier compris. Ce choix reste EXPLICITE parce qu'un
 * `undefined` laissé passer révèle un inconnu.
 */
export type PresenceMissingEntryPolicy = 'hide' | 'reveal';

/**
 * Forme SERVIE par {@link applyPresenceVisibilityAsOffline} : `isOnline` sans
 * `null`, `lastActiveAt` — si et seulement si le profil le porte, optionnalité
 * conservée — élargi à `Date | null`, tout le reste tel quel. Mappé sur
 * `keyof T` pour que la clé ne soit ni fabriquée ni promise à tort.
 */
export type PresenceAsOffline<T extends { isOnline: boolean | null; lastActiveAt?: Date | null }> = {
  [K in keyof T]: K extends 'isOnline' ? boolean : K extends 'lastActiveAt' ? Date | null : T[K];
};

/**
 * Même application que {@link applyPresenceVisibility}, pour les surfaces dont le
 * schéma de sérialisation déclare `isOnline` NON nullable (`userMinimalSchema`,
 * `contacts-schemas`) et dont les clients le typent `boolean` : masqué s'y
 * présente comme HORS LIGNE — `false` au lieu de `null`.
 *
 * Le sort d'une visibilité **absente** se choisit avec `onMissingEntry`, dont le
 * défaut `'hide'` sert le régime strict (voir {@link PresenceMissingEntryPolicy}).
 *
 * `lastActiveAt` est OPTIONNEL : certaines portes ne chargent que `isOnline`
 * (aperçu de membres d'une communauté). Le gate ne fabrique alors pas la clé —
 * une réponse ne gagne pas un champ parce qu'on l'a filtrée.
 *
 * Le type de retour dit ce que le code FAIT ({@link PresenceAsOffline}) : quand
 * le profil porte `lastActiveAt`, la clé sort en `Date | null` — masquée, elle
 * vaut `null`, même si le type d'entrée l'excluait (`PublicUser`). Un retour
 * qui recopiait `T['lastActiveAt']` promettait une `Date` que le masquage ne
 * tenait pas. Le contrat est porté par une SURCHARGE : `tsc` ne sait pas
 * relier un objet étalé à un type mappé sur `keyof T` générique, et la
 * signature d'implémentation garde la forme structurelle qu'il vérifie.
 */
export function applyPresenceVisibilityAsOffline<
  T extends { isOnline: boolean | null; lastActiveAt?: Date | null },
>(
  profile: T,
  visibility: PresenceVisibility | undefined,
  options?: { readonly onMissingEntry?: PresenceMissingEntryPolicy },
): PresenceAsOffline<T>;
export function applyPresenceVisibilityAsOffline<
  T extends { isOnline: boolean | null; lastActiveAt?: Date | null },
>(
  profile: T,
  visibility: PresenceVisibility | undefined,
  options?: { readonly onMissingEntry?: PresenceMissingEntryPolicy; readonly now?: number },
): Omit<T, 'isOnline' | 'lastActiveAt'> & { isOnline: boolean; lastActiveAt?: Date | null } {
  const effective =
    visibility ?? (options?.onMissingEntry === 'reveal' ? REVEALED : HIDDEN);

  return {
    ...profile,
    isOnline: effective.showOnline ? servedOnlineValue(profile, effective, options?.now ?? Date.now()) === true : false,
    ...('lastActiveAt' in profile
      ? { lastActiveAt: effective.showLastSeenTimestamp ? profile.lastActiveAt ?? null : null }
      : {}),
  };
}
