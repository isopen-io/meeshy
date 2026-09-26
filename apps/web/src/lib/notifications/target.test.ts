import { describe, expect, test } from 'bun:test';

import type { NotificationRecord } from './record';
import { notificationTarget, pushTapTarget, resolveTarget } from './target';

/**
 * OÙ MÈNE UNE NOTIFICATION (#6288) — miroir de `NotificationContentRouter`
 * (`apps/ios/Meeshy/Features/Main/Navigation/NotificationContentRouter.swift`).
 *
 * La règle d'iOS tient en une phrase, et c'est elle que ces témoins gardent :
 * **le TYPE n'est pas un discriminant d'entité.** `story_thread_reply` est émis
 * pour un commentaire sur N'IMPORTE quel contenu — seul `metadata.postType`
 * (ou `contentType`) dit la vérité. Router sur le type seul ouvrait le lecteur
 * de story sur un réel commenté.
 *
 * Une destination que le web n'a pas encore rend `null` — la ligne se marque
 * lue sans prétendre ouvrir quoi que ce soit (loi 4).
 */

const record = (partial: Partial<NotificationRecord>): NotificationRecord => ({
  id: 'n1',
  type: 'new_message',
  title: null,
  content: '',
  actor: null,
  context: {},
  metadata: {},
  state: { isRead: false, createdAt: '2026-09-13T08:00:00.000Z' },
  ...partial,
});

describe('les contenus sociaux ouvrent l’entité que la métadonnée NOMME', () => {
  test('un commentaire de publication ouvre le détail de la publication', () => {
    expect(notificationTarget(record({ type: 'post_comment', context: { postId: 'p1' }, metadata: { postType: 'POST' } }))).toEqual({
      route: 'post',
      params: { post: 'p1' },
    });
  });

  test('`story_thread_reply` sur un RÉEL ouvre la publication, pas le lecteur de story', () => {
    expect(
      notificationTarget(record({ type: 'story_thread_reply', context: { postId: 'r1' }, metadata: { postType: 'REEL' } })),
    ).toEqual({ route: 'post', params: { post: 'r1' } });
  });

  test('une story, un statut ou une humeur ouvrent le lecteur plein écran', () => {
    for (const postType of ['STORY', 'STATUS', 'MOOD']) {
      expect(notificationTarget(record({ type: 'post_like', context: { postId: 's1' }, metadata: { postType } }))).toEqual({
        route: 'story',
        params: { post: 's1' },
      });
    }
  });

  test('la famille `friend_new_*` se discrimine par `contentType`', () => {
    expect(
      notificationTarget(record({ type: 'friend_new_post', context: { postId: 's2' }, metadata: { contentType: 'STORY' } })),
    ).toEqual({ route: 'story', params: { post: 's2' } });
  });

  test('sans discriminant, un type éphémère PAR CONSTRUCTION ouvre la story, tout autre la publication', () => {
    expect(notificationTarget(record({ type: 'story_reaction', context: { postId: 's3' } }))).toEqual({
      route: 'story',
      params: { post: 's3' },
    });
    expect(notificationTarget(record({ type: 'post_like', context: { postId: 'p4' } }))).toEqual({
      route: 'post',
      params: { post: 'p4' },
    });
  });
});

describe('les autres familles', () => {
  test('un message, une mention ou une réaction à un message ouvrent la conversation', () => {
    for (const type of ['new_message', 'user_mentioned', 'message_reaction', 'member_joined']) {
      expect(notificationTarget(record({ type, context: { conversationId: 'c-deploiement' } }))).toEqual({
        route: 'thread',
        params: { conversation: 'c-deploiement' },
      });
    }
  });

  test('un badge, une série ou un niveau ouvrent la progression', () => {
    for (const type of ['achievement_unlocked', 'badge_earned', 'streak_milestone', 'level_up']) {
      expect(notificationTarget(record({ type }))).toEqual({ route: 'progression' });
    }
  });

  test('une alerte de sécurité ouvre les réglages', () => {
    expect(notificationTarget(record({ type: 'login_new_device' }))).toEqual({ route: 'settings' });
  });

  /* Ce témoin disait « ne mène NULLE PART tant que le web n’a pas d’écran de
     contacts » — une exemption dont la CONDITION est devenue fausse : #6363 a
     livré `/discover` et son onglet « Demandes », qui porte les boutons
     Accepter et Refuser. Sans cette destination, apprendre qu’on a reçu une
     demande et pouvoir y répondre étaient deux écrans sans chemin entre eux
     (#7173). */
  test('une demande de contact ouvre l’onglet « Demandes » de la découverte, filtre « Reçues »', () => {
    for (const type of ['friend_request', 'contact_request']) {
      expect(notificationTarget(record({ type, context: { friendRequestId: 'fr1' } }))).toEqual({
        route: 'discover',
        search: { onglet: 'requests', demandes: 'received' },
      });
    }
  });

  test('une demande ACCEPTÉE ouvre le fil, pas la découverte — on peut désormais écrire', () => {
    expect(notificationTarget(record({ type: 'friend_accepted', context: { conversationId: 'c-neuve' } }))).toEqual({
      route: 'thread',
      params: { conversation: 'c-neuve' },
    });
  });

  test('un type sans destination rend toujours null — la table ne se remplit pas en silence', () => {
    expect(notificationTarget(record({ type: 'un_type_sans_ecran' }))).toBeNull();
  });
});

