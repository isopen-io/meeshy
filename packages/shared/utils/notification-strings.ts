/**
 * Catalogue i18n des textes système de notification (source unique).
 * Localisation côté serveur, à la langue résolue du destinataire (Prisme-first).
 * @see docs/superpowers/specs/2026-06-16-notification-system-i18n-design.md
 */

import type { SocialPostType } from '../types/notification.js';

export const NOTIFICATION_LANGUAGES = [
  'ar', 'de', 'en', 'es', 'fr', 'it', 'pt', 'zh-Hans',
] as const;
export type NotificationLanguage = typeof NOTIFICATION_LANGUAGES[number];

export const NOTIFICATION_STRING_KEYS = [
  'reaction.message', 'reaction.comment', 'reaction.commentVerbose', 'reaction.post',
  'comment.your', 'comment.generic', 'comment.repliedIn', 'comment.reply', 'comment.replyWithParent',
  'comment.genericFrom', 'comment.repliedInFrom',
  'comment.repliedToYours',
  'comment.subtitleOwner', 'comment.subtitleFrom', 'comment.subtitleBare',
  'mention', 'someone',
  'reference.post', 'reference.reel', 'reference.story', 'reference.status',
  'friend.story', 'friend.post', 'friend.reel', 'friend.mood', 'friend.subtitleNew',
  'call.missed', 'call.incoming.title', 'call.incoming.body',
  'contact.request', 'contact.accepted',
  'contact.requestAction', 'contact.acceptedAction',
  'repost',
  'invitation.group', 'invitation.direct',
  'group.added', 'group.newContact',
  'attachment.photo', 'attachment.video', 'attachment.audio', 'attachment.document', 'attachment.files',
  'login.newDevice.title',
  'push.private',
] as const;
export type NotificationStringKey = typeof NOTIFICATION_STRING_KEYS[number];

/**
 * Le kind qui traverse le FIL — exactement `SocialPostType`, donc exactement
 * `enum PostType`. Le catalogue et le fil ne peuvent pas diverger : c'est le
 * même type, pas deux listes tenues à jour en parallèle (#4906).
 */
export type NotificationPostKind = SocialPostType;

/**
 * La clé de PROSE du catalogue — ce n'est PAS un identifiant de fil.
 *
 * Elle porte `'MOOD'` en plus des quatre valeurs du fil, et c'est voulu :
 * `docs/product/meeshy-composer-modele.md` § 7 dit que le quatrième profil
 * s'appelle `status` dans le CODE et « mood » dans la PROSE, **et que les deux
 * sont justes**. Ce type est la moitié PROSE de cette frontière. Il sert à
 * deux choses, toutes deux des lectures :
 *
 *  1. **nommer le libellé** — « Nouvelle humeur », « votre humeur », « on
 *     {author}'s mood » : le mot que l'auteur lit, et que le § 7 protège ;
 *  2. **tolérer une charge déjà persistée** qui porte encore `'MOOD'` — un
 *     contrat neuf s'ajoute à l'ancien, il ne le remplace pas, et le serveur
 *     ne doit pas moins bien rendre une notification qu'il rendait hier.
 *
 * Ce qui est INTERDIT est l'inverse : émettre `'MOOD'` comme discriminant.
 * `SocialPostType` (`types/notification.ts`) est le seul type des champs qui
 * voyagent, et il ne le connaît plus. Cliquet :
 * `__tests__/types/social-post-type-wire-guard.test.ts`.
 */
export type NotificationPostLabelKind = NotificationPostKind | 'MOOD';

export type NotificationCallKind = 'audio' | 'video';

export type NotificationStringParams = {
  readonly emoji?: string;
  readonly actor?: string;
  readonly title?: string;
  readonly preview?: string;
  readonly author?: string;
  readonly count?: number;
  readonly callIcon?: string;
  /**
   * L'entité nommée par le libellé. Typée en clé de PROSE, pas en valeur de
   * fil : le catalogue est un dictionnaire, il RENDRA ce qu'on lui donne — y
   * compris le nom produit « MOOD » d'une charge déjà persistée.
   */
  readonly postType?: NotificationPostLabelKind;
  readonly callType?: NotificationCallKind;
  readonly isStory?: boolean;
};

type Templates = Record<NotificationStringKey, string>;
type ObjMap = Record<NotificationPostLabelKind, string>;
type CallMap = Record<NotificationCallKind, string>;

