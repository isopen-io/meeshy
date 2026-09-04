import { describe, it, expect } from 'vitest';

import {
  buildNotificationBanner,
  buildNotificationBannerBody,
  buildNotificationHeadline,
  buildNotificationReactionBadge,
  buildNotificationThumbnail,
  notificationBannerFraming,
  type ConventionsDuClient,
} from '../../utils/notification-banner.js';
import { NotificationTypeEnum, type Notification } from '../../types/notification.js';

/**
 * Témoins DIRECTS de `packages/shared/utils/notification-banner.ts` — la loi
 * de bannière elle-même, pas son ré-export web (#5117). Les sept cadrages
 * sont en miroir de `apps/web/__tests__/utils/notification-banner.test.ts`
 * et de `NotificationBannerPresentationTests` (iOS) ; ces témoins-ci exercent
 * en plus les conventions client comme un troisième client le ferait — sans
 * dépendre du vocabulaire d'aucun des deux clients existants.
 */

const t = (key: string, params?: Record<string, string>): string => {
  if (key === 'titles.inConversation') return `${params?.sender} dans ${params?.title}`;
  if (key === 'attachments.photo') return 'Photo';
  if (key === 'attachments.video') return 'Vidéo';
  if (key === 'attachments.audio') return 'Audio';
  return key;
};

const conventions: ConventionsDuClient = {
  nomDeLActeur: (acteur) => (acteur && 'displayName' in acteur ? String(acteur.displayName) : 'Quelqu’un'),
  apercuDeMessage: (contenu, piecesJointes) =>
    piecesJointes && piecesJointes.length > 0 ? `${contenu} (+${piecesJointes.length})` : contenu,
  titreDeRepli: (notification) => `repli.${notification.type}`,
};

const notification = (overrides: Partial<Notification>): Notification => ({
  id: 'n1',
  userId: 'u1',
  type: 'new_message',
  priority: 'normal',
  title: null,
  subtitle: null,
  content: '',
  actor: undefined,
  context: {},
  metadata: {},
  state: { isRead: false, readAt: null, createdAt: new Date('2026-08-30T10:00:00Z'), expiresAt: undefined },
  delivery: { emailSent: false, pushSent: false },
  ...overrides,
} as Notification);

const alice = { id: 'a1', username: 'alice', displayName: 'Alice Martin', avatar: null };

describe('notificationBannerFraming', () => {
  it('range chaque famille de types', () => {
    expect(notificationBannerFraming(notification({ type: NotificationTypeEnum.NEW_MESSAGE }))).toBe('conversation');
    expect(notificationBannerFraming(notification({ type: NotificationTypeEnum.MESSAGE_REPLY }))).toBe('conversation');
    expect(notificationBannerFraming(notification({ type: NotificationTypeEnum.USER_MENTIONED }))).toBe('conversation');
    expect(notificationBannerFraming(notification({ type: NotificationTypeEnum.MESSAGE_REACTION }))).toBe('conversation');
    expect(notificationBannerFraming(notification({ type: NotificationTypeEnum.CONTACT_REQUEST }))).toBe('relation');
    expect(notificationBannerFraming(notification({ type: NotificationTypeEnum.FRIEND_ACCEPTED }))).toBe('relation');
    expect(notificationBannerFraming(notification({ type: NotificationTypeEnum.POST_COMMENT }))).toBe('action');
  });

  it('retombe sur une chaîne vide quand le type n’est pas une chaîne', () => {
    expect(notificationBannerFraming(notification({ type: undefined as unknown as string }))).toBe('action');
  });
});

