# Notification System i18n — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localiser tous les textes système des notifications dans la langue résolue du destinataire (Prisme-first), côté serveur, sur 8 langues.

**Architecture:** Un catalogue i18n unique vit dans `packages/shared`. Le gateway résout la langue du destinataire via `resolveUserLanguage()` puis construit chaque `content`/`subtitle`/`title` depuis le catalogue. iOS (NSE + toast in-app) cesse de reconstruire en français et affiche le texte du gateway.

**Tech Stack:** TypeScript (shared, strict) + vitest ; gateway (Fastify, jest) ; Swift (iOS, NSE + MeeshyUI).

**Spec de référence:** `docs/superpowers/specs/2026-06-16-notification-system-i18n-design.md`

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `packages/shared/utils/notification-strings.ts` (créer) | Catalogue 8 langues + `notificationString()` + `normalizeNotificationLanguage()`. Aucune dépendance gateway/Prisma. |
| `packages/shared/utils/index.ts` (modifier) | Ré-exporter le nouveau module. |
| `packages/shared/__tests__/utils/notification-strings.test.ts` (créer) | Complétude des 8 langues, normalisation, interpolation. |
| `services/gateway/src/services/notifications/NotificationService.ts` (modifier) | Helpers `resolveRecipientLang`/`resolveRecipientLangs` + remplacement des ~18 chaînes FR + threading `lang` dans les fonctions d'attachment. |
| `services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts` (créer) | Localisation par destinataire (en/de/ar), non-override deviceLocale, fallback fr. |
| `apps/ios/MeeshyNotificationExtension/NotificationService.swift` (modifier) | Supprimer la reconstruction FR des réactions ; afficher le `content` gateway. |
| `apps/ios/.../MeeshyUI/Notifications/SocketNotificationEvent+Toast.swift` (modifier) | Corps du toast in-app = `content` gateway, plus de rebuild FR. |

**Conventions :**
- Catalogue dans `shared` (strict, `readonly`, pas de `any`) — single source of truth.
- Gateway importe via subpath : `import { notificationString, normalizeNotificationLanguage } from '@meeshy/shared/utils/notification-strings'` (même style que `resolveUserLanguage`).
- Fallback catalogue = **`fr`** (cohérent avec `resolveUserLanguage`).

---

## Task 1: Catalogue i18n partagé

**Files:**
- Create: `packages/shared/utils/notification-strings.ts`
- Modify: `packages/shared/utils/index.ts`
- Test: `packages/shared/__tests__/utils/notification-strings.test.ts`

- [ ] **Step 1: Écrire le test de complétude + normalisation + interpolation (RED)**