/**
 * LE NOYAU PUR, ET LA DESTINATION D'UN TAP DE BANNIÈRE (#7305).
 *
 * `notificationTarget()` lit une LIGNE de la cloche ; la charge d'un push
 * porte les MÊMES clés, mais en chaînes plates dont `''` vaut absence
 * (`NotificationService`, carte `data`). Le lot extrait donc le noyau plutôt
 * que d'écrire une seconde table — c'est exactement le défaut que portait
 * `firebase-messaging-sw.js`, dérivé sur trois routes sur trois.
 *
 * **Deux sorties, une seule loi.** La cloche rend `null` quand le web n'a pas
 * la destination (loi 4 : un contrôle qui ment est pire qu'un contrôle
 * absent). Un TAP, lui, doit toujours atterrir : `pushTapTarget()` replie sur
 * `notifications`. La divergence est délibérée, et c'est la SEULE.
 */
describe('resolveTarget — le noyau que la charge du push consomme', () => {
  test('une chaîne VIDE vaut absence, jamais un identifiant', () => {
    expect(resolveTarget({ type: 'un_type_sans_ecran', conversationId: '', postId: '', friendRequestId: '', route: '' })).toBeNull();
  });

  test('la conversation ouvre le fil', () => {
    expect(resolveTarget({ type: 'new_message', conversationId: 'abc' })).toEqual({
      route: 'thread',
      params: { conversation: 'abc' },
    });
  });

  test('`postType` décide de la surface, le type ne décide de rien', () => {
    expect(resolveTarget({ type: 'story_thread_reply', postId: 'p1', postType: 'REEL' })).toEqual({
      route: 'post',
      params: { post: 'p1' },
    });
    expect(resolveTarget({ type: 'story_thread_reply', postId: 'p1', postType: 'STORY' })).toEqual({
      route: 'story',
      params: { post: 'p1' },
    });
  });

  test('`contentType` sert de repli au discriminant, comme pour la cloche', () => {
    expect(resolveTarget({ type: 'friend_new_story', postId: 'p1', contentType: 'MOOD' })).toEqual({
      route: 'story',
      params: { post: 'p1' },
    });
  });

  /* Le web n'a AUCUNE route de demandes d'ami : elles vivent dans l'onglet
     « Demandes » de `/discover`. La cloche y allait déjà PAR LE TYPE ; un push
     porte l'identifiant, et une famille de types qui s'élargit côté serveur ne
     doit pas faire retomber le tap dans le repli. */
  test('un `friendRequestId` ouvre la découverte, même sur un type que la table ne connaît pas', () => {
    expect(resolveTarget({ type: 'un_type_de_demande_inconnu', friendRequestId: 'fr1' })).toEqual({
      route: 'discover',
      search: { onglet: 'requests', demandes: 'received' },
    });
  });

  /* L'indice de route est posé par la passerelle pour les notifications de
     réengagement, qui ne portent NI conversation NI contenu social — son
     commentaire le dit. Il prime donc sur toute DÉDUCTION par type, et cède
     devant une entité, qui est le contenu lui-même. */
  test('l’indice `route` du serveur prime sur la déduction par type', () => {
    expect(resolveTarget({ type: 'login_new_device', route: 'progression' })).toEqual({ route: 'progression' });
  });

  test('une entité prime sur l’indice `route` — le serveur ne le pose que faute d’entité', () => {
    expect(resolveTarget({ type: 'new_message', conversationId: 'abc', route: 'progression' })).toEqual({
      route: 'thread',
      params: { conversation: 'abc' },
    });
  });

  test('un indice de route INCONNU ne fabrique pas d’adresse', () => {
    expect(resolveTarget({ type: 'un_type_sans_ecran', route: '/mood' })).toBeNull();
  });
});

describe('pushTapTarget — un tap atterrit toujours', () => {
  test('sans destination, le tap ouvre la liste des notifications', () => {
    expect(pushTapTarget({ type: 'un_type_sans_ecran' })).toEqual({ route: 'notifications' });
  });

  test('avec destination, c’est la même que celle de la cloche', () => {
    expect(pushTapTarget({ type: 'new_message', conversationId: 'abc' })).toEqual({
      route: 'thread',
      params: { conversation: 'abc' },
    });
  });
});

/**
 * « X A REJOINT MEESHY » (#8105) — la notification annonce une PERSONNE, et
 * c'est son profil qui s'ouvre : on y trouve « Se connecter » et « Écrire ».
 * L'acteur est l'arrivant ; son pseudonyme compose l'adresse `/u/$username`,
 * sur la cloche (`actor.username`) comme au tap d'un push (`senderUsername`,
 * la clé que la passerelle pose sur la carte `data`).
 */
describe('contact_joined ouvre le profil de l’arrivant', () => {
  const arrivant = { id: 'u-awa', username: 'awa', displayName: 'Maman', avatar: null };

  test('la cloche ouvre `/u/<pseudo>` de l’acteur', () => {
    expect(notificationTarget(record({ type: 'contact_joined', actor: arrivant }))).toEqual({
      route: 'userProfile',
      params: { username: 'awa' },
    });
  });

  test('le tap d’une bannière suit le pseudonyme porté par la charge', () => {
    expect(pushTapTarget({ type: 'contact_joined', senderUsername: 'awa' })).toEqual({
      route: 'userProfile',
      params: { username: 'awa' },
    });
  });

  test('sans pseudonyme, aucune adresse n’est inventée : le tap retombe sur la liste', () => {
    expect(pushTapTarget({ type: 'contact_joined' })).toEqual({ route: 'notifications' });
    expect(notificationTarget(record({ type: 'contact_joined' }))).toBeNull();
  });

  test('le pseudonyme d’un AUTRE type n’ouvre pas de profil — seul contact_joined annonce une personne', () => {
    expect(pushTapTarget({ type: 'post_like', senderUsername: 'awa' })).toEqual({ route: 'notifications' });
  });
});
