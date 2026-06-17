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
  'comment.subtitleOwner', 'comment.subtitleFrom', 'comment.subtitleBare',
  'mention',
  'friend.story', 'friend.post', 'friend.mood', 'friend.subtitleNew',
  'call.missed',
  'contact.request', 'contact.accepted',
  'repost',
  'invitation.group', 'invitation.direct',
  'group.added', 'group.newContact',
  'attachment.photo', 'attachment.video', 'attachment.audio', 'attachment.document', 'attachment.files',
  'login.newDevice.title',
] as const;
export type NotificationStringKey = typeof NOTIFICATION_STRING_KEYS[number];

export type NotificationPostKind = 'POST' | 'STORY' | 'MOOD' | 'STATUS';
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
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} de {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'vous a mentionné',
    'friend.story': 'a publié une nouvelle story',
    'friend.post': 'a publié un nouveau post',
    'friend.mood': 'a publié une nouvelle humeur',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Appel {callLabel} manqué',
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
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} from {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'mentioned you',
    'friend.story': 'shared a new story',
    'friend.post': 'shared a new post',
    'friend.mood': 'shared a new mood',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Missed {callLabel} call',
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
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} de {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'te mencionó',
    'friend.story': 'publicó una nueva historia',
    'friend.post': 'publicó una nueva publicación',
    'friend.mood': 'publicó un nuevo estado de ánimo',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Llamada {callLabel} perdida',
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
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} de {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'mencionou você',
    'friend.story': 'publicou uma nova story',
    'friend.post': 'publicou uma nova publicação',
    'friend.mood': 'publicou um novo humor',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Chamada {callLabel} perdida',
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
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} von {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'hat dich erwähnt',
    'friend.story': 'hat eine neue Story geteilt',
    'friend.post': 'hat einen neuen Beitrag geteilt',
    'friend.mood': 'hat eine neue Stimmung geteilt',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Verpasster {callLabel}',
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
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} di {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'ti ha menzionato',
    'friend.story': 'ha pubblicato una nuova storia',
    'friend.post': 'ha pubblicato un nuovo post',
    'friend.mood': 'ha pubblicato un nuovo stato d’animo',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} Chiamata {callLabel} persa',
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
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{nounCap} من {author}',
    'comment.subtitleBare': '{nounCap}',
    'mention': 'أشار إليك',
    'friend.story': 'نشر قصة جديدة',
    'friend.post': 'نشر منشورًا جديدًا',
    'friend.mood': 'شارك مزاجًا جديدًا',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} مكالمة {callLabel} فائتة',
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
    'comment.subtitleOwner': '{ownerSubtitle}',
    'comment.subtitleFrom': '{author} 的{nounCap}',
    'comment.subtitleBare': '{nounCap}',
    'mention': '提到了你',
    'friend.story': '发布了新快拍',
    'friend.post': '发布了新帖子',
    'friend.mood': '分享了新心情',
    'friend.subtitleNew': '{friendSubtitle}',
    'call.missed': '{callIcon} 未接{callLabel}',
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
  fr: { POST: 'votre publication', STORY: 'votre story', MOOD: 'votre humeur', STATUS: 'votre statut' },
  en: { POST: 'your post', STORY: 'your story', MOOD: 'your mood', STATUS: 'your status' },
  es: { POST: 'tu publicación', STORY: 'tu historia', MOOD: 'tu estado de ánimo', STATUS: 'tu estado' },
  pt: { POST: 'sua publicação', STORY: 'sua story', MOOD: 'seu humor', STATUS: 'seu status' },
  de: { POST: 'deinen Beitrag', STORY: 'deine Story', MOOD: 'deine Stimmung', STATUS: 'deinen Status' },
  it: { POST: 'il tuo post', STORY: 'la tua storia', MOOD: 'il tuo stato d’animo', STATUS: 'il tuo stato' },
  ar: { POST: 'منشورك', STORY: 'قصتك', MOOD: 'مزاجك', STATUS: 'حالتك' },
  'zh-Hans': { POST: '你的帖子', STORY: '你的快拍', MOOD: '你的心情', STATUS: '你的状态' },
};