describe('buildNotificationHeadline — cadrage conversation', () => {
  it('n’annonce que l’acteur pour une conversation directe', () => {
    const headline = buildNotificationHeadline(
      notification({
        type: NotificationTypeEnum.NEW_MESSAGE,
        actor: alice,
        context: { conversationType: 'direct', conversationTitle: 'Alice Martin' },
      }),
      t,
      conventions,
    );
    expect(headline).toBe('Alice Martin');
  });

  it('nomme le groupe depuis le contexte serveur à défaut de nom local', () => {
    const headline = buildNotificationHeadline(
      notification({
        type: NotificationTypeEnum.NEW_MESSAGE,
        actor: alice,
        context: { conversationType: 'group', conversationTitle: 'Équipe Tech' },
      }),
      t,
      conventions,
    );
    expect(headline).toBe('Alice Martin dans Équipe Tech');
  });

  it('préfère le nom LOCAL du groupe à celui du serveur', () => {
    const headline = buildNotificationHeadline(
      notification({
        type: NotificationTypeEnum.NEW_MESSAGE,
        actor: alice,
        context: { conversationType: 'group', conversationTitle: 'Équipe Tech' },
      }),
      t,
      conventions,
      '😴 Mon équipe',
    );
    expect(headline).toBe('Alice Martin dans 😴 Mon équipe');
  });

  it('retombe sur l’acteur seul quand un groupe n’a aucun nom connu', () => {
    const headline = buildNotificationHeadline(
      notification({
        type: NotificationTypeEnum.NEW_MESSAGE,
        actor: alice,
        context: { conversationType: 'group' },
      }),
      t,
      conventions,
    );
    expect(headline).toBe('Alice Martin');
  });
});

describe('buildNotificationHeadline — les deux cadrages du champ `title`', () => {
  it('ne réadditionne pas un titre REST déjà composé', () => {
    const headline = buildNotificationHeadline(
      notification({
        type: NotificationTypeEnum.POST_COMMENT,
        title: 'Alice Martin a commenté votre réel',
        subtitle: 'Votre réel',
        actor: alice,
      }),
      t,
      conventions,
    );
    expect(headline).toBe('Alice Martin a commenté votre réel');
  });

  it('additionne titre (= acteur) et action sur une charge de fil temps réel', () => {
    const headline = buildNotificationHeadline(
      notification({
        type: NotificationTypeEnum.POST_COMMENT,
        title: 'Alice Martin',
        subtitle: 'a commenté votre réel',
        actor: alice,
      }),
      t,
      conventions,
    );
    expect(headline).toBe('Alice Martin a commenté votre réel');
  });

  it('retombe sur le repli client quand le serveur n’a ni titre ni action', () => {
    const headline = buildNotificationHeadline(
      notification({ type: NotificationTypeEnum.POST_COMMENT, actor: alice }),
      t,
      conventions,
    );
    expect(headline).toBe('repli.post_comment');
  });
});

describe('buildNotificationBannerBody', () => {
  it('ne rend aucun corps pour une relation', () => {
    const body = buildNotificationBannerBody(
      notification({ type: NotificationTypeEnum.FRIEND_REQUEST, content: 'Nouvelle demande de contact' }),
      t,
      conventions,
    );
    expect(body).toBeNull();
  });

  it('rend le contenu comme aperçu pour une conversation, pièces jointes comprises', () => {
    const body = buildNotificationBannerBody(
      notification({
        type: NotificationTypeEnum.NEW_MESSAGE,
        content: 'Regarde ça',
        metadata: { attachments: [{ id: 'p1' }] },
      }),
      t,
      conventions,
    );
    expect(body).toBe('Regarde ça (+1)');
  });

  it('ignore des `attachments` qui ne sont pas un tableau', () => {
    const body = buildNotificationBannerBody(
      notification({
        type: NotificationTypeEnum.NEW_MESSAGE,
        content: 'Regarde ça',
        metadata: { attachments: 'pas-un-tableau' },
      }),
      t,
      conventions,
    );
    expect(body).toBe('Regarde ça');
  });

  it('ne rend aucun corps pour une conversation sans contenu', () => {
    const body = buildNotificationBannerBody(
      notification({ type: NotificationTypeEnum.NEW_MESSAGE, content: '' }),
      t,
      conventions,
    );
    expect(body).toBeNull();
  });

  it('résume le média (photo/vidéo/audio) quand une action n’a pas d’extrait', () => {
    const photo = buildNotificationBannerBody(
      notification({ type: NotificationTypeEnum.FRIEND_NEW_POST, content: '', metadata: { mediaType: 'IMAGE' } }),
      t,
      conventions,
    );
    const video = buildNotificationBannerBody(
      notification({ type: NotificationTypeEnum.FRIEND_NEW_POST, content: '', metadata: { mediaType: 'video' } }),
      t,
      conventions,
    );
    const audio = buildNotificationBannerBody(
      notification({ type: NotificationTypeEnum.FRIEND_NEW_POST, content: '', metadata: { mediaType: 'audio' } }),
      t,
      conventions,
    );
    const inconnu = buildNotificationBannerBody(
      notification({ type: NotificationTypeEnum.FRIEND_NEW_POST, content: '', metadata: { mediaType: 'pdf' } }),
      t,
      conventions,
    );
    expect(photo).toBe('Photo');
    expect(video).toBe('Vidéo');
    expect(audio).toBe('Audio');
    expect(inconnu).toBeNull();
  });

  it('ne redit pas l’action dans le corps quand le contenu vaut déjà le sous-titre', () => {
    const body = buildNotificationBannerBody(
      notification({
        type: NotificationTypeEnum.FRIEND_NEW_POST,
        subtitle: 'a publié une nouvelle story',
        content: 'a publié une nouvelle story',
        metadata: { mediaType: 'image' },
      }),
      t,
      conventions,
    );
    expect(body).toBe('Photo');
  });

  it('rend le contenu tel quel pour une action dont l’extrait diffère du sous-titre', () => {
    const body = buildNotificationBannerBody(
      notification({
        type: NotificationTypeEnum.FRIEND_NEW_POST,
        subtitle: 'a publié un nouveau réel',
        content: 'Mon week-end en 15 secondes',
      }),
      t,
      conventions,
    );
    expect(body).toBe('Mon week-end en 15 secondes');
  });
});

