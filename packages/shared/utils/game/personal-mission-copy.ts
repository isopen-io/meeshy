/**
 * LES PHRASES DE LA MISSION PERSONNELLE (#9539) — ce que la notification de début de plage dit de la mission :
 * une activité, jamais un compte (« Ta mission du jour : réagir à des messages, entre 18:00 et 20:00. »).
 * Huit langues du catalogue de notifications ; le repli est l'anglais, comme `notificationString`.
 *
 * Les clients localisent LEUR carte par la clé du gabarit (`GameCopy`) ; ces phrases ne servent que le texte
 * que le SERVEUR compose pour la bannière, dans la langue de cadrage du destinataire.
 */

import type { NotificationLanguage } from '../notification-strings.js';
import { NOTIFICATION_LANGUAGES } from '../notification-strings.js';
import type { PersonalActivity } from './personal-mission.js';

const PHRASES: Record<NotificationLanguage, Record<PersonalActivity, string>> = {
  fr: {
    react: 'réagir à des messages',
    voice: 'envoyer des messages vocaux',
    chat: 'discuter avec tes amis',
    stickers: 'envoyer des stickers',
    attachments: 'partager des fichiers',
    reply: 'répondre dans plusieurs conversations',
    comment: 'commenter des publications',
    story: 'publier une story',
    post: 'publier un post',
    prism: 'écrire dans une autre langue',
  },
  en: {
    react: 'react to messages',
    voice: 'send voice messages',
    chat: 'chat with your friends',
    stickers: 'send stickers',
    attachments: 'share files',
    reply: 'reply in several conversations',
    comment: 'comment on posts',
    story: 'post a story',
    post: 'publish a post',
    prism: 'write in another language',
  },
  es: {
    react: 'reaccionar a mensajes',
    voice: 'enviar mensajes de voz',
    chat: 'charlar con tus amigos',
    stickers: 'enviar stickers',
    attachments: 'compartir archivos',
    reply: 'responder en varias conversaciones',
    comment: 'comentar publicaciones',
    story: 'publicar una historia',
    post: 'publicar un post',
    prism: 'escribir en otro idioma',
  },
  pt: {
    react: 'reagir a mensagens',
    voice: 'enviar mensagens de voz',
    chat: 'conversar com seus amigos',
    stickers: 'enviar stickers',
    attachments: 'compartilhar arquivos',
    reply: 'responder em várias conversas',
    comment: 'comentar publicações',
    story: 'publicar uma story',
    post: 'publicar um post',
    prism: 'escrever em outro idioma',
  },
  de: {
    react: 'auf Nachrichten reagieren',
    voice: 'Sprachnachrichten senden',
    chat: 'mit Freunden chatten',
    stickers: 'Sticker senden',
    attachments: 'Dateien teilen',
    reply: 'in mehreren Unterhaltungen antworten',
    comment: 'Beiträge kommentieren',
    story: 'eine Story posten',
    post: 'einen Beitrag veröffentlichen',
    prism: 'in einer anderen Sprache schreiben',
  },
  it: {
    react: 'reagire ai messaggi',
    voice: 'inviare messaggi vocali',
    chat: 'chattare con i tuoi amici',
    stickers: 'inviare sticker',
    attachments: 'condividere file',
    reply: 'rispondere in più conversazioni',
    comment: 'commentare i post',
    story: 'pubblicare una storia',
    post: 'pubblicare un post',
    prism: 'scrivere in un’altra lingua',
  },
  ar: {
    react: 'تفاعل مع الرسائل',
    voice: 'أرسل رسائل صوتية',
    chat: 'تحدّث مع أصدقائك',
    stickers: 'أرسل ملصقات',
    attachments: 'شارك ملفات',
    reply: 'ردّ في عدة محادثات',
    comment: 'علّق على المنشورات',
    story: 'انشر قصة',
    post: 'انشر منشورًا',
    prism: 'اكتب بلغة أخرى',
  },
  'zh-Hans': {
    react: '回应消息',
    voice: '发送语音消息',
    chat: '和朋友聊天',
    stickers: '发送贴纸',
    attachments: '分享文件',
    reply: '在多个对话中回复',
    comment: '评论帖子',
    story: '发布快拍',
    post: '发布帖子',
    prism: '用另一种语言写消息',
  },
};

const known = (lang: string): lang is NotificationLanguage => (NOTIFICATION_LANGUAGES as readonly string[]).includes(lang);

export const personalMissionPhrase = (lang: string | null | undefined, activity: PersonalActivity): string =>
  PHRASES[known(lang ?? '') ? (lang as NotificationLanguage) : 'en'][activity];