// "à votre X" (préposition de réaction + possessif) — reaction.post
const REACT_OBJ: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'à votre publication', STORY: 'à votre story', MOOD: 'à votre humeur', STATUS: 'à votre statut' },
  en: { POST: 'to your post', STORY: 'to your story', MOOD: 'to your mood', STATUS: 'to your status' },
  es: { POST: 'a tu publicación', STORY: 'a tu historia', MOOD: 'a tu estado de ánimo', STATUS: 'a tu estado' },
  pt: { POST: 'à sua publicação', STORY: 'à sua story', MOOD: 'ao seu humor', STATUS: 'ao seu status' },
  de: { POST: 'auf deinen Beitrag', STORY: 'auf deine Story', MOOD: 'auf deine Stimmung', STATUS: 'auf deinen Status' },
  it: { POST: 'al tuo post', STORY: 'alla tua storia', MOOD: 'al tuo stato d’animo', STATUS: 'al tuo stato' },
  ar: { POST: 'على منشورك', STORY: 'على قصتك', MOOD: 'على مزاجك', STATUS: 'على حالتك' },
  'zh-Hans': { POST: '你的帖子', STORY: '你的快拍', MOOD: '你的心情', STATUS: '你的状态' },
};

// "une X" (indéfini, accusatif) — comment.generic
const INDEF_OBJ: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'une publication', STORY: 'une story', MOOD: 'une humeur', STATUS: 'un statut' },
  en: { POST: 'a post', STORY: 'a story', MOOD: 'a mood', STATUS: 'a status' },
  es: { POST: 'una publicación', STORY: 'una historia', MOOD: 'un estado de ánimo', STATUS: 'un estado' },
  pt: { POST: 'uma publicação', STORY: 'uma story', MOOD: 'um humor', STATUS: 'um status' },
  de: { POST: 'einen Beitrag', STORY: 'eine Story', MOOD: 'eine Stimmung', STATUS: 'einen Status' },
  it: { POST: 'un post', STORY: 'una storia', MOOD: 'uno stato d’animo', STATUS: 'uno stato' },
  ar: { POST: 'منشورًا', STORY: 'قصة', MOOD: 'مزاجًا', STATUS: 'حالة' },
  'zh-Hans': { POST: '帖子', STORY: '快拍', MOOD: '心情', STATUS: '状态' },
};

// "dans une X" (locatif/datif) — comment.repliedIn
const LOC_OBJ: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'dans une publication', STORY: 'dans une story', MOOD: 'dans une humeur', STATUS: 'dans un statut' },
  en: { POST: 'in a post', STORY: 'in a story', MOOD: 'in a mood', STATUS: 'in a status' },
  es: { POST: 'en una publicación', STORY: 'en una historia', MOOD: 'en un estado de ánimo', STATUS: 'en un estado' },
  pt: { POST: 'em uma publicação', STORY: 'em uma story', MOOD: 'em um humor', STATUS: 'em um status' },
  de: { POST: 'in einem Beitrag', STORY: 'in einer Story', MOOD: 'in einer Stimmung', STATUS: 'in einem Status' },
  it: { POST: 'in un post', STORY: 'in una storia', MOOD: 'in uno stato d’animo', STATUS: 'in uno stato' },
  ar: { POST: 'في منشور', STORY: 'في قصة', MOOD: 'في مزاج', STATUS: 'في حالة' },
  'zh-Hans': { POST: '在帖子中', STORY: '在快拍中', MOOD: '在心情中', STATUS: '在状态中' },
};

// Nom capitalisé nu (subtitle "{nounCap} de {author}" / bare)
const POST_NOUN_CAP: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'Publication', STORY: 'Story', MOOD: 'Humeur', STATUS: 'Statut' },
  en: { POST: 'Post', STORY: 'Story', MOOD: 'Mood', STATUS: 'Status' },
  es: { POST: 'Publicación', STORY: 'Historia', MOOD: 'Estado de ánimo', STATUS: 'Estado' },
  pt: { POST: 'Publicação', STORY: 'Story', MOOD: 'Humor', STATUS: 'Status' },
  de: { POST: 'Beitrag', STORY: 'Story', MOOD: 'Stimmung', STATUS: 'Status' },
  it: { POST: 'Post', STORY: 'Storia', MOOD: 'Stato d’animo', STATUS: 'Stato' },
  ar: { POST: 'منشور', STORY: 'قصة', MOOD: 'مزاج', STATUS: 'حالة' },
  'zh-Hans': { POST: '帖子', STORY: '快拍', MOOD: '心情', STATUS: '状态' },
};

