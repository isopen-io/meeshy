/**
 * LE CATALOGUE DES DÉFIS DU JOUR (#9635) — rangé par les quatre buts du porteur : faire vivre la plateforme,
 * briser la timidité, apprendre les langues, faire connaître Meeshy.
 *
 * Chaque gabarit n'attend qu'un signal que la PASSERELLE établit elle-même (un geste crédité, ou un fait posé
 * au point unique du geste), et déclare :
 *  - son objectif : `baseTarget` sans profil connu, sinon tiré des habitudes du compte (`habit`), toujours
 *    borné par `minTarget` / `maxTarget` ;
 *  - ce qu'il paie : `unitPoints` par unité d'objectif en plus de la base de sa difficulté (la Gloire ne se fixe
 *    pas ici : elle se lit dans `MISSION_GLORY`, voir `missionGlory`) ;
 *  - ce qu'il exige du profil (`requires`) : un défi impossible pour un compte n'est pas tiré pour lui ;
 *  - son poids de tirage (`weight`, 4 par défaut ; un défi rare pèse 1).
 *
 * Des LITTÉRAUX purs, sans appel : la première peinture du web importe le module de la loi, et un tableau
 * construit par appels de fonction y resterait même inutilisé.
 */

import type { EngagementOperationKey } from '../../types/engagement-operations.js';

export const MISSION_GOALS = ['animate', 'courage', 'languages', 'reach'] as const;
export type MissionGoal = (typeof MISSION_GOALS)[number];

/** Ce qu'un défi peut exiger du profil. */
export const MISSION_CAPABILITIES = ['contacts', 'active-conversations', 'communities', 'multilingual'] as const;
export type MissionCapability = (typeof MISSION_CAPABILITIES)[number];

/** Les faits que la passerelle pose au point unique du geste, hors des axes d'engagement. */
export const MISSION_FACT_SIGNALS = [
  'reply-distinct-conversations',
  'foreign-language-message',
  'replies-received-distinct-authors',
  'reel-published',
  'conversation-started',
  'story-reply',
  'comment-others-post',
  'comment-stranger-public-post',
  'cross-language-exchange',
  'reply-in-their-language',
] as const;
export type MissionFactSignal = (typeof MISSION_FACT_SIGNALS)[number];

/** Un geste CRÉDITÉ (`EngagementService.recordActivity`) : `axis:<clé d'opération>`. */
export type AxisMissionSignal = `axis:${EngagementOperationKey}`;
export type MissionSignal = AxisMissionSignal | MissionFactSignal;

export type MissionTemplateDifficulty = 'easy' | 'medium' | 'hard' | 'gold';

export type MissionTemplate = {
  readonly key: string;
  readonly difficulty: MissionTemplateDifficulty;
  readonly goal: MissionGoal;
  readonly signal: MissionSignal;
  /** L'objectif quand le profil n'est pas connu, avant la bande de niveau. */
  readonly baseTarget: number;
  readonly minTarget: number;
  readonly maxTarget: number;
  /** Le compteur d'engagement dont la moyenne quotidienne règle l'objectif ; `ratio` quand ce n'est qu'un indice. */
  readonly habit?: { readonly operation: EngagementOperationKey; readonly ratio?: number };
  /** Points par unité d'objectif, en plus de la base de la difficulté. */
  readonly unitPoints: number;
  /** Défi de langue : le jour du Prisme en garantit un. */
  readonly prism?: boolean;
  readonly weight?: number;
  readonly requires?: readonly MissionCapability[];
};

const TEXT_HABIT = { operation: 'content.text_message', ratio: 0.2 } as const;

