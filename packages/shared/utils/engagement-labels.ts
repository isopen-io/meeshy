/**
 * LES LIBELLÉS DES STREAKS & BADGES — les mots, dans les huit langues des
 * notifications (`NOTIFICATION_LANGUAGES`), écrits UNE fois.
 *
 * Trois surfaces les prononcent, et une seule les possède :
 *  - la PASSERELLE, qui compose le corps des quatre notifications de
 *    réengagement dans la langue du destinataire (`EngagementService` →
 *    `notificationString(lang, 'engagement.badgeEarned', { title })`) — elle
 *    y mettait la CLÉ STABLE de l'axe (« Badge débloqué : conversation.private
 *    · palier 10 », relevé en production le 2026-09-08) : une clé de catalogue
 *    est faite pour survivre à un renommage, pas pour être lue ;
 *  - la v3.1 web (`apps/web-v3/src/lib/view/progression.ts`), qui les importe ;
 *  - iOS (`Localizable.xcstrings`, clés `progression.axis.*` /
 *    `progression.achievement.*.title`), MIROIR gardé par
 *    `engagement-labels-mirror-parity.test.ts` — le catalogue Xcode ne peut
 *    pas importer ce module, il en est la projection, et le témoin rougit dès
 *    qu'un mot diverge.
 *
 * La CLÉ reste le contrat (`EngagementAxisKey`, `EngagementAchievementKey`) ;
 * le libellé est sa PROSE, et la prose se résout à la langue du LECTEUR
 * (`normalizeNotificationLanguage`, repli `fr`) — jamais celle de l'émetteur,
 * jamais l'anglais par défaut (Prisme Linguistique, face « cadrage »).
 */

import type { EngagementAchievementKey, EngagementAxisKey } from '../types/engagement.js';
import { normalizeNotificationLanguage, type NotificationLanguage } from './notification-strings.js';

type AxisLabels = Record<EngagementAxisKey, string>;
type AchievementLabels = Record<EngagementAchievementKey, { readonly title: string; readonly condition: string }>;

