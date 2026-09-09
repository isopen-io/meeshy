/**
 * LES GABARITS DE LIBELLÉ DES SUCCÈS (#5759).
 *
 * UN gabarit par FAMILLE, pas un libellé par succès : `{n}` porte le palier.
 * Neuf familles × huit langues = 72 chaînes, pour ~50 succès aujourd'hui et
 * autant qu'on voudra demain — ajouter un palier ne coûte AUCUNE traduction.
 *
 * ## Pourquoi un gabarit par famille, et non une composition libre
 *
 * On pourrait composer `{geste} {n} {sujet}` et descendre à ~20 chaînes. On ne
 * le fait pas : l'accord grammatical le rend faux hors du français et de
 * l'anglais — l'arabe fléchit le nom selon le nombre (duel, pluriel de
 * paucité), l'allemand décline selon le cas régi par le verbe. Une phrase
 * bancale dans deux langues sur huit coûte plus cher que cinquante chaînes.
 *
 * Le gabarit est COMPACT parce que l'écran le rend en rangée horizontale : il
 * doit s'identifier seul, sans en-tête de famille au-dessus. « 100
 * conversations » et « 100 départs » se distinguent ; « 100 » ne se
 * distinguerait pas.
 */

import { normalizeNotificationLanguage, type NotificationLanguage } from './notification-strings.js';
import { familyId } from '../types/achievement-families.js';
import type { AchievementFamily } from '../types/achievement-catalog.js';

type FamilyLabels = Record<string, string>;

