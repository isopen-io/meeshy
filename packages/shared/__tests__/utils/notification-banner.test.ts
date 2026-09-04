/**
 * LA LOI DE LA BANNIÈRE, JUGÉE CHEZ ELLE (#4454).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ET CE QU'IL DIT DE LA REMONTÉE D'UNE LOI
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * La loi a été remontée du web existant vers `packages/shared` pour cesser
 * d'être écrite trois fois. Ses TÉMOINS, eux, sont restés chez les clients :
 * `apps/web/__tests__/utils/notification-banner.test.ts` et
 * `apps/web-v3/__tests__/banniere-notification.test.ts` la couvrent — chacun À
 * TRAVERS SA LIAISON.
 *
 * Résultat mesuré en CI : `notification-banner.ts` à **7,14 % de lignes** dans
 * la couverture de `packages/shared`, sous les seuils du paquet (98 / 98 / 94),
 * et le gate rouge. Le code était pourtant exercé — mais par les suites de DEUX
 * AUTRES paquets, qui ne comptent pas ici.
 *
 * **REMONTER UNE LOI SANS REMONTER SES TÉMOINS LA REND ORPHELINE.** Ce n'est
 * pas une exigence de chiffre : un paquet partagé dont la règle n'est prouvée
 * que par ses consommateurs ne peut plus être modifié en confiance depuis
 * lui-même — le jour où un client cesse de l'appeler, la règle n'a plus aucun
 * témoin, et rien ne rougit.
 *
 * Ce fichier juge donc la loi PAR ELLE-MÊME, avec des conventions COUSUES : ce
 * qui est vérifié est le CADRAGE et la COMPOSITION, jamais le vocabulaire d'un
 * client. Les deux suites clientes gardent leur objet propre — que la LIAISON
 * apporte les bonnes conventions.
 */

import { describe, it, expect } from 'vitest';

import {
  buildNotificationBanner,
  buildNotificationBannerBody,
  buildNotificationHeadline,
  buildNotificationReactionBadge,
  buildNotificationThumbnail,
  notificationBannerFraming,
  type ConventionsDuClient,
  type TranslateFunction,
} from '../../utils/notification-banner';
import type { Notification } from '../../types/notification';

/**
 * LE `t` COUSU — il rend une forme RECONNAISSABLE plutôt qu'une phrase
 * française : ce qui est jugé ici est « la loi a-t-elle demandé CETTE clé ? »,
 * pas « la phrase est-elle jolie ». Une phrase en dur ici gèlerait précisément
 * ce que #4451 a déplacé côté serveur.
 */
const t: TranslateFunction = (cle, params) =>
  cle === 'titles.inConversation'
    ? `<${params?.sender ?? ''}|${params?.title ?? ''}>`
    : `<${cle}>`;

const conventions: ConventionsDuClient = {
  nomDeLActeur: (acteur) => {
    const nom = (acteur as { displayName?: unknown } | undefined)?.displayName;
    return typeof nom === 'string' ? nom : '';
  },
  apercuDeMessage: (contenu, piecesJointes) =>
    piecesJointes === undefined ? contenu : `[${piecesJointes.length}]${contenu}`,
  titreDeRepli: () => '<repli>',
};

const notification = (parts: Record<string, unknown>): Notification => parts as unknown as Notification;

const ALICE = { id: 'u9', displayName: 'Alice Martin' };

describe('le cadrage — le TYPE décide, jamais la forme des champs', () => {
  it.each([
    ['new_message', 'conversation'],
    ['message_reply', 'conversation'],
    ['user_mentioned', 'conversation'],
    ['message_reaction', 'conversation'],
    ['contact_request', 'relation'],
    ['contact_accepted', 'relation'],
    ['friend_request', 'relation'],
    ['friend_accepted', 'relation'],
    ['story_reaction', 'action'],
    ['post_like', 'action'],
    ['friend_new_story', 'action'],
    ['un_type_inconnu', 'action'],
  ])('range %s en %s', (type, attendu) => {
    expect(notificationBannerFraming(notification({ type }))).toBe(attendu);
  });

  it('range en action une charge dont le type n’est pas une chaîne', () => {
    expect(notificationBannerFraming(notification({ type: 42 }))).toBe('action');
    expect(notificationBannerFraming(notification({}))).toBe('action');
  });
});