```ts
// packages/shared/__tests__/utils/notification-strings.test.ts
import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_LANGUAGES,
  NOTIFICATION_STRING_KEYS,
  normalizeNotificationLanguage,
  notificationString,
} from '../../utils/notification-strings.js';

describe('normalizeNotificationLanguage', () => {
  it('mappe les variantes régionales vers la langue de base', () => {
    expect(normalizeNotificationLanguage('fr-FR')).toBe('fr');
    expect(normalizeNotificationLanguage('pt-BR')).toBe('pt');
    expect(normalizeNotificationLanguage('PT')).toBe('pt');
  });
  it('mappe toutes les variantes chinoises vers zh-Hans', () => {
    expect(normalizeNotificationLanguage('zh')).toBe('zh-Hans');
    expect(normalizeNotificationLanguage('zh-CN')).toBe('zh-Hans');
    expect(normalizeNotificationLanguage('zh-Hans')).toBe('zh-Hans');
  });
  it('retombe sur fr pour un code inconnu ou vide', () => {
    expect(normalizeNotificationLanguage('ja')).toBe('fr');
    expect(normalizeNotificationLanguage(null)).toBe('fr');
    expect(normalizeNotificationLanguage(undefined)).toBe('fr');
  });
});

describe('catalogue — complétude', () => {
  it('définit chaque clé dans les 8 langues', () => {
    for (const lang of NOTIFICATION_LANGUAGES) {
      for (const key of NOTIFICATION_STRING_KEYS) {
        const out = notificationString(lang, key, {
          emoji: '❤️', actor: 'Alice', title: 'Équipe', preview: 'salut',
          author: 'Bob', count: 3, callIcon: '📞', postType: 'POST', callType: 'audio',
        });
        expect(out, `${lang}/${key}`).toBeTruthy();
      }
    }
  });
});

describe('notificationString — interpolation', () => {
  it('localise selon la langue', () => {
    expect(notificationString('en', 'mention')).toBe('mentioned you');
    expect(notificationString('fr', 'mention')).toBe('vous a mentionné');
    expect(notificationString('de', 'contact.request')).toBe('Neue Kontaktanfrage');
  });
  it('interpole emoji et titre sans les altérer', () => {
    expect(notificationString('en', 'reaction.message', { emoji: '🔥' }))
      .toBe('reacted 🔥 to your message');
    expect(notificationString('fr', 'invitation.group', { title: 'Team' }))
      .toBe('Invitation au groupe Team');
  });
  it('résout les noms d’objet par postType (genre/cas gérés en interne)', () => {
    expect(notificationString('en', 'reaction.post', { emoji: '👍', postType: 'STORY' }))
      .toBe('reacted 👍 to your story');
    expect(notificationString('de', 'comment.your', { postType: 'POST' }))
      .toBe('hat deinen Beitrag kommentiert');
  });
  it('résout le contexte de la réaction-commentaire verbeuse', () => {
    expect(notificationString('fr', 'reaction.commentVerbose',
      { actor: 'Alice', emoji: '❤️', author: 'Bob', isStory: false }))
      .toBe('Alice a réagi ❤️ à votre commentaire sur le post de Bob');
    expect(notificationString('fr', 'reaction.commentVerbose',
      { actor: 'Alice', emoji: '❤️' }))
      .toBe('Alice a réagi ❤️ à votre commentaire');
  });
  it('retombe sur fr pour une langue hors catalogue', () => {
    expect(notificationString('ja', 'mention')).toBe('vous a mentionné');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l’échec (RED)**

Run: `cd packages/shared && npx vitest run __tests__/utils/notification-strings.test.ts`
Expected: FAIL — `Cannot find module '../../utils/notification-strings.js'`.

- [ ] **Step 3: Créer le catalogue (GREEN)**

```ts
// packages/shared/utils/notification-strings.ts
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
  'mention',
  'friend.story', 'friend.post', 'friend.mood',
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
    'mention': 'vous a mentionné',
    'friend.story': 'a publié une nouvelle story',
    'friend.post': 'a publié un nouveau post',
    'friend.mood': 'a publié une nouvelle humeur',
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
    'mention': 'mentioned you',
    'friend.story': 'shared a new story',
    'friend.post': 'shared a new post',
    'friend.mood': 'shared a new mood',
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
    'mention': 'te mencionó',
    'friend.story': 'publicó una nueva historia',
    'friend.post': 'publicó una nueva publicación',
    'friend.mood': 'publicó un nuevo estado de ánimo',
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
    'mention': 'mencionou você',
    'friend.story': 'publicou uma nova story',
    'friend.post': 'publicou uma nova publicação',
    'friend.mood': 'publicou um novo humor',
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
    'mention': 'hat dich erwähnt',
    'friend.story': 'hat eine neue Story geteilt',
    'friend.post': 'hat einen neuen Beitrag geteilt',
    'friend.mood': 'hat eine neue Stimmung geteilt',
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
    'mention': 'ti ha menzionato',
    'friend.story': 'ha pubblicato una nuova storia',
    'friend.post': 'ha pubblicato un nuovo post',
    'friend.mood': 'ha pubblicato un nuovo stato d’animo',
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
    'mention': 'أشار إليك',
    'friend.story': 'نشر قصة جديدة',
    'friend.post': 'نشر منشورًا جديدًا',
    'friend.mood': 'شارك مزاجًا جديدًا',
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
    'mention': '提到了你',
    'friend.story': '发布了新快拍',
    'friend.post': '发布了新帖子',
    'friend.mood': '分享了新心情',
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
  const base = lc.split(/[-_]/)[0];
  return SUPPORTED.has(base) ? (base as NotificationLanguage) : 'fr';
}

function interpolate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    tokens[k] === undefined ? '' : tokens[k]);
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
  }
  if (params.callType) tokens.callLabel = CALL_LABEL[L][params.callType];

  if (key === 'reaction.commentVerbose') {
    tokens.context = params.author
      ? interpolate(COMMENT_CONTEXT[L][params.isStory ? 'story' : 'post'], { author: params.author })
      : '';
  }

  return interpolate(template, tokens);
}
```

- [ ] **Step 4: Ré-exporter depuis le barrel**

Dans `packages/shared/utils/index.ts`, ajouter après la ligne `export * from './language-normalize.js';` :

```ts
export * from './notification-strings.js';
```

- [ ] **Step 5: Lancer les tests (GREEN)**

Run: `cd packages/shared && npx vitest run __tests__/utils/notification-strings.test.ts`
Expected: PASS (tous les cas verts).

- [ ] **Step 6: Builder le package shared**

Run: `cd packages/shared && npm run build`
Expected: compilation TypeScript sans erreur (génère `dist/`).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/utils/notification-strings.ts packages/shared/utils/index.ts packages/shared/__tests__/utils/notification-strings.test.ts
git commit -m "feat(shared): catalogue i18n des notifications (8 langues, fallback fr)"
```

---

## Task 2: Helpers de résolution de langue (gateway)

**Files:**
- Modify: `services/gateway/src/services/notifications/NotificationService.ts`
- Test: `services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts`