const TEMPLATES: Record<NotificationLanguage, Templates> = {
  fr: {
    'reaction.message': 'a réagi {emoji} à votre message',
    'reaction.comment': 'a réagi {emoji} à votre commentaire',
    'reaction.commentVerbose': '{actor} a réagi {emoji} à votre commentaire{context}',
    'reaction.post': 'a réagi {emoji} {reactObj}',
    'comment.your': 'a commenté {possObj}',
    'comment.generic': 'a commenté {indefObj}',
    'comment.repliedIn': 'a répondu {locObj}',
    'comment.reply': 'En réponse à votre commentaire',
    'comment.replyWithParent': 'En réponse à « {preview} »',
    'comment.repliedToYours': 'a répondu à votre commentaire',
    'comment.genericFrom': 'a commenté {indefObj} de {author}',
    'comment.repliedInFrom': 'a répondu {locObj} de {author}',
    'someone': 'Quelqu’un',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} de {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'vous a mentionné',
    'reference.post': 'vous a référencé dans sa publication',
    'reference.reel': 'vous a référencé dans son réel',
    'reference.story': 'vous a référencé dans sa story',
    'reference.status': 'vous a référencé dans son statut',
    'friend.story': 'a publié une nouvelle story',
    'friend.post': 'a publié un nouveau post',
    'friend.reel': 'a publié un nouveau réel',
    'friend.mood': 'a publié une nouvelle humeur',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Appel {callLabel} manqué',
    'call.incoming.title': '{actor} vous appelle',
    'call.incoming.body': '{callBody}',
    'contact.request': 'Nouvelle demande de contact',
    'contact.accepted': 'Demande de contact acceptée',
    'contact.requestAction': 'veut se connecter',
    'contact.acceptedAction': 'a accepté votre demande',
    'repost': 'a partagé {possObj}',
    'invitation.group': 'Invitation au groupe {title}',
    'invitation.direct': 'Nouvelle conversation avec {actor}',
    'group.added': 'Ajouté au groupe {title}',
    'group.newContact': 'Nouveau contact',
    'attachment.photo': '📷 Photo',
    'attachment.video': '🎬 Vidéo',
    'attachment.audio': '🎵 Audio',
    'attachment.document': '📎 Document',
    'attachment.files': '📎 {count} fichiers',
    'login.newDevice.title': 'Nouvelle connexion détectée',
    'push.private': 'Nouvelle notification',
  },
  en: {
    'reaction.message': 'reacted {emoji} to your message',
    'reaction.comment': 'reacted {emoji} to your comment',
    'reaction.commentVerbose': '{actor} reacted {emoji} to your comment{context}',
    'reaction.post': 'reacted {emoji} {reactObj}',
    'comment.your': 'commented on {possObj}',
    'comment.generic': 'commented on {indefObj}',
    'comment.repliedIn': 'replied {locObj}',
    'comment.reply': 'Replied to your comment',
    'comment.replyWithParent': 'Replying to “{preview}”',
    'comment.repliedToYours': 'replied to your comment',
    'comment.genericFrom': 'commented on {author}’s {bareObj}',
    'comment.repliedInFrom': 'replied in {author}’s {bareObj}',
    'someone': 'Someone',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} from {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'mentioned you',
    'reference.post': 'referenced you in their post',
    'reference.reel': 'referenced you in their reel',
    'reference.story': 'referenced you in their story',
    'reference.status': 'referenced you in their status',
    'friend.story': 'shared a new story',
    'friend.post': 'shared a new post',
    'friend.reel': 'shared a new reel',
    'friend.mood': 'shared a new mood',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Missed {callLabel} call',
    'call.incoming.title': '{actor} is calling you',
    'call.incoming.body': '{callBody}',
    'contact.request': 'New contact request',
    'contact.accepted': 'Contact request accepted',
    'contact.requestAction': 'wants to connect',
    'contact.acceptedAction': 'accepted your request',
    'repost': 'shared {possObj}',
    'invitation.group': 'Invitation to group {title}',
    'invitation.direct': 'New conversation with {actor}',
    'group.added': 'Added to group {title}',
    'group.newContact': 'New contact',
    'attachment.photo': '📷 Photo',
    'attachment.video': '🎬 Video',
    'attachment.audio': '🎵 Audio',
    'attachment.document': '📎 Document',
    'attachment.files': '📎 {count} files',
    'login.newDevice.title': 'New login detected',
    'push.private': 'New notification',
  },
  es: {
    'reaction.message': 'reaccionó {emoji} a tu mensaje',
    'reaction.comment': 'reaccionó {emoji} a tu comentario',
    'reaction.commentVerbose': '{actor} reaccionó {emoji} a tu comentario{context}',
    'reaction.post': 'reaccionó {emoji} {reactObj}',
    'comment.your': 'comentó {possObj}',
    'comment.generic': 'comentó {indefObj}',
    'comment.repliedIn': 'respondió {locObj}',
    'comment.reply': 'Respondió a tu comentario',
    'comment.replyWithParent': 'Respondiendo a «{preview}»',
    'comment.repliedToYours': 'respondió a tu comentario',
    'comment.genericFrom': 'comentó {indefObj} de {author}',
    'comment.repliedInFrom': 'respondió {locObj} de {author}',
    'someone': 'Alguien',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} de {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'te mencionó',
    'reference.post': 'te referenció en su publicación',
    'reference.reel': 'te referenció en su reel',
    'reference.story': 'te referenció en su historia',
    'reference.status': 'te referenció en su estado',
    'friend.story': 'publicó una nueva historia',
    'friend.post': 'publicó una nueva publicación',
    'friend.reel': 'publicó un nuevo reel',
    'friend.mood': 'publicó un nuevo estado de ánimo',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Llamada {callLabel} perdida',
    'call.incoming.title': '{actor} te está llamando',
    'call.incoming.body': '{callBody}',
    'contact.request': 'Nueva solicitud de contacto',
    'contact.accepted': 'Solicitud de contacto aceptada',
    'contact.requestAction': 'quiere conectar contigo',
    'contact.acceptedAction': 'aceptó tu solicitud',
    'repost': 'compartió {possObj}',
    'invitation.group': 'Invitación al grupo {title}',
    'invitation.direct': 'Nueva conversación con {actor}',
    'group.added': 'Añadido al grupo {title}',
    'group.newContact': 'Nuevo contacto',
    'attachment.photo': '📷 Foto',
    'attachment.video': '🎬 Vídeo',
    'attachment.audio': '🎵 Audio',
    'attachment.document': '📎 Documento',
    'attachment.files': '📎 {count} archivos',
    'login.newDevice.title': 'Nuevo inicio de sesión detectado',
    'push.private': 'Nueva notificación',
  },
  pt: {
    'reaction.message': 'reagiu {emoji} à sua mensagem',
    'reaction.comment': 'reagiu {emoji} ao seu comentário',
    'reaction.commentVerbose': '{actor} reagiu {emoji} ao seu comentário{context}',
    'reaction.post': 'reagiu {emoji} {reactObj}',
    'comment.your': 'comentou {possObj}',
    'comment.generic': 'comentou {indefObj}',
    'comment.repliedIn': 'respondeu {locObj}',
    'comment.reply': 'Respondeu ao seu comentário',
    'comment.replyWithParent': 'Respondendo a “{preview}”',
    'comment.repliedToYours': 'respondeu ao seu comentário',
    'comment.genericFrom': 'comentou {indefObj} de {author}',
    'comment.repliedInFrom': 'respondeu {locObj} de {author}',
    'someone': 'Alguém',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} de {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'mencionou você',
    'reference.post': 'referenciou você na publicação dele(a)',
    'reference.reel': 'referenciou você no reel dele(a)',
    'reference.story': 'referenciou você na story dele(a)',
    'reference.status': 'referenciou você no status dele(a)',
    'friend.story': 'publicou uma nova story',
    'friend.post': 'publicou uma nova publicação',
    'friend.reel': 'publicou um novo reel',
    'friend.mood': 'publicou um novo humor',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Chamada {callLabel} perdida',
    'call.incoming.title': '{actor} está ligando para você',
    'call.incoming.body': '{callBody}',
    'contact.request': 'Novo pedido de contato',
    'contact.accepted': 'Pedido de contato aceito',
    'contact.requestAction': 'quer se conectar',
    'contact.acceptedAction': 'aceitou o seu pedido',
    'repost': 'compartilhou {possObj}',
    'invitation.group': 'Convite para o grupo {title}',
    'invitation.direct': 'Nova conversa com {actor}',
    'group.added': 'Adicionado ao grupo {title}',
    'group.newContact': 'Novo contato',
    'attachment.photo': '📷 Foto',
    'attachment.video': '🎬 Vídeo',
    'attachment.audio': '🎵 Áudio',
    'attachment.document': '📎 Documento',
    'attachment.files': '📎 {count} arquivos',
    'login.newDevice.title': 'Novo login detectado',
    'push.private': 'Nova notificação',
  },
  de: {
    'reaction.message': 'hat {emoji} auf deine Nachricht reagiert',
    'reaction.comment': 'hat {emoji} auf deinen Kommentar reagiert',
    'reaction.commentVerbose': '{actor} hat {emoji} auf deinen Kommentar reagiert{context}',
    'reaction.post': 'hat {emoji} {reactObj} reagiert',
    'comment.your': 'hat {possObj} kommentiert',
    'comment.generic': 'hat {indefObj} kommentiert',
    'comment.repliedIn': 'hat {locObj} geantwortet',
    'comment.reply': 'Hat auf deinen Kommentar geantwortet',
    'comment.replyWithParent': 'Antwort auf „{preview}“',
    'comment.repliedToYours': 'hat auf deinen Kommentar geantwortet',
    'comment.genericFrom': 'hat {indefObj} von {author} kommentiert',
    'comment.repliedInFrom': 'hat {locObj} von {author} geantwortet',
    'someone': 'Jemand',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} von {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'hat dich erwähnt',
    'reference.post': 'hat dich in einem Beitrag erwähnt',
    'reference.reel': 'hat dich in einem Reel erwähnt',
    'reference.story': 'hat dich in einer Story erwähnt',
    'reference.status': 'hat dich in einem Status erwähnt',
    'friend.story': 'hat eine neue Story geteilt',
    'friend.post': 'hat einen neuen Beitrag geteilt',
    'friend.reel': 'hat einen neuen Reel geteilt',
    'friend.mood': 'hat eine neue Stimmung geteilt',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Verpasster {callLabel}',
    'call.incoming.title': '{actor} ruft dich an',
    'call.incoming.body': '{callBody}',
    'contact.request': 'Neue Kontaktanfrage',
    'contact.accepted': 'Kontaktanfrage angenommen',
    'contact.requestAction': 'möchte sich vernetzen',
    'contact.acceptedAction': 'hat deine Anfrage angenommen',
    'repost': 'hat {possObj} geteilt',
    'invitation.group': 'Einladung zur Gruppe {title}',
    'invitation.direct': 'Neue Unterhaltung mit {actor}',
    'group.added': 'Zur Gruppe {title} hinzugefügt',
    'group.newContact': 'Neuer Kontakt',
    'attachment.photo': '📷 Foto',
    'attachment.video': '🎬 Video',
    'attachment.audio': '🎵 Audio',
    'attachment.document': '📎 Dokument',
    'attachment.files': '📎 {count} Dateien',
    'login.newDevice.title': 'Neue Anmeldung erkannt',
    'push.private': 'Neue Benachrichtigung',
  },
  it: {
    'reaction.message': 'ha reagito {emoji} al tuo messaggio',
    'reaction.comment': 'ha reagito {emoji} al tuo commento',
    'reaction.commentVerbose': '{actor} ha reagito {emoji} al tuo commento{context}',
    'reaction.post': 'ha reagito {emoji} {reactObj}',
    'comment.your': 'ha commentato {possObj}',
    'comment.generic': 'ha commentato {indefObj}',
    'comment.repliedIn': 'ha risposto {locObj}',
    'comment.reply': 'Ha risposto al tuo commento',
    'comment.replyWithParent': 'In risposta a «{preview}»',
    'comment.repliedToYours': 'ha risposto al tuo commento',
    'comment.genericFrom': 'ha commentato {indefObj} di {author}',
    'comment.repliedInFrom': 'ha risposto {locObj} di {author}',
    'someone': 'Qualcuno',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} di {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'ti ha menzionato',
    'reference.post': 'ti ha menzionato nel suo post',
    'reference.reel': 'ti ha menzionato nel suo reel',
    'reference.story': 'ti ha menzionato nella sua storia',
    'reference.status': 'ti ha menzionato nel suo stato',
    'friend.story': 'ha pubblicato una nuova storia',
    'friend.post': 'ha pubblicato un nuovo post',
    'friend.reel': 'ha pubblicato un nuovo reel',
    'friend.mood': 'ha pubblicato un nuovo stato d’animo',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Chiamata {callLabel} persa',
    'call.incoming.title': '{actor} ti sta chiamando',
    'call.incoming.body': '{callBody}',
    'contact.request': 'Nuova richiesta di contatto',
    'contact.accepted': 'Richiesta di contatto accettata',
    'contact.requestAction': 'vuole entrare in contatto',
    'contact.acceptedAction': 'ha accettato la tua richiesta',
    'repost': 'ha condiviso {possObj}',
    'invitation.group': 'Invito al gruppo {title}',
    'invitation.direct': 'Nuova conversazione con {actor}',
    'group.added': 'Aggiunto al gruppo {title}',
    'group.newContact': 'Nuovo contatto',
    'attachment.photo': '📷 Foto',
    'attachment.video': '🎬 Video',
    'attachment.audio': '🎵 Audio',
    'attachment.document': '📎 Documento',
    'attachment.files': '📎 {count} file',
    'login.newDevice.title': 'Nuovo accesso rilevato',
    'push.private': 'Nuova notifica',
  },
  ar: {
    'reaction.message': 'تفاعل {emoji} مع رسالتك',
    'reaction.comment': 'تفاعل {emoji} مع تعليقك',
    'reaction.commentVerbose': '{actor} تفاعل {emoji} مع تعليقك{context}',
    'reaction.post': 'تفاعل {emoji} {reactObj}',
    'comment.your': 'علّق على {possObj}',
    'comment.generic': 'علّق على {indefObj}',
    'comment.repliedIn': 'ردّ {locObj}',
    'comment.reply': 'ردّ على تعليقك',
    'comment.replyWithParent': 'ردًّا على «{preview}»',
    'comment.repliedToYours': 'ردّ على تعليقك',
    'comment.genericFrom': 'علّق على {indefObj} لـ{author}',
    'comment.repliedInFrom': 'ردّ {locObj} لـ{author}',
    'someone': 'شخص ما',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} من {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'أشار إليك',
    'reference.post': 'أشار إليك في منشور',
    'reference.reel': 'أشار إليك في ريل',
    'reference.story': 'أشار إليك في قصة',
    'reference.status': 'أشار إليك في حالة',
    'friend.story': 'نشر قصة جديدة',
    'friend.post': 'نشر منشورًا جديدًا',
    'friend.reel': 'نشر ريلًا جديدًا',
    'friend.mood': 'شارك مزاجًا جديدًا',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} مكالمة {callLabel} فائتة',
    'call.incoming.title': '{actor} يتصل بك',
    'call.incoming.body': '{callBody}',
    'contact.request': 'طلب تواصل جديد',
    'contact.accepted': 'تم قبول طلب التواصل',
    'contact.requestAction': 'يريد التواصل معك',
    'contact.acceptedAction': 'قبِل طلبك',
    'repost': 'شارك {possObj}',
    'invitation.group': 'دعوة إلى مجموعة {title}',
    'invitation.direct': 'محادثة جديدة مع {actor}',
    'group.added': 'تمت إضافتك إلى مجموعة {title}',
    'group.newContact': 'جهة اتصال جديدة',
    'attachment.photo': '📷 صورة',
    'attachment.video': '🎬 فيديو',
    'attachment.audio': '🎵 صوت',
    'attachment.document': '📎 مستند',
    'attachment.files': '📎 {count} ملفات',
    'login.newDevice.title': 'تم رصد تسجيل دخول جديد',
    'push.private': 'إشعار جديد',
  },
  'zh-Hans': {
    'reaction.message': '用 {emoji} 回应了你的消息',
    'reaction.comment': '用 {emoji} 回应了你的评论',
    'reaction.commentVerbose': '{actor} 用 {emoji} 回应了你的评论{context}',
    'reaction.post': '用 {emoji} 回应了{reactObj}',
    'comment.your': '评论了{possObj}',
    'comment.generic': '评论了{indefObj}',
    'comment.repliedIn': '{locObj}回复了',
    'comment.reply': '回复了你的评论',
    'comment.replyWithParent': '回复 “{preview}”',
    'comment.repliedToYours': '回复了你的评论',
    'comment.genericFrom': '评论了 {author} 的{bareObj}',
    'comment.repliedInFrom': '在 {author} 的{bareObj}中回复了',
    'someone': '有人',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{author} 的{nounCap}',
    'comment.subtitleBare': '{nounCap}',
    'mention': '提到了你',
    'reference.post': '在帖子中提到了你',
    'reference.reel': '在短视频中提到了你',
    'reference.story': '在快拍中提到了你',
    'reference.status': '在状态中提到了你',
    'friend.story': '发布了新快拍',
    'friend.post': '发布了新帖子',
    'friend.reel': '发布了新短视频',
    'friend.mood': '分享了新心情',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} 未接{callLabel}',
    'call.incoming.title': '{actor} 来电',
    'call.incoming.body': '{callBody}',
    'contact.request': '新的联系人请求',
    'contact.accepted': '联系人请求已接受',
    'contact.requestAction': '想与你建立联系',
    'contact.acceptedAction': '接受了你的请求',
    'repost': '分享了{possObj}',
    'invitation.group': '邀请你加入群组 {title}',
    'invitation.direct': '与 {actor} 的新对话',
    'group.added': '已加入群组 {title}',
    'group.newContact': '新联系人',
    'attachment.photo': '📷 照片',
    'attachment.video': '🎬 视频',
    'attachment.audio': '🎵 音频',
    'attachment.document': '📎 文档',
    'attachment.files': '📎 {count} 个文件',
    'login.newDevice.title': '检测到新登录',
    'push.private': '新通知',
  },
};