// Subtitle "Votre X" (forme nominative possessive, gérée par langue)
const SUBTITLE_OWNER: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'Votre publication', STORY: 'Votre story', MOOD: 'Votre humeur', STATUS: 'Votre statut' },
  en: { POST: 'Your post', STORY: 'Your story', MOOD: 'Your mood', STATUS: 'Your status' },
  es: { POST: 'Tu publicación', STORY: 'Tu historia', MOOD: 'Tu estado de ánimo', STATUS: 'Tu estado' },
  pt: { POST: 'Sua publicação', STORY: 'Sua story', MOOD: 'Seu humor', STATUS: 'Seu status' },
  de: { POST: 'Dein Beitrag', STORY: 'Deine Story', MOOD: 'Deine Stimmung', STATUS: 'Dein Status' },
  it: { POST: 'Il tuo post', STORY: 'La tua storia', MOOD: 'Il tuo stato d’animo', STATUS: 'Il tuo stato' },
  ar: { POST: 'منشورك', STORY: 'قصتك', MOOD: 'مزاجك', STATUS: 'حالتك' },
  'zh-Hans': { POST: '你的帖子', STORY: '你的快拍', MOOD: '你的心情', STATUS: '你的状态' },
};

// Subtitle "Nouvelle X" (forme avec accord de genre, gérée par langue)
const FRIEND_SUBTITLE: Record<NotificationLanguage, ObjMap> = {
  fr: { POST: 'Nouvelle publication', STORY: 'Nouvelle story', MOOD: 'Nouvelle humeur', STATUS: 'Nouveau statut' },
  en: { POST: 'New post', STORY: 'New story', MOOD: 'New mood', STATUS: 'New status' },
  es: { POST: 'Nueva publicación', STORY: 'Nueva historia', MOOD: 'Nuevo estado de ánimo', STATUS: 'Nuevo estado' },
  pt: { POST: 'Nova publicação', STORY: 'Nova story', MOOD: 'Novo humor', STATUS: 'Novo status' },
  de: { POST: 'Neuer Beitrag', STORY: 'Neue Story', MOOD: 'Neue Stimmung', STATUS: 'Neuer Status' },
  it: { POST: 'Nuovo post', STORY: 'Nuova storia', MOOD: 'Nuovo stato d’animo', STATUS: 'Nuovo stato' },
  ar: { POST: 'منشور جديد', STORY: 'قصة جديدة', MOOD: 'مزاج جديد', STATUS: 'حالة جديدة' },
  'zh-Hans': { POST: '新帖子', STORY: '新快拍', MOOD: '新心情', STATUS: '新状态' },
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

// Contexte de reaction.commentVerbose : " sur le post de {author}" / " sur la story de {author}"
const COMMENT_CONTEXT: Record<NotificationLanguage, { story: string; post: string }> = {
  fr: { story: ' sur la story de {author}', post: ' sur le post de {author}' },
  en: { story: ' on {author}’s story', post: ' on {author}’s post' },
  es: { story: ' en la historia de {author}', post: ' en la publicación de {author}' },
  pt: { story: ' na story de {author}', post: ' na publicação de {author}' },
  de: { story: ' in der Story von {author}', post: ' im Beitrag von {author}' },
  it: { story: ' nella storia di {author}', post: ' nel post di {author}' },
  ar: { story: ' على قصة {author}', post: ' على منشور {author}' },
  'zh-Hans': { story: '（在 {author} 的快拍中）', post: '（在 {author} 的帖子中）' },
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
  if (params.callType) tokens.callLabel = CALL_LABEL[L][params.callType];

  if (key === 'reaction.commentVerbose') {
    tokens.context = params.author
      ? interpolate(COMMENT_CONTEXT[L][params.isStory ? 'story' : 'post'], { author: params.author })
      : '';
  }

  return interpolate(template, tokens);
}
