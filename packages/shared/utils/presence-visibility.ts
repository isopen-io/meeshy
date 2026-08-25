import { isGlobalAdmin } from '../types/role-types.js';
import type { GlobalUserRoleType } from '../types/role-types.js';

export type PresenceVisibilityInput = {
  readonly isSelf: boolean;
  readonly viewerRole: GlobalUserRoleType;
  readonly areConnected: boolean;
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
 * Autorisé = privilégié OU amitié acceptée (`areConnected`). Le partage
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
  if (input.targetIsDeactivated || input.isBlockedEitherWay) return HIDDEN;

  const privileged = input.isSelf || isGlobalAdmin(input.viewerRole);
  const allowed = privileged || input.areConnected;
  if (!allowed) return HIDDEN;

  if (privileged) return { showOnline: true, showLastSeenTimestamp: true };
  if (!input.targetShowOnlineStatus) return HIDDEN;
  return { showOnline: true, showLastSeenTimestamp: input.targetShowLastSeen };
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
): Omit<T, 'isOnline' | 'lastActiveAt'> & { isOnline: boolean | null; lastActiveAt: Date | null } => ({
  ...profile,
  isOnline: visibility.showOnline ? profile.isOnline : null,
  lastActiveAt: visibility.showLastSeenTimestamp ? profile.lastActiveAt : null,
});

const REVEALED: PresenceVisibility = { showOnline: true, showLastSeenTimestamp: true };

/**
 * Que faire d'une carte de visibilité qui ne porte AUCUNE entrée pour l'id
 * qu'on lui présente ? Les deux régimes de résolution répondent l'inverse, et
 * les deux ont raison :
 *
 * - `'hide'` — régime STRICT (`resolveForTargets`). Le résolveur rend une entrée
 *   par id qu'on lui passe ; une entrée absente est donc une anomalie, et une
 *   porte de confidentialité refuse par défaut.
 * - `'reveal'` — régime PREFS-ONLY (`resolvePrefsOnly`). Une entrée absente est
 *   la situation NORMALE : un participant anonyme n'a pas de `userId`, donc pas
 *   de préférences, et doit rester visible. Seule une préférence explicitement
 *   négative masque.
 *
 * Confondre les deux ne casse rien de visible : cela masque des anonymes, ou
 * révèle des inconnus. C'est précisément pourquoi le choix est ici EXPLICITE.
 */
export type PresenceMissingEntryPolicy = 'hide' | 'reveal';

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
 */
export const applyPresenceVisibilityAsOffline = <
  T extends { isOnline: boolean | null; lastActiveAt?: Date | null },
>(
  profile: T,
  visibility: PresenceVisibility | undefined,
  options?: { readonly onMissingEntry?: PresenceMissingEntryPolicy },
): Omit<T, 'isOnline'> & { isOnline: boolean } => {
  const effective =
    visibility ?? (options?.onMissingEntry === 'reveal' ? REVEALED : HIDDEN);

  return {
    ...profile,
    isOnline: effective.showOnline ? profile.isOnline === true : false,
    ...('lastActiveAt' in profile
      ? { lastActiveAt: effective.showLastSeenTimestamp ? profile.lastActiveAt ?? null : null }
      : {}),
  };
};