// "votre X" (possessif) — comment.your, repost
const POSS_OBJ: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'votre publication', STORY: 'votre story', MOOD: 'votre humeur', STATUS: 'votre statut', REEL: 'votre réel' },
  en: { POST: 'your post', STORY: 'your story', MOOD: 'your mood', STATUS: 'your status', REEL: 'your reel' },
  es: { POST: 'tu publicación', STORY: 'tu historia', MOOD: 'tu estado de ánimo', STATUS: 'tu estado', REEL: 'tu reel' },
  pt: { POST: 'sua publicação', STORY: 'sua story', MOOD: 'seu humor', STATUS: 'seu status', REEL: 'seu reel' },
  de: { POST: 'deinen Beitrag', STORY: 'deine Story', MOOD: 'deine Stimmung', STATUS: 'deinen Status', REEL: 'deinen Reel' },
  it: { POST: 'il tuo post', STORY: 'la tua storia', MOOD: 'il tuo stato d’animo', STATUS: 'il tuo stato', REEL: 'il tuo reel' },
  ar: { POST: 'منشورك', STORY: 'قصتك', MOOD: 'مزاجك', STATUS: 'حالتك', REEL: 'ريلك' },
  'zh-Hans': { POST: '你的帖子', STORY: '你的快拍', MOOD: '你的心情', STATUS: '你的状态', REEL: '你的短视频' },
};

