import type { UserPresenceStatus } from '@/lib/api/types';

/**
 * LES TYPES PURS DU RÉSUMÉ VIVANT (#5695, étape 3) — miroir de
 * `Focal/Core/LivingSummaryModels.swift`. Domicile PROVISOIRE (§9 question
 * 1, D-24) : `src/lib/summary/` tant qu'aucun second client TypeScript ne
 * lit ces lois — l'amendement A2 (`LivingSummaryModels.swift:4-9`, « pas de
 * mirroir TypeScript ») a été pris quand aucun second client n'existait, la
 * v3.1 en est un.
 *
 * Les horloges sont des `number` (epoch ms), jamais des `Date` : c'est ce
 * qui rend les trois lois PURES et comparables sans horloge murale — même
 * parti que `presenceOf(participant, now: number)`.
 */

export type DigestMediaKind = 'image' | 'video' | 'audio' | 'file' | 'location';

/** Message vu par le segmenteur d'épisodes — miroir `EpisodeInputMessage`. */
export type EpisodeInputMessage = {
  readonly id: string;
  readonly senderId: string;
  /** epoch ms. */
  readonly createdAt: number;
  readonly replyToId: string | null;
  readonly isSystem: boolean;
};

/** Message vu par `buildDigest` — COMPOSE `EpisodeInputMessage`, ne le duplique pas. */
export type DigestInputMessage = EpisodeInputMessage & {
  readonly content: string;
  readonly languageCode: string | null;
  readonly attachmentKinds: readonly DigestMediaKind[];
  /**
   * ÉCART DÉCLARÉ (§1.4.2 de la spécification #5695) — iOS lit
   * `MeeshyMessage.trackedLinkMap.count`, un champ RÉEL absent de
   * `@meeshy/shared` (`grep -rn trackedLink packages/shared/types` = 0).
   * Ce champ compte ici les URL `https?://` du CONTENU (`assembly.ts`) —
   * rien n'affiche `media.links` cette itération (iOS non plus).
   */
  readonly linkCount: number;
  readonly mentionsViewer: boolean;
};

export type DigestParticipant = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly colorHex: string;
  readonly presence: UserPresenceStatus;
};

export type ConversationEpisode = {
  readonly id: string;
  /** epoch ms. */
  readonly start: number;
  /** epoch ms. */
  readonly end: number;
  readonly messageIds: readonly string[];
  readonly participantIds: readonly string[];
  readonly deterministicTitle: string;
  /** Toujours `null` — aucun agent ne titre encore un épisode (`EpisodeSegmenter.swift:174`). */
  readonly agentTitle: string | null;
};

export const displayTitle = (episode: ConversationEpisode): string =>
  episode.agentTitle ?? episode.deterministicTitle;

export const isAgentTitled = (episode: ConversationEpisode): boolean => episode.agentTitle !== null;

export type SenderTally = {
  readonly userId: string;
  readonly messageCount: number;
  /** epoch ms. Porté mais HORS tri (`DeterministicDigestBuilder.swift:72-79`). */
  readonly lastAt: number;
};

export type LanguageTally = {
  readonly code: string;
  readonly messageCount: number;
};

export type MediaTally = {
  readonly images: number;
  readonly videos: number;
  readonly audios: number;
  readonly files: number;
  readonly locations: number;
  readonly links: number;
};

export const EMPTY_MEDIA_TALLY: MediaTally = {
  images: 0,
  videos: 0,
  audios: 0,
  files: 0,
  locations: 0,
  links: 0,
};

export type AwaitingKind = 'mention' | 'directReply' | 'unansweredQuestion';

export type AwaitingItem = {
  readonly id: string;
  readonly kind: AwaitingKind;
  readonly fromUserId: string;
  /** Non vide par construction — voir `makeAwaitingItem`. */
  readonly evidenceMessageIds: readonly string[];
  /** epoch ms. */
  readonly at: number;
};

/**
 * `AwaitingItem.init?` (Swift) — rend `null` sur preuve vide plutôt que de
 * construire une ligne sans preuve (contrat §6.3 : « une ligne sans preuve
 * est rejetée à la construction, pas filtrée à l'affichage »).
 */
export function makeAwaitingItem(input: {
  readonly id: string;
  readonly kind: AwaitingKind;
  readonly fromUserId: string;
  readonly evidenceMessageIds: readonly string[];
  readonly at: number;
}): AwaitingItem | null {
  if (input.evidenceMessageIds.length === 0) return null;
  return input;
}

export type DeterministicConversationDigest = {
  readonly messageCount: number;
  readonly participantCount: number;
  /** epoch ms, `null` sur fenêtre vide. */
  readonly start: number | null;
  /** epoch ms, `null` sur fenêtre vide. */
  readonly end: number | null;
  readonly topSenders: readonly SenderTally[];
  readonly languages: readonly LanguageTally[];
  readonly media: MediaTally;
  readonly awaitingYou: readonly AwaitingItem[];
  readonly episodes: readonly ConversationEpisode[];
  /** `false` ⇒ la fenêtre chargée ne couvre PAS tout le non-lu. */
  readonly isComplete: boolean;
};

export type FaceRampEntry = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly colorHex: string;
  readonly presence: UserPresenceStatus;
  /** AFFICHÉ sur le badge — le nombre de messages qui attendent. */
  readonly awaitingCount: number;
  /** SERT AU TRI — jamais affiché. */
  readonly needScore: number;
  readonly evidenceMessageIds: readonly string[];
};

export type FaceRampRankingInput = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly colorHex: string;
  readonly presence: UserPresenceStatus;
  readonly mentionEvidence: readonly string[];
  readonly directReplyEvidence: readonly string[];
  readonly unansweredQuestionEvidence: readonly string[];
  /** epoch ms, `null` si aucune preuve. */
  readonly mostRecentEvidenceAt: number | null;
};
