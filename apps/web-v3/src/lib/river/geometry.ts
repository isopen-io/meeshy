/**
 * `geometry.ts` — le pont PUR entre le fil d'une conversation (`Message`) et
 * la loi de la Rivière (`@meeshy/shared/utils/river-lanes`), #5696 (travail
 * `river`) étape 3.
 *
 * Miroir de `RiverConversationMapping` (Core, `apps/ios/Meeshy/Features/
 * Main/Riviere/Core/RiverConversationMapping.swift`) — fonction par
 * fonction, mêmes noms en anglais. Zéro pixel, zéro loi réécrite : ce
 * fichier ne fait QUE des conversions de type entre le monde `Message` du
 * web et les entrées pures de `river-lanes.ts`, exactement comme
 * `summary/assembly.ts::episodeInput` le fait pour `episodes.ts`.
 *
 * CE QUI EST REPRIS : tout le `Core` iOS. CE QUI EST ADAPTÉ : `isDeleted`
 * (Swift) devient `deletedAt !== undefined` (`Message` partagé n'a pas de
 * booléen, `packages/shared/types/conversation.ts:125` — même lecture que
 * `reading-mode/protection.ts:51`) ; `senderName ?? senderUsername ??
 * senderId` devient `sender?.displayName ?? senderId` (`senderName` est
 * `@deprecated`, `conversation.ts:208`). CE QUI N'EST PAS PORTÉ :
 * `horizontalOffset` (n'existe que parce que `ScrollViewProxy.scrollTo` ne
 * bouge qu'un axe — `scrollLeft` est adressable directement sur le web,
 * `targets/riviere.md:175`).
 *
 * Ce module N'EST IMPORTÉ PAR AUCUN module de production à ce jour (§7 de
 * la spécification) : `river` reste hors `THREAD_RENDERABLE_MODES`
 * (`src/lib/reading-mode/decision.ts`). Il n'entre donc dans AUCUN chunk —
 * la mesure de première peinture ne bouge pas.
 */
import {
  resolveRiverLanes,
  RIVER_LANE_SILENCE_WINDOW_MS,
  RIVER_MAX_LANES,
  type ResolveRiverLanesInput,
  type RiverBubble,
  type RiverCursor,
  type RiverGeometry,
  type RiverParticipantInput,
} from '@meeshy/shared/utils/river-lanes';

import type { Message } from '@/lib/api/types';

export type RiverLanesOptions = {
  readonly silenceWindowMs?: number;
  /**
   * Décalage UTC du calendrier du LECTEUR, en minutes —
   * `-new Date().getTimezoneOffset()` chez l'appelant, jamais lu ici (loi
   * pure).
   */
  readonly dayBoundaryOffsetMinutes?: number;
};

/** Une VOIX : ni un avis système, ni un message supprimé. Miroir de `RiverConversationMapping.isVoice`. */
export const isRiverVoice = (message: Message): boolean =>
  message.messageSource !== 'system' && message.deletedAt === undefined;

/** Miroir de `RiverConversationMapping.displayName(of:)` — `senderName ?? senderUsername ?? senderId` devient `sender?.displayName ?? senderId`. */
export const riverDisplayName = (message: Message): string => message.sender?.displayName ?? message.senderId;

/**
 * Les participants DÉRIVÉS des expéditeurs qui sont des voix — dernier nom
 * connu (le dernier message d'un expéditeur GAGNE), ordre de PREMIÈRE
 * apparition. Un auteur d'avis qui n'a jamais parlé n'y figure pas : la loi
 * ne lui fera naître aucune branche, sa graine de couleur n'aurait servi à
 * rien.
 */
export function riverParticipants(messages: readonly Message[]): readonly RiverParticipantInput[] {
  const displayNameById = new Map<string, string>();
  const order: string[] = [];

  for (const message of messages) {
    if (!isRiverVoice(message)) continue;
    if (!displayNameById.has(message.senderId)) order.push(message.senderId);
    displayNameById.set(message.senderId, riverDisplayName(message));
  }

  return order.map((id) => ({ id, displayName: displayNameById.get(id) ?? id }));
}

/**
 * Ce que la loi doit voir : TOUT ce qui a un rang dans le temps — les voix
 * ET les avis (marqués `isSystem`). Seuls les messages SUPPRIMÉS restent
 * dehors (une bulle vide ferait un rang vide) — miroir de `lanesInput`.
 */
export function riverLanesInput(
  messages: readonly Message[],
  viewerId: string,
  options: RiverLanesOptions = {},
): ResolveRiverLanesInput {
  const ranked = messages.filter((message) => message.deletedAt === undefined);

  return {
    messages: ranked.map((message) => ({
      id: message.id,
      senderId: message.senderId,
      createdAt: message.createdAt,
      replyToMessageId: message.replyToId ?? null,
      isSystem: message.messageSource === 'system',
    })),
    participants: riverParticipants(ranked),
    viewerId,
    ...(options.silenceWindowMs === undefined ? {} : { silenceWindowMs: options.silenceWindowMs }),
    ...(options.dayBoundaryOffsetMinutes === undefined
      ? {}
      : { dayBoundaryOffsetMinutes: options.dayBoundaryOffsetMinutes }),
  };
}

/**
 * L'échelle des fenêtres essayées, du plus large au plus serré — miroir de
 * `RiverConversationMapping.silenceWindowLadder` : une conversation qui
 * s'étale sur des jours garde ses voix côte à côte, une conversation en
 * rafale se resserre jusqu'à la minute. Le défaut de la loi
 * (`RIVER_LANE_SILENCE_WINDOW_MS`) y figure comme un barreau parmi d'autres
 * — IMPORTÉ, jamais recopié (garde R15).
 */