// "à votre X" (préposition de réaction + possessif) — reaction.post
const REACT_OBJ: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'à votre publication', STORY: 'à votre story', MOOD: 'à votre humeur', STATUS: 'à votre statut', REEL: 'à votre réel' },
  en: { POST: 'to your post', STORY: 'to your story', MOOD: 'to your mood', STATUS: 'to your status', REEL: 'to your reel' },
  es: { POST: 'a tu publicación', STORY: 'a tu historia', MOOD: 'a tu estado de ánimo', STATUS: 'a tu estado', REEL: 'a tu reel' },
  pt: { POST: 'à sua publicação', STORY: 'à sua story', MOOD: 'ao seu humor', STATUS: 'ao seu status', REEL: 'ao seu reel' },
  de: { POST: 'auf deinen Beitrag', STORY: 'auf deine Story', MOOD: 'auf deine Stimmung', STATUS: 'auf deinen Status', REEL: 'auf deinen Reel' },
  it: { POST: 'al tuo post', STORY: 'alla tua storia', MOOD: 'al tuo stato d’animo', STATUS: 'al tuo stato', REEL: 'al tuo reel' },
  ar: { POST: 'على منشورك', STORY: 'على قصتك', MOOD: 'على مزاجك', STATUS: 'على حالتك', REEL: 'على ريلك' },
  'zh-Hans': { POST: '你的帖子', STORY: '你的快拍', MOOD: '你的心情', STATUS: '你的状态', REEL: '你的短视频' },
};

// "une X" (indéfini, accusatif) — comment.generic
const INDEF_OBJ: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'une publication', STORY: 'une story', MOOD: 'une humeur', STATUS: 'un statut', REEL: 'un réel' },
  en: { POST: 'a post', STORY: 'a story', MOOD: 'a mood', STATUS: 'a status', REEL: 'a reel' },
  es: { POST: 'una publicación', STORY: 'una historia', MOOD: 'un estado de ánimo', STATUS: 'un estado', REEL: 'un reel' },
  pt: { POST: 'uma publicação', STORY: 'uma story', MOOD: 'um humor', STATUS: 'um status', REEL: 'um reel' },
  de: { POST: 'einen Beitrag', STORY: 'eine Story', MOOD: 'eine Stimmung', STATUS: 'einen Status', REEL: 'einen Reel' },
  it: { POST: 'un post', STORY: 'una storia', MOOD: 'uno stato d’animo', STATUS: 'uno stato', REEL: 'un reel' },
  ar: { POST: 'منشورًا', STORY: 'قصة', MOOD: 'مزاجًا', STATUS: 'حالة', REEL: 'ريلًا' },
  'zh-Hans': { POST: '帖子', STORY: '快拍', MOOD: '心情', STATUS: '状态', REEL: '短视频' },
};