Le helper résout la langue d’UN destinataire ; la variante batch résout N destinataires en une requête (évite N+1 dans les méthodes batch).

- [ ] **Step 1: Écrire le test du helper (RED)**

```ts
// services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts
import { NotificationService } from '../../../services/notifications/NotificationService';

function makeService(users: Record<string, any>) {
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) =>
        users[where.id] ? { ...users[where.id] } : null,
      findMany: async ({ where }: any) =>
        (where.id.in as string[]).map(id => users[id] ? { id, ...users[id] } : null).filter(Boolean),
    },
  };
  return new NotificationService(prisma as any);
}

describe('resolveRecipientLang', () => {
  it('retourne systemLanguage (priorité Prisme 1)', async () => {
    const svc = makeService({ u1: { systemLanguage: 'en', deviceLocale: 'fr' } });
    expect(await (svc as any).resolveRecipientLang('u1')).toBe('en');
  });
  it('ne laisse pas deviceLocale supplanter systemLanguage', async () => {
    const svc = makeService({ u1: { systemLanguage: 'fr', deviceLocale: 'en' } });
    expect(await (svc as any).resolveRecipientLang('u1')).toBe('fr');
  });
  it('retombe sur fr si destinataire introuvable', async () => {
    const svc = makeService({});
    expect(await (svc as any).resolveRecipientLang('ghost')).toBe('fr');
  });
});

describe('resolveRecipientLangs (batch)', () => {
  it('mappe chaque destinataire à sa langue', async () => {
    const svc = makeService({
      a: { systemLanguage: 'en' },
      b: { systemLanguage: 'de' },
    });
    const map = await (svc as any).resolveRecipientLangs(['a', 'b', 'missing']);
    expect(map.get('a')).toBe('en');
    expect(map.get('b')).toBe('de');
    expect(map.get('missing')).toBe('fr');
  });
});
```

- [ ] **Step 2: Lancer le test (RED)**

Run: `cd services/gateway && npx jest --config=jest.config.json NotificationService.i18n -t resolveRecipient`
Expected: FAIL — `resolveRecipientLang is not a function`.

- [ ] **Step 3: Implémenter les helpers + import**

En haut de `NotificationService.ts`, ajouter l’import (à côté des imports `@meeshy/shared` existants) :

```ts
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import { notificationString, type NotificationStringKey } from '@meeshy/shared/utils/notification-strings';
```
> `resolveUserLanguage` est peut-être déjà importé dans le fichier — ne pas dupliquer l’import.

Ajouter ces méthodes privées dans la classe `NotificationService` (près de `createNotification`) :

```ts
private readonly LANG_SELECT = {
  systemLanguage: true,
  regionalLanguage: true,
  customDestinationLanguage: true,
  deviceLocale: true,
} as const;

/** Langue de notification d’un destinataire (Prisme-first, fallback 'fr'). */
private async resolveRecipientLang(userId: string): Promise<string> {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: this.LANG_SELECT,
  });
  if (!user) return 'fr';
  return resolveUserLanguage(user, { deviceLocale: user.deviceLocale ?? undefined });
}

/** Variante batch : un seul findMany, retourne une Map userId → langue (fallback 'fr'). */
private async resolveRecipientLangs(userIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const users = await this.prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: { id: true, ...this.LANG_SELECT },
  });
  for (const u of users) {
    out.set(u.id, resolveUserLanguage(u, { deviceLocale: u.deviceLocale ?? undefined }));
  }
  for (const id of userIds) if (!out.has(id)) out.set(id, 'fr');
  return out;
}
```

- [ ] **Step 4: Lancer le test (GREEN)**

Run: `cd services/gateway && npx jest --config=jest.config.json NotificationService.i18n -t resolveRecipient`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/notifications/NotificationService.ts services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts
git commit -m "feat(gateway/notif): helpers resolveRecipientLang + batch (Prisme-first)"
```

---

## Task 3: Chemin notification message + pièces jointes

Le corps `new_message` est construit par `buildMessageNotificationBody` (fonction module, ~343) via `formatSingleAttachmentLabel` (~269), `buildAttachmentBadges` (~324), `formatDocumentBadge` (~308). Tout cela est appelé une fois par destinataire dans `createMessageNotification` (`content` ligne 951, `userId: recipientUserId` ligne 961).

**Files:**
- Modify: `services/gateway/src/services/notifications/NotificationService.ts`
- Test: `services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts`

- [ ] **Step 1: Écrire le test (RED)** — append au fichier i18n test

```ts
import { formatSingleAttachmentLabelI18n, buildMessageNotificationBodyI18n } from '../../../services/notifications/NotificationService';

