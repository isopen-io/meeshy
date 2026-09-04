/**
 * **Une bannière doit dire CE QUI vient d'arriver.**
 *
 * Le toast web n'affichait que l'auteur et le contenu, et son titre venait de
 * `notification.title` — qui vaut le NOM DE L'ACTEUR sur le fil temps réel :
 * un commentaire sur un réel s'annonçait « elvira ndjiki », rien de plus.
 *
 * Ces témoins tiennent les SEPT cadrages du produit, en miroir de
 * `NotificationBannerPresentationTests` (iOS). La phrase d'action vient du
 * serveur et n'est jamais réécrite ici : ce qui se vérifie, c'est qu'elle est
 * LUE, POSÉE au bon endroit, et jamais dite deux fois.
 */

import {
  buildNotificationBanner,
  notificationBannerFraming,
} from '@/utils/notification-banner';
import { buildNotificationTitle } from '@/utils/notification-helpers';
import type { Notification } from '@/types/notification';

const t = (key: string, params?: Record<string, string>): string => {
  if (key === 'titles.inConversation') return `${params?.sender} dans ${params?.title}`;
  if (key === 'attachments.photo') return 'Photo';
  if (key === 'attachments.video') return 'Vidéo';
  if (key === 'attachments.audio') return 'Audio';
  return key;
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

describe('buildNotificationBanner — les sept cadrages', () => {
  // ── 1. Commentaire de contenu ──

  it('dit CE QUI a été commenté, et montre le commentaire', () => {
    const banner = buildNotificationBanner(notification({
      type: 'post_comment',
      title: 'Alice Martin',
      subtitle: 'a commenté votre réel',
      content: 'Superbe montage !',
      actor: alice,
      metadata: { postType: 'REEL', postThumbnailUrl: 'https://cdn/reel.jpg' },
    }), t);

    expect(banner.headline).toBe('Alice Martin a commenté votre réel');
    expect(banner.body).toBe('Superbe montage !');
    expect(banner.thumbnailUrl).toBe('https://cdn/reel.jpg');
  });

  // ── 2. Publication de nouveau contenu ──

  it('dit CE QUI a été publié', () => {
    const banner = buildNotificationBanner(notification({
      type: 'friend_new_post',
      title: 'Alice Martin',
      subtitle: 'a publié un nouveau réel',
      content: 'Mon week-end en 15 secondes',
      actor: alice,
      metadata: { contentType: 'REEL' },
    }), t);

    expect(banner.headline).toBe('Alice Martin a publié un nouveau réel');
    expect(banner.body).toBe('Mon week-end en 15 secondes');
  });

  it('ne redit pas l’action dans le corps quand le contenu n’a pas de texte', () => {
    // Le serveur garantit que la LIGNE DE LISTE n'est jamais vide : sans
    // extrait, `content` retombe sur la phrase d'action elle-même.
    const banner = buildNotificationBanner(notification({
      type: 'friend_new_story',
      title: 'Alice Martin',
      subtitle: 'a publié une nouvelle story',
      content: 'a publié une nouvelle story',
      actor: alice,
      metadata: { contentType: 'STORY', mediaType: 'image' },
    }), t);

    expect(banner.headline).toBe('Alice Martin a publié une nouvelle story');
    expect(banner.body).toBe('Photo');
  });

  // ── 3 & 4. Messages ──

  it('n’annonce qu’un nom pour un message privé', () => {
    const banner = buildNotificationBanner(notification({
      type: 'new_message',
      title: 'Alice Martin',
      content: 'Coucou',
      actor: alice,
      context: { conversationId: 'c1', conversationTitle: 'Alice Martin', conversationType: 'direct' },
    }), t);

    expect(banner.headline).toBe('Alice Martin');
    expect(banner.body).toBe('Coucou');
  });

  /**
   * LE CAS NOMINAL D'UNE PHOTO — un message SANS LÉGENDE. La loi retournait
   * `null` sur l'absence de texte AVANT de regarder les pièces jointes : la
   * bannière ne portait alors que le nom de l'expéditeur, et `formatMessagePreview`
   * — qui sait pourtant composer « 📷 Photo » — n'était jamais appelée.
   */
  it('annonce la pièce jointe d’un message envoyé sans légende', () => {
    const banner = buildNotificationBanner(notification({
      type: 'new_message',
      title: 'Alice Martin',
      content: '',
      actor: alice,
      context: { conversationId: 'c1', conversationTitle: 'Alice Martin', conversationType: 'direct' },
      metadata: { attachments: [{ mimeType: 'image/jpeg' }] },
    }), t);

    expect(banner.headline).toBe('Alice Martin');
    expect(banner.body).toBe('📷 Photo');
  });

  it('nomme le groupe pour un message de groupe', () => {
    const banner = buildNotificationBanner(notification({
      type: 'new_message',
      title: 'Alice Martin',
      subtitle: 'Équipe Tech',
      content: 'Salut',
      actor: alice,
      context: { conversationId: 'c1', conversationTitle: 'Équipe Tech', conversationType: 'group' },
    }), t);

    expect(banner.headline).toBe('Alice Martin dans Équipe Tech');
  });

  it('préfère le nom LOCAL du groupe quand l’appareil en connaît un', () => {
    const banner = buildNotificationBanner(notification({
      type: 'new_message',
      title: 'Alice Martin',
      content: 'Salut',
      actor: alice,
      context: { conversationId: 'c1', conversationTitle: 'Équipe Tech', conversationType: 'group' },
    }), t, { groupName: '😴 Mon équipe à moi' });

    expect(banner.headline).toBe('Alice Martin dans 😴 Mon équipe à moi');
  });

  it('montre l’indicateur d’un message protégé, sans jamais de vignette', () => {
    // La passerelle retient le média en bloc pour un message éphémère / à vue
    // unique / flouté / chiffré : le fil n'en porte aucune URL.
    const banner = buildNotificationBanner(notification({
      type: 'new_message',
      title: 'Alice Martin',
      content: '👁️ 🖼️',
      actor: alice,
      context: { conversationTitle: 'Photos', conversationType: 'group' },
    }), t);

    expect(banner.body).toBe('👁️ 🖼️');
    expect(banner.thumbnailUrl).toBeNull();
  });

  it('prend la photo du message comme vignette, mais pas un vocal', () => {
    const photo = buildNotificationBanner(notification({
      type: 'new_message', title: 'Alice Martin', content: 'regarde', actor: alice,
      context: {
        conversationTitle: 'Photos', conversationType: 'group',
        firstAttachmentUrl: 'https://cdn/p.jpg', firstAttachmentMimeType: 'image/jpeg',
      },
    }), t);
    const voice = buildNotificationBanner(notification({
      type: 'new_message', title: 'Alice Martin', content: '🎵 Audio · 0:34', actor: alice,
      context: {
        conversationTitle: 'Voice', conversationType: 'group',
        firstAttachmentUrl: 'https://cdn/v.m4a', firstAttachmentMimeType: 'audio/m4a',
      },
    }), t);

    expect(photo.thumbnailUrl).toBe('https://cdn/p.jpg');
    expect(voice.thumbnailUrl).toBeNull();
  });

  // ── 5 & 6. Relations ──

  it('annonce une demande de relation comme une ACTION, sans corps qui la redit', () => {
    const banner = buildNotificationBanner(notification({
      type: 'friend_request',
      title: 'Alice Martin',
      subtitle: 'veut se connecter',
      content: 'Nouvelle demande de contact',
      actor: alice,
    }), t);

    expect(banner.headline).toBe('Alice Martin veut se connecter');
    expect(banner.body).toBeNull();
  });

  it('annonce une relation acceptée', () => {
    const banner = buildNotificationBanner(notification({
      type: 'friend_accepted',
      title: 'Alice Martin',
      subtitle: 'a accepté votre demande',
      content: 'Demande de contact acceptée',
      actor: alice,
    }), t);

    expect(banner.headline).toBe('Alice Martin a accepté votre demande');
    expect(banner.body).toBeNull();
  });

  // ── 7. Réaction ──

  it('dit à QUOI on a réagi, et ne répète pas l’émoji que la phrase porte déjà', () => {
    const banner = buildNotificationBanner(notification({
      type: 'story_reaction',
      title: 'Alice Martin',
      subtitle: 'a réagi 🔥 à votre story',
      content: 'Votre story · 📷 Photo',
      actor: alice,
      metadata: { postType: 'STORY', emoji: '🔥', postThumbnailUrl: 'https://cdn/s.jpg' },
    }), t);

    expect(banner.headline).toBe('Alice Martin a réagi 🔥 à votre story');
    expect(banner.body).toBe('Votre story · 📷 Photo');
    expect(banner.thumbnailUrl).toBe('https://cdn/s.jpg');
    expect(banner.reactionBadge).toBeNull();
  });

  it('rend la réaction en pastille quand la phrase ne la porte pas', () => {
    const banner = buildNotificationBanner(notification({
      type: 'comment_like',
      title: 'Alice Martin',
      subtitle: 'a aimé votre commentaire',
      content: '« Bien vu ! »',
      actor: alice,
      metadata: { emoji: '👍' },
    }), t);

    expect(banner.reactionBadge).toBe('👍');
  });
});

describe('buildNotificationBanner — les deux cadrages du champ `title`', () => {
  /**
   * Le fil temps réel envoie `title` = l'acteur et `subtitle` = la phrase
   * d'action ; la liste REST envoie `title` = la phrase entière persistée et
   * `subtitle` = l'entité visée. Les additionner dans le second cas écrirait
   * « Alice a commenté votre réel Votre réel ».
   */
  it('ne réadditionne pas un titre déjà composé (charge REST)', () => {
    const banner = buildNotificationBanner(notification({
      type: 'post_comment',
      title: 'Alice Martin a commenté votre réel',
      subtitle: 'Votre réel',
      content: 'Superbe montage !',
      actor: alice,
    }), t);

    expect(banner.headline).toBe('Alice Martin a commenté votre réel');
  });

  it('retombe sur le rendu client quand le serveur n’a ni titre ni action', () => {
    const banner = buildNotificationBanner(notification({
      type: 'post_comment',
      content: 'Superbe montage !',
      actor: alice,
    }), t);

    expect(banner.headline).toBe('titles.postComment');
  });
});

describe('le défaut que ce module corrige', () => {
  /**
   * Témoin de non-régression : `buildNotificationTitle` — ce que le toast
   * utilisait — préfère `notification.title`, qui vaut le NOM DE L'ACTEUR sur
   * le fil temps réel. Il ne peut PAS dire ce qui vient d'arriver, et le
   * remplacer par la somme titre + action est tout l'objet de ce module.
   */
  it('buildNotificationTitle ne dit que l’auteur sur une charge de fil', () => {
    const socketPayload = notification({
      type: 'post_comment',
      title: 'Alice Martin',
      subtitle: 'a commenté votre réel',
      content: 'Superbe montage !',
      actor: alice,
    });

    expect(buildNotificationTitle(socketPayload, t)).toBe('Alice Martin');
    expect(buildNotificationBanner(socketPayload, t).headline)
      .toBe('Alice Martin a commenté votre réel');
  });
});

describe('notificationBannerFraming', () => {
  it('décide par le TYPE, jamais par la forme des champs', () => {
    expect(notificationBannerFraming(notification({ type: 'user_mentioned' }))).toBe('conversation');
    expect(notificationBannerFraming(notification({ type: 'contact_request' }))).toBe('relation');
    expect(notificationBannerFraming(notification({ type: 'friend_new_mood' }))).toBe('action');
  });
});