// "dans une X" (locatif/datif) — comment.repliedIn
const LOC_OBJ: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'dans une publication', STORY: 'dans une story', MOOD: 'dans une humeur', STATUS: 'dans un statut', REEL: 'dans un réel' },
  en: { POST: 'in a post', STORY: 'in a story', MOOD: 'in a mood', STATUS: 'in a status', REEL: 'in a reel' },
  es: { POST: 'en una publicación', STORY: 'en una historia', MOOD: 'en un estado de ánimo', STATUS: 'en un estado', REEL: 'en un reel' },
  pt: { POST: 'em uma publicação', STORY: 'em uma story', MOOD: 'em um humor', STATUS: 'em um status', REEL: 'em um reel' },
  de: { POST: 'in einem Beitrag', STORY: 'in einer Story', MOOD: 'in einer Stimmung', STATUS: 'in einem Status', REEL: 'in einem Reel' },
  it: { POST: 'in un post', STORY: 'in una storia', MOOD: 'in uno stato d’animo', STATUS: 'in uno stato', REEL: 'in un reel' },
  ar: { POST: 'في منشور', STORY: 'في قصة', MOOD: 'في مزاج', STATUS: 'في حالة', REEL: 'في ريل' },
  'zh-Hans': { POST: '在帖子中', STORY: '在快拍中', MOOD: '在心情中', STATUS: '在状态中', REEL: '在短视频中' },
};

// Nom capitalisé nu (subtitle "{nounCap} de {author}" / bare)
const POST_NOUN_CAP: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'Publication', STORY: 'Story', MOOD: 'Humeur', STATUS: 'Statut', REEL: 'Réel' },
  en: { POST: 'Post', STORY: 'Story', MOOD: 'Mood', STATUS: 'Status', REEL: 'Reel' },
  es: { POST: 'Publicación', STORY: 'Historia', MOOD: 'Estado de ánimo', STATUS: 'Estado', REEL: 'Reel' },
  pt: { POST: 'Publicação', STORY: 'Story', MOOD: 'Humor', STATUS: 'Status', REEL: 'Reel' },
  de: { POST: 'Beitrag', STORY: 'Story', MOOD: 'Stimmung', STATUS: 'Status', REEL: 'Reel' },
  it: { POST: 'Post', STORY: 'Storia', MOOD: 'Stato d’animo', STATUS: 'Stato', REEL: 'Reel' },
  ar: { POST: 'منشور', STORY: 'قصة', MOOD: 'مزاج', STATUS: 'حالة', REEL: 'ريل' },
  'zh-Hans': { POST: '帖子', STORY: '快拍', MOOD: '心情', STATUS: '状态', REEL: '短视频' },
};

// Nom nu, non capitalisé — pour les langues qui placent le possesseur AVANT
// l'objet (« Windie Nh’s reel », « Windie Nh 的短视频 ») et ne peuvent donc pas
// réutiliser la forme indéfinie (« a reel »).
const BARE_OBJ: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'publication', STORY: 'story', MOOD: 'humeur', STATUS: 'statut', REEL: 'réel' },
  en: { POST: 'post', STORY: 'story', MOOD: 'mood', STATUS: 'status', REEL: 'reel' },
  es: { POST: 'publicación', STORY: 'historia', MOOD: 'estado de ánimo', STATUS: 'estado', REEL: 'reel' },
  pt: { POST: 'publicação', STORY: 'story', MOOD: 'humor', STATUS: 'status', REEL: 'reel' },
  de: { POST: 'Beitrag', STORY: 'Story', MOOD: 'Stimmung', STATUS: 'Status', REEL: 'Reel' },
  it: { POST: 'post', STORY: 'storia', MOOD: 'stato d’animo', STATUS: 'stato', REEL: 'reel' },
  ar: { POST: 'منشور', STORY: 'قصة', MOOD: 'مزاج', STATUS: 'حالة', REEL: 'ريل' },
  'zh-Hans': { POST: '帖子', STORY: '快拍', MOOD: '心情', STATUS: '状态', REEL: '短视频' },
};

// Subtitle "Votre X" (forme nominative possessive, gérée par langue)
const SUBTITLE_OWNER: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'Votre publication', STORY: 'Votre story', MOOD: 'Votre humeur', STATUS: 'Votre statut', REEL: 'Votre réel' },
  en: { POST: 'Your post', STORY: 'Your story', MOOD: 'Your mood', STATUS: 'Your status', REEL: 'Your reel' },
  es: { POST: 'Tu publicación', STORY: 'Tu historia', MOOD: 'Tu estado de ánimo', STATUS: 'Tu estado', REEL: 'Tu reel' },
  pt: { POST: 'Sua publicação', STORY: 'Sua story', MOOD: 'Seu humor', STATUS: 'Seu status', REEL: 'Seu reel' },
  de: { POST: 'Dein Beitrag', STORY: 'Deine Story', MOOD: 'Deine Stimmung', STATUS: 'Dein Status', REEL: 'Dein Reel' },
  it: { POST: 'Il tuo post', STORY: 'La tua storia', MOOD: 'Il tuo stato d’animo', STATUS: 'Il tuo stato', REEL: 'Il tuo reel' },
  ar: { POST: 'منشورك', STORY: 'قصتك', MOOD: 'مزاجك', STATUS: 'حالتك', REEL: 'ريلك' },
  'zh-Hans': { POST: '你的帖子', STORY: '你的快拍', MOOD: '你的心情', STATUS: '你的状态', REEL: '你的短视频' },
};

// Subtitle "Nouvelle X" (forme avec accord de genre, gérée par langue)
const FRIEND_SUBTITLE: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'Nouvelle publication', STORY: 'Nouvelle story', MOOD: 'Nouvelle humeur', STATUS: 'Nouveau statut', REEL: 'Nouveau réel' },
  en: { POST: 'New post', STORY: 'New story', MOOD: 'New mood', STATUS: 'New status', REEL: 'New reel' },
  es: { POST: 'Nueva publicación', STORY: 'Nueva historia', MOOD: 'Nuevo estado de ánimo', STATUS: 'Nuevo estado', REEL: 'Nuevo reel' },
  pt: { POST: 'Nova publicação', STORY: 'Nova story', MOOD: 'Novo humor', STATUS: 'Novo status', REEL: 'Novo reel' },
  de: { POST: 'Neuer Beitrag', STORY: 'Neue Story', MOOD: 'Neue Stimmung', STATUS: 'Neuer Status', REEL: 'Neuer Reel' },
  it: { POST: 'Nuovo post', STORY: 'Nuova storia', MOOD: 'Nuovo stato d’animo', STATUS: 'Nuovo stato', REEL: 'Nuovo reel' },
  ar: { POST: 'منشور جديد', STORY: 'قصة جديدة', MOOD: 'مزاج جديد', STATUS: 'حالة جديدة', REEL: 'ريل جديد' },
  'zh-Hans': { POST: '新帖子', STORY: '新快拍', MOOD: '新心情', STATUS: '新状态', REEL: '新短视频' },
};