describe('le titre', () => {
  it('rend le seul acteur pour un tête-à-tête', () => {
    const titre = buildNotificationHeadline(
      notification({
        type: 'new_message',
        actor: ALICE,
        context: { conversationType: 'direct', conversationTitle: 'Alice Martin' },
      }),
      t,
      conventions,
    );

    expect(titre).toBe('Alice Martin');
  });

  /**
   * SUR UN MESSAGE, `subtitle` PORTE LE NOM DU GROUPE — pas une phrase
   * d'action. Le concaténer écrirait « Alice Martin Les collègues ». C'est le
   * défaut exact que la lecture « si subtitle existe, c'est une action »
   * produirait, et la seule chose qui l'en sépare est le TYPE.
   */
  it('compose « X dans {groupe} » pour un groupe, sans jamais concaténer le sous-titre', () => {
    const titre = buildNotificationHeadline(
      notification({
        type: 'new_message',
        subtitle: 'Les collègues',
        actor: ALICE,
        context: { conversationType: 'group', conversationTitle: 'Les collègues' },
      }),
      t,
      conventions,
    );

    expect(titre).toBe('<Alice Martin|Les collègues>');
  });

  it('préfère le nom LOCAL du groupe à celui du fil — il n’existe que sur l’appareil', () => {
    const titre = buildNotificationHeadline(
      notification({
        type: 'new_message',
        actor: ALICE,
        context: { conversationType: 'group', conversationTitle: 'Les collègues' },
      }),
      t,
      conventions,
      'Équipe produit',
    );

    expect(titre).toBe('<Alice Martin|Équipe produit>');
  });

  it('rend l’acteur seul quand un groupe n’a AUCUN nom — il n’y a rien à composer', () => {
    const titre = buildNotificationHeadline(
      notification({ type: 'new_message', actor: ALICE, context: { conversationType: 'group' } }),
      t,
      conventions,
    );

    expect(titre).toBe('Alice Martin');
  });

  /**
   * DEUX CADRAGES COEXISTENT SUR `title`, et le discriminant est l'ÉGALITÉ avec
   * le nom de l'acteur : sur le fil TEMPS RÉEL, `title` EST l'acteur et
   * `subtitle` porte la phrase — le titre est leur SOMME ; en liste REST,
   * `title` est déjà la phrase entière, et y ajouter le sous-titre écrirait
   * « Alice a commenté votre réel Votre réel ».
   */
  it('somme l’acteur et la phrase d’action quand `title` EST l’acteur', () => {
    const titre = buildNotificationHeadline(
      notification({
        type: 'post_comment',
        title: 'Alice Martin',
        subtitle: 'a commenté votre réel',
        actor: ALICE,
      }),
      t,
      conventions,
    );

    expect(titre).toBe('Alice Martin a commenté votre réel');
  });

  it('ne rallonge pas un titre REST déjà entier', () => {
    const titre = buildNotificationHeadline(
      notification({
        type: 'post_comment',
        title: 'Alice Martin a commenté votre réel',
        subtitle: 'Votre réel',
        actor: ALICE,
      }),
      t,
      conventions,
    );

    expect(titre).toBe('Alice Martin a commenté votre réel');
  });

  it('somme sur l’ACTEUR quand la phrase existe sans titre du tout', () => {
    const titre = buildNotificationHeadline(
      notification({ type: 'post_comment', subtitle: 'a commenté votre réel', actor: ALICE }),
      t,
      conventions,
    );

    expect(titre).toBe('Alice Martin a commenté votre réel');
  });

  /**
   * NI TITRE RICHE NI PHRASE D'ACTION : lignes anciennes, ou type que le
   * builder serveur ne couvre pas. Le repli CLIENT reprend la main — c'est la
   * troisième convention, et la loi ne fabrique aucune phrase elle-même.
   */
  it('rend la main au repli du client quand le serveur n’a rien servi', () => {
    const titre = buildNotificationHeadline(
      notification({ type: 'post_comment', actor: ALICE }),
      t,
      conventions,
    );

    expect(titre).toBe('<repli>');
  });
});