/** `{n}` est remplacé par le palier, formaté selon la locale du LECTEUR. */
export const ACHIEVEMENT_LABELS: Record<NotificationLanguage, FamilyLabels> = {
  fr: {
    'conversation.join.size': 'Conversation de {n} membres',
    'conversation.join.count': '{n} conversations rejointes',
    'conversation.leave.count': '{n} conversations quittées',
    'conversation.create.count': '{n} conversations créées',
    'community.join.size': 'Communauté de {n} membres',
    'community.join.count': '{n} communautés rejointes',
    'community.create.size': '{n} membres réunis',
    'community.create.count': '{n} communautés créées',
    'message.send.count': '{n} messages envoyés',
    'voice.send.count': '{n} vocaux envoyés',
    'image.send.count': '{n} images envoyées',
    'video.send.count': '{n} vidéos envoyées',
    'message.edit.count': '{n} messages corrigés',
    'message.delete.count': '{n} messages supprimés',
    'message.react.count': '{n} réactions posées',
    'call.join.count': '{n} appels rejoints',
    'call.start.count': '{n} appels lancés',
    'call.start.size': 'Appel à {n} participants',
    'referral.complete.count': '{n} filleuls arrivés',
    'link.click.count': '{n} clics sur vos liens',
    'streak.hold.count': 'Série de {n} jours',
    'meesh.mint.count': '{n} Meeshes frappées',
  },
  en: {
    'conversation.join.size': 'Conversation of {n} members',
    'conversation.join.count': '{n} conversations joined',
    'conversation.leave.count': '{n} conversations left',
    'conversation.create.count': '{n} conversations created',
    'community.join.size': 'Community of {n} members',
    'community.join.count': '{n} communities joined',
    'community.create.size': '{n} members gathered',
    'community.create.count': '{n} communities created',
    'message.send.count': '{n} messages sent',
    'voice.send.count': '{n} voice notes sent',
    'image.send.count': '{n} images sent',
    'video.send.count': '{n} videos sent',
    'message.edit.count': '{n} messages edited',
    'message.delete.count': '{n} messages deleted',
    'message.react.count': '{n} reactions added',
    'call.join.count': '{n} calls joined',
    'call.start.count': '{n} calls started',
    'call.start.size': 'Call with {n} participants',
    'referral.complete.count': '{n} referrals landed',
    'link.click.count': '{n} clicks on your links',
    'streak.hold.count': '{n}-day streak',
    'meesh.mint.count': '{n} Meeshes minted',
  },
  es: {
    'conversation.join.size': 'Conversación de {n} miembros',
    'conversation.join.count': '{n} conversaciones unidas',
    'conversation.leave.count': '{n} conversaciones abandonadas',
    'conversation.create.count': '{n} conversaciones creadas',
    'community.join.size': 'Comunidad de {n} miembros',
    'community.join.count': '{n} comunidades unidas',
    'community.create.size': '{n} miembros reunidos',
    'community.create.count': '{n} comunidades creadas',
    'message.send.count': '{n} mensajes enviados',
    'voice.send.count': '{n} notas de voz enviadas',
    'image.send.count': '{n} imágenes enviadas',
    'video.send.count': '{n} vídeos enviados',
    'message.edit.count': '{n} mensajes editados',
    'message.delete.count': '{n} mensajes eliminados',
    'message.react.count': '{n} reacciones añadidas',
    'call.join.count': '{n} llamadas unidas',
    'call.start.count': '{n} llamadas iniciadas',
    'call.start.size': 'Llamada con {n} participantes',
    'referral.complete.count': '{n} referidos llegados',
    'link.click.count': '{n} clics en tus enlaces',
    'streak.hold.count': 'Racha de {n} días',
    'meesh.mint.count': '{n} Meeshes acuñadas',
  },
  pt: {
    'conversation.join.size': 'Conversa de {n} membros',
    'conversation.join.count': '{n} conversas entradas',
    'conversation.leave.count': '{n} conversas deixadas',
    'conversation.create.count': '{n} conversas criadas',
    'community.join.size': 'Comunidade de {n} membros',
    'community.join.count': '{n} comunidades entradas',
    'community.create.size': '{n} membros reunidos',
    'community.create.count': '{n} comunidades criadas',
    'message.send.count': '{n} mensagens enviadas',
    'voice.send.count': '{n} áudios enviados',
    'image.send.count': '{n} imagens enviadas',
    'video.send.count': '{n} vídeos enviados',
    'message.edit.count': '{n} mensagens editadas',
    'message.delete.count': '{n} mensagens apagadas',
    'message.react.count': '{n} reações adicionadas',
    'call.join.count': '{n} chamadas entradas',
    'call.start.count': '{n} chamadas iniciadas',
    'call.start.size': 'Chamada com {n} participantes',
    'referral.complete.count': '{n} indicados chegados',
    'link.click.count': '{n} cliques nos seus links',
    'streak.hold.count': 'Sequência de {n} dias',
    'meesh.mint.count': '{n} Meeshes cunhadas',
  },
  de: {
    'conversation.join.size': 'Unterhaltung mit {n} Mitgliedern',
    'conversation.join.count': '{n} Unterhaltungen beigetreten',
    'conversation.leave.count': '{n} Unterhaltungen verlassen',
    'conversation.create.count': '{n} Unterhaltungen erstellt',
    'community.join.size': 'Community mit {n} Mitgliedern',
    'community.join.count': '{n} Communitys beigetreten',
    'community.create.size': '{n} Mitglieder versammelt',
    'community.create.count': '{n} Communitys erstellt',
    'message.send.count': '{n} Nachrichten gesendet',
    'voice.send.count': '{n} Sprachnachrichten gesendet',
    'image.send.count': '{n} Bilder gesendet',
    'video.send.count': '{n} Videos gesendet',
    'message.edit.count': '{n} Nachrichten bearbeitet',
    'message.delete.count': '{n} Nachrichten gelöscht',
    'message.react.count': '{n} Reaktionen gesetzt',
    'call.join.count': '{n} Anrufen beigetreten',
    'call.start.count': '{n} Anrufe gestartet',
    'call.start.size': 'Anruf mit {n} Teilnehmenden',
    'referral.complete.count': '{n} Empfehlungen angekommen',
    'link.click.count': '{n} Klicks auf Ihre Links',
    'streak.hold.count': '{n}-Tage-Serie',
    'meesh.mint.count': '{n} Meeshes geprägt',
  },
  it: {
    'conversation.join.size': 'Conversazione di {n} membri',
    'conversation.join.count': '{n} conversazioni raggiunte',
    'conversation.leave.count': '{n} conversazioni lasciate',
    'conversation.create.count': '{n} conversazioni create',
    'community.join.size': 'Community di {n} membri',
    'community.join.count': '{n} community raggiunte',
    'community.create.size': '{n} membri riuniti',
    'community.create.count': '{n} community create',
    'message.send.count': '{n} messaggi inviati',
    'voice.send.count': '{n} vocali inviati',
    'image.send.count': '{n} immagini inviate',
    'video.send.count': '{n} video inviati',
    'message.edit.count': '{n} messaggi modificati',
    'message.delete.count': '{n} messaggi eliminati',
    'message.react.count': '{n} reazioni aggiunte',
    'call.join.count': '{n} chiamate raggiunte',
    'call.start.count': '{n} chiamate avviate',
    'call.start.size': 'Chiamata con {n} partecipanti',
    'referral.complete.count': '{n} invitati arrivati',
    'link.click.count': '{n} clic sui tuoi link',
    'streak.hold.count': 'Serie di {n} giorni',
    'meesh.mint.count': '{n} Meesh coniate',
  },
  ar: {
    'conversation.join.size': 'محادثة من {n} عضوًا',
    'conversation.join.count': 'الانضمام إلى {n} محادثة',
    'conversation.leave.count': 'مغادرة {n} محادثة',
    'conversation.create.count': 'إنشاء {n} محادثة',
    'community.join.size': 'مجتمع من {n} عضوًا',
    'community.join.count': 'الانضمام إلى {n} مجتمع',
    'community.create.size': 'جمع {n} عضوًا',
    'community.create.count': 'إنشاء {n} مجتمع',
    'message.send.count': 'إرسال {n} رسالة',
    'voice.send.count': 'إرسال {n} رسالة صوتية',
    'image.send.count': 'إرسال {n} صورة',
    'video.send.count': 'إرسال {n} مقطع فيديو',
    'message.edit.count': 'تعديل {n} رسالة',
    'message.delete.count': 'حذف {n} رسالة',
    'message.react.count': 'إضافة {n} تفاعل',
    'call.join.count': 'الانضمام إلى {n} مكالمة',
    'call.start.count': 'بدء {n} مكالمة',
    'call.start.size': 'مكالمة مع {n} مشاركًا',
    'referral.complete.count': 'وصول {n} مدعو',
    'link.click.count': '{n} نقرة على روابطك',
    'streak.hold.count': 'سلسلة {n} يومًا',
    'meesh.mint.count': 'سك {n} ميش',
  },
  'zh-Hans': {
    'conversation.join.size': '{n} 人的会话',
    'conversation.join.count': '加入 {n} 个会话',
    'conversation.leave.count': '退出 {n} 个会话',
    'conversation.create.count': '创建 {n} 个会话',
    'community.join.size': '{n} 人的社区',
    'community.join.count': '加入 {n} 个社区',
    'community.create.size': '聚集 {n} 位成员',
    'community.create.count': '创建 {n} 个社区',
    'message.send.count': '发送 {n} 条消息',
    'voice.send.count': '发送 {n} 条语音',
    'image.send.count': '发送 {n} 张图片',
    'video.send.count': '发送 {n} 个视频',
    'message.edit.count': '编辑 {n} 条消息',
    'message.delete.count': '删除 {n} 条消息',
    'message.react.count': '添加 {n} 个回应',
    'call.join.count': '加入 {n} 次通话',
    'call.start.count': '发起 {n} 次通话',
    'call.start.size': '{n} 人参与的通话',
    'referral.complete.count': '{n} 位受邀者加入',
    'link.click.count': '链接被点击 {n} 次',
    'streak.hold.count': '{n} 天连续记录',
    'meesh.mint.count': '铸造 {n} 枚 Meesh',
  },
};

