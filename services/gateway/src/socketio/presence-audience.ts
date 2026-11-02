import type { RelationLevel } from '@meeshy/shared/types/relation';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';

/**
 * Qui reçoit une transition de présence (`user:status`), et avec quelle charge.
 *
 * Directive produit (2026-08-25) : « Lorsqu'on n'est pas ami (aucune connexion) :
 * je veux supprimer ma présence en ligne — c'est seulement quand on m'écrit et
 * que je réponds que la personne saura que je suis en ligne, et personne ne doit
 * savoir ma dernière connexion sur l'application si on n'est pas ami. Les
 * utilisateurs avec le rôle ADMIN et supérieur peuvent constamment avoir l'état
 * de présence. »
 *
 * L'audience est donc faite de RELATIONS, jamais de fils : amis acceptés,
 * administrateurs globaux, et les autres appareils du sujet.
 *
 * L'AMI est BINAIRE (directive porteur 2026-10-31, #13928) : il reçoit « en
 * ligne » ou rien, jamais `lastActiveAt`. Seuls les PROCHES et au-dessus
 * reçoivent la présence détaillée. L'audience se scinde donc selon le niveau,
 * et ce qu'un niveau obtient se demande à la loi partagée
 * (`resolvePresenceVisibility`), jamais à une comparaison de niveaux ici. Une room
 * `conversation:<id>` n'y a plus sa place — c'était l'adresse qui livrait la
 * présence à un inconnu au seul motif qu'il partageait un salon.
 *
 * Le module est PUR : il ne connaît ni Prisma ni Socket.IO. L'appelant lui
 * apporte les deux listes qu'une requête bornée rend (amis du sujet,
 * administrateurs de la plateforme) et reçoit des noms de rooms.
 *
 * @see packages/shared/utils/presence-visibility.ts (la loi que ce module projette)
 * @see services/gateway/src/services/PresenceVisibilityService.ts
 */
export type PresenceAudienceInput = {
  /** `User.id` pour un inscrit, `Participant.id` pour un invité de lien. */
  readonly subjectId: string;
  readonly isAnonymous: boolean;
  /** Amitiés ACCEPTÉES du sujet, avec le NIVEAU effectif de chaque lien. */
  readonly friendLevels: ReadonlyMap<string, RelationLevel>;
  /** `User.id` des ADMIN/BIGBOSS de la plateforme. */
  readonly adminIds: readonly string[];
};

export type PresenceStatusAudience = {
  /**
   * Rooms des lecteurs que la loi partagée met en FULL — administrateurs
   * globaux et le sujet lui-même. Leur charge ignore les préférences.
   */
  readonly privilegedRooms: string[];
  /**
   * Rooms des AMIS (niveau Ami exactement). Leur charge est « en ligne » sans
   * dernière connexion, quelles que soient les préférences de la cible.
   */
  readonly friendRooms: string[];
  /**
   * Rooms des PROCHES et au-dessus. Leur charge est gouvernée par
   * `showOnlineStatus` / `showLastSeen`.
   */
  readonly closeRooms: string[];
};

/**
 * Les deux sous-ensembles d'audience, dédupliqués, le privilégié l'emportant.
 *
 * Un ami qui est AUSSI administrateur n'apparaît qu'une fois : sans cela il
 * recevrait deux charges du même fait, et la plus pauvre des deux (celle des
 * préférences) contredirait la plus riche. La déduplication est ici et non chez
 * l'appelant parce que c'est ELLE qui garantit qu'un socket ne voit jamais deux
 * versions divergentes de la même transition.
 *
 * L'invité de lien n'a par construction aucune amitié — il n'a pas de compte —
 * donc son audience se réduit aux administrateurs. Il ne s'adresse pas non plus
 * à lui-même : sa session est unique, et « aucun broadcast hors ADMIN/BIGBOSS »
 * est ce que la directive dit d'une identité sans relation.
 */
