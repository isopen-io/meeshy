import { describe, expect, test } from 'bun:test';

import type { NotificationRecord } from './record';
import { notificationQuickActions, notificationRowPresentation, repeatsText } from './row-presentation';
import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';

await loadNotificationRowCatalog('fr');

/**
 * CE QU'UNE LIGNE DE LA CLOCHE DIT (#8727, jumelle de `NotificationRowPresentationTests`
 * iOS, #8724) — une règle PURE, témoignée par TYPE :
 *
 * - AUCUNE RÉPÉTITION : un texte ne paraît qu'une fois (titre, corps, citation, pied) ;
 * - le CONTEXTE : une réaction ou une réponse sur un commentaire ou un post dit en pied
 *   le POST qui le porte, avec son icône — jamais le commentaire une seconde fois ;
 * - le PALIER : « Badge débloqué » dit QUEL badge, et pourquoi ;
 * - l'AMI PARRAINÉ : Écrire, et Se connecter tant qu'on n'est pas amis.
 */

const NOW = new Date('2026-09-30T10:00:00.000Z');

const record = (partial: Partial<NotificationRecord>): NotificationRecord => ({
  id: 'n1',
  type: 'comment_reaction',
  title: 'Belva Tano a réagi ❤️ à votre commentaire',
  content: 'Superbe features qui vient avec tellement d’options',
  actor: { id: 'u-belva', username: 'belva', displayName: 'Belva Tano', avatar: null },
  context: { postId: 'p1' },
  metadata: {},
  state: { isRead: false, createdAt: '2026-09-30T09:00:00.000Z' },
  ...partial,
});

const present = (notification: NotificationRecord) => notificationRowPresentation(notification, { language: 'fr', now: NOW });

describe('la règle anti-répétition', () => {
  test('guillemets, casse, espaces et troncature « … » ne font pas un texte neuf', () => {
    expect(repeatsText('« Superbe features qui vient avec tellement d’… »', 'Superbe features qui vient avec tellement d’options')).toBe(true);
    expect(repeatsText('BONJOUR  à tous', 'bonjour à tous')).toBe(true);
    expect(repeatsText('Le lac', 'Superbe')).toBe(false);
  });

  test('l’action seule répète le titre « acteur + action » qui la porte (#10299)', () => {
    expect(repeatsText('a rejoint Les Amis', 'Awa a rejoint Les Amis')).toBe(true);
    expect(repeatsText('Les Amis', 'Awa a rejoint Les Amis')).toBe(true);
  });

  test('une arrivée de membre se lit en UNE ligne : qui, et dans quelle conversation (#10299)', () => {
    const row = present(
      record({
        type: 'member_joined',
        title: 'Awa a rejoint Les Amis',
        content: 'a rejoint Les Amis',
        actor: { id: 'u-awa', username: 'awa', displayName: 'Awa', avatar: null },
        context: { conversationId: 'c1', conversationTitle: 'Les Amis', conversationType: 'group' },
      }),
    );
    expect(row).toMatchObject({ title: 'Awa a rejoint Les Amis', body: null, footer: null });
    expect(repeatsText('', 'Superbe')).toBe(false);
  });
});

describe('réaction à un COMMENTAIRE — le cas Belva de la capture porteur', () => {
  test('le commentaire paraît UNE fois, le pied dit le POST avec son icône', () => {
    const row = present(
      record({
        content: 'Superbe features qui vient avec tellement d’…',
        metadata: { commentPreview: 'Superbe features qui vient avec tellement d’options', postPreview: 'Le lac au matin', postType: 'POST' },
      }),
    );
    expect(row.leading).toEqual({ kind: 'avatar' });
    expect(row.body).toBe('« Superbe features qui vient avec tellement d’options »');
    expect(row.quote).toBeNull();
    expect(row.footer).toEqual({ kind: 'content', content: 'post', text: 'Le lac au matin', expired: false });
  });

  test('un post sans texte se dit par son MÉDIA, un post sans rien par son LIBELLÉ', () => {
    const photo = present(record({ metadata: { commentPreview: 'Superbe', mediaType: 'image' } }));
    const nu = present(record({ metadata: { commentPreview: 'Superbe' } }));
    expect(photo.footer).toEqual({ kind: 'content', content: 'post', text: '📷 Photo', expired: false });
    expect(nu.footer).toEqual({ kind: 'content', content: 'post', text: 'Publication', expired: false });
  });

  test('un extrait du post qui répète le corps retombe sur le libellé du contenu', () => {
    const row = present(record({ metadata: { commentPreview: 'Le lac au matin', postPreview: 'Le lac au matin' } }));
    expect(row.footer).toEqual({ kind: 'content', content: 'post', text: 'Publication', expired: false });
  });
});