// Corps du push VoIP d'appel entrant — phrase complète par type d'appel
// (le hardcode français « Appel vidéo »/« Appel audio » violait le Prisme,
// audit appels 2026-07-11 #11).
const INCOMING_CALL_BODY: Record<NotificationLanguage, CallMap> = {
  fr: { audio: 'Appel audio', video: 'Appel vidéo' },
  en: { audio: 'Audio call', video: 'Video call' },
  es: { audio: 'Llamada de voz', video: 'Videollamada' },
  pt: { audio: 'Chamada de voz', video: 'Chamada de vídeo' },
  de: { audio: 'Sprachanruf', video: 'Videoanruf' },
  it: { audio: 'Chiamata vocale', video: 'Videochiamata' },
  ar: { audio: 'مكالمة صوتية', video: 'مكالمة فيديو' },
  'zh-Hans': { audio: '语音通话', video: '视频通话' },
};

const CALL_LABEL: Record<NotificationLanguage, CallMap> = {
  fr: { audio: 'audio', video: 'vidéo' },
  en: { audio: 'audio', video: 'video' },
  es: { audio: 'de voz', video: 'de vídeo' },
  pt: { audio: 'de voz', video: 'de vídeo' },
  de: { audio: 'Anruf', video: 'Videoanruf' },
  it: { audio: 'vocale', video: 'video' },
  ar: { audio: 'صوتية', video: 'فيديو' },
  'zh-Hans': { audio: '语音通话', video: '视频通话' },
};

// Contexte de reaction.commentVerbose : " sur le <entité> de {author}", entité-conscient.
// Couvre les clés de PROSE (`NotificationPostLabelKind`) — une réaction à un commentaire sur un REEL/STATUS
// ne s'effondre plus vers « post » (symétrie avec reaction.post qui porte déjà le postType).
const COMMENT_CONTEXT: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: ' sur le post de {author}', STORY: ' sur la story de {author}', MOOD: ' sur l’humeur de {author}', STATUS: ' sur le statut de {author}', REEL: ' sur le réel de {author}' },
  en: { POST: ' on {author}’s post', STORY: ' on {author}’s story', MOOD: ' on {author}’s mood', STATUS: ' on {author}’s status', REEL: ' on {author}’s reel' },
  es: { POST: ' en la publicación de {author}', STORY: ' en la historia de {author}', MOOD: ' en el estado de ánimo de {author}', STATUS: ' en el estado de {author}', REEL: ' en el reel de {author}' },
  pt: { POST: ' na publicação de {author}', STORY: ' na story de {author}', MOOD: ' no humor de {author}', STATUS: ' no status de {author}', REEL: ' no reel de {author}' },
  de: { POST: ' im Beitrag von {author}', STORY: ' in der Story von {author}', MOOD: ' in der Stimmung von {author}', STATUS: ' im Status von {author}', REEL: ' im Reel von {author}' },
  it: { POST: ' nel post di {author}', STORY: ' nella storia di {author}', MOOD: ' nello stato d’animo di {author}', STATUS: ' nello stato di {author}', REEL: ' nel reel di {author}' },
  ar: { POST: ' على منشور {author}', STORY: ' على قصة {author}', MOOD: ' على مزاج {author}', STATUS: ' على حالة {author}', REEL: ' على ريل {author}' },
  'zh-Hans': { POST: '（在 {author} 的帖子中）', STORY: '（在 {author} 的快拍中）', MOOD: '（在 {author} 的心情中）', STATUS: '（在 {author} 的状态中）', REEL: '（在 {author} 的短视频中）' },
};

const SUPPORTED = new Set<string>(NOTIFICATION_LANGUAGES);

export function normalizeNotificationLanguage(code?: string | null): NotificationLanguage {
  if (!code) return 'fr';
  const lc = code.toLowerCase();
  if (lc.startsWith('zh')) return 'zh-Hans';
  const base = lc.split(/[-_]/)[0] ?? '';
  return SUPPORTED.has(base) ? (base as NotificationLanguage) : 'fr';
}

type ByteUnits = { readonly b: string; readonly kb: string; readonly mb: string };

/**
 * Unités d’octets par langue. Le français emploie la notation « octet »
 * (o / Ko / Mo) ; toutes les autres langues du catalogue utilisent la notation
 * B / KB / MB, universellement lisible dans un contexte technique. Sans cette
 * localisation, une notification anglaise/allemande affichait « 15.0 Mo » —
 * mot localisé (Video / Foto…) mais unité de taille restée française.
 */
const FRENCH_BYTE_UNITS: ByteUnits = { b: 'o', kb: 'Ko', mb: 'Mo' };
const DEFAULT_BYTE_UNITS: ByteUnits = { b: 'B', kb: 'KB', mb: 'MB' };

/**
 * Formate une taille de fichier en octets vers un libellé court localisé.
 *
 * La langue est normalisée via {@link normalizeNotificationLanguage} (parité
 * stricte avec {@link notificationString}), donc `'fr-FR'` → `'fr'`, `'en-US'`
 * → `'en'`, une langue hors catalogue → `'fr'`.
 *
 * Le palier bascule sur la valeur ARRONDIE (comme `formatCallDataSize`) : sinon
 * 1 048 500 o (< 1 Mio, mais /1024 = 1023,93) afficherait « 1024 Ko » au lieu de
 * « 1.0 Mo ».
 */
export function formatFileSizeI18n(lang: string | null | undefined, bytes: number): string {
  const units = normalizeNotificationLanguage(lang) === 'fr' ? FRENCH_BYTE_UNITS : DEFAULT_BYTE_UNITS;
  if (bytes < 1024) return `${bytes} ${units.b}`;
  const kb = Math.round(bytes / 1024);
  if (kb < 1024) return `${kb} ${units.kb}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${units.mb}`;
}

function interpolate(template: string, tokens: Record<string, string>): string {
  // Chaque `{token}` capture aussi l'espace qui le flanque. Un token absent
  // (`emoji` est optionnel, mais les templates l'enchâssent entre deux espaces)
  // ne doit pas laisser d'espace orphelin : entre deux espaces il se réduit à un
  // seul, en bord il disparaît. Une valeur NON vide conserve ses espaces
  // littéraux tels quels — le contenu utilisateur n'est jamais altéré, et le
  // contexte à espace-en-tête de `COMMENT_CONTEXT` reste intact.
  return template.replace(/( ?)\{(\w+)\}( ?)/g, (_match, lead: string, key: string, tail: string) => {
    const value = tokens[key];
    if (value === undefined || value === '') {
      return lead && tail ? ' ' : '';
    }
    return lead + value + tail;
  });
}