export const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  // Faire vivre la plateforme
  { key: 'send-texts', difficulty: 'easy', goal: 'animate', signal: 'axis:content.text_message', baseTarget: 5, minTarget: 1, maxTarget: 15, unitPoints: 15, habit: { operation: 'content.text_message' } },
  { key: 'send-attachments', difficulty: 'easy', goal: 'animate', signal: 'axis:tool.attachment', baseTarget: 2, minTarget: 1, maxTarget: 6, unitPoints: 16, habit: { operation: 'tool.attachment' } },
  { key: 'react-messages', difficulty: 'easy', goal: 'animate', signal: 'axis:tool.reaction', baseTarget: 5, minTarget: 1, maxTarget: 15, unitPoints: 8, habit: { operation: 'tool.reaction' }, requires: ['contacts'] },
  { key: 'react-posts', difficulty: 'easy', goal: 'animate', signal: 'axis:tool.post_reaction', baseTarget: 5, minTarget: 1, maxTarget: 15, unitPoints: 6, habit: { operation: 'tool.post_reaction' } },
  { key: 'use-stickers', difficulty: 'easy', goal: 'animate', signal: 'axis:tool.sticker', baseTarget: 2, minTarget: 1, maxTarget: 6, unitPoints: 6, habit: { operation: 'tool.sticker' } },
  { key: 'comment-text', difficulty: 'medium', goal: 'animate', signal: 'comment-others-post', baseTarget: 3, minTarget: 1, maxTarget: 6, unitPoints: 190, habit: { operation: 'comment.text' } },
  { key: 'publish-story', difficulty: 'medium', goal: 'animate', signal: 'axis:content.story', baseTarget: 1, minTarget: 1, maxTarget: 2, unitPoints: 560, habit: { operation: 'content.story' } },
  { key: 'publish-post', difficulty: 'medium', goal: 'animate', signal: 'axis:content.post', baseTarget: 1, minTarget: 1, maxTarget: 1, unitPoints: 920 },
  { key: 'reply-story', difficulty: 'medium', goal: 'animate', signal: 'story-reply', baseTarget: 1, minTarget: 1, maxTarget: 3, unitPoints: 15, requires: ['contacts'] },
  { key: 'reply-conversations', difficulty: 'medium', goal: 'animate', signal: 'reply-distinct-conversations', baseTarget: 3, minTarget: 1, maxTarget: 4, unitPoints: 15, habit: TEXT_HABIT, requires: ['contacts'] },
  { key: 'join-community', difficulty: 'medium', goal: 'animate', signal: 'axis:social.community_joined', baseTarget: 1, minTarget: 1, maxTarget: 1, unitPoints: 15 },
  { key: 'long-chat', difficulty: 'hard', goal: 'animate', signal: 'axis:content.text_message', baseTarget: 10, minTarget: 3, maxTarget: 40, unitPoints: 12, habit: { operation: 'content.text_message' } },
  { key: 'publish-posts', difficulty: 'hard', goal: 'animate', signal: 'axis:content.post', baseTarget: 2, minTarget: 2, maxTarget: 3, unitPoints: 950, habit: { operation: 'content.post' } },
  { key: 'publish-reel', difficulty: 'hard', goal: 'animate', signal: 'reel-published', baseTarget: 1, minTarget: 1, maxTarget: 1, unitPoints: 1840 },
  { key: 'voice-comments', difficulty: 'hard', goal: 'animate', signal: 'axis:comment.audio', baseTarget: 2, minTarget: 1, maxTarget: 3, unitPoints: 150, habit: { operation: 'comment.audio' } },
  { key: 'reply-conversations-wide', difficulty: 'hard', goal: 'animate', signal: 'reply-distinct-conversations', baseTarget: 6, minTarget: 2, maxTarget: 8, unitPoints: 15, habit: TEXT_HABIT, requires: ['active-conversations'] },
  { key: 'gold-reply-conversations', difficulty: 'gold', goal: 'animate', signal: 'reply-distinct-conversations', baseTarget: 8, minTarget: 3, maxTarget: 12, unitPoints: 15, habit: TEXT_HABIT, requires: ['active-conversations'] },
  { key: 'gold-replies-received', difficulty: 'gold', goal: 'animate', signal: 'replies-received-distinct-authors', baseTarget: 4, minTarget: 2, maxTarget: 6, unitPoints: 25, requires: ['active-conversations'] },

  // Briser la timidité
  { key: 'send-voice', difficulty: 'easy', goal: 'courage', signal: 'axis:content.audio_message', baseTarget: 1, minTarget: 1, maxTarget: 5, unitPoints: 20, habit: { operation: 'content.audio_message' } },
  { key: 'write-someone-new', difficulty: 'medium', goal: 'courage', signal: 'axis:conversation.private', baseTarget: 1, minTarget: 1, maxTarget: 3, unitPoints: 20 },
  { key: 'start-conversation', difficulty: 'medium', goal: 'courage', signal: 'conversation-started', baseTarget: 1, minTarget: 1, maxTarget: 2, unitPoints: 25 },
  { key: 'community-hello', difficulty: 'medium', goal: 'courage', signal: 'axis:conversation.community', baseTarget: 1, minTarget: 1, maxTarget: 2, unitPoints: 20, requires: ['communities'] },
  { key: 'comment-stranger-post', difficulty: 'medium', goal: 'courage', signal: 'comment-stranger-public-post', baseTarget: 1, minTarget: 1, maxTarget: 3, unitPoints: 175 },

  // Apprendre les langues
  { key: 'prism-foreign-messages', difficulty: 'medium', goal: 'languages', signal: 'foreign-language-message', baseTarget: 2, minTarget: 1, maxTarget: 6, unitPoints: 15, prism: true, requires: ['multilingual'] },
  { key: 'cross-language-chat', difficulty: 'medium', goal: 'languages', signal: 'cross-language-exchange', baseTarget: 1, minTarget: 1, maxTarget: 3, unitPoints: 20, prism: true, requires: ['contacts'] },
  { key: 'prism-foreign-exchange', difficulty: 'hard', goal: 'languages', signal: 'foreign-language-message', baseTarget: 5, minTarget: 2, maxTarget: 15, unitPoints: 15, prism: true, requires: ['multilingual'] },
  { key: 'reply-their-language', difficulty: 'hard', goal: 'languages', signal: 'reply-in-their-language', baseTarget: 1, minTarget: 1, maxTarget: 5, unitPoints: 25, prism: true, requires: ['multilingual', 'contacts'] },

  // Faire connaître Meeshy
  { key: 'create-invite-link', difficulty: 'easy', goal: 'reach', signal: 'axis:social.affiliate_link_created', baseTarget: 1, minTarget: 1, maxTarget: 1, unitPoints: 10 },
  { key: 'share-link', difficulty: 'medium', goal: 'reach', signal: 'axis:social.share', baseTarget: 1, minTarget: 1, maxTarget: 3, unitPoints: 30, habit: { operation: 'social.share' } },
  { key: 'invite-contact', difficulty: 'medium', goal: 'reach', signal: 'axis:social.email_invite', baseTarget: 1, minTarget: 1, maxTarget: 3, unitPoints: 20 },
  { key: 'invite-joined', difficulty: 'gold', goal: 'reach', signal: 'axis:social.invite_joined', baseTarget: 1, minTarget: 1, maxTarget: 1, unitPoints: 400, weight: 1 },
];
