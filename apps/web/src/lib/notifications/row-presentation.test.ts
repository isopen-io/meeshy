import { describe, expect, test } from 'bun:test';

import type { NotificationRecord } from './record';
import { notificationQuickActions, notificationRowPresentation, repeatsText } from './row-presentation';

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
    expect(row.footer).toEqual({ kind: 'conversation', text: 'Les amateurs' });
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

  test('une conversation directe n’a pas de pied de groupe ; le sous-titre serveur tient lieu de pied', () => {
    const direct = present(record({ type: 'new_message', title: 'Grace', content: 'Salut', context: { conversationId: 'c1', conversationTitle: 'Grace', conversationType: 'direct' } }));
    const plain = present(record({ type: 'friend_accepted', title: 'Awa a accepté', content: '', subtitle: 'Vous êtes maintenant amis', context: {} }));
    expect(direct.footer).toBeNull();
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