export function notificationString(
  lang: string | null | undefined,
  key: NotificationStringKey,
  params: NotificationStringParams = {},
): string {
  const L = normalizeNotificationLanguage(lang);
  const template = TEMPLATES[L][key];
  if (template === undefined) return '';

  const tokens: Record<string, string> = {
    emoji: params.emoji ?? '',
    actor: params.actor ?? '',
    title: params.title ?? '',
    preview: params.preview ?? '',
    author: params.author ?? '',
    count: params.count != null ? String(params.count) : '',
    callIcon: params.callIcon ?? '',
  };

  if (params.postType) {
    tokens.possObj = POSS_OBJ[L][params.postType];
    tokens.reactObj = REACT_OBJ[L][params.postType];
    tokens.indefObj = INDEF_OBJ[L][params.postType];
    tokens.locObj = LOC_OBJ[L][params.postType];
    tokens.nounCap = POST_NOUN_CAP[L][params.postType];
    tokens.bareObj = BARE_OBJ[L][params.postType];
    tokens.ownerSubtitle = SUBTITLE_OWNER[L][params.postType];
    tokens.friendSubtitle = FRIEND_SUBTITLE[L][params.postType];
  }
  if (params.callType) {
    tokens.callLabel = CALL_LABEL[L][params.callType];
    tokens.callBody = INCOMING_CALL_BODY[L][params.callType];
  }

  if (key === 'reaction.commentVerbose') {
    // postType (entité réelle) prime ; `isStory` reste un repli legacy binaire.
    const kind: NotificationPostLabelKind = params.postType ?? (params.isStory ? 'STORY' : 'POST');
    tokens.context = params.author
      ? interpolate(COMMENT_CONTEXT[L][kind], { author: params.author })
      : '';
  }

  return interpolate(template, tokens);
}

// ──────────────────────────────────────────────────────────────────────────
// Display builder — titre (headline) + sous-titre localisés (source unique)
// ──────────────────────────────────────────────────────────────────────────
//
// La liste in-app (iOS/iPadOS/macOS) et le web affichent un titre « acteur +
// action » précis et conscient de l'entité (story / réel / publication / humeur
// / statut). Historiquement ce titre était reconstruit côté client en français
// codé en dur — d'où des libellés imprécis et non localisés (« a commenté votre
// publication » même pour une réponse à un commentaire sur une story).
//
// `buildNotificationDisplay` centralise ce calcul côté serveur, à la langue
// résolue du destinataire (Prisme-first). Le résultat est PERSISTÉ sur la
// Notification puis renvoyé tel quel via REST / socket / push — donc identique
// sur toutes les plateformes. Le client n'ajoute QUE la décoration dépendante
// de l'appareil : la date locale (fuseau + format régional).
//
// Le sous-titre retourné NE contient PAS de date — le client l'append.
// Retourne `{ title: null }` pour les types non gérés ici (messages, appels,
// système…) : le client conserve alors son rendu de repli.

export type NotificationDisplayInput = {
  readonly type: string;
  /** Nom affiché de l'acteur (déjà résolu). */
  readonly actorName?: string | null;
  /** Type d'entité sociale liée (pilote l'accord et le nom) — normalisé en interne. */
  readonly postType?: string | null;
  readonly emoji?: string | null;
  /** Aperçu du commentaire parent (réponse à un commentaire). */
  readonly parentCommentPreview?: string | null;
  /**
   * Nom de l'AUTEUR du contenu visé, quand ce n'est pas le lecteur — « a
   * commenté un réel DE WINDIE NH ». Fusionné dans la phrase d'action plutôt
   * que juxtaposé en sous-titre, pour que la formulation soit la même que
   * lorsque le contenu appartient au lecteur (« a commenté VOTRE réel »).
   *
   * Ignoré par les types dont l'action est déjà possessive : « a commenté
   * votre réel de Windie Nh » désignerait deux propriétaires.
   */
  readonly authorName?: string | null;
};

export type NotificationDisplay = {
  /** Titre « acteur + action » localisé, conscient de l'entité, ou null. */
  readonly title: string | null;
  /** Base de sous-titre localisée (SANS date — le client l'append), ou null. */
  readonly subtitle: string | null;
  /**
   * L'action SEULE, sans l'acteur (« a commenté un réel ») — le titre en est
   * exactement la composition `<acteur> <action>`.
   *
   * Elle existe parce qu'une bannière push iOS ne peut PAS porter le titre
   * riche : sur le chemin Communication Notification, iOS réécrit le titre
   * avec le `displayName` de l'`INPerson` expéditeur. L'action doit donc
   * voyager séparément pour être rendue sous le nom. `null` partout où
   * `title` est `null`.
   */
  readonly action: string | null;
};

/**
 * La clé de libellé par type de contenu référençant — UNE ligne par valeur que
 * la base sait produire.
 *
 * Elle en portait une cinquième, `MOOD: 'reference.status'`, qui était une
 * TRADUCTION INTERNE entre deux noms d'une même chose. Le § 7 dit qu'il n'y en
 * a qu'un sur le fil : la traduction se fait maintenant UNE fois, à la
 * frontière (`wirePostKind`), et cette table n'a plus à la connaître (#4906).
 */
const REFERENCE_KEY_BY_KIND: Record<NotificationPostKind, NotificationStringKey> = {
  POST: 'reference.post',
  REEL: 'reference.reel',
  STORY: 'reference.story',
  STATUS: 'reference.status',
};

/**
 * Les clés que le catalogue sait rendre — PROJECTION d'un `ObjMap`, jamais une
 * liste tenue à la main. Une liste recopiée est exactement ce qui laisse un
 * membre neuf de `PostType` passer pour « inconnu » et retomber sur le libellé
 * générique : ici, le membre neuf casse d'abord les neuf tables de libellés
 * (elles sont exhaustives par type), puis entre ici tout seul.
 */
const POST_LABEL_KINDS: ReadonlySet<string> = new Set(Object.keys(POST_NOUN_CAP.fr));

/**
 * Normalise un postType potentiellement absent/inconnu vers une clé de PROSE
 * sûre. Tolérante par contrat : elle accepte encore `'MOOD'`, parce qu'une
 * notification déjà persistée peut le porter et qu'aucun lecteur ne doit
 * moins bien la rendre qu'hier.
 */
function normalizePostKind(value?: string | null): NotificationPostLabelKind | undefined {
  if (!value) return undefined;
  const up = value.toUpperCase();
  return POST_LABEL_KINDS.has(up) ? (up as NotificationPostLabelKind) : undefined;
}

/**
 * La frontière, en une fonction : une clé de PROSE devient l'identifiant que
 * le FIL connaît. C'est le SEUL endroit du catalogue où « MOOD » se traduit —
 * partout ailleurs il reste un mot, jamais un discriminant.
 */