describe('attachments i18n', () => {
  it('localise le label d’un attachment unique', () => {
    expect(formatSingleAttachmentLabelI18n('en', { type: 'video', duration: 135000, fileSize: 15_000_000 }))
      .toMatch(/^🎬 Video · /);
    expect(formatSingleAttachmentLabelI18n('de', { type: 'image', width: 1920, height: 1080 }))
      .toMatch(/^📷 Foto · 1920×1080/);
  });
  it('localise le badge multi-fichiers hétérogène', () => {
    const body = buildMessageNotificationBodyI18n('es', {
      attachments: [{ type: 'image' }, { type: 'audio' }, { type: 'video' }],
    });
    expect(body).toContain('+1🎵');
  });
});
```

- [ ] **Step 2: Lancer (RED)**

Run: `cd services/gateway && npx jest --config=jest.config.json NotificationService.i18n -t attachments`
Expected: FAIL — exports introuvables.

- [ ] **Step 3: Rendre les fonctions d’attachment dépendantes de `lang`**

**Remplacer** (pas dupliquer) les fonctions module existantes. `buildMessageNotificationBody` (~343) n’a qu’un seul appelant (ligne 951) et `formatSingleAttachmentLabel`/`formatDocumentBadge`/`buildAttachmentBadges` ne sont utilisées qu’en interne — les renommer/ré-signer comme ci-dessous et supprimer les anciennes versions. Modifier `formatSingleAttachmentLabel` (renommer + ajouter `lang` en 1er paramètre, exporter) :

```ts
export function formatSingleAttachmentLabelI18n(lang: string, params: {
  type: NotificationAttachmentType;
  filename?: string | null;
  fileSize?: number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
}): string {
  const details: string[] = [];
  if (params.type === 'audio') {
    if (params.duration) details.push(formatDuration(params.duration));
    if (params.fileSize) details.push(formatFileSize(params.fileSize));
    const word = notificationString(lang, 'attachment.audio');
    return details.length > 0 ? `${word} · ${details.join(' · ')}` : word;
  }
  if (params.type === 'video') {
    if (params.duration) details.push(formatDuration(params.duration));
    if (params.fileSize) details.push(formatFileSize(params.fileSize));
    const word = notificationString(lang, 'attachment.video');
    return details.length > 0 ? `${word} · ${details.join(' · ')}` : word;
  }
  if (params.type === 'image') {
    if (params.width && params.height) details.push(`${params.width}×${params.height}`);
    if (params.fileSize) details.push(formatFileSize(params.fileSize));
    const word = notificationString(lang, 'attachment.photo');
    return details.length > 0 ? `${word} · ${details.join(' · ')}` : word;
  }
  const ext = extractExtension(params.filename);
  const docLabel = ext ? formatDocumentLabel(ext) : notificationString(lang, 'attachment.document');
  return params.fileSize ? `${docLabel} · ${formatFileSize(params.fileSize)}` : docLabel;
}
```

Modifier `formatDocumentBadge` pour le fallback hétérogène :

```ts
function formatDocumentBadge(lang: string, docs: ReadonlyArray<NotificationAttachmentSummary>): string {
  const labels = docs.map(doc => {
    const ext = extractExtension(doc.filename);
    return ext ? formatDocumentLabel(ext) : notificationString(lang, 'attachment.document');
  });
  const homogeneous = labels.every(label => label === labels[0]);
  if (homogeneous) return docs.length > 1 ? `${labels[0]} · ${docs.length}` : labels[0];
  return notificationString(lang, 'attachment.files', { count: docs.length });
}
```

Mettre à jour `buildAttachmentBadges` pour passer `lang` (signature `(lang, rest)`), et la ligne documents :

```ts
function buildAttachmentBadges(lang: string, rest: ReadonlyArray<NotificationAttachmentSummary>): string {
  const images = rest.filter(att => att.type === 'image');
  const audios = rest.filter(att => att.type === 'audio');
  const videos = rest.filter(att => att.type === 'video');
  const documents = rest.filter(att => att.type === 'document');
  const segments: string[] = [];
  if (images.length > 0) segments.push(`+${images.length}📷`);
  if (audios.length > 0) segments.push(`+${audios.length}🎵`);
  if (videos.length > 0) segments.push(`+${videos.length}🎬`);
  if (documents.length > 0) segments.push(formatDocumentBadge(lang, documents));
  return segments.join(' ');
}
```

Renommer `buildMessageNotificationBody` → ajouter `lang` (export pour le test) :

```ts
export function buildMessageNotificationBodyI18n(lang: string, params: {
  messagePreview?: string;
  attachments?: ReadonlyArray<NotificationAttachmentSummary>;
  firstAttachmentFileSize?: number | null;
  firstAttachmentDuration?: number | null;
  firstAttachmentWidth?: number | null;
  firstAttachmentHeight?: number | null;
}): string {
  const text = params.messagePreview?.trim() || '';
  const attachments = params.attachments ?? [];
  if (attachments.length === 0) return text;
  const [first, ...rest] = attachments;
  const badges = buildAttachmentBadges(lang, rest);
  const base = text || formatSingleAttachmentLabelI18n(lang, {
    type: first.type,
    filename: first.filename,
    fileSize: params.firstAttachmentFileSize,
    duration: params.firstAttachmentDuration,
    width: params.firstAttachmentWidth,
    height: params.firstAttachmentHeight,
  });
  return badges ? `${base} ${badges}` : base;
}
```

- [ ] **Step 4: Câbler le call site `createMessageNotification` (~951)**

Avant le bloc `const content = ...`, résoudre la langue, puis l’utiliser :

```ts
const recipientLang = await this.resolveRecipientLang(params.recipientUserId);