/**
 * L'ACCORD AU SINGULIER du palier 1, pour les familles de VOLUME (#5832).
 *
 * `ACHIEVEMENT_LABELS` porte UNE forme par famille, au pluriel — juste à partir
 * du palier 10, faux au palier 1 (« 1 messages envoyés »). Cette table ne
 * COUVRE QUE ce que `ACHIEVEMENT_LABELS` ne peut pas porter seule :
 *  - les 18 familles de VOLUME (`scale: 'count'`) — les familles d'AMPLEUR
 *    commencent à 10, jamais à 1, donc n'ont jamais besoin d'accord ;
 *  - les 6 langues qui FLÉCHISSENT au singulier — `ar` (déjà singulier après
 *    ١ dans cette construction) et `zh-Hans` (aucun accord de nombre) n'y
 *    figurent pas : l'absence y est la règle, pas un oubli.
 *
 * `achievementLabel()` choisit cette table quand `Intl.PluralRules` range le
 * palier dans la catégorie « one » ET qu'une forme y est déclarée ; sinon il
 * retombe sur `ACHIEVEMENT_LABELS`, sans changement de comportement.
 */
export const ACHIEVEMENT_LABELS_ONE: Partial<Record<NotificationLanguage, FamilyLabels>> = {
  fr: {
    'conversation.join.count': '{n} conversation rejointe',
    'conversation.leave.count': '{n} conversation quittée',
    'conversation.create.count': '{n} conversation créée',
    'community.join.count': '{n} communauté rejointe',
    'community.create.count': '{n} communauté créée',
    'message.send.count': '{n} message envoyé',
    'voice.send.count': '{n} vocal envoyé',
    'image.send.count': '{n} image envoyée',
    'video.send.count': '{n} vidéo envoyée',
    'message.edit.count': '{n} message corrigé',
    'message.delete.count': '{n} message supprimé',
    'message.react.count': '{n} réaction posée',
    'call.join.count': '{n} appel rejoint',
    'call.start.count': '{n} appel lancé',
    'referral.complete.count': '{n} filleul arrivé',
    'link.click.count': '{n} clic sur vos liens',
    'streak.hold.count': 'Série de {n} jour',
    'meesh.mint.count': '{n} Meesh frappée',
  },
  en: {
    'conversation.join.count': '{n} conversation joined',
    'conversation.leave.count': '{n} conversation left',
    'conversation.create.count': '{n} conversation created',
    'community.join.count': '{n} community joined',
    'community.create.count': '{n} community created',
    'message.send.count': '{n} message sent',
    'voice.send.count': '{n} voice note sent',
    'image.send.count': '{n} image sent',
    'video.send.count': '{n} video sent',
    'message.edit.count': '{n} message edited',
    'message.delete.count': '{n} message deleted',
    'message.react.count': '{n} reaction added',
    'call.join.count': '{n} call joined',
    'call.start.count': '{n} call started',
    'referral.complete.count': '{n} referral landed',
    'link.click.count': '{n} click on your links',
    'streak.hold.count': '{n}-day streak',
    'meesh.mint.count': '{n} Meesh minted',
  },
  es: {
    'conversation.join.count': '{n} conversación unida',
    'conversation.leave.count': '{n} conversación abandonada',
    'conversation.create.count': '{n} conversación creada',
    'community.join.count': '{n} comunidad unida',
    'community.create.count': '{n} comunidad creada',
    'message.send.count': '{n} mensaje enviado',
    'voice.send.count': '{n} nota de voz enviada',
    'image.send.count': '{n} imagen enviada',
    'video.send.count': '{n} vídeo enviado',
    'message.edit.count': '{n} mensaje editado',
    'message.delete.count': '{n} mensaje eliminado',
    'message.react.count': '{n} reacción añadida',
    'call.join.count': '{n} llamada unida',
    'call.start.count': '{n} llamada iniciada',
    'referral.complete.count': '{n} referido llegado',
    'link.click.count': '{n} clic en tus enlaces',
    'streak.hold.count': 'Racha de {n} día',
    'meesh.mint.count': '{n} Meesh acuñada',
  },
  pt: {
    'conversation.join.count': '{n} conversa entrada',
    'conversation.leave.count': '{n} conversa deixada',
    'conversation.create.count': '{n} conversa criada',
    'community.join.count': '{n} comunidade entrada',
    'community.create.count': '{n} comunidade criada',
    'message.send.count': '{n} mensagem enviada',
    'voice.send.count': '{n} áudio enviado',
    'image.send.count': '{n} imagem enviada',
    'video.send.count': '{n} vídeo enviado',
    'message.edit.count': '{n} mensagem editada',
    'message.delete.count': '{n} mensagem apagada',
    'message.react.count': '{n} reação adicionada',
    'call.join.count': '{n} chamada entrada',
    'call.start.count': '{n} chamada iniciada',
    'referral.complete.count': '{n} indicado chegado',
    'link.click.count': '{n} clique nos seus links',
    'streak.hold.count': 'Sequência de {n} dia',
    'meesh.mint.count': '{n} Meesh cunhada',
  },
  de: {
    'conversation.join.count': '{n} Unterhaltung beigetreten',
    'conversation.leave.count': '{n} Unterhaltung verlassen',
    'conversation.create.count': '{n} Unterhaltung erstellt',
    'community.join.count': '{n} Community beigetreten',
    'community.create.count': '{n} Community erstellt',
    'message.send.count': '{n} Nachricht gesendet',
    'voice.send.count': '{n} Sprachnachricht gesendet',
    'image.send.count': '{n} Bild gesendet',
    'video.send.count': '{n} Video gesendet',
    'message.edit.count': '{n} Nachricht bearbeitet',
    'message.delete.count': '{n} Nachricht gelöscht',
    'message.react.count': '{n} Reaktion gesetzt',
    'call.join.count': '{n} Anruf beigetreten',
    'call.start.count': '{n} Anruf gestartet',
    'referral.complete.count': '{n} Empfehlung angekommen',
    'link.click.count': '{n} Klick auf Ihre Links',
    'streak.hold.count': '{n}-Tag-Serie',
    'meesh.mint.count': '{n} Meesh geprägt',
  },
  it: {
    'conversation.join.count': '{n} conversazione raggiunta',
    'conversation.leave.count': '{n} conversazione lasciata',
    'conversation.create.count': '{n} conversazione creata',
    'community.join.count': '{n} community raggiunta',
    'community.create.count': '{n} community creata',
    'message.send.count': '{n} messaggio inviato',
    'voice.send.count': '{n} vocale inviato',
    'image.send.count': '{n} immagine inviata',
    'video.send.count': '{n} video inviato',
    'message.edit.count': '{n} messaggio modificato',
    'message.delete.count': '{n} messaggio eliminato',
    'message.react.count': '{n} reazione aggiunta',
    'call.join.count': '{n} chiamata raggiunta',
    'call.start.count': '{n} chiamata avviata',
    'referral.complete.count': '{n} invitato arrivato',
    'link.click.count': '{n} clic sui tuoi link',
    'streak.hold.count': 'Serie di {n} giorno',
    'meesh.mint.count': '{n} Meesh coniata',
  },
};

