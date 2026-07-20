/**
 * Catalogue i18n des textes système de notification (source unique).
 * Localisation côté serveur, à la langue résolue du destinataire (Prisme-first).
 * @see docs/superpowers/specs/2026-06-16-notification-system-i18n-design.md
 */

export const NOTIFICATION_LANGUAGES = [
  'ar', 'de', 'en', 'es', 'fr', 'it', 'pt', 'zh-Hans',
] as const;
export type NotificationLanguage = typeof NOTIFICATION_LANGUAGES[number];

export const NOTIFICATION_STRING_KEYS = [
  'reaction.message', 'reaction.comment', 'reaction.commentVerbose', 'reaction.post',
  'comment.your', 'comment.generic', 'comment.repliedIn', 'comment.reply', 'comment.replyWithParent',
  'comment.repliedToYours',
  'comment.subtitleOwner', 'comment.subtitleFrom', 'comment.subtitleBare',
  'mention', 'someone',
  'friend.story', 'friend.post', 'friend.mood', 'friend.subtitleNew',
  'call.missed', 'call.incoming.title', 'call.incoming.body',
  'contact.request', 'contact.accepted',
  'repost',
  'invitation.group', 'invitation.direct',
  'group.added', 'group.newContact',
  'attachment.photo', 'attachment.video', 'attachment.audio', 'attachment.document', 'attachment.files',
  'login.newDevice.title',
] as const;
export type NotificationStringKey = typeof NOTIFICATION_STRING_KEYS[number];

export type NotificationPostKind = 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';
export type NotificationCallKind = 'audio' | 'video';

export type NotificationStringParams = {
  readonly emoji?: string;
  readonly actor?: string;
  readonly title?: string;
  readonly preview?: string;
  readonly author?: string;
  readonly count?: number;
  readonly callIcon?: string;
  readonly postType?: NotificationPostKind;
  readonly callType?: NotificationCallKind;
  readonly isStory?: boolean;
};

type Templates = Record<NotificationStringKey, string>;
type ObjMap = Record<NotificationPostKind, string>;
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
    'someone': 'Quelqu’un',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} de {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'vous a mentionné',
    'friend.story': 'a publié une nouvelle story',
    'friend.post': 'a publié un nouveau post',
    'friend.mood': 'a publié une nouvelle humeur',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Appel {callLabel} manqué',
    'call.incoming.title': '{actor} vous appelle',
    'call.incoming.body': '{callBody}',
    'contact.request': 'Nouvelle demande de contact',
    'contact.accepted': 'Demande de contact acceptée',
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
    'someone': 'Someone',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} from {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'mentioned you',
    'friend.story': 'shared a new story',
    'friend.post': 'shared a new post',
    'friend.mood': 'shared a new mood',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Missed {callLabel} call',
    'call.incoming.title': '{actor} is calling you',
    'call.incoming.body': '{callBody}',
    'contact.request': 'New contact request',
    'contact.accepted': 'Contact request accepted',
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
    'someone': 'Alguien',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} de {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'te mencionó',
    'friend.story': 'publicó una nueva historia',
    'friend.post': 'publicó una nueva publicación',
    'friend.mood': 'publicó un nuevo estado de ánimo',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Llamada {callLabel} perdida',
    'call.incoming.title': '{actor} te está llamando',
    'call.incoming.body': '{callBody}',
    'contact.request': 'Nueva solicitud de contacto',
    'contact.accepted': 'Solicitud de contacto aceptada',
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
    'someone': 'Alguém',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} de {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'mencionou você',
    'friend.story': 'publicou uma nova story',
    'friend.post': 'publicou uma nova publicação',
    'friend.mood': 'publicou um novo humor',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Chamada {callLabel} perdida',
    'call.incoming.title': '{actor} está ligando para você',
    'call.incoming.body': '{callBody}',
    'contact.request': 'Novo pedido de contato',
    'contact.accepted': 'Pedido de contato aceito',
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
    'someone': 'Jemand',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} von {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'hat dich erwähnt',
    'friend.story': 'hat eine neue Story geteilt',
    'friend.post': 'hat einen neuen Beitrag geteilt',
    'friend.mood': 'hat eine neue Stimmung geteilt',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Verpasster {callLabel}',
    'call.incoming.title': '{actor} ruft dich an',
    'call.incoming.body': '{callBody}',
    'contact.request': 'Neue Kontaktanfrage',
    'contact.accepted': 'Kontaktanfrage angenommen',
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
    'someone': 'Qualcuno',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} di {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'ti ha menzionato',
    'friend.story': 'ha pubblicato una nuova storia',
    'friend.post': 'ha pubblicato un nuovo post',
    'friend.mood': 'ha pubblicato un nuovo stato d’animo',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Chiamata {callLabel} persa',
    'call.incoming.title': '{actor} ti sta chiamando',
    'call.incoming.body': '{callBody}',
    'contact.request': 'Nuova richiesta di contatto',
    'contact.accepted': 'Richiesta di contatto accettata',
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
    'someone': 'شخص ما',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} من {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'أشار إليك',
    'friend.story': 'نشر قصة جديدة',
    'friend.post': 'نشر منشورًا جديدًا',
    'friend.mood': 'شارك مزاجًا جديدًا',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} مكالمة {callLabel} فائتة',
    'call.incoming.title': '{actor} يتصل بك',
    'call.incoming.body': '{callBody}',
    'contact.request': 'طلب تواصل جديد',
    'contact.accepted': 'تم قبول طلب التواصل',
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
    'someone': '有人',
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{author} 的{nounCap}',
    'comment.subtitleBare': '{nounCap}',
    'mention': '提到了你',
    'friend.story': '发布了新快拍',
    'friend.post': '发布了新帖子',
    'friend.mood': '分享了新心情',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} 未接{callLabel}',
    'call.incoming.title': '{actor} 来电',
    'call.incoming.body': '{callBody}',
    'contact.request': '新的联系人请求',
    'contact.accepted': '联系人请求已接受',
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
// Couvre les 5 NotificationPostKind — une réaction à un commentaire sur un REEL/STATUS
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