describe('buildNotificationReactionBadge', () => {
  it('ne rend rien pour un type qui n’est pas une réaction', () => {
    expect(buildNotificationReactionBadge(notification({ type: NotificationTypeEnum.NEW_MESSAGE }), 'Alice')).toBeNull();
  });

  it('lit `emoji` pour les réactions de contenu', () => {
    const badge = buildNotificationReactionBadge(
      notification({ type: NotificationTypeEnum.STORY_REACTION, metadata: { emoji: '🔥' } }),
      'Alice a réagi à votre story',
    );
    expect(badge).toBe('🔥');
  });

  it('lit `reactionEmoji` pour les réactions de message', () => {
    const badge = buildNotificationReactionBadge(
      notification({ type: NotificationTypeEnum.MESSAGE_REACTION, metadata: { reactionEmoji: '👍' } }),
      'Alice',
    );
    expect(badge).toBe('👍');
  });

  it('ne rend rien quand aucun émoji n’est présent', () => {
    const badge = buildNotificationReactionBadge(
      notification({ type: NotificationTypeEnum.COMMENT_LIKE, metadata: {} }),
      'Alice a aimé votre commentaire',
    );
    expect(badge).toBeNull();
  });

  it('ne redouble pas un émoji déjà porté par la phrase', () => {
    const badge = buildNotificationReactionBadge(
      notification({ type: NotificationTypeEnum.STORY_REACTION, metadata: { emoji: '🔥' } }),
      'Alice Martin a réagi 🔥 à votre story',
    );
    expect(badge).toBeNull();
  });
});

describe('buildNotificationThumbnail', () => {
  it('préfère la vignette du post à toute autre source', () => {
    const url = buildNotificationThumbnail(
      notification({
        metadata: { postThumbnailUrl: 'https://cdn/post.jpg' },
        context: { firstAttachmentUrl: 'https://cdn/other.jpg', firstAttachmentMimeType: 'image/jpeg' },
      }),
    );
    expect(url).toBe('https://cdn/post.jpg');
  });

  it('rend la photo de la 1re pièce jointe d’un message', () => {
    const url = buildNotificationThumbnail(
      notification({ context: { firstAttachmentUrl: 'https://cdn/p.jpg', firstAttachmentMimeType: 'image/jpeg' } }),
    );
    expect(url).toBe('https://cdn/p.jpg');
  });

  it('ne rend aucune vignette pour un vocal', () => {
    const url = buildNotificationThumbnail(
      notification({ context: { firstAttachmentUrl: 'https://cdn/v.m4a', firstAttachmentMimeType: 'audio/m4a' } }),
    );
    expect(url).toBeNull();
  });

  it('ne rend aucune vignette quand le contexte ne porte ni vignette ni pièce jointe image', () => {
    expect(buildNotificationThumbnail(notification({ context: {} }))).toBeNull();
  });

  it('ne rend aucune vignette quand l’URL de la pièce jointe est vide', () => {
    const url = buildNotificationThumbnail(
      notification({ context: { firstAttachmentUrl: '   ', firstAttachmentMimeType: 'image/png' } }),
    );
    expect(url).toBeNull();
  });
});