const content = buildMessageNotificationBodyI18n(recipientLang, {
  messagePreview: params.messagePreview,
  attachments: params.attachments,
  firstAttachmentFileSize: params.firstAttachmentFileSize,
  firstAttachmentDuration: params.firstAttachmentDuration,
  firstAttachmentWidth: params.firstAttachmentWidth,
  firstAttachmentHeight: params.firstAttachmentHeight,
});
```

- [ ] **Step 5: Lancer (GREEN)**

Run: `cd services/gateway && npx jest --config=jest.config.json NotificationService.i18n -t attachments`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/notifications/NotificationService.ts services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts
git commit -m "feat(gateway/notif): localiser le corps message + libellés pièces jointes"
```

---

## Task 4: Méthodes mono-destinataire (réactions, appels, contacts, posts, invitations)

Pour chacune de ces méthodes : ajouter `const lang = await this.resolveRecipientLang(<recipientUserId>);` au début (avant la construction de la chaîne), puis remplacer la chaîne FR par `notificationString(lang, …)`. Le `<recipientUserId>` est indiqué site par site.

**Files:**
- Modify: `services/gateway/src/services/notifications/NotificationService.ts`
- Test: `services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts`

- [ ] **Step 1: Écrire un test représentatif (RED)**

Ouvrir `services/gateway/src/__tests__/unit/services/NotificationService.pushMessage.test.ts` et **réutiliser son harness de stub** (il stube `prisma.user`/`conversation`/`notificationPreference`/`notification.create` et permet de capter l’objet passé à `prisma.notification.create`). L’étendre : ajouter `systemLanguage` au stub du destinataire et capter `create.mock.calls[0][0].data.content` (ou le champ équivalent du harness). Asserter ces sorties EXACTES :

```ts
describe('contenu localisé par destinataire', () => {
  it('missed_call, destinataire en → "📞 Missed audio call"', async () => {
    const content = await captureContent(svc =>
      svc.createMissedCallNotification({ recipientUserId: 'r', callerId: 'c', conversationId: 'cv', callSessionId: 's', callType: 'audio' }),
      { r: { systemLanguage: 'en' }, c: { displayName: 'Caller' } });
    expect(content).toBe('📞 Missed audio call');
  });
  it('friend_request, destinataire de → "Neue Kontaktanfrage"', async () => {
    const content = await captureContent(svc =>
      svc.createFriendRequestNotification({ recipientUserId: 'r', requesterId: 'q', friendRequestId: 'f' }),
      { r: { systemLanguage: 'de' }, q: { displayName: 'Q' } });
    expect(content).toBe('Neue Kontaktanfrage');
  });
  it('post_like STORY, destinataire en → "reacted ❤️ to your story"', async () => {
    const content = await captureContent(svc =>
      svc.createPostLikeNotification({ actorId: 'a', postId: 'p', postAuthorId: 'r', emoji: '❤️', postType: 'STORY' }),
      { r: { systemLanguage: 'en' }, a: { displayName: 'A' } });
    expect(content).toBe('reacted ❤️ to your story');
  });
});
```
> `captureContent(run, users)` = helper local : instancie `NotificationService` avec le prisma stub du harness (peuplé de `users`), exécute `run(svc)`, retourne `prisma.notification.create.mock.calls[0][0].data.content`.

- [ ] **Step 2: Lancer (RED)** — `cd services/gateway && npx jest --config=jest.config.json NotificationService.i18n -t "localisé par destinataire"` → FAIL.

- [ ] **Step 3: Remplacer chaque site** (ligne → remplacement) :

**Site 1 — `createCommentReactionNotification` (~1224)** — recipient = `params.commentAuthorId`
```ts
// avant la ligne `const body = ...`:
const lang = await this.resolveRecipientLang(params.commentAuthorId);
const body = notificationString(lang, 'reaction.commentVerbose', {
  actor: reactorName,
  emoji: params.reactionEmoji,
  author: params.postAuthorName,
  isStory: params.isStory,
});
```

**Site 7 — `createMissedCallNotification` (~1808-1814)** — recipient = `params.recipientUserId`
```ts
const callIcon = params.callType === 'video' ? '📹' : '📞';
const lang = await this.resolveRecipientLang(params.recipientUserId);
// ...
content: notificationString(lang, 'call.missed', { callIcon, callType: params.callType }),
```