describe('réponse à un commentaire', () => {
  test('la réponse en corps, le commentaire parent en citation, le post en pied', () => {
    const row = present(
      record({
        type: 'comment_reply',
        title: 'Grace a répondu à votre commentaire',
        content: 'Merci !',
        metadata: { commentPreview: 'Merci !', parentCommentPreview: 'Quelle vue', postPreview: 'Le lac au matin', postType: 'STORY' },
        context: { postId: 'p1', postCreatedAt: '2026-09-28T08:00:00.000Z' },
      }),
    );
    expect(row.body).toBe('Merci !');
    expect(row.quote).toBe('En réponse à « Quelle vue »');
    expect(row.footer).toEqual({ kind: 'content', content: 'story', text: 'Le lac au matin · 28/09', expired: false });
  });
});

describe('réaction à un POST — le corps se tait, le pied dit le contenu', () => {
  test('une story expirée le dit en pied', () => {
    const row = present(
      record({
        type: 'story_reaction',
        title: 'Awa a réagi 🔥 à votre story',
        content: '',
        metadata: { postPreview: 'Coucher de soleil' },
        context: { postId: 'p1', postExpiresAt: '2026-09-29T08:00:00.000Z' },
      }),
    );
    expect(row.body).toBeNull();
    expect(row.footer).toEqual({ kind: 'content', content: 'story', text: 'Coucher de soleil · expirée', expired: true });
  });
});

describe('une REPUBLICATION — le titre et le pied nomment le contenu republié (#10525)', () => {
  const repost = (postType: string, title: string) =>
    present(
      record({
        type: 'post_repost',
        title,
        content: '',
        actor: { id: 'u-awa', username: 'awa', displayName: 'Awa', avatar: null },
        metadata: { postType },
      }),
    );

  test('un réel, une story, une publication : le titre servi, le pied à son icône', () => {
    const cases: readonly (readonly [string, string, string, string])[] = [
      ['REEL', 'Awa a republié votre réel', 'reel', 'Réel'],
      ['STORY', 'Awa a republié votre story', 'story', 'Story'],
      ['POST', 'Awa a republié votre publication', 'post', 'Publication'],
    ];
    cases.forEach(([postType, title, content, label]) => {
      const row = repost(postType, title);
      expect(row.title).toBe(title);
      expect(row.footer).toEqual({ kind: 'content', content, text: label, expired: false });
    });
  });

  test('un STATUS republié se dit « humeur » jusque dans le pied, comme le titre servi', () => {
    const row = repost('STATUS', 'Awa a republié votre humeur');
    expect(row.title).toBe('Awa a republié votre humeur');
    expect(row.footer).toEqual({ kind: 'content', content: 'mood', text: 'Humeur', expired: false });
  });

  test('une réaction ou un commentaire sur un STATUS dit « Humeur » en pied, comme sa republication (#10526)', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['status_reaction', 'Awa a réagi 🔥 à votre humeur'],
      ['post_comment', 'Awa a commenté votre humeur'],
      ['friend_story_comment', 'Awa a commenté une humeur'],
    ];
    cases.forEach(([type, title]) => {
      const row = present(record({ type, title, content: '', metadata: { postType: 'STATUS' } }));
      expect(row.footer).toEqual({ kind: 'content', content: 'mood', text: 'Humeur', expired: false });
    });
  });

  test('une charge sans type (status_reaction seul) ou persistée en MOOD se lit aussi « Humeur »', () => {
    const bare = present(record({ type: 'status_reaction', title: 'Awa a réagi 🔥 à votre humeur', content: '', metadata: {} }));
    const mood = present(record({ type: 'status_reaction', title: 'Awa a réagi 🔥 à votre humeur', content: '', metadata: { postType: 'MOOD' } }));
    expect(bare.footer).toEqual({ kind: 'content', content: 'mood', text: 'Humeur', expired: false });
    expect(mood.footer).toEqual(bare.footer);
  });

  test('dans les sept langues, le pied d’un STATUS porte le mot du mood', async () => {
    const MOT = { fr: 'Humeur', en: 'Mood', es: 'Estado de ánimo', pt: 'Humor', de: 'Stimmung', it: 'Stato d’animo', ar: 'مزاج' } as const;
    for (const [language, mot] of Object.entries(MOT) as [keyof typeof MOT, string][]) {
      await loadNotificationRowCatalog(language);
      const row = notificationRowPresentation(
        record({ type: 'status_reaction', title: 'Awa', content: '', metadata: { postType: 'STATUS' } }),
        { language, now: NOW },
      );
      expect(row.footer).toEqual({ kind: 'content', content: 'mood', text: mot, expired: false });
    }
  });
});