describe('buildNotificationBanner — assemble les quatre champs', () => {
  it('compose une bannière complète pour une réaction sur contenu', () => {
    const banner = buildNotificationBanner(
      notification({
        type: NotificationTypeEnum.STORY_REACTION,
        title: 'Alice Martin',
        subtitle: 'a réagi 🔥 à votre story',
        content: 'Votre story · 📷 Photo',
        actor: alice,
        metadata: { emoji: '🔥', postThumbnailUrl: 'https://cdn/s.jpg' },
      }),
      t,
      conventions,
    );

    expect(banner).toEqual({
      headline: 'Alice Martin a réagi 🔥 à votre story',
      body: 'Votre story · 📷 Photo',
      reactionBadge: null,
      thumbnailUrl: 'https://cdn/s.jpg',
    });
  });

  it('transmet le nom de groupe local aux quatre champs', () => {
    const banner = buildNotificationBanner(
      notification({
        type: NotificationTypeEnum.NEW_MESSAGE,
        actor: alice,
        content: 'Salut',
        context: { conversationType: 'group', conversationTitle: 'Équipe Tech' },
      }),
      t,
      conventions,
      { groupName: '😴 Mon équipe' },
    );

    expect(banner.headline).toBe('Alice Martin dans 😴 Mon équipe');
    expect(banner.body).toBe('Salut');
  });
});

/**
 * LA GARDE DU CORRECTIF DE LA BRANCHE `feat/banniere-v3` (#4454), ajoutée à ces
 * témoins plutôt qu'en concurrence d'eux.
 *
 * Deux fichiers de témoins pour la même loi ont été écrits en parallèle, par
 * deux sessions, au même chemin. Celui-ci — le premier arrivé sur `dev` — est
 * gardé ENTIER ; ce qui suit n'ajoute que les cas qu'il ne couvrait pas, parce
 * qu'ils gardent un correctif qui n'existait pas encore quand il a été écrit.
 *
 * **LE DÉFAUT CORRIGÉ.** `buildNotificationBannerBody` sortait sur
 * `if (!contenu) return null` AVANT de regarder les pièces jointes : une photo
 * envoyée SANS LÉGENDE — le cas nominal — poussait une bannière portant le seul
 * nom de l'expéditeur, et `apercuDeMessage`, la convention faite pour ce cas,
 * n'était jamais appelée. C'est l'absence des DEUX qui fait un corps vide,
 * jamais celle du texte seul.
 *
 * Le témoin « ne rend aucun corps pour une conversation sans contenu » ci-dessus
 * reste juste et le reste : il n'a pas de pièce jointe, et c'est précisément ce
 * qui l'en distingue.
 */
describe('buildNotificationBannerBody — un message sans légende n’est pas un message vide', () => {
  it('demande au client de résumer les pièces jointes d’un message SANS texte', () => {
    const body = buildNotificationBannerBody(
      notification({
        type: NotificationTypeEnum.NEW_MESSAGE,
        content: '',
        metadata: { attachments: [{ id: 'p1' }] },
      }),
      t,
      conventions,
    );

    expect(body).toBe(' (+1)');
  });

  it('ne rend toujours aucun corps quand le tableau de pièces jointes est VIDE', () => {
    const body = buildNotificationBannerBody(
      notification({ type: NotificationTypeEnum.NEW_MESSAGE, content: '', metadata: { attachments: [] } }),
      t,
      conventions,
    );

    expect(body).toBeNull();
  });

  it('ne rend aucun corps quand il n’y a NI texte NI pièce jointe lisible', () => {
    for (const metadata of [{}, { attachments: 'pas-un-tableau' }]) {
      expect(
        buildNotificationBannerBody(
          notification({ type: NotificationTypeEnum.NEW_MESSAGE, content: '', metadata }),
          t,
          conventions,
        ),
      ).toBeNull();
    }
  });
});