**Site 8 — `createFriendRequestNotification` (~1857)** — recipient = `params.recipientUserId`
```ts
const lang = await this.resolveRecipientLang(params.recipientUserId);
// ...
content: notificationString(lang, 'contact.request'),
```

**Site 9 — `createFriendAcceptedNotification` (~1896)** — recipient = `params.recipientUserId`
```ts
const lang = await this.resolveRecipientLang(params.recipientUserId);
// ...
content: notificationString(lang, 'contact.accepted'),
```

**Site 10 — `createPostLikeNotification` (~2117)** — recipient = `params.postAuthorId`
```ts
const lang = await this.resolveRecipientLang(params.postAuthorId);
const postType = params.postType === 'STORY' ? 'STORY' : params.postType === 'STATUS' ? 'STATUS' : 'POST';
// ...
content: notificationString(lang, 'reaction.post', { emoji: params.emoji, postType }),
```

**Site 11 — `createPostRepostNotification` (~2241)** — recipient = `params.postAuthorId`
```ts
const lang = await this.resolveRecipientLang(params.postAuthorId);
// ...
content: notificationString(lang, 'repost', { postType: params.postType ?? 'POST' }),
```

**Site 12 — `createCommentReplyNotification` (~2287-2288)** — recipient = `params.commentAuthorId` ; champ = `subtitle`
```ts
const lang = await this.resolveRecipientLang(params.commentAuthorId);
const trimmedParent = params.parentCommentPreview?.trim() ?? '';
const subtitle = trimmedParent !== ''
  ? notificationString(lang, 'comment.replyWithParent', { preview: this.truncateMessage(trimmedParent) })
  : notificationString(lang, 'comment.reply');
```

**Site 13 — `createCommentLikeNotification` (~2347)** — recipient = `params.commentAuthorId`
```ts
const lang = await this.resolveRecipientLang(params.commentAuthorId);
// ...
content: notificationString(lang, 'reaction.comment', { emoji: params.emoji }),
```

**Site 14 — `createConversationInviteNotification` (~2405-2407)** — recipient = `params.invitedUserId`
```ts
const lang = await this.resolveRecipientLang(params.invitedUserId);
const content = params.conversationType === 'direct'
  ? notificationString(lang, 'invitation.direct', { actor: actor.displayName })
  : notificationString(lang, 'invitation.group', { title: params.conversationTitle || '' });
```
> Si `conversationTitle` est vide, le titre rendu est `Invitation au groupe ` ; conserver le comportement actuel (ancien fallback `'sans nom'` retiré — `{title}` vide acceptable, ou réintroduire un fallback localisé si désiré : hors périmètre).

**Site 15 — `createAddedToConversationNotification` (~2444)** — recipient = `params.recipientUserId`
```ts
const lang = await this.resolveRecipientLang(params.recipientUserId);
// ...
content: conversation?.type === 'direct'
  ? notificationString(lang, 'group.newContact')
  : notificationString(lang, 'group.added', { title: conversation?.title || '' }),
```