describe('le corps', () => {
  it('sert l’extrait d’un message, par la convention du client', () => {
    const corps = buildNotificationBannerBody(
      notification({
        type: 'new_message',
        content: 'on se voit à 18 h ?',
        context: { conversationType: 'direct' },
      }),
      t,
      conventions,
    );

    expect(corps).toBe('on se voit à 18 h ?');
  });

  /**
   * LE CAS NOMINAL D'UNE PHOTO — un message SANS LÉGENDE. La garde retournait
   * `null` sur l'absence de TEXTE avant de regarder les pièces jointes : la
   * convention faite pour ce cas n'était jamais appelée. C'est l'absence des
   * DEUX qui fait un corps vide, jamais celle du texte seul.
   */
  it('demande au client de résumer les pièces jointes d’un message SANS LÉGENDE', () => {
    const corps = buildNotificationBannerBody(
      notification({
        type: 'new_message',
        content: '',
        metadata: { attachments: [{ mimeType: 'image/jpeg' }] },
      }),
      t,
      conventions,
    );

    expect(corps).toBe('[1]');
  });

  it('marque aussi les pièces jointes d’un message qui PORTE une légende', () => {
    const corps = buildNotificationBannerBody(
      notification({
        type: 'new_message',
        content: 'regarde',
        metadata: { attachments: [{ mimeType: 'image/jpeg' }, { mimeType: 'image/png' }] },
      }),
      t,
      conventions,
    );

    expect(corps).toBe('[2]regarde');
  });

  it('rend `null` quand un message n’a NI texte NI pièce jointe', () => {
    for (const charge of [
      { type: 'new_message', content: '' },
      { type: 'new_message', content: '   ' },
      { type: 'new_message', content: '', metadata: { attachments: [] } },
      { type: 'new_message', content: '', metadata: { attachments: 'pas un tableau' } },
      { type: 'new_message' },
    ]) {
      expect(buildNotificationBannerBody(notification(charge), t, conventions)).toBeNull();
    }
  });

  /** « Nouvelle demande de contact » sous « Alice veut se connecter » dit deux fois la même chose. */
  it.each(['contact_request', 'contact_accepted', 'friend_request', 'friend_accepted'])(
    'se tait sur une relation (%s), quoi que le serveur ait servi',
    (type) => {
      const corps = buildNotificationBannerBody(
        notification({ type, content: 'Nouvelle demande de contact', subtitle: 'veut se connecter' }),
        t,
        conventions,
      );

      expect(corps).toBeNull();
    },
  );

  it('sert l’extrait d’une action quand il diffère de la phrase déjà servie en titre', () => {
    const corps = buildNotificationBannerBody(
      notification({ type: 'post_comment', subtitle: 'a commenté votre réel', content: 'superbe !' }),
      t,
      conventions,
    );

    expect(corps).toBe('superbe !');
  });

  /**
   * Le serveur garantit une ligne de liste non vide : faute d'extrait, `content`
   * retombe sur la phrase d'action elle-même. Sur une bannière qui porte déjà
   * cette phrase en titre, la répéter est un doublon — d'où le résumé MÉDIA.
   */
  it.each([
    ['image', 'attachments.photo'],
    ['video', 'attachments.video'],
    ['audio', 'attachments.audio'],
    ['IMAGE', 'attachments.photo'],
  ])('remplace un doublon par le résumé du média (%s)', (genre, cle) => {
    const corps = buildNotificationBannerBody(
      notification({
        type: 'friend_new_post',
        subtitle: 'a publié',
        content: 'a publié',
        metadata: { mediaType: genre },
      }),
      t,
      conventions,
    );

    expect(corps).toBe(`<${cle}>`);
  });

  it('sert le résumé du média quand une action n’a AUCUN extrait', () => {
    const corps = buildNotificationBannerBody(
      notification({ type: 'friend_new_post', metadata: { mediaType: 'video' } }),
      t,
      conventions,
    );

    expect(corps).toBe('<attachments.video>');
  });

  it('rend `null` sur un genre de média que la loi n’interroge pas', () => {
    for (const metadata of [{ mediaType: 'sculpture' }, { mediaType: 42 }, {}, undefined, 'pas un objet']) {
      expect(
        buildNotificationBannerBody(
          notification({ type: 'friend_new_post', subtitle: 'a publié', content: 'a publié', metadata }),
          t,
          conventions,
        ),
      ).toBeNull();
    }
  });
});

describe('la pastille de réaction', () => {
  it.each(['message_reaction', 'post_like', 'story_reaction', 'status_reaction', 'comment_like', 'comment_reaction'])(
    'la rend sous ses DEUX noms de fil (%s)',
    (type) => {
      expect(
        buildNotificationReactionBadge(notification({ type, metadata: { emoji: '🔥' } }), 'a réagi'),
      ).toBe('🔥');
      expect(
        buildNotificationReactionBadge(notification({ type, metadata: { reactionEmoji: '❤️' } }), 'a réagi'),
      ).toBe('❤️');
    },
  );

  /**
   * Le serveur fusionne déjà l'émoji dans la phrase d'action (« a réagi 🔥 à
   * votre story ») : le rendre une seconde fois en pastille ferait dire deux
   * fois la même chose à deux endroits de la même carte.
   */
  it('se tait quand la phrase porte déjà l’émoji', () => {
    expect(
      buildNotificationReactionBadge(
        notification({ type: 'story_reaction', metadata: { emoji: '🔥' } }),
        'Alice a réagi 🔥 à votre story',
      ),
    ).toBeNull();
  });

  it('se tait sur un type qui n’est pas une réaction, émoji ou non', () => {
    expect(
      buildNotificationReactionBadge(notification({ type: 'new_message', metadata: { emoji: '🔥' } }), 'X'),
    ).toBeNull();
    expect(buildNotificationReactionBadge(notification({ type: 42 }), 'X')).toBeNull();
  });

  it('se tait sur une réaction SANS émoji servi', () => {
    for (const metadata of [{}, { emoji: '' }, { emoji: 7 }, undefined]) {
      expect(buildNotificationReactionBadge(notification({ type: 'post_like', metadata }), 'X')).toBeNull();
    }
  });
});