export const ENGAGEMENT_AXIS_LABELS: Record<NotificationLanguage, AxisLabels> = {
  fr: {
    'content.audio_message': 'Messages vocaux',
    'content.text_message': 'Messages texte',
    'content.post': 'Publications',
    'content.story': 'Stories',
    'content.reel': 'Réels',
    'comment.audio': 'Commentaires vocaux',
    'comment.text': 'Commentaires écrits',
    'conversation.private': 'Conversations privées',
    'conversation.public': 'Conversations publiques',
    'conversation.community': 'Conversations de communauté',
    'tool.sticker': 'Stickers posés',
    'tool.in_app_edit': 'Montages dans l’app',
    'tool.direct_publish': 'Publications directes',
    'social.tracked_link': 'Liens créés',
    'social.share': 'Contenus partagés',
    'social.invite_joined': 'Invités venus',
    'social.friendship': 'Amitiés nouées',
  },
  en: {
    'content.audio_message': 'Voice messages',
    'content.text_message': 'Text messages',
    'content.post': 'Posts',
    'content.story': 'Stories',
    'content.reel': 'Reels',
    'comment.audio': 'Voice comments',
    'comment.text': 'Written comments',
    'conversation.private': 'Private conversations',
    'conversation.public': 'Public conversations',
    'conversation.community': 'Community conversations',
    'tool.sticker': 'Stickers placed',
    'tool.in_app_edit': 'In-app edits',
    'tool.direct_publish': 'Direct publications',
    'social.tracked_link': 'Links created',
    'social.share': 'Shared content',
    'social.invite_joined': 'Invites who joined',
    'social.friendship': 'Friendships formed',
  },
  es: {
    'content.audio_message': 'Mensajes de voz',
    'content.text_message': 'Mensajes de texto',
    'content.post': 'Publicaciones',
    'content.story': 'Historias',
    'content.reel': 'Reels',
    'comment.audio': 'Comentarios de voz',
    'comment.text': 'Comentarios escritos',
    'conversation.private': 'Conversaciones privadas',
    'conversation.public': 'Conversaciones públicas',
    'conversation.community': 'Conversaciones de comunidad',
    'tool.sticker': 'Stickers colocados',
    'tool.in_app_edit': 'Ediciones en la app',
    'tool.direct_publish': 'Publicaciones directas',
    'social.tracked_link': 'Enlaces creados',
    'social.share': 'Contenido compartido',
    'social.invite_joined': 'Invitados que se unieron',
    'social.friendship': 'Amistades creadas',
  },
  pt: {
    'content.audio_message': 'Mensagens de voz',
    'content.text_message': 'Mensagens de texto',
    'content.post': 'Publicações',
    'content.story': 'Stories',
    'content.reel': 'Reels',
    'comment.audio': 'Comentários de voz',
    'comment.text': 'Comentários escritos',
    'conversation.private': 'Conversas privadas',
    'conversation.public': 'Conversas públicas',
    'conversation.community': 'Conversas de comunidade',
    'tool.sticker': 'Stickers colocados',
    'tool.in_app_edit': 'Edições no app',
    'tool.direct_publish': 'Publicações diretas',
    'social.tracked_link': 'Links criados',
    'social.share': 'Conteúdo compartilhado',
    'social.invite_joined': 'Convidados que entraram',
    'social.friendship': 'Amizades criadas',
  },
  de: {
    'content.audio_message': 'Sprachnachrichten',
    'content.text_message': 'Textnachrichten',
    'content.post': 'Beiträge',
    'content.story': 'Storys',
    'content.reel': 'Reels',
    'comment.audio': 'Sprachkommentare',
    'comment.text': 'Schriftliche Kommentare',
    'conversation.private': 'Private Unterhaltungen',
    'conversation.public': 'Öffentliche Unterhaltungen',
    'conversation.community': 'Community-Unterhaltungen',
    'tool.sticker': 'Gesetzte Sticker',
    'tool.in_app_edit': 'Bearbeitungen in der App',
    'tool.direct_publish': 'Direkte Veröffentlichungen',
    'social.tracked_link': 'Erstellte Links',
    'social.share': 'Geteilte Inhalte',
    'social.invite_joined': 'Beigetretene Eingeladene',
    'social.friendship': 'Geknüpfte Freundschaften',
  },
  it: {
    'content.audio_message': 'Messaggi vocali',
    'content.text_message': 'Messaggi di testo',
    'content.post': 'Pubblicazioni',
    'content.story': 'Storie',
    'content.reel': 'Reel',
    'comment.audio': 'Commenti vocali',
    'comment.text': 'Commenti scritti',
    'conversation.private': 'Conversazioni private',
    'conversation.public': 'Conversazioni pubbliche',
    'conversation.community': 'Conversazioni di community',
    'tool.sticker': 'Sticker inseriti',
    'tool.in_app_edit': 'Montaggi nell’app',
    'tool.direct_publish': 'Pubblicazioni dirette',
    'social.tracked_link': 'Link creati',
    'social.share': 'Contenuti condivisi',
    'social.invite_joined': 'Invitati arrivati',
    'social.friendship': 'Amicizie strette',
  },
  ar: {
    'content.audio_message': 'رسائل صوتية',
    'content.text_message': 'رسائل نصية',
    'content.post': 'منشورات',
    'content.story': 'قصص',
    'content.reel': 'ريلز',
    'comment.audio': 'تعليقات صوتية',
    'comment.text': 'تعليقات مكتوبة',
    'conversation.private': 'محادثات خاصة',
    'conversation.public': 'محادثات عامة',
    'conversation.community': 'محادثات المجتمع',
    'tool.sticker': 'ملصقات موضوعة',
    'tool.in_app_edit': 'تعديلات داخل التطبيق',
    'tool.direct_publish': 'منشورات مباشرة',
    'social.tracked_link': 'روابط منشأة',
    'social.share': 'محتوى مُشارَك',
    'social.invite_joined': 'مدعوون انضموا',
    'social.friendship': 'صداقات جديدة',
  },
  'zh-Hans': {
    'content.audio_message': '语音消息',
    'content.text_message': '文字消息',
    'content.post': '帖子',
    'content.story': '动态',
    'content.reel': '短视频',
    'comment.audio': '语音评论',
    'comment.text': '文字评论',
    'conversation.private': '私聊会话',
    'conversation.public': '公开会话',
    'conversation.community': '社区会话',
    'tool.sticker': '已使用的贴纸',
    'tool.in_app_edit': '应用内剪辑',
    'tool.direct_publish': '直接发布',
    'social.tracked_link': '已创建的链接',
    'social.share': '已分享的内容',
    'social.invite_joined': '已加入的受邀者',
    'social.friendship': '已建立的好友',
  },
};