describe('les messages — le groupe en pied, jamais répété', () => {
  test('le corps, puis le nom du groupe', () => {
    const row = present(
      record({
        type: 'new_message',
        title: 'Grace',
        content: 'On se voit à 18 h ?',
        context: { conversationId: 'c1', conversationTitle: 'Les amateurs', conversationType: 'group' },
      }),
    );
    expect(row.body).toBe('On se voit à 18 h ?');
    expect(row.footer).toEqual({ kind: 'conversation', scope: 'group', text: 'Les amateurs' });
  });

  test('un corps qui répète le titre se tait ; un groupe qui répète le titre aussi', () => {
    const row = present(
      record({
        type: 'new_message',
        title: 'Les amateurs',
        content: 'Les amateurs',
        context: { conversationId: 'c1', conversationTitle: 'Les amateurs', conversationType: 'group' },
      }),
    );
    expect(row.body).toBeNull();
    expect(row.footer).toBeNull();
  });

  test('une conversation directe se dit « Message privé » (#9992) ; hors conversation, le sous-titre serveur tient lieu de pied', () => {
    const direct = present(record({ type: 'new_message', title: 'Grace', content: 'Salut', context: { conversationId: 'c1', conversationTitle: 'Grace', conversationType: 'direct' } }));
    const plain = present(record({ type: 'friend_accepted', title: 'Awa a accepté', content: '', subtitle: 'Vous êtes maintenant amis', context: {} }));
    expect(direct.footer).toEqual({ kind: 'conversation', scope: 'direct', text: 'Message privé' });
    expect(plain.footer).toEqual({ kind: 'plain', text: 'Vous êtes maintenant amis' });
  });
});

describe('les paliers — la ligne dit QUEL badge', () => {
  test('un badge d’axe : son nom, son icône et son palier', () => {
    const row = present(
      record({
        type: 'badge_earned',
        title: 'Badge débloqué',
        content: 'Badge débloqué : Stories · palier 10',
        actor: null,
        metadata: { axisKey: 'content.story', threshold: 10 },
      }),
    );
    expect(row.leading).toEqual({ kind: 'milestone', glyph: 'camera' });
    expect(row.title).toBe('Stories');
    expect(row.body).toBe('Badge débloqué · palier 10');
    expect(row.footer).toBeNull();
  });

  test('le badge de parrainage nomme la personne venue par votre lien', () => {
    const row = present(
      record({
        type: 'badge_earned',
        title: 'Badge débloqué',
        content: 'Badge débloqué : Invités venus · palier 1',
        actor: { id: 'u-awa', username: 'awa', displayName: 'Awa', avatar: null },
        metadata: { axisKey: 'social.invite_joined', threshold: 1 },
      }),
    );
    expect(row.leading).toEqual({ kind: 'milestone', glyph: 'userPlus' });
    expect(row.title).toBe('Invités venus');
    expect(row.body).toBe('Awa a rejoint Meeshy grâce à vous');
  });

  test('un succès dit sa condition ; un niveau et une série disent leur nombre', () => {
    const achievement = present(record({ type: 'achievement_unlocked', title: 'Succès débloqué', content: '', actor: null, metadata: { achievementKey: 'achievement.first_voice' } }));
    const level = present(record({ type: 'level_up', title: 'Niveau atteint', content: 'Niveau 3', actor: null, metadata: { threshold: 150, level: 3 } }));
    const streak = present(record({ type: 'streak_milestone', title: 'Série', content: '', actor: null, metadata: { threshold: 7 } }));
    expect(achievement.leading).toEqual({ kind: 'milestone', glyph: 'trophy' });
    expect(achievement.title).toBe('Première voix');
    expect(achievement.body).toBe('Un premier message ou commentaire vocal');
    expect(level).toMatchObject({ leading: { kind: 'milestone', glyph: 'star' }, title: 'Niveau 3', body: null });
    expect(streak).toMatchObject({ leading: { kind: 'milestone', glyph: 'fire' }, title: '7 jours d’affilée' });
  });

  test('un palier composé par le serveur (#10298) se rend tel quel : le palier en titre, l’exploit en corps', () => {
    const badge = present(
      record({
        type: 'badge_earned',
        title: '🏆 Palier 6 atteint',
        content: 'Commentaires écrits : 1 000 — bravo, vous êtes au palier 6 !',
        actor: null,
        metadata: { axisKey: 'comment.text', threshold: 1000, tierRank: 6 },
      }),
    );
    const level = present(
      record({ type: 'level_up', title: '⭐ Niveau 3 atteint !', content: '150 points — bravo, vous êtes au niveau 3 !', actor: null, metadata: { threshold: 150, level: 3, tierRank: 3 } }),
    );
    expect(badge).toMatchObject({ title: '🏆 Palier 6 atteint', body: 'Commentaires écrits : 1 000 — bravo, vous êtes au palier 6 !' });
    expect(badge.leading.kind).toBe('milestone');
    expect(level).toMatchObject({ title: '⭐ Niveau 3 atteint !', body: '150 points — bravo, vous êtes au niveau 3 !' });
  });

  test('un axe inconnu retombe sur la ligne ordinaire, jamais sur une clé', () => {
    const row = present(record({ type: 'badge_earned', title: 'Badge débloqué', content: 'Bravo', actor: null, metadata: { axisKey: 'inconnu' } }));
    expect(row.leading).toEqual({ kind: 'avatar' });
    expect(row.title).toBe('Badge débloqué');
  });
});