export function presenceStatusAudience(input: PresenceAudienceInput): PresenceStatusAudience {
  const privileged = uniqueIds(
    input.isAnonymous ? input.adminIds : [...input.adminIds, input.subjectId],
  );
  const alreadyPrivileged = new Set(privileged);
  const friends = input.isAnonymous
    ? []
    : uniqueIds([...input.friendLevels.keys()]).filter((id) => !alreadyPrivileged.has(id));

  const verdicts = friends.map((id) => ({
    id,
    ...resolvePresenceVisibility({
      isSelf: false,
      viewerRole: 'USER',
      relationLevel: input.friendLevels.get(id) ?? 'PUBLIC',
      targetShowOnlineStatus: true,
      targetShowLastSeen: true,
      targetIsDeactivated: false,
      isBlockedEitherWay: false,
    }),
  }));
  const roomsOf = (keep: (v: (typeof verdicts)[number]) => boolean): string[] =>
    verdicts.filter(keep).map((v) => ROOMS.user(v.id));

  return {
    privilegedRooms: privileged.map(ROOMS.user),
    friendRooms: roomsOf((v) => v.showOnline && !v.showLastSeenTimestamp),
    closeRooms: roomsOf((v) => v.showLastSeenTimestamp),
  };
}

/** Dédoublonne en conservant l'ordre d'arrivée ; un id vide n'est pas une room. */
const uniqueIds = (ids: readonly string[]): string[] =>
  [...new Set(ids)].filter((id) => id !== '');

/**
 * Une charge à émettre : les rooms qui la reçoivent, et la dernière connexion
 * qu'elle porte.
 *
 * `lastActiveAt` voyage À CÔTÉ d'`isOnline` et n'est pas gouverné par la même
 * préférence — c'est précisément le champ qu'un gate posé sur le seul
 * `isOnline` laisse partir intact.
 */
export type PresenceStatusEmission = {
  readonly rooms: string[];
  readonly lastActiveAt: Date | null;
};

export type PresenceEmissionInput = PresenceAudienceInput & {
  readonly lastActiveAt: Date | null;
  readonly showOnlineStatus: boolean;
  readonly showLastSeen: boolean;
};

/**
 * La décision « quelle charge pour quel sous-ensemble », en une fonction.
 *
 * Deux charges au plus, jamais une seule aplatie : `showOnlineStatus = false`
 * doit taire la présence pour les AMIS sans la taire pour les administrateurs,
 * que la loi partagée met en FULL, ni pour les autres appareils du sujet. Un
 * `return` précoce sur cette préférence — la forme précédente — coupait les
 * trois d'un coup.
 *
 * Un sous-ensemble vide ne produit AUCUNE charge : `io.to([])` n'adresse
 * personne, mais une charge fabriquée pour zéro room fait croire à l'appelant
 * qu'une émission a eu lieu.
 */
export function presenceStatusEmissions(input: PresenceEmissionInput): PresenceStatusEmission[] {
  const { privilegedRooms, friendRooms, closeRooms } = presenceStatusAudience(input);

  const privileged: PresenceStatusEmission[] = privilegedRooms.length > 0
    ? [{ rooms: privilegedRooms, lastActiveAt: input.lastActiveAt }]
    : [];
  if (!input.showOnlineStatus) return privileged;

  const closeSeenAt = input.showLastSeen ? input.lastActiveAt : null;
  const close: PresenceStatusEmission[] = closeRooms.length > 0
    ? [{ rooms: closeRooms, lastActiveAt: closeSeenAt }]
    : [];
  const friends: PresenceStatusEmission[] = friendRooms.length > 0
    ? [{ rooms: friendRooms, lastActiveAt: null }]
    : [];

  return [...privileged, ...mergeSamePayload([...close, ...friends])];
}

/**
 * Deux sous-ensembles dont la charge est IDENTIQUE partent en une seule
 * émission : quand la dernière connexion est tue pour les proches
 * (`showLastSeen = false`), proches et amis reçoivent la même chose.
 */
const mergeSamePayload = (emissions: PresenceStatusEmission[]): PresenceStatusEmission[] =>
  emissions.reduce<PresenceStatusEmission[]>((merged, emission) => {
    const twin = merged.find((m) => m.lastActiveAt?.getTime() === emission.lastActiveAt?.getTime());
    return twin
      ? merged.map((m) => (m === twin ? { rooms: [...m.rooms, ...emission.rooms], lastActiveAt: m.lastActiveAt } : m))
      : [...merged, emission];
  }, []);