export const ENGAGEMENT_ACHIEVEMENT_LABELS: Record<NotificationLanguage, AchievementLabels> = {
  fr: {
    'achievement.first_content': { title: 'Premier pas', condition: 'Publier un premier contenu, quel qu’il soit' },
    'achievement.all_content_types': { title: 'Touche-à-tout', condition: 'Un message vocal, un message texte, une publication, une story et un réel' },
    'achievement.first_voice': { title: 'Première voix', condition: 'Un premier message ou commentaire vocal' },
    'achievement.editor': { title: 'Monteur', condition: 'Un premier montage dans l’app avant de publier' },
    'achievement.three_conversation_kinds': { title: 'Trois cercles', condition: 'Écrire dans une conversation privée, une publique et une de communauté' },
  },
  en: {
    'achievement.first_content': { title: 'First step', condition: 'Publish a first piece of content, of any kind' },
    'achievement.all_content_types': { title: 'Jack of all trades', condition: 'A voice message, a text message, a post, a story and a reel' },
    'achievement.first_voice': { title: 'First voice', condition: 'A first voice message or comment' },
    'achievement.editor': { title: 'Editor', condition: 'A first in-app edit before publishing' },
    'achievement.three_conversation_kinds': { title: 'Three circles', condition: 'Write in a private, a public and a community conversation' },
  },
  es: {
    'achievement.first_content': { title: 'Primer paso', condition: 'Publicar un primer contenido, del tipo que sea' },
    'achievement.all_content_types': { title: 'Todoterreno', condition: 'Un mensaje de voz, un mensaje de texto, una publicación, una historia y un reel' },
    'achievement.first_voice': { title: 'Primera voz', condition: 'Un primer mensaje o comentario de voz' },
    'achievement.editor': { title: 'Editor', condition: 'Una primera edición en la app antes de publicar' },
    'achievement.three_conversation_kinds': { title: 'Tres círculos', condition: 'Escribir en una conversación privada, una pública y una de comunidad' },
  },
  pt: {
    'achievement.first_content': { title: 'Primeiro passo', condition: 'Publicar um primeiro conteúdo, de qualquer tipo' },
    'achievement.all_content_types': { title: 'Faz-tudo', condition: 'Uma mensagem de voz, uma de texto, uma publicação, uma story e um reel' },
    'achievement.first_voice': { title: 'Primeira voz', condition: 'Uma primeira mensagem ou comentário de voz' },
    'achievement.editor': { title: 'Editor', condition: 'Uma primeira edição no app antes de publicar' },
    'achievement.three_conversation_kinds': { title: 'Três círculos', condition: 'Escrever em uma conversa privada, uma pública e uma de comunidade' },
  },
  de: {
    'achievement.first_content': { title: 'Erster Schritt', condition: 'Einen ersten Inhalt veröffentlichen, egal welchen' },
    'achievement.all_content_types': { title: 'Alleskönner', condition: 'Eine Sprachnachricht, eine Textnachricht, ein Beitrag, eine Story und ein Reel' },
    'achievement.first_voice': { title: 'Erste Stimme', condition: 'Eine erste Sprachnachricht oder ein Sprachkommentar' },
    'achievement.editor': { title: 'Cutter', condition: 'Eine erste Bearbeitung in der App vor dem Veröffentlichen' },
    'achievement.three_conversation_kinds': { title: 'Drei Kreise', condition: 'In einer privaten, einer öffentlichen und einer Community-Unterhaltung schreiben' },
  },
  it: {
    'achievement.first_content': { title: 'Primo passo', condition: 'Pubblicare un primo contenuto, di qualsiasi tipo' },
    'achievement.all_content_types': { title: 'Tuttofare', condition: 'Un messaggio vocale, uno di testo, una pubblicazione, una storia e un reel' },
    'achievement.first_voice': { title: 'Prima voce', condition: 'Un primo messaggio o commento vocale' },
    'achievement.editor': { title: 'Montatore', condition: 'Un primo montaggio nell’app prima di pubblicare' },
    'achievement.three_conversation_kinds': { title: 'Tre cerchi', condition: 'Scrivere in una conversazione privata, una pubblica e una di community' },
  },
  ar: {
    'achievement.first_content': { title: 'الخطوة الأولى', condition: 'نشر أول محتوى، أيًا كان نوعه' },
    'achievement.all_content_types': { title: 'متعدّد المواهب', condition: 'رسالة صوتية ورسالة نصية ومنشور وقصة وريل' },
    'achievement.first_voice': { title: 'الصوت الأول', condition: 'أول رسالة أو تعليق صوتي' },
    'achievement.editor': { title: 'المونتير', condition: 'أول تعديل داخل التطبيق قبل النشر' },
    'achievement.three_conversation_kinds': { title: 'ثلاث دوائر', condition: 'الكتابة في محادثة خاصة وعامة ومجتمعية' },
  },
  'zh-Hans': {
    'achievement.first_content': { title: '第一步', condition: '发布第一条内容，任何类型均可' },
    'achievement.all_content_types': { title: '全能玩家', condition: '一条语音消息、一条文字消息、一篇帖子、一条动态和一个短视频' },
    'achievement.first_voice': { title: '初次发声', condition: '第一条语音消息或语音评论' },
    'achievement.editor': { title: '剪辑师', condition: '发布前第一次在应用内剪辑' },
    'achievement.three_conversation_kinds': { title: '三个圈子', condition: '在私聊、公开和社区会话中各写一条消息' },
  },
};

/** Le libellé d'un axe dans la langue du LECTEUR (`normalizeNotificationLanguage`, repli `fr`). */
export function engagementAxisLabel(lang: string | null | undefined, axisKey: EngagementAxisKey): string {
  return ENGAGEMENT_AXIS_LABELS[normalizeNotificationLanguage(lang)][axisKey];
}

/** Le titre d'un succès dans la langue du LECTEUR. */
export function engagementAchievementTitle(lang: string | null | undefined, key: EngagementAchievementKey): string {
  return ENGAGEMENT_ACHIEVEMENT_LABELS[normalizeNotificationLanguage(lang)][key].title;
}

/** La condition d'un succès — ce qu'il reste à faire, lisible verrouillé. */
export function engagementAchievementCondition(lang: string | null | undefined, key: EngagementAchievementKey): string {
  return ENGAGEMENT_ACHIEVEMENT_LABELS[normalizeNotificationLanguage(lang)][key].condition;
}