export const SILENCE_WINDOW_LADDER_MS: readonly number[] = [
  7 * 24 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  60 * 60 * 1000,
  RIVER_LANE_SILENCE_WINDOW_MS,
  10 * 60 * 1000,
  5 * 60 * 1000,
  2 * 60 * 1000,
  60 * 1000,
  30 * 1000,
];

/**
 * **La fenêtre de silence ne peut pas être une constante — et elle ne peut
 * pas non plus être devinée.** Miroir de `RiverConversationMapping.
 * resolveGeometry` : on rejoue la loi (pure) sur `SILENCE_WINDOW_LADDER_MS`,
 * on ne retient que les barreaux qui donnent un plan à COULOIRS
 * (`layout === 'lanes'`), on garde celui qui aligne le PLUS de colonnes
 * (`>` strict — à égalité, le plus LARGE gagne, car il est essayé en
 * premier), et on s'arrête dès que `laneCount >= RIVER_MAX_LANES`. Si aucun
 * barreau ne donne un plan à couloirs, on rend la loi à sa fenêtre PAR
 * DÉFAUT — plutôt qu'un nombre fabriqué qui prétendrait avoir essayé.
 */
export function resolveRiverGeometry(
  messages: readonly Message[],
  viewerId: string,
  options: Pick<RiverLanesOptions, 'dayBoundaryOffsetMinutes'> = {},
): RiverGeometry {
  const base = riverLanesInput(messages, viewerId, options);
  let best: RiverGeometry | null = null;

  /*
   * Le mapping (filtre des supprimés, roster, conversion des rangs) est fait
   * UNE fois : seule `silenceWindowMs` change d'un barreau à l'autre. iOS
   * rappelle `lanesInput` à chaque tour (`RiverConversationMapping.swift:
   * 133-136`) et paie donc dix balayages du fil ; ici la recherche reste en
   * O(N) — le rendu (travail 2) la rejoue à chaque arrivée de message sur un
   * fil qui peut compter des milliers de rangs.
   */
  for (const window of SILENCE_WINDOW_LADDER_MS) {
    const candidate = resolveRiverLanes({ ...base, silenceWindowMs: window });
    if (candidate.layout !== 'lanes') continue;
    if (best === null || candidate.laneCount > best.laneCount) {
      best = candidate;
    }
    if (candidate.laneCount >= RIVER_MAX_LANES) break;
  }

  return best ?? resolveRiverLanes(base);
}

export type RiverGroupPosition = 'solo' | 'head' | 'middle' | 'tail';

/** Le bord haut est la jointure pointillée avec la bulle précédente. */
export const joinsAbove = (position: RiverGroupPosition): boolean => position === 'middle' || position === 'tail';
/** Le bord bas reste ouvert : la bulle suivante vient s'y coller. */
export const joinsBelow = (position: RiverGroupPosition): boolean => position === 'head' || position === 'middle';

/**
 * Position de groupe de CHAQUE bulle, déduite de la loi seule — miroir de
 * `RiverConversationMapping.groupPositions` : la tête est `isFirstInGroup`
 * (ou un avis système, qui ouvre TOUJOURS un groupe) ; la bulle est SUIVIE
 * dans son groupe si le rang suivant n'ouvre pas de groupe et n'est pas un
 * avis. Un avis système coupe donc toujours le groupe qui le précède.
 */
export function groupPositions(bubbles: readonly RiverBubble[]): ReadonlyMap<string, RiverGroupPosition> {
  const positions = new Map<string, RiverGroupPosition>();

  bubbles.forEach((bubble, index) => {
    const next = bubbles[index + 1];
    const isHead = bubble.isFirstInGroup || bubble.isSystem;
    const isFollowed = next !== undefined && !next.isFirstInGroup && !next.isSystem;
    const position: RiverGroupPosition = isHead
      ? isFollowed
        ? 'head'
        : 'solo'
      : isFollowed
        ? 'middle'
        : 'tail';
    positions.set(bubble.messageId, position);
  });

  return positions;
}

/**
 * R-6 — la citation mène à sa cible : le curseur du message cité. `null` si
 * le message n'est pas dans la fenêtre, ou s'il est un avis système (la loi
 * ne lui donne aucun couloir — il n'est la cible de personne).
 */
export function cursorForMessageId(messageId: string, geometry: RiverGeometry): RiverCursor | null {
  const bubble = geometry.bubbles.find((candidate) => candidate.messageId === messageId);
  if (bubble === undefined || bubble.isSystem) return null;
  return { laneIndex: bubble.laneIndex, rank: bubble.rank };
}

/** Curseur d'ouverture : la bulle la plus RÉCENTE, sinon la rive du lecteur au premier rang. */
export function initialCursor(geometry: RiverGeometry): RiverCursor {
  const last = geometry.bubbles.reduce<RiverBubble | undefined>(
    (best, bubble) => (best === undefined || bubble.rank > best.rank ? bubble : best),
    undefined,
  );
  return last === undefined ? { laneIndex: 0, rank: 0 } : { laneIndex: last.laneIndex, rank: last.rank };
}

/** « Au présent » : le curseur porte le rang de la bulle la plus RÉCENTE. Une rivière vide n'a rien à rattraper. */
export function isAtPresent(cursor: RiverCursor, geometry: RiverGeometry): boolean {
  if (geometry.bubbles.length === 0) return false;
  const mostRecentRank = geometry.bubbles.reduce((max, bubble) => Math.max(max, bubble.rank), -Infinity);
  return cursor.rank === mostRecentRank;
}
