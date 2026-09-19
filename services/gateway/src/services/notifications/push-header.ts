/**
 * Composition du HEADER de push (titre, sous-titre, catégorie iOS) et son
 * dédoublonnage contre le corps — extrait de `NotificationService.ts` (#7093,
 * cf. `tasks/lessons.md`). Fonctions PURES, sans effet de bord.
 */

import type { NotificationActor, NotificationType } from '@meeshy/shared/types/notification';

/**
 * Resolve the best available name for a notification actor:
 * displayName first, then username, then a neutral fallback.
 */
function resolveActorName(actor: NotificationActor | undefined): string {
  return actor?.displayName?.trim() || actor?.username?.trim() || 'Meeshy';
}

/**
 * GW4 — native iOS category set by the PRODUCER (the NSE `applyCategory`
 * stays as fallback for legacy payloads). Mirrors the NSE type mapping with
 * one deliberate divergence: the CALL family is split into
 * `MEESHY_CALL_INCOMING` (answer/decline) vs `MEESHY_CALL_MISSED`
 * (callback/view) so a finished call never shows an "Answer" action.
 * Unknown types return undefined — no category means no misleading actions.
 */
export function pushCategoryForNotificationType(type: NotificationType): string | undefined {
  switch (type) {
    case 'new_message':
    case 'message_reply':
    case 'reply':
    case 'message_forwarded':
    case 'message_reaction':
    case 'reaction':
    case 'new_conversation':
    case 'new_conversation_direct':
    case 'new_conversation_group':
    case 'added_to_conversation':
      return 'MEESHY_MESSAGE';
    case 'mention':
    case 'user_mentioned':
      return 'MEESHY_MENTION';
    case 'friend_request':
    case 'contact_request':
      return 'MEESHY_FRIEND_REQUEST';
    case 'post_like':
    case 'post_comment':
    case 'post_repost':
    case 'story_reaction':
    case 'status_reaction':
    case 'comment_like':
    case 'comment_reply':
    case 'comment_reaction':
    case 'story_new_comment':
    case 'story_thread_reply':
    case 'friend_story_comment':
    case 'friend_new_story':
    case 'friend_new_post':
    case 'friend_new_mood':
      return 'MEESHY_SOCIAL';
    case 'incoming_call':
      return 'MEESHY_CALL_INCOMING';
    case 'missed_call':
    case 'call_ended':
    case 'call_declined':
    case 'call_recording_ready':
      return 'MEESHY_CALL_MISSED';
    default:
      return undefined;
  }
}

/**
 * Build the APN/FCM push header (title + optional subtitle) for a notification.
 *
 * Keeps the title focused on the sender so iOS Communication Notifications
 * (`INSendMessageIntent.donate`) can rewrite the banner around the sender's
 * INPerson without losing the conversation name. The conversation name is
 * carried in a separate `subtitle` field — APN-native, displayed by iOS
 * between title and body and untouched by Communication Intent donation.
 *
 * Conversation-scoped notifications (messages, mentions, reactions) get the
 * conversation name as subtitle when the conversation is a group/global chat
 * — the recipient must know WHICH group the activity happened in. System
 * events keep the title-only layout where the actor name is the natural focus.
 *
 * Exported for unit testing — the helper is pure and side-effect free.
 */
const CONVERSATION_SUBTITLE_TYPES = new Set([
  'new_message',
  'user_mentioned',
  'message_reaction',
]);

/** Longueur au-delà de laquelle une bannière iOS 3 lignes coupe de toute façon. */
const PUSH_SUBTITLE_MAX_LENGTH = 120;

