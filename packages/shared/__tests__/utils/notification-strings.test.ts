import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_LANGUAGES,
  NOTIFICATION_STRING_KEYS,
  normalizeNotificationLanguage,
  notificationString,
  buildNotificationDisplay,
  formatFileSizeI18n,
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

describe('notificationString — token vide n’insère pas d’espace orphelin', () => {
  // `{emoji}` est optionnel (params.emoji ?? '') mais chaque template de réaction
  // l’enchâsse entre deux espaces littéraux. Sans l’emoji, l’ancienne interpolation
  // laissait un DOUBLE espace qui partait verbatim sur REST/socket/push vers tous
  // les clients. Le collapse doit fermer la faille dans TOUTES les langues.
  it('reaction.message sans emoji ne double pas l’espace (8 langues)', () => {
    expect(notificationString('en', 'reaction.message')).toBe('reacted to your message');
    expect(notificationString('fr', 'reaction.message')).toBe('a réagi à votre message');
    expect(notificationString('es', 'reaction.message')).toBe('reaccionó a tu mensaje');
    expect(notificationString('pt', 'reaction.message')).toBe('reagiu à sua mensagem');
    expect(notificationString('de', 'reaction.message')).toBe('hat auf deine Nachricht reagiert');
    expect(notificationString('it', 'reaction.message')).toBe('ha reagito al tuo messaggio');
    expect(notificationString('ar', 'reaction.message')).toBe('تفاعل مع رسالتك');
    expect(notificationString('zh-Hans', 'reaction.message')).toBe('用 回应了你的消息');
    for (const lang of NOTIFICATION_LANGUAGES) {
      expect(notificationString(lang, 'reaction.message'), lang).not.toMatch(/  /);
    }
  });
  it('reaction.comment et reaction.post sans emoji ne doublent pas l’espace', () => {
    expect(notificationString('en', 'reaction.comment')).toBe('reacted to your comment');
    expect(notificationString('fr', 'reaction.post', { postType: 'POST' }))
      .toBe('a réagi à votre publication');
    expect(notificationString('en', 'reaction.post', { postType: 'STORY' }))
      .toBe('reacted to your story');
  });
  it('reaction.commentVerbose sans emoji conserve le contexte à espace unique', () => {
    expect(notificationString('en', 'reaction.commentVerbose', { actor: 'Alice' }))
      .toBe('Alice reacted to your comment');
    expect(notificationString('fr', 'reaction.commentVerbose',
      { actor: 'Alice', author: 'Bob' }))
      .toBe('Alice a réagi à votre commentaire sur le post de Bob');
  });
  it('l’emoji présent reste inchangé (non-régression)', () => {
    expect(notificationString('en', 'reaction.message', { emoji: '🔥' }))
      .toBe('reacted 🔥 to your message');
    expect(notificationString('fr', 'reaction.commentVerbose',
      { actor: 'Alice', emoji: '❤️', author: 'Bob' }))
      .toBe('Alice a réagi ❤️ à votre commentaire sur le post de Bob');
    expect(notificationString('en', 'reaction.post', { emoji: '👍', postType: 'STORY' }))
      .toBe('reacted 👍 to your story');
  });
  it('préserve les espaces internes d’une valeur non vide (pas de mutation du contenu)', () => {
    expect(notificationString('en', 'reaction.commentVerbose', { actor: 'Jean  Dupont', emoji: '❤️' }))
      .toBe('Jean  Dupont reacted ❤️ to your comment');
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

  it('une réaction sans emoji ne fabrique pas un titre à double espace (fuite REST/socket/push)', () => {
    // NotificationService passe emoji: null quand la métadonnée n’en porte pas ;
    // ce titre est PERSISTÉ puis renvoyé verbatim aux clients.
    expect(buildNotificationDisplay('en', { type: 'post_like', actorName: 'Alice', postType: 'POST' }).title)
      .toBe('Alice reacted to your post');
    expect(buildNotificationDisplay('fr', { type: 'post_like', actorName: 'Alice', postType: 'POST' }).title)
      .toBe('Alice a réagi à votre publication');
    expect(buildNotificationDisplay('fr', { type: 'comment_like', actorName: 'Sam' }).title)
      .not.toMatch(/  /);
  });

  it('couvre toutes les branches sociales (titre + sous-titre)', () => {
    // Réactions sur contenu — avec et sans postType (branche kind undefined).
    expect(buildNotificationDisplay('fr', { type: 'post_like', actorName: 'A', emoji: '❤️', postType: 'POST' }))
      .toEqual({ title: 'A a réagi ❤️ à votre publication', subtitle: 'Votre publication', action: 'a réagi ❤️ à votre publication' });
    expect(buildNotificationDisplay('fr', { type: 'post_like', actorName: 'A', emoji: '❤️' }))
      .toEqual({ title: 'A a réagi ❤️ à votre publication', subtitle: null, action: 'a réagi ❤️ à votre publication' });
    expect(buildNotificationDisplay('fr', { type: 'status_reaction', actorName: 'A', emoji: '🔥', postType: 'STATUS' }).title)
      .toBe('A a réagi 🔥 à votre statut');

    // Commentaire sur votre contenu (story_new_comment défaut STORY).
    expect(buildNotificationDisplay('fr', { type: 'story_new_comment', actorName: 'B' }))
      .toEqual({ title: 'B a commenté votre story', subtitle: 'Votre story', action: 'a commenté votre story' });

    // Fil / engagement sur le contenu d'un ami.
    expect(buildNotificationDisplay('fr', { type: 'story_thread_reply', actorName: 'C', postType: 'POST' }))
      .toEqual({ title: 'C a répondu dans une publication', subtitle: 'Publication', action: 'a répondu dans une publication' });

    // Réponse à votre commentaire sans aperçu parent ET sans postType → fallback comment.reply.
    expect(buildNotificationDisplay('fr', { type: 'comment_reply', actorName: 'D' }))
      .toEqual({ title: 'D a répondu à votre commentaire', subtitle: 'En réponse à votre commentaire', action: 'a répondu à votre commentaire' });

    // Réaction sur votre commentaire (emoji absent → couvre la branche sans emoji).
    const commentReaction = buildNotificationDisplay('fr', { type: 'comment_reaction', actorName: 'E', postType: 'POST' });
    expect(commentReaction.title).toContain('E ');
    expect(commentReaction.title).toContain('à votre commentaire');
    expect(commentReaction.subtitle).toBe('Publication');

    // Repost — avec et sans entité.
    expect(buildNotificationDisplay('fr', { type: 'post_repost', actorName: 'F', postType: 'STORY' }))
      .toEqual({ title: 'F a partagé votre story', subtitle: 'Votre story', action: 'a partagé votre story' });
    expect(buildNotificationDisplay('fr', { type: 'post_repost', actorName: 'F' }).subtitle).toBeNull();

    // Nouveau contenu d'un ami (post / réel / humeur).
    expect(buildNotificationDisplay('fr', { type: 'friend_new_post', actorName: 'G' }))
      .toEqual({ title: 'G a publié un nouveau post', subtitle: 'Nouvelle publication', action: 'a publié un nouveau post' });
    // Un réel (variante de post) reste conscient de l'entité sur le titre ET le
    // sous-titre — pas de « a publié un nouveau post » contredit par « Nouveau réel ».
    expect(buildNotificationDisplay('fr', { type: 'friend_new_post', actorName: 'G', postType: 'REEL' }))
      .toEqual({ title: 'G a publié un nouveau réel', subtitle: 'Nouveau réel', action: 'a publié un nouveau réel' });
    expect(buildNotificationDisplay('en', { type: 'friend_new_post', actorName: 'G', postType: 'REEL' }))
      .toEqual({ title: 'G shared a new reel', subtitle: 'New reel', action: 'shared a new reel' });
    expect(buildNotificationDisplay('fr', { type: 'friend_new_mood', actorName: 'G' }).title)
      .toBe('G a publié une nouvelle humeur');

    // Mention (conversation/commentaire).
    expect(buildNotificationDisplay('fr', { type: 'user_mentioned', actorName: 'H' }).title)
      .toBe('H vous a mentionné');
  });

  it('expose l’action seule — le fragment que le titre compose avec l’acteur', () => {
    // Le titre est littéralement « <acteur> <action> » : l'action est le
    // fragment que la bannière push affiche sous le nom, là où iOS réécrit
    // le titre avec le displayName de l'INPerson.
    const comment = buildNotificationDisplay('fr', { type: 'friend_story_comment', actorName: 'elvira ndjiki', postType: 'REEL' });
    expect(comment.action).toBe('a commenté un réel');
    expect(comment.title).toBe(`elvira ndjiki ${comment.action}`);

    const newPost = buildNotificationDisplay('fr', { type: 'friend_new_post', actorName: 'Windie Nh', postType: 'REEL' });
    expect(newPost.action).toBe('a publié un nouveau réel');
    expect(newPost.title).toBe(`Windie Nh ${newPost.action}`);

    const own = buildNotificationDisplay('fr', { type: 'post_comment', actorName: 'Alice', postType: 'STORY' });
    expect(own.action).toBe('a commenté votre story');

    expect(buildNotificationDisplay('en', { type: 'friend_new_post', actorName: 'G', postType: 'REEL' }).action)
      .toBe('shared a new reel');
  });

  it('fusionne l’auteur du contenu dans la phrase, au lieu de le juxtaposer', () => {
    // « a commenté un réel de Windie Nh », pas « a commenté un réel » suivi
    // d'un « Publication de Windie Nh » posé à côté : une notification énonce
    // UNE phrase, comme le fait déjà « a commenté VOTRE réel ».
    const fr = buildNotificationDisplay('fr', {
      type: 'friend_story_comment', actorName: 'elvira ndjiki',
      postType: 'REEL', authorName: 'Windie Nh',
    });
    expect(fr.action).toBe('a commenté un réel de Windie Nh');
    expect(fr.title).toBe('elvira ndjiki a commenté un réel de Windie Nh');

    const thread = buildNotificationDisplay('fr', {
      type: 'story_thread_reply', actorName: 'Bob', postType: 'STORY', authorName: 'Alice',
    });
    expect(thread.action).toBe('a répondu dans une story de Alice');
  });

  it('place le possesseur avant l’objet dans les langues qui l’exigent', () => {
    // L'anglais et le chinois antéposent le possesseur : une concaténation
    // « action + de + auteur » y produirait « commented on a reel de X ».
    expect(buildNotificationDisplay('en', {
      type: 'friend_story_comment', actorName: 'E', postType: 'REEL', authorName: 'Windie Nh',
    }).action).toBe('commented on Windie Nh’s reel');

    expect(buildNotificationDisplay('zh-Hans', {
      type: 'friend_story_comment', actorName: 'E', postType: 'REEL', authorName: 'Windie Nh',
    }).action).toBe('评论了 Windie Nh 的短视频');

    expect(buildNotificationDisplay('de', {
      type: 'story_thread_reply', actorName: 'E', postType: 'POST', authorName: 'Windie Nh',
    }).action).toBe('hat in einem Beitrag von Windie Nh geantwortet');
  });

  it('retombe sur la forme indéfinie quand l’auteur est inconnu', () => {
    for (const authorName of [undefined, '', '   ']) {
      expect(buildNotificationDisplay('fr', {
        type: 'friend_story_comment', actorName: 'E', postType: 'REEL', authorName,
      }).action, String(authorName)).toBe('a commenté un réel');
    }
  });

  it('n’injecte JAMAIS l’auteur dans une action déjà possessive', () => {
    // « a commenté votre réel de Windie Nh » n'aurait aucun sens : la cible
    // est le lecteur lui-même.
    expect(buildNotificationDisplay('fr', {
      type: 'post_comment', actorName: 'E', postType: 'REEL', authorName: 'Windie Nh',
    }).action).toBe('a commenté votre réel');
    expect(buildNotificationDisplay('fr', {
      type: 'post_like', actorName: 'E', emoji: '❤️', postType: 'REEL', authorName: 'Windie Nh',
    }).action).toBe('a réagi ❤️ à votre réel');
  });

  it('n’expose aucune action là où il n’y a pas de titre (message, appel, système)', () => {
    for (const type of ['new_message', 'missed_call', 'login_new_device']) {
      const r = buildNotificationDisplay('fr', { type, actorName: 'X' });
      expect(r.action, type).toBeNull();
      expect(r.title, type).toBeNull();
    }
  });

  it('replie sur « Quelqu’un » même quand actorName est une chaîne d’espaces', () => {
    expect(buildNotificationDisplay('fr', { type: 'post_like', actorName: '   ', emoji: '❤️', postType: 'POST' }).title)
      .toBe('Quelqu’un a réagi ❤️ à votre publication');
  });

  // ── Relations : la ligne n'est pas un groupe nominal, c'est une PHRASE ──
  //
  // `content` disait « Nouvelle demande de contact » — un titre de rubrique.
  // Une bannière annonce ce que QUELQU'UN vient de faire : sans phrase
  // d'action, aucun client ne peut composer « X veut se connecter » sans
  // réécrire du français en dur, ce que le Prisme (i18n serveur) interdit.
  it('rend une phrase d’action pour une demande de relation, sur les deux noms de type', () => {
    for (const type of ['friend_request', 'contact_request']) {
      expect(buildNotificationDisplay('fr', { type, actorName: 'Alice' }).title, type)
        .toBe('Alice veut se connecter');
      expect(buildNotificationDisplay('fr', { type, actorName: 'Alice' }).action, type)
        .toBe('veut se connecter');
    }
    expect(buildNotificationDisplay('en', { type: 'friend_request', actorName: 'Alice' }).title)
      .toBe('Alice wants to connect');
  });

  it('rend une phrase d’action pour une relation acceptée, sur les deux noms de type', () => {
    for (const type of ['friend_accepted', 'contact_accepted']) {
      expect(buildNotificationDisplay('fr', { type, actorName: 'Bob' }).title, type)
        .toBe('Bob a accepté votre demande');
    }
    expect(buildNotificationDisplay('en', { type: 'contact_accepted', actorName: 'Bob' }).title)
      .toBe('Bob accepted your request');
  });

  it('ne donne AUCUN sous-titre d’entité à une relation — il n’y a pas de contenu visé', () => {
    expect(buildNotificationDisplay('fr', { type: 'friend_request', actorName: 'Alice' }).subtitle).toBeNull();
    expect(buildNotificationDisplay('fr', { type: 'friend_accepted', actorName: 'Bob' }).subtitle).toBeNull();
  });

  it('normalise les variantes de casse / valeurs nulles de postType', () => {
    expect(buildNotificationDisplay('fr', { type: 'post_comment', actorName: 'I', postType: 'story' }).title)
      .toBe('I a commenté votre story');
    expect(buildNotificationDisplay('fr', { type: 'comment_reply', actorName: 'I', postType: null }).subtitle)
      .toBe('En réponse à votre commentaire');
  });
});

describe('formatFileSizeI18n — unités d’octets localisées', () => {
  it('garde la notation octet française (o / Ko / Mo)', () => {
    expect(formatFileSizeI18n('fr', 512)).toBe('512 o');
    expect(formatFileSizeI18n('fr', 500_000)).toBe('488 Ko');
    // Bascule sur la valeur ARRONDIE au bord du mébioctet (jamais « 1024 Ko »).
    expect(formatFileSizeI18n('fr', 1_048_500)).toBe('1.0 Mo');
  });
  it('localise B / KB / MB pour les langues non françaises', () => {
    expect(formatFileSizeI18n('en', 512)).toBe('512 B');
    expect(formatFileSizeI18n('en', 500_000)).toBe('488 KB');
    expect(formatFileSizeI18n('en', 15_000_000)).toBe('14.3 MB');
    expect(formatFileSizeI18n('de', 500_000)).toBe('488 KB');
  });
  it('normalise les variantes régionales avant de choisir l’unité', () => {
    expect(formatFileSizeI18n('fr-FR', 500_000)).toBe('488 Ko');
    expect(formatFileSizeI18n('en-US', 500_000)).toBe('488 KB');
    // Langue inconnue → repli fr (parité normalizeNotificationLanguage).
    expect(formatFileSizeI18n('ja', 500_000)).toBe('488 Ko');
  });
})