describe('la vignette', () => {
  it('préfère celle du contenu visé', () => {
    expect(
      buildNotificationThumbnail(
        notification({
          metadata: { postThumbnailUrl: 'https://cdn/post.jpg' },
          context: { firstAttachmentMimeType: 'image/jpeg', firstAttachmentUrl: 'https://cdn/piece.jpg' },
        }),
      ),
    ).toBe('https://cdn/post.jpg');
  });

  it('retombe sur la photo de la première pièce jointe d’un message', () => {
    expect(
      buildNotificationThumbnail(
        notification({ context: { firstAttachmentMimeType: 'image/png', firstAttachmentUrl: 'https://cdn/p.png' } }),
      ),
    ).toBe('https://cdn/p.png');
  });

  /**
   * ELLE EST ABSENTE DU FIL quand le message est protégé (éphémère / vue unique
   * / flouté / chiffré) — la passerelle la retient EN BLOC. Rien à re-garder
   * ici, rien à fabriquer depuis une autre source non plus.
   */
  it('ne fabrique RIEN quand la passerelle n’a pas servi l’URL', () => {
    expect(
      buildNotificationThumbnail(notification({ context: { firstAttachmentMimeType: 'image/jpeg' } })),
    ).toBeNull();
  });

  it('ne rend une pièce jointe que si elle est une IMAGE', () => {
    for (const mime of ['video/mp4', 'application/pdf', 'audio/mpeg', 42, undefined]) {
      expect(
        buildNotificationThumbnail(
          notification({ context: { firstAttachmentMimeType: mime, firstAttachmentUrl: 'https://cdn/x' } }),
        ),
      ).toBeNull();
    }
  });

  it('rend `null` sur une charge sans contexte ni métadonnées', () => {
    expect(buildNotificationThumbnail(notification({}))).toBeNull();
  });
});

describe('la bannière entière — les quatre champs d’une seule descente', () => {
  it('compose le titre, le corps, la pastille et la vignette ensemble', () => {
    const banniere = buildNotificationBanner(
      notification({
        type: 'story_reaction',
        title: 'Alice Martin',
        subtitle: 'a réagi à votre story',
        content: 'super !',
        actor: ALICE,
        metadata: { emoji: '❤️', postThumbnailUrl: 'https://cdn/s.jpg' },
      }),
      t,
      conventions,
    );

    expect(banniere).toEqual({
      headline: 'Alice Martin a réagi à votre story',
      body: 'super !',
      reactionBadge: '❤️',
      thumbnailUrl: 'https://cdn/s.jpg',
    });
  });

  /**
   * LA PASTILLE EST JUGÉE CONTRE LE TITRE QUE CETTE DESCENTE VIENT DE COMPOSER,
   * jamais contre un titre calculé à part : deux descentes parallèles
   * rendraient la pastille sur une phrase qui la porte déjà.
   */
  it('juge la pastille contre le titre qu’elle vient elle-même de composer', () => {
    const banniere = buildNotificationBanner(
      notification({
        type: 'story_reaction',
        title: 'Alice Martin',
        subtitle: 'a réagi 🔥 à votre story',
        actor: ALICE,
        metadata: { emoji: '🔥' },
      }),
      t,
      conventions,
    );

    expect(banniere.headline).toContain('🔥');
    expect(banniere.reactionBadge).toBeNull();
  });

  it('passe le nom LOCAL du groupe jusqu’au titre', () => {
    const banniere = buildNotificationBanner(
      notification({
        type: 'new_message',
        actor: ALICE,
        content: 'je suis en route',
        context: { conversationType: 'group', conversationTitle: 'Les collègues' },
      }),
      t,
      conventions,
      { groupName: 'Équipe produit' },
    );

    expect(banniere.headline).toBe('<Alice Martin|Équipe produit>');
    expect(banniere.body).toBe('je suis en route');
  });

  it('ne rougit sur AUCUNE charge illisible — elle vient du réseau', () => {
    const banniere = buildNotificationBanner(
      notification({ type: 42, title: [], subtitle: null, content: 7, actor: 'pas un objet', metadata: [], context: null }),
      t,
      conventions,
    );

    expect(banniere).toEqual({
      headline: '<repli>',
      body: null,
      reactionBadge: null,
      thumbnailUrl: null,
    });
  });
});