describe('les gestes d’une ligne', () => {
  const invite = record({ type: 'badge_earned', actor: { id: 'u-awa', username: 'awa', displayName: 'Awa', avatar: null }, metadata: { axisKey: 'social.invite_joined', threshold: 1 } });

  test('l’ami parrainé : Écrire, puis Se connecter tant qu’on n’est pas amis', () => {
    expect(notificationQuickActions(invite, { isFriend: false })).toEqual([
      { kind: 'write', userId: 'u-awa' },
      { kind: 'connect', userId: 'u-awa' },
    ]);
    expect(notificationQuickActions(invite, { isFriend: true })).toEqual([{ kind: 'write', userId: 'u-awa' }]);
  });

  test('un contact qui rejoint : Se connecter puis Écrire ; un autre badge : rien', () => {
    expect(notificationQuickActions(record({ type: 'contact_joined' }), { isFriend: false })).toEqual([
      { kind: 'connect', userId: 'u-belva' },
      { kind: 'write', userId: 'u-belva' },
    ]);
    expect(notificationQuickActions(record({ type: 'badge_earned', metadata: { axisKey: 'content.story' } }), { isFriend: false })).toEqual([]);
    expect(notificationQuickActions({ ...invite, actor: null }, { isFriend: false })).toEqual([]);
  });
});

/**
 * LES NOTIFICATIONS DU JEU (#9490) — le serveur compose la phrase dans la langue du destinataire. Un duo se
 * joue entre amis : l'ami est l'acteur, son avatar tient la place. Une ligue et une saison n'ont personne à
 * nommer : la ligne porte la SIGNATURE de Meeshy à la place d'un avatar, et la phrase est dans le corps.
 */
describe('les notifications du jeu', () => {
  test('un duo : l’ami en avatar, le titre cadré par le serveur, la phrase en corps', () => {
    const row = present(
      record({
        type: 'game_duo_invited',
        title: 'Amina t’invite à la mission en duo',
        content: 'Ouvre la mission de la semaine pour répondre.',
        actor: { id: 'u-amina', username: 'amina', displayName: 'Amina', avatar: null },
        context: {},
        metadata: { gameSection: 'duo' },
      }),
    );
    expect(row.leading).toEqual({ kind: 'avatar' });
    expect(row.title).toBe('Amina t’invite à la mission en duo');
    expect(row.body).toBe('Ouvre la mission de la semaine pour répondre.');
  });

  test('un résultat de ligue et une étape de saison : la Signature de Meeshy, la phrase du serveur en corps', () => {
    for (const type of ['game_league_result', 'game_season_step']) {
      const row = present(record({ type, title: null, content: 'Étape 12 franchie : une récompense t’attend.', actor: null, context: {}, metadata: { gameSection: 'season' } }));
      expect(row.leading).toEqual({ kind: 'game' });
      expect(row.title).toBe('Meeshy');
      expect(row.body).toBe('Étape 12 franchie : une récompense t’attend.');
      expect(row.footer).toBeNull();
    }
  });

  test('l’annonce d’une plage de mission est la ligne du jeu : la Signature en tête, le texte servi, aucun nom (#9539)', () => {
    const row = present(record({ type: 'game_mission_window', title: null, content: 'Ta mission du jour : envoyer 3 messages, entre 18:00 et 20:00.', actor: null, context: {}, metadata: { gameSection: 'missions' } }));
    expect(row.leading).toEqual({ kind: 'game' });
    expect(row.title).toBe('Meeshy');
    expect(row.body).toBe('Ta mission du jour : envoyer 3 messages, entre 18:00 et 20:00.');
  });

  test('aucune rangée du jeu ne porte de geste rapide : pas d’« Écrire », pas de « Se connecter »', () => {
    for (const type of ['game_duo_invited', 'game_duo_accepted', 'game_league_result', 'game_season_step', 'game_mission_window']) {
      const actor = { id: 'u-amina', username: 'amina', displayName: 'Amina', avatar: null };
      expect(notificationQuickActions(record({ type, actor }), { isFriend: false })).toEqual([]);
    }
  });
});
