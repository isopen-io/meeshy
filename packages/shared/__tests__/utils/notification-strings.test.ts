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
    expect(notificationString('de', 'comment.repliedIn', { postType: 'POST' }))
      .toBe('hat in einem Beitrag geantwortet');
  });
  it('résout le contexte de la réaction-commentaire verbeuse', () => {
    expect(notificationString('fr', 'reaction.commentVerbose',
      { actor: 'Alice', emoji: '❤️', author: 'Bob', isStory: false }))
      .toBe('Alice a réagi ❤️ à votre commentaire sur le post de Bob');
    expect(notificationString('fr', 'reaction.commentVerbose',
      { actor: 'Alice', emoji: '❤️' }))
      .toBe('Alice a réagi ❤️ à votre commentaire');
  });
  it('localise call.missed avec icône et type', () => {
    expect(notificationString('en', 'call.missed', { callIcon: '📞', callType: 'audio' }))
      .toBe('📞 Missed audio call');
    expect(notificationString('de', 'call.missed', { callIcon: '📹', callType: 'video' }))
      .toBe('📹 Verpasster Videoanruf');
  });
  it('retombe sur fr pour une langue hors catalogue', () => {
    expect(notificationString('ja', 'mention')).toBe('vous a mentionné');
  });
});