- [ ] **Step 4: Lancer (GREEN)** — même commande qu’au Step 2 → PASS.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/notifications/NotificationService.ts services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts
git commit -m "feat(gateway/notif): localiser réactions, appels, contacts, posts, invitations"
```

---

## Task 5: Méthodes batch (commentaires story/thread, mentions, contenu ami)

Ces méthodes bouclent sur plusieurs destinataires. Résoudre toutes les langues en une requête via `resolveRecipientLangs`, puis localiser par destinataire dans la boucle.

**Files:**
- Modify: `services/gateway/src/services/notifications/NotificationService.ts`
- Test: `services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts`

- [ ] **Step 1: Écrire le test (RED)**

Réutiliser le harness de `NotificationService.pushMessage.test.ts` mais capter TOUS les appels `prisma.notification.create` (`create.mock.calls.map(c => c[0].data)`), car ces méthodes créent N notifications. Stub : destinataires `a` (`systemLanguage:'en'`) et `b` (`systemLanguage:'de'`), `postExcerpt` vide.

```ts
describe('batch — langue par destinataire', () => {
  it('mentions : chaque destinataire reçoit son contenu localisé', async () => {
    const byUser = await captureContentsByUser(svc =>
      svc.createPostMentionNotificationsBatch({ postId: 'p', posterId: 'x', mentionedUserIds: ['a', 'b'] }),
      { a: { systemLanguage: 'en' }, b: { systemLanguage: 'de' }, x: { displayName: 'X' } });
    expect(byUser.get('a')).toBe('mentioned you');
    expect(byUser.get('b')).toBe('hat dich erwähnt');
  });
});
```
> `captureContentsByUser(run, users)` = variante qui retourne une `Map<userId, content>` en lisant `data.userId`/`data.content` de chaque appel `create`.

- [ ] **Step 2: Lancer (RED)** — `npx jest --config=jest.config.json NotificationService.i18n -t "batch"` → FAIL.

- [ ] **Step 3: Implémenter par méthode**

**`createPostMentionNotificationsBatch` (site 5, ~1613)** — boucle sur `params.mentionedUserIds`
```ts
const langs = await this.resolveRecipientLangs(params.mentionedUserIds);
// dans la boucle (pour chaque mentioned userId):
const excerpt = params.postExcerpt ? this.truncateMessage(params.postExcerpt) : '';
const content = excerpt || notificationString(langs.get(userId) ?? 'fr', 'mention');
```

**`createStoryCommentNotificationsBatch` (sites 2,3,4)** — résoudre les langues de tous les destinataires concernés en tête de méthode :
```ts
const allRecipientIds = [authorId, ...previousCommenterIds, ...friendIds];
const langs = await this.resolveRecipientLangs(allRecipientIds);
```
- Site 2 (~1457, `story_new_comment`, recipient = `authorId`) :
```ts
content: excerpt || notificationString(langs.get(authorId) ?? 'fr', 'comment.your', { postType: params.postType ?? 'POST' }),
```
- Site 3 (~1474, `story_thread_reply`, recipient = `recipientId`) :
```ts
content: excerpt || notificationString(langs.get(recipientId) ?? 'fr', 'comment.repliedIn', { postType: params.postType ?? 'POST' }),
```
- Site 4 (~1491, `friend_story_comment`, recipient = `recipientId`) :
```ts
content: excerpt || notificationString(langs.get(recipientId) ?? 'fr', 'comment.generic', { postType: params.postType ?? 'POST' }),
```

**`createFriendContentNotificationsBatch` (site 6, ~1720-1725)** — boucle sur `friendIds`
```ts
const langs = await this.resolveRecipientLangs(friendIds);
const keyByType: Record<'friend_new_story' | 'friend_new_post' | 'friend_new_mood', NotificationStringKey> = {
  friend_new_story: 'friend.story',
  friend_new_post: 'friend.post',
  friend_new_mood: 'friend.mood',
};
// dans la boucle (pour chaque friendId):
const content = excerpt || notificationString(langs.get(friendId) ?? 'fr', keyByType[notificationType]);
```
> Supprimer l’objet `fallbackContent` FR (lignes 1720-1724) devenu inutile.

- [ ] **Step 4: Lancer (GREEN)** — `npx jest --config=jest.config.json NotificationService.i18n -t "batch"` → PASS.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/notifications/NotificationService.ts services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts
git commit -m "feat(gateway/notif): localiser les notifications batch (mentions, commentaires, contenu ami)"
```

---

## Task 6: Notification login nouvel appareil (site 16)

`createLoginNewDeviceNotification` (~2743) fetch déjà `systemLanguage`. Remplacer le branchement ad-hoc `en/fr` du titre par le catalogue (8 langues), tout en conservant le `locale` BCP-47 pour `toLocaleString`.

**Files:**
- Modify: `services/gateway/src/services/notifications/NotificationService.ts`
- Test: `services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts`

- [ ] **Step 1: Test (RED)**

Même harness ; capter `data.title` de l’appel `create`.

```ts
describe('login new device', () => {
  it('titre localisé selon systemLanguage (de)', async () => {
    const title = await captureTitle(svc =>
      svc.createLoginNewDeviceNotification({ recipientUserId: 'r' }),
      { r: { systemLanguage: 'de' } });
    expect(title).toBe('Neue Anmeldung erkannt');
  });
});
```
> `captureTitle` = comme `captureContent` mais lit `data.title`.

- [ ] **Step 2: Lancer (RED)** — `npx jest --config=jest.config.json NotificationService.i18n -t "login new device"` → FAIL.

- [ ] **Step 3: Remplacer le titre (~2747-2758)**

```ts
const lang = user?.systemLanguage ?? 'fr';
const locale = user?.systemLanguage === 'en' ? 'en-US' : 'fr-FR'; // conservé pour toLocaleString
// ...
const title = notificationString(lang, 'login.newDevice.title');
```

- [ ] **Step 4: Lancer (GREEN)** — `npx jest --config=jest.config.json NotificationService.i18n -t "login new device"` → PASS.

- [ ] **Step 5: Vérifier la suite NotificationService complète + build gateway**