/** Les locales dont le format de nombre correspond à chaque langue du catalogue. */
const NUMBER_LOCALES: Record<NotificationLanguage, string> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  it: 'it-IT',
  ar: 'ar-EG',
  'zh-Hans': 'zh-Hans-CN',
};

/**
 * Le libellé d'un succès, dans la langue du LECTEUR.
 *
 * Le nombre est formaté SELON CETTE LANGUE : « 1 000 » en français, « 1,000 »
 * en anglais, « ١٠٠٠ » en arabe. Servir « 1000 » brut ferait lire un catalogue
 * traduit avec des chiffres qui ne le sont pas — l'incohérence exacte que la
 * face « cadrage » du Prisme interdit.
 *
 * Famille inconnue ⇒ `null`, jamais une clé affichée : c'est la leçon du
 * `first_content` servi tel quel sur un écran verrouillé (#5731).
 */
export function achievementLabel(
  language: string,
  family: AchievementFamily,
  tier: number,
): string | null {
  const lang = normalizeNotificationLanguage(language);
  const cle = familyId(family);
  const estSingulier = new Intl.PluralRules(NUMBER_LOCALES[lang]).select(tier) === 'one';
  const gabarit = (estSingulier ? ACHIEVEMENT_LABELS_ONE[lang]?.[cle] : undefined)
    ?? ACHIEVEMENT_LABELS[lang][cle];
  if (gabarit === undefined) return null;
  const nombre = new Intl.NumberFormat(NUMBER_LOCALES[lang]).format(tier);
  return gabarit.replace('{n}', nombre);
}