export function buildPushHeader(input: {
  type: string;
  customTitle?: string;
  actor?: NotificationActor;
  context: {
    conversationType?: string | null;
    conversationTitle?: string | null;
  };
  /**
   * Fragment d'action localisé, SANS l'acteur (« a commenté un réel ») —
   * `NotificationDisplay.action`. Présent pour les notifications sociales,
   * `null` pour les messages / appels / système.
   *
   * Il existe parce qu'iOS réécrit le titre d'une Communication Notification
   * avec le `displayName` de l'`INPerson` expéditeur : le titre riche persisté
   * n'atteindrait jamais l'écran. L'action passe donc par le subtitle.
   */
  action?: string | null;
  /** Sous-titre d'entité persisté (cible du geste), quand la ligne en porte un. */
  entitySubtitle?: string | null;
}): { title: string; subtitle: string | undefined } {
  const isMessage = CONVERSATION_SUBTITLE_TYPES.has(input.type);
  const conversationType = input.context.conversationType?.trim() || '';
  const conversationTitle = input.context.conversationTitle?.trim() || '';
  const isGroupMessage = isMessage
    && conversationType !== ''
    && conversationType !== 'direct';

  const actorName = resolveActorName(input.actor);
  const title = input.customTitle?.trim() || actorName;
  // Le subtitle ne porte que le NOM CANONIQUE du groupe — l'icône de type et le
  // renommage local (customName) sont résolus CÔTÉ CLIENT (NSE + toast), en
  // Local-First, depuis les préférences locales (cf. ConversationSnapshot App
  // Group). Le gateway ne recompose pas la présentation systématiquement.
  const conversationSubtitle = isGroupMessage && conversationTitle !== ''
    ? conversationTitle
    : undefined;

  // Ordre : action sociale → cible explicite → nom de conversation.
  //
  // L'action se suffit à elle-même : l'auteur du contenu y est déjà fusionné
  // (« a commenté un réel DE WINDIE NH ») et l'aperçu du contenu visé occupe
  // le CORPS. Y adjoindre la cible reproduirait, sur trois lignes, la même
  // information écrite deux fois — le défaut signalé sur les réactions.
  const action = input.action?.trim() || '';
  const entity = input.entitySubtitle?.trim() || '';
  const subtitle = (action || entity || conversationSubtitle || '').slice(0, PUSH_SUBTITLE_MAX_LENGTH)
    || undefined;

  return { title, subtitle };
}

/**
 * La bannière ne dit jamais deux fois la même phrase.
 *
 * `buildPushHeader` promeut l'ACTION en subtitle ; le corps du push est le
 * `content` PERSISTÉ. Les deux sont légitimes et, la plupart du temps,
 * différents — l'action au-dessus, l'aperçu du contenu en dessous. Mais pour
 * une story / un post / un réel SANS excerpt, `content` retombe justement sur
 * la phrase d'action (« a publié une nouvelle story »), parce que la ligne de
 * la LISTE in-app n'a pas de sous-titre pour la porter et ne doit jamais être
 * vide — invariant explicite, tenu par
 * `NotificationService.friendcontent.test.ts`. La bannière affichait alors la
 * même phrase deux fois (signalé par le porteur produit le 2026-08-22).
 *
 * Le dédoublonnage se fait ICI, au seul point où les deux lignes se
 * rencontrent : ni le contenu persisté (la liste en a besoin) ni
 * `buildPushHeader` (le toast Socket.IO consomme son subtitle) ne bougent.
 *
 * **C'est le SUBTITLE qui tombe, jamais le corps** : le corps part aussi vers
 * FCM (bloc `notification`) et WebPush, où le subtitle n'existe pas — le vider
 * exposerait trois plateformes à une alerte sans texte pour ne corriger qu'iOS.
 *
 * Seul le doublon EXACT (aux espaces de bord près) est supprimé : le corps est
 * tronqué à 200 et le subtitle à 120, donc un subtitle qui n'est qu'un préfixe
 * du corps porte peut-être une information de plus — le faire disparaître
 * cacherait du texte au lieu d'en dédoublonner.
 *
 * Exporté pour test unitaire — la fonction est pure.
 */
export function dedupePushSubtitle(input: {
  subtitle?: string;
  body: string;
}): string | undefined {
  const subtitle = input.subtitle?.trim();
  if (!subtitle) return undefined;
  return subtitle === input.body.trim() ? undefined : input.subtitle;
}