Run: `cd services/gateway && npx jest --config=jest.config.json NotificationService`
Expected: PASS (i18n + pushMessage existant).
Run: `cd services/gateway && npx tsc --noEmit`
Expected: pas d’erreur de type.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/notifications/NotificationService.ts services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts
git commit -m "feat(gateway/notif): localiser le titre login nouvel appareil (8 langues)"
```

---

## Task 7: iOS NSE — afficher le content gateway (supprimer les rebuilds FR)

Le NSE reformate aujourd’hui les réactions en français (~104-127 de `NotificationService.swift`). Comme le gateway envoie désormais un `content`/`body` déjà localisé, le NSE doit l’afficher tel quel.

**Files:**
- Modify: `apps/ios/MeeshyNotificationExtension/NotificationService.swift`

- [ ] **Step 1: Cartographier les rebuilds FR**

Run: `grep -n "a réagi\|a commenté\|vous a\|Appel\|à votre" apps/ios/MeeshyNotificationExtension/NotificationService.swift`
Noter chaque ligne qui reconstruit une chaîne FR à partir des champs `userInfo`.

- [ ] **Step 2: Supprimer la reconstruction FR des réactions**

Dans le bloc `message_reaction` (~104-127), retirer la composition `"<sender> a réagi <emoji> à votre message"` et conserver le `body` reçu (`bestAttemptContent.body`, déjà localisé par le gateway). Ne PAS toucher : le déchiffrement E2EE (~52-62), la voie `locKey` (~72-86, filet E2EE), l’`INSendMessageIntent` (~183-191), ni la recomposition du `subtitle` (Local-First customName).

- [ ] **Step 3: Vérifier le build NSE**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED (cf. mémoire : si exit 1 sur build warning-free, re-coder-signer + réinstaller le `.app` frais).

- [ ] **Step 4: Commit**

```bash
git add apps/ios/MeeshyNotificationExtension/NotificationService.swift
git commit -m "feat(ios/nse): afficher le content gateway localisé (suppr. rebuild FR des réactions)"
```

---

## Task 8: iOS toast in-app — corps depuis le content gateway

Le toast in-app reconstruit le corps en FR (`SocketNotificationEvent+Toast.swift`, ~153-180). Faire consommer le `content` localisé porté par l’événement socket.

**Files:**
- Modify: `apps/ios/.../MeeshyUI/Notifications/SocketNotificationEvent+Toast.swift` (chemin exact à confirmer via grep ci-dessous)

- [ ] **Step 1: Localiser le fichier + les rebuilds FR**

Run: `grep -rn "a réagi\|toastBody\|toastTitle" apps/ios packages/MeeshySDK --include=*.swift | grep -i toast`
Confirmer le chemin et les lignes des reconstructions FR du corps.

- [ ] **Step 2: Brancher `toastBody` sur le content gateway**

Dans `toastBody` (~153-180), pour les types message/réaction/commentaire, retourner le `content`/`nonEmptyContentPreview` de l’événement (déjà localisé), en conservant le préfixe `attachmentLabel` si présent. Ne PAS toucher `toastTitle` (nom de l’expéditeur) ni la résolution Local-First du `subtitle` (customName).

- [ ] **Step 3: Vérifier le build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Commit**

```bash
git add apps/ios
git commit -m "feat(ios/toast): corps du toast in-app depuis le content gateway localisé"
```

---

## Task 9: Vérification d’intégration end-to-end

**Files:** aucun (vérification).

- [ ] **Step 1: Build + tests shared**

Run: `cd packages/shared && npm run build && npx vitest run __tests__/utils/notification-strings.test.ts`
Expected: build OK + tests verts.

- [ ] **Step 2: Tests gateway notifications + types**

Run: `cd services/gateway && npx jest --config=jest.config.json NotificationService && npx tsc --noEmit`
Expected: tests verts + pas d’erreur de type.

- [ ] **Step 3: Vérifier l’absence de chaînes FR résiduelles dans les sites traités**

Run: `grep -nE "a réagi|a commenté|a répondu|vous a mentionné|Nouvelle demande|Demande de contact|a partagé|Invitation au groupe|Ajouté au groupe|Nouveau contact|Nouvelle connexion|a publié" services/gateway/src/services/notifications/NotificationService.ts`
Expected: plus aucune correspondance dans du code produisant un `content`/`subtitle`/`title` (seuls logs/commentaires tolérés).

- [ ] **Step 4: Build iOS complet**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Commit final (si reliquats)**

```bash
git add -A && git commit -m "chore(notif-i18n): vérification d’intégration end-to-end"
```

---

## Notes d’implémentation

- **Genre/cas linguistiques** : les noms d’objet (post/story/mood/status) sont bakés par langue dans `POSS_OBJ`/`REACT_OBJ`/`INDEF_OBJ`/`LOC_OBJ` pour gérer le genre (de/pt) et le cas (de accusatif vs datif). Ne pas reconstruire ces phrases côté appelant.
- **Réserve qualité** : `ar` (RTL) et `zh-Hans` à faire relire par un natif avant prod (cf. spec §9). Les chaînes du catalogue sont la cible de cette relecture.
- **Message reactions** : si un site gateway crée une notif `message_reaction` avec un `content` FR (à vérifier via `grep -n "message_reaction" NotificationService.ts`), le localiser via `notificationString(lang, 'reaction.message', { emoji })` — même pattern que Task 4.
- **Pas de Co-Authored-By** dans les commits (préférence utilisateur).
```
