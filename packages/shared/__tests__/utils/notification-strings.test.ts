import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_LANGUAGES,
  NOTIFICATION_STRING_KEYS,
  normalizeNotificationLanguage,
  notificationString,
  buildNotificationDisplay,
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
  it('localise le push d’appel entrant à la langue résolue du callee (Prisme)', () => {
    expect(notificationString('fr', 'call.incoming.title', { actor: 'Alice' }))
      .toBe('Alice vous appelle');
    expect(notificationString('en', 'call.incoming.title', { actor: 'Alice' }))
      .toBe('Alice is calling you');
    expect(notificationString('zh-Hans', 'call.incoming.title', { actor: '小明' }))
      .toBe('小明 来电');
    expect(notificationString('fr', 'call.incoming.body', { callType: 'video' }))
      .toBe('Appel vidéo');
    expect(notificationString('en', 'call.incoming.body', { callType: 'audio' }))
      .toBe('Audio call');
    expect(notificationString('de', 'call.incoming.body', { callType: 'video' }))
      .toBe('Videoanruf');
  });
  it('retombe sur fr pour une langue hors catalogue', () => {
    expect(notificationString('ja', 'mention')).toBe('vous a mentionné');
  });
  it('résout isStory:true dans reaction.commentVerbose (branche story)', () => {
    const result = notificationString('fr', 'reaction.commentVerbose',
      { actor: 'Alice', emoji: '❤️', author: 'Bob', isStory: true });
    expect(result).toContain('Alice');
    expect(result).toContain('❤️');
    expect(result).toContain('Bob');
  });
  it('résout le contexte de reaction.commentVerbose par postType (REEL / STATUS)', () => {
    expect(notificationString('fr', 'reaction.commentVerbose',
      { actor: 'Alice', emoji: '❤️', author: 'Bob', postType: 'REEL' }))
      .toBe('Alice a réagi ❤️ à votre commentaire sur le réel de Bob');
    expect(notificationString('fr', 'reaction.commentVerbose',
      { actor: 'Alice', emoji: '❤️', author: 'Bob', postType: 'STATUS' }))
      .toBe('Alice a réagi ❤️ à votre commentaire sur le statut de Bob');
    expect(notificationString('en', 'reaction.commentVerbose',
      { actor: 'Alice', emoji: '❤️', author: 'Bob', postType: 'REEL' }))
      .toBe('Alice reacted ❤️ to your comment on Bob’s reel');
  });
  it('postType a priorité sur isStory dans reaction.commentVerbose', () => {
    // Un REEL ne doit jamais s’effondrer vers « post » — postType gagne sur le booléen legacy.
    expect(notificationString('fr', 'reaction.commentVerbose',
      { actor: 'Alice', emoji: '❤️', author: 'Bob', postType: 'REEL', isStory: false }))
      .toBe('Alice a réagi ❤️ à votre commentaire sur le réel de Bob');
  });
  it('remplace les tokens manquants par une chaîne vide (branche v===undefined)', () => {
    // A key that uses {possObj} tokens without providing postType → token undefined → ''
    const result = notificationString('en', 'reaction.post', { emoji: '👍' });
    // Should not throw; the missing {possObj} placeholder becomes ''
    expect(typeof result).toBe('string');
  });
  it('retourne une chaîne vide pour un template inexistant (guard template===undefined)', () => {
    // Using a key cast that doesn't exist in the templates ensures the early-return guard
    const result = notificationString('en', 'nonexistent.key' as typeof NOTIFICATION_STRING_KEYS[number]);
    expect(result).toBe('');
  });
});