function interpolate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = tokens[k];
    return v === undefined ? '' : v;
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
    tokens.ownerSubtitle = SUBTITLE_OWNER[L][params.postType];
    tokens.friendSubtitle = FRIEND_SUBTITLE[L][params.postType];
  }
  if (params.callType) {
    tokens.callLabel = CALL_LABEL[L][params.callType];
    tokens.callBody = INCOMING_CALL_BODY[L][params.callType];
  }

  if (key === 'reaction.commentVerbose') {
    // postType (entité réelle) prime ; `isStory` reste un repli legacy binaire.
    const kind: NotificationPostKind = params.postType ?? (params.isStory ? 'STORY' : 'POST');
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
};

export type NotificationDisplay = {
  /** Titre « acteur + action » localisé, conscient de l'entité, ou null. */
  readonly title: string | null;
  /** Base de sous-titre localisée (SANS date — le client l'append), ou null. */
  readonly subtitle: string | null;
};

/** Normalise un postType potentiellement absent/inconnu vers une clé sûre. */
function normalizePostKind(value?: string | null): NotificationPostKind | undefined {
  if (!value) return undefined;
  const up = value.toUpperCase();
  return (['POST', 'STORY', 'MOOD', 'STATUS', 'REEL'] as const).includes(up as NotificationPostKind)
    ? (up as NotificationPostKind)
    : undefined;
}

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
  const ns = (key: NotificationStringKey, postType?: NotificationPostKind) =>
    notificationString(L, key, { ...(emoji ? { emoji } : {}), ...(postType ? { postType } : {}) });
  const compose = (fragment: string) => `${actor} ${fragment}`.trim();
  const nounCap = kind ? notificationString(L, 'comment.subtitleBare', { postType: kind }) : null;

  switch (input.type) {
    // ── Réactions sur contenu (post / story / humeur / statut / réel) ──
    case 'post_like':
    case 'story_reaction':
    case 'status_reaction':
      return {
        title: compose(ns('reaction.post', kind ?? 'POST')),
        subtitle: kind ? notificationString(L, 'comment.subtitleOwner', { postType: kind }) : null,
      };

    // ── Commentaire sur VOTRE contenu ──
    case 'post_comment':
    case 'story_new_comment':
      return {
        title: compose(ns('comment.your', kind ?? (input.type === 'story_new_comment' ? 'STORY' : 'POST'))),
        subtitle: notificationString(L, 'comment.subtitleOwner', { postType: kind ?? (input.type === 'story_new_comment' ? 'STORY' : 'POST') }),
      };

    // ── Commentaire sur le contenu d'un AMI (fil / engagement) ──
    case 'friend_story_comment':
      return {
        title: compose(ns('comment.generic', kind ?? 'STORY')),
        subtitle: nounCap,
      };
    case 'story_thread_reply':
      return {
        title: compose(ns('comment.repliedIn', kind ?? 'STORY')),
        subtitle: nounCap,
      };

    // ── Réponse à VOTRE commentaire (corrige le bug « a commenté votre publication ») ──
    case 'comment_reply': {
      const parent = input.parentCommentPreview?.trim();
      return {
        title: compose(notificationString(L, 'comment.repliedToYours')),
        subtitle: (parent && parent !== '')
          ? notificationString(L, 'comment.replyWithParent', { preview: parent })
          : (nounCap ?? notificationString(L, 'comment.reply')),
      };
    }

    // ── Réaction sur VOTRE commentaire ──
    case 'comment_like':
    case 'comment_reaction':
      return {
        title: compose(ns('reaction.comment')),
        subtitle: nounCap,
      };

    // ── Partage / repost ──
    case 'post_repost':
      return {
        title: compose(ns('repost', kind ?? 'POST')),
        subtitle: kind ? notificationString(L, 'comment.subtitleOwner', { postType: kind }) : null,
      };

    // ── Nouveau contenu d'un ami ──
    case 'friend_new_story':
      return { title: compose(notificationString(L, 'friend.story')), subtitle: notificationString(L, 'friend.subtitleNew', { postType: 'STORY' }) };
    case 'friend_new_post':
      return { title: compose(notificationString(L, 'friend.post')), subtitle: notificationString(L, 'friend.subtitleNew', { postType: kind === 'REEL' ? 'REEL' : 'POST' }) };
    case 'friend_new_mood':
      return { title: compose(notificationString(L, 'friend.mood')), subtitle: notificationString(L, 'friend.subtitleNew', { postType: 'MOOD' }) };

    // ── Mention (conversation ou commentaire) ──
    case 'mention':
    case 'user_mentioned':
      return { title: compose(notificationString(L, 'mention')), subtitle: nounCap };

    default:
      // Types non gérés ici (messages, appels, contacts, système…) :
      // le client conserve son rendu de repli.
      return { title: null, subtitle: null };
  }
}