const wirePostKind = (kind: NotificationPostLabelKind): NotificationPostKind =>
  kind === 'MOOD' ? 'STATUS' : kind;

export function buildNotificationDisplay(
  lang: string | null | undefined,
  input: NotificationDisplayInput,
): NotificationDisplay {
  const L = normalizeNotificationLanguage(lang);
  const actor = (input.actorName && input.actorName.trim() !== '')
    ? input.actorName.trim()
    : notificationString(L, 'someone');
  const emoji = input.emoji ?? undefined;
  const kind = normalizePostKind(input.postType);
  const ns = (key: NotificationStringKey, postType?: NotificationPostLabelKind) =>
    notificationString(L, key, { ...(emoji ? { emoji } : {}), ...(postType ? { postType } : {}) });
  const nounCap = kind ? notificationString(L, 'comment.subtitleBare', { postType: kind }) : null;
  const author = (input.authorName && input.authorName.trim() !== '') ? input.authorName.trim() : null;
  // Un seul point de composition : le titre NAÎT du fragment d'action, et le
  // fragment est conservé tel quel. Rien ne peut diverger entre les deux.
  const framed = (fragment: string, subtitle: string | null): NotificationDisplay => ({
    title: `${actor} ${fragment}`.trim(),
    subtitle,
    action: fragment,
  });

  switch (input.type) {
    // ── Réactions sur contenu (post / story / humeur / statut / réel) ──
    case 'post_like':
    case 'story_reaction':
    case 'status_reaction':
      return framed(
        ns('reaction.post', kind ?? 'POST'),
        kind ? notificationString(L, 'comment.subtitleOwner', { postType: kind }) : null,
      );

    // ── Commentaire sur VOTRE contenu ──
    case 'post_comment':
    case 'story_new_comment': {
      const ownKind = kind ?? (input.type === 'story_new_comment' ? 'STORY' : 'POST');
      return framed(
        ns('comment.your', ownKind),
        notificationString(L, 'comment.subtitleOwner', { postType: ownKind }),
      );
    }

    // ── Commentaire sur le contenu d'un AMI (fil / engagement) ──
    //
    // L'auteur du contenu, quand on le connaît, entre DANS la phrase : la
    // forme « de {author} » ne se concatène pas côté serveur car les langues
    // ne s'accordent pas sur sa place (« Windie Nh’s reel », « Windie Nh 的
    // 短视频 ») — chaque catalogue porte donc sa propre variante.
    case 'friend_story_comment':
      return framed(
        author
          ? notificationString(L, 'comment.genericFrom', { postType: kind ?? 'STORY', author })
          : ns('comment.generic', kind ?? 'STORY'),
        nounCap,
      );
    case 'story_thread_reply':
      return framed(
        author
          ? notificationString(L, 'comment.repliedInFrom', { postType: kind ?? 'STORY', author })
          : ns('comment.repliedIn', kind ?? 'STORY'),
        nounCap,
      );

    // ── Réponse à VOTRE commentaire (corrige le bug « a commenté votre publication ») ──
    case 'comment_reply': {
      const parent = input.parentCommentPreview?.trim();
      return framed(
        notificationString(L, 'comment.repliedToYours'),
        (parent && parent !== '')
          ? notificationString(L, 'comment.replyWithParent', { preview: parent })
          : (nounCap ?? notificationString(L, 'comment.reply')),
      );
    }

    // ── Réaction sur VOTRE commentaire ──
    case 'comment_like':
    case 'comment_reaction':
      return framed(ns('reaction.comment'), nounCap);

    // ── Relation : demande reçue / demande acceptée ──
    //
    // Sans phrase d'action, ces deux types n'avaient qu'un `content` en GROUPE
    // NOMINAL (« Nouvelle demande de contact ») : une bannière ne peut pas en
    // tirer « X veut se connecter » sans réécrire du français en dur, ce que le
    // Prisme (i18n serveur) interdit. Aucun sous-titre : il n'y a pas de
    // contenu visé dont on nommerait l'entité.
    case 'friend_request':
    case 'contact_request':
      return framed(notificationString(L, 'contact.requestAction'), null);
    case 'friend_accepted':
    case 'contact_accepted':
      return framed(notificationString(L, 'contact.acceptedAction'), null);

    // ── Partage / repost ──
    case 'post_repost':
      return framed(
        ns('repost', kind ?? 'POST'),
        kind ? notificationString(L, 'comment.subtitleOwner', { postType: kind }) : null,
      );

    // ── Nouveau contenu d'un ami ──
    case 'friend_new_story':
      return framed(
        notificationString(L, 'friend.story'),
        notificationString(L, 'friend.subtitleNew', { postType: 'STORY' }),
      );
    case 'friend_new_post':
      // Un réel reste le type de notification `friend_new_post` (variante de post),
      // mais son titre ET son sous-titre restent conscients de l'entité — le
      // discriminant `postType: REEL` est justement « conservé pour l'affichage
      // client ». Sans titre réel-conscient, un nouveau réel s'annonçait « a
      // publié un nouveau post » alors que le sous-titre disait déjà « Nouveau
      // réel » : titre et sous-titre se contredisaient sur la même entrée.
      return framed(
        notificationString(L, kind === 'REEL' ? 'friend.reel' : 'friend.post'),
        notificationString(L, 'friend.subtitleNew', { postType: kind === 'REEL' ? 'REEL' : 'POST' }),
      );
    case 'friend_new_mood':
      // « MOOD » est ici une clé de PROSE, jamais un discriminant : le
      // sous-titre que l'auteur lit dit « Nouvelle humeur », et c'est
      // exactement la moitié de la frontière que le § 7 protège. Le
      // discriminant qui voyage avec la notification, lui, dit STATUS.
      return framed(
        notificationString(L, 'friend.mood'),
        notificationString(L, 'friend.subtitleNew', { postType: 'MOOD' }),
      );

    // ── Référence dans un contenu, ou mention en conversation / commentaire ──
    case 'mention':
    case 'user_mentioned':
      // Le type du contenu décide du libellé. Absent, c'est une mention en
      // conversation ou en commentaire : le libellé générique reste le bon.
      //
      // Deux variables parce que deux questions : `kind` NOMME l'entité (prose,
      // le mot que l'auteur lit), `wirePostKind(kind)` la ROUTE vers sa clé de
      // libellé (identifiant, ce que la base sait produire).
      return kind
        ? framed(ns(REFERENCE_KEY_BY_KIND[wirePostKind(kind)]), nounCap)
        : framed(notificationString(L, 'mention'), nounCap);

    default:
      // Types non gérés ici (messages, appels, contacts, système…) :
      // le client conserve son rendu de repli.
      return { title: null, subtitle: null, action: null };
  }
}