describe('buildNotificationDisplay — titre + sous-titre', () => {
  it('corrige le bug de réponse : « a répondu à votre commentaire » (pas « a commenté votre publication »)', () => {
    const fr = buildNotificationDisplay('fr', { type: 'comment_reply', actorName: 'Belva Tano', postType: 'STORY' });
    expect(fr.title).toBe('Belva Tano a répondu à votre commentaire');
    const en = buildNotificationDisplay('en', { type: 'comment_reply', actorName: 'Belva Tano' });
    expect(en.title).toBe('Belva Tano replied to your comment');
  });
  it('expose l’aperçu du commentaire parent en sous-titre quand fourni', () => {
    const r = buildNotificationDisplay('fr', { type: 'comment_reply', actorName: 'Bob', parentCommentPreview: 'Tu as tout dit' });
    expect(r.subtitle).toBe('En réponse à « Tu as tout dit »');
  });
  it('replie sur le nom d’entité quand pas d’aperçu parent', () => {
    const r = buildNotificationDisplay('fr', { type: 'comment_reply', actorName: 'Bob', postType: 'REEL' });
    expect(r.subtitle).toBe('Réel');
  });
  it('rend le commentaire conscient de l’entité (story / réel, pas « publication »)', () => {
    expect(buildNotificationDisplay('fr', { type: 'post_comment', actorName: 'Alice', postType: 'STORY' }).title)
      .toBe('Alice a commenté votre story');
    expect(buildNotificationDisplay('fr', { type: 'post_comment', actorName: 'Alice', postType: 'REEL' }).title)
      .toBe('Alice a commenté votre réel');
  });
  it('localise les réactions sur post selon l’entité', () => {
    expect(buildNotificationDisplay('en', { type: 'story_reaction', actorName: 'Sam', emoji: '❤️', postType: 'STORY' }).title)
      .toBe('Sam reacted ❤️ to your story');
    expect(buildNotificationDisplay('fr', { type: 'comment_like', actorName: 'Sam', emoji: '👍' }).title)
      .toBe('Sam a réagi 👍 à votre commentaire');
  });
  it('décrit le commentaire d’un ami sur une story (complaint #3)', () => {
    const r = buildNotificationDisplay('fr', { type: 'friend_story_comment', actorName: 'Belva Tano', postType: 'STORY' });
    expect(r.title).toBe('Belva Tano a commenté une story');
    expect(r.subtitle).toBe('Story');
  });
  it('localise le nouveau contenu d’un ami', () => {
    expect(buildNotificationDisplay('es', { type: 'friend_new_story', actorName: 'Ana' }).title)
      .toBe('Ana publicó una nueva historia');
  });
  it('replie sur « Quelqu’un » quand l’acteur est absent', () => {
    expect(buildNotificationDisplay('fr', { type: 'post_comment', postType: 'POST' }).title)
      .toBe('Quelqu’un a commenté votre publication');
  });
  it('retourne title null pour les types non gérés (le client garde son repli)', () => {
    expect(buildNotificationDisplay('fr', { type: 'new_message', actorName: 'X' }).title).toBeNull();
    expect(buildNotificationDisplay('fr', { type: 'missed_call', actorName: 'X' }).title).toBeNull();
  });
  it('reste robuste à un postType inconnu', () => {
    const r = buildNotificationDisplay('fr', { type: 'post_comment', actorName: 'Z', postType: 'WEIRD' });
    expect(r.title).toBe('Z a commenté votre publication');
  });

  it('couvre toutes les branches sociales (titre + sous-titre)', () => {
    // Réactions sur contenu — avec et sans postType (branche kind undefined).
    expect(buildNotificationDisplay('fr', { type: 'post_like', actorName: 'A', emoji: '❤️', postType: 'POST' }))
      .toEqual({ title: 'A a réagi ❤️ à votre publication', subtitle: 'Votre publication' });
    expect(buildNotificationDisplay('fr', { type: 'post_like', actorName: 'A', emoji: '❤️' }))
      .toEqual({ title: 'A a réagi ❤️ à votre publication', subtitle: null });
    expect(buildNotificationDisplay('fr', { type: 'status_reaction', actorName: 'A', emoji: '🔥', postType: 'STATUS' }).title)
      .toBe('A a réagi 🔥 à votre statut');

    // Commentaire sur votre contenu (story_new_comment défaut STORY).
    expect(buildNotificationDisplay('fr', { type: 'story_new_comment', actorName: 'B' }))
      .toEqual({ title: 'B a commenté votre story', subtitle: 'Votre story' });

    // Fil / engagement sur le contenu d'un ami.
    expect(buildNotificationDisplay('fr', { type: 'story_thread_reply', actorName: 'C', postType: 'POST' }))
      .toEqual({ title: 'C a répondu dans une publication', subtitle: 'Publication' });

    // Réponse à votre commentaire sans aperçu parent ET sans postType → fallback comment.reply.
    expect(buildNotificationDisplay('fr', { type: 'comment_reply', actorName: 'D' }))
      .toEqual({ title: 'D a répondu à votre commentaire', subtitle: 'En réponse à votre commentaire' });

    // Réaction sur votre commentaire (emoji absent → couvre la branche sans emoji).
    const commentReaction = buildNotificationDisplay('fr', { type: 'comment_reaction', actorName: 'E', postType: 'POST' });
    expect(commentReaction.title).toContain('E ');
    expect(commentReaction.title).toContain('à votre commentaire');
    expect(commentReaction.subtitle).toBe('Publication');

    // Repost — avec et sans entité.
    expect(buildNotificationDisplay('fr', { type: 'post_repost', actorName: 'F', postType: 'STORY' }))
      .toEqual({ title: 'F a partagé votre story', subtitle: 'Votre story' });
    expect(buildNotificationDisplay('fr', { type: 'post_repost', actorName: 'F' }).subtitle).toBeNull();

    // Nouveau contenu d'un ami (post / réel / humeur).
    expect(buildNotificationDisplay('fr', { type: 'friend_new_post', actorName: 'G' }))
      .toEqual({ title: 'G a publié un nouveau post', subtitle: 'Nouvelle publication' });
    expect(buildNotificationDisplay('fr', { type: 'friend_new_post', actorName: 'G', postType: 'REEL' }).subtitle)
      .toBe('Nouveau réel');
    expect(buildNotificationDisplay('fr', { type: 'friend_new_mood', actorName: 'G' }).title)
      .toBe('G a publié une nouvelle humeur');

    // Mention (conversation/commentaire).
    expect(buildNotificationDisplay('fr', { type: 'user_mentioned', actorName: 'H' }).title)
      .toBe('H vous a mentionné');
  });

  it('replie sur « Quelqu’un » même quand actorName est une chaîne d’espaces', () => {
    expect(buildNotificationDisplay('fr', { type: 'post_like', actorName: '   ', emoji: '❤️', postType: 'POST' }).title)
      .toBe('Quelqu’un a réagi ❤️ à votre publication');
  });

  it('normalise les variantes de casse / valeurs nulles de postType', () => {
    expect(buildNotificationDisplay('fr', { type: 'post_comment', actorName: 'I', postType: 'story' }).title)
      .toBe('I a commenté votre story');
    expect(buildNotificationDisplay('fr', { type: 'comment_reply', actorName: 'I', postType: null }).subtitle)
      .toBe('En réponse à votre commentaire');
  });
});
