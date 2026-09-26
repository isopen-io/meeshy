import { describe, expect, test } from 'bun:test';
import { REPRODUCED_PUSH_FIELD, REPRODUCED_PUSH_VALUE } from '@meeshy/shared/types/reproduced-notification-push';

import type { DeliveryReceiptCredential } from './delivery-receipt-credential';
import { banner, CODE, mount, push, windowClient, type WorkerHarness } from '@/test-support/sw-push-harness';

/**
 * LE SERVICE WORKER QUI REÇOIT LE PUSH (#7305).
 *
 * `public/sw-push.js` est un script CLASSIQUE, chargé par `importScripts` en
 * tête du worker généré (`SERVICE_WORKER_SCRIPTS`, `vite.config.ts`). Il ne
 * peut donc rien importer de `src/` — ni `resolveTarget`, ni `href`, ni les
 * constantes de `lib/discover/view`. Sa table de destinations vit en DOUBLE,
 * et c'est `scripts/check-push-target-parity.mjs` qui interdit la dérive,
 * pas la discipline : `firebase-messaging-sw.js` s'était donné la bonne règle
 * en commentaire et avait quand même dérivé sur trois routes sur trois.
 *
 * Ce témoin, lui, mesure le COMPORTEMENT : il monte le script dans un `self`
 * bouchonné, capture ses écouteurs, et les fait décider.
 *
 * **Ce qu'il garde surtout, ce sont les deux règles négatives** — D-11 (jamais
 * deux bannières pour un même événement) et le cycle 125 (une protection de
 * contenu se mesure sur tout ce que la charge TRANSPORTE, pas sur sa seule
 * chaîne). Le worker AFFICHE ce que le serveur a composé ; il ne re-résout
 * aucun Prisme et ne rend aucune URL venue de la charge.
 */


describe('le worker n’affiche une bannière que si personne ne regarde (D-11)', () => {
  test('aucun client ouvert : la bannière système s’affiche', async () => {
    const worker = mount();
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown.map((n) => [n.title, n.options['body']])).toEqual([['Awa', 'Bonjour']]);
  });

  test('un onglet VISIBLE : aucune bannière système — le socket porte la bannière in-app', async () => {
    const worker = mount({ clients: [windowClient('visible')] });
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown).toEqual([]);
  });

  test('un onglet ouvert mais CACHÉ ne retient rien — personne ne voit la bannière in-app', async () => {
    const worker = mount({ clients: [windowClient('hidden')] });
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown.length).toBe(1);
  });

  test('la même notification déjà affichée n’est pas affichée deux fois', async () => {
    const worker = mount({ already: [{ notificationId: 'n1' }] });
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown).toEqual([]);
  });

  test('une AUTRE notification passe — le dédoublonnage ne bâillonne pas le fil', async () => {
    const worker = mount({ already: [{ notificationId: 'n0' }] });
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown.length).toBe(1);
  });

});

/**
 * LE SON COUPÉ ET L'EMPILEMENT CHOISIS PAR LE LECTEUR (#7308).
 *
 * La passerelle les calcule au chokepoint des préférences et les pose dans
 * `webpush.notification` : `silent` pour `soundEnabled:false`, `tag` pour
 * l'empilement par conversation — et PAS de `tag` quand le lecteur a choisi
 * `groupNotifications:false`. Un worker qui ne les lit pas les rend inertes :
 * le serveur aurait corrigé personne.
 */
const composed = (notification: Record<string, unknown>, data: Record<string, unknown>) => ({
  notification: { title: 'Awa', body: 'Bonjour', ...notification },
  data,
});

describe('le son coupé et l’empilement choisis par le lecteur valent aussi sur le web (#7308)', () => {
  test('le son coupé coupe le son de la bannière — elle reste affichée', async () => {
    const worker = mount();
    await worker.dispatch('push', push(composed({ silent: true }, { notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown.map((n) => [n.title, n.options['silent']])).toEqual([['Awa', true]]);
  });

  test('sans son coupé, la bannière sonne', async () => {
    const worker = mount();
    await worker.dispatch('push', push(composed({}, { notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown[0]?.options['silent']).not.toBe(true);
  });

  test('le tag du SERVEUR regroupe les bannières d’une conversation', async () => {
    const worker = mount();
    await worker.dispatch('push', push(composed({ tag: 'conv-42' }, { notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown[0]?.options['tag']).toBe('conv-42');
  });

  /* `groupNotifications:false` : la passerelle retire le tag. Se rabattre sur
     `conversationId` empilerait quand même — le réglage resterait ignoré. */
  test('sans tag du serveur, chaque bannière garde la sienne — même dans une conversation', async () => {
    const worker = mount();
    await worker.dispatch('push', push(composed({}, { notificationId: 'n1', conversationId: 'abc' })));
    await worker.dispatch('push', push(composed({}, { notificationId: 'n2', conversationId: 'abc' })));
    expect(worker.shown.map((n) => n.options['tag'])).toEqual(['n1', 'n2']);
  });

  /* Une bannière qui REMPLACE une autre de même tag n'alerte qu'avec
     `renotify` (« show steps »). Sans lui, chaque message après le premier
     d'une conversation arriverait sans son ni annonce. */
  test('une bannière qui en remplace une autre de même tag alerte encore', async () => {
    const worker = mount();
    await worker.dispatch('push', push(composed({ tag: 'conv-42' }, { notificationId: 'n1', conversationId: 'abc' })));
    expect(worker.shown[0]?.options['renotify']).toBe(true);
  });

  /* Muette ne veut pas dire cachée : `silent` retire le son et la vibration,
     `renotify` garde l'annonce. La paire est licite — seuls `silent`+`vibrate`
     et `renotify` sans tag lèvent un TypeError. */
  test('une bannière muette qui en remplace une autre est annoncée, sans son', async () => {
    const worker = mount();
    await worker.dispatch('push', push(composed({ tag: 'conv-42', silent: true }, { notificationId: 'n1' })));
    expect({ renotify: worker.shown[0]?.options['renotify'], silent: worker.shown[0]?.options['silent'] }).toEqual({
      renotify: true,
      silent: true,
    });
  });

  /* Un identifiant PAR charge : la barre du bouchon dédoublonne comme celle du
     navigateur (D-11 point 4), et douze charges au même identifiant n'en
     montreraient qu'une partie — ce témoin mesure le refus du navigateur,
     pas le dédoublonnage. */
  test('aucune combinaison de la charge ne fait refuser la bannière par le navigateur', async () => {
    const cases = [true, false].flatMap((silent) =>
      [undefined, '', 'conv-42'].flatMap((tag) =>
        [false, true].map((identified) => ({ silent, tag, identified })),
      ),
    );
    const worker = mount();
    for (const [index, { silent, tag, identified }] of cases.entries()) {
      const notificationId = identified ? `n${index}` : undefined;
      await worker.dispatch(
        'push',
        push(composed({ ...(silent ? { silent } : {}), ...(tag === undefined ? {} : { tag }) }, notificationId ? { notificationId } : {})),
      );
    }
    expect(worker.shown.length).toBe(cases.length);
    expect(worker.shown.filter((n) => 'vibrate' in n.options)).toEqual([]);
  });
});

/**
 * UNE NOTIFICATION ÉDITÉE REMPLACE LA BANNIÈRE DÉJÀ AFFICHÉE (#7342).
 *
 * Éditer un message, un post ou un commentaire REPRODUIT chaque notification
 * qui en portait le texte, sous la MÊME identité. iOS et Android reçoivent
 * d'abord un push de révocation ; le web non (#7308). Le dédoublonnage D-11
 * point 4 écartait donc la version d'après — la bannière d'avant était encore
 * là — et le lecteur web gardait le texte que l'auteur venait de corriger.
 *
 * La passerelle DÉCLARE la reproduction (`REPRODUCED_PUSH_FIELD`) : le worker
 * ne devine pas qu'il corrige. Il ne compare le texte que pour ne pas
 * re-sonner une bannière qui dit déjà le texte d'après.
 */
const firstBanner = (notification: Record<string, unknown> = {}) =>
  composed({ tag: 'abc', ...notification }, { notificationId: 'n1', conversationId: 'abc' });

const reproduction = (body: string, notification: Record<string, unknown> = {}) =>
  composed(
    { tag: 'abc', body, ...notification },
    { notificationId: 'n1', conversationId: 'abc', [REPRODUCED_PUSH_FIELD]: REPRODUCED_PUSH_VALUE },
  );

const visible = (worker: WorkerHarness) => worker.tray.map((banner) => [banner.data['notificationId'], banner.body]);

describe('une notification éditée remplace la bannière déjà affichée (#7342)', () => {
  test('la bannière encore affichée porte désormais le texte d’APRÈS', async () => {
    const worker = mount();
    await worker.dispatch('push', push(firstBanner()));
    await worker.dispatch('push', push(reproduction('Bonsoir')));
    expect(worker.tray.map((banner) => ({ title: banner.title, body: banner.body, data: banner.data }))).toEqual([
      { title: 'Awa', body: 'Bonsoir', data: { notificationId: 'n1', conversationId: 'abc' } },
    ]);
  });

  /* Le lecteur a changé `groupNotifications` entre les deux pushes : la
     bannière d'avant a l'identifiant pour tag, la correction arrive avec celui
     de la conversation. Sous le tag NEUF, l'ancienne resterait à côté — deux
     bannières pour une seule notification (D-11). */
  test('le remplacement se fait EN PLACE, sous le tag de la bannière affichée', async () => {
    const worker = mount();
    await worker.dispatch('push', push(composed({}, { notificationId: 'n1', conversationId: 'abc' })));
    await worker.dispatch('push', push(reproduction('Bonsoir')));
    expect(visible(worker)).toEqual([['n1', 'Bonsoir']]);
  });

  /* Le cas piège : depuis #7340, un message plus récent de la même
     conversation a REMPLACÉ la bannière (même tag). Corriger le plus ancien
     ne doit pas le faire remonter par-dessus : la bannière visible n'est plus
     la sienne, et le lecteur perdrait le message qu'il n'a pas encore lu. */
  test('une bannière déjà remplacée par un message plus récent ne remonte pas', async () => {
    const worker = mount();
    await worker.dispatch('push', push(firstBanner()));
    await worker.dispatch('push', push(composed({ tag: 'abc', body: 'Tu viens ?' }, { notificationId: 'n2', conversationId: 'abc' })));
    await worker.dispatch('push', push(reproduction('Bonsoir')));
    expect(visible(worker)).toEqual([['n2', 'Tu viens ?']]);
  });

  /* Une correction n'est pas un événement neuf : elle met à jour une bannière,
     elle n'en lève pas. Fermée par le lecteur, ou jamais montrée parce qu'il
     lisait l'application (D-11 point 1), la notification ne revient pas. */
  test('une bannière que le lecteur a fermée ne revient pas pour une correction', async () => {
    const worker = mount();
    await worker.dispatch('push', push(firstBanner()));
    worker.tray[0]?.close();
    await worker.dispatch('push', push(reproduction('Bonsoir')));
    expect(worker.tray).toEqual([]);
  });

  /* D-11 point 4, côté correction : une bannière qui dit DÉJÀ le texte
     d'après — reproduction livrée deux fois, édition qui ne touche pas le
     texte notifié — n'est ni re-montrée ni re-sonnée. */
  test('une correction au texte identique ne re-montre ni ne re-sonne rien', async () => {
    const worker = mount();
    await worker.dispatch('push', push(firstBanner()));
    await worker.dispatch('push', push(reproduction('Bonjour')));
    expect(worker.shown.length).toBe(1);
  });

  /* iOS : la révocation retire la bannière d'avant, puis le push nominal —
     du CONTENU, soumis aux préférences comme un contenu neuf — sonne, sauf si
     le lecteur a coupé le son. Le web s'aligne : la correction s'annonce
     (`renotify`), muette quand le son est coupé. */
  test('la correction s’annonce comme sur iOS — dans le son choisi par le lecteur', async () => {
    const announced = async (notification: Record<string, unknown>) => {
      const worker = mount();
      await worker.dispatch('push', push(firstBanner(notification)));
      await worker.dispatch('push', push(reproduction('Bonsoir', notification)));
      return { renotify: worker.shown[1]?.options['renotify'], silent: worker.shown[1]?.options['silent'] === true };
    };
    expect([await announced({}), await announced({ silent: true })]).toEqual([
      { renotify: true, silent: false },
      { renotify: true, silent: true },
    ]);
  });
});

describe('le worker AFFICHE ce que le serveur a composé — il ne re-résout rien', () => {
  test('une charge sans titre ni corps n’affiche rien plutôt qu’un libellé inventé', async () => {
    const worker = mount();
    await worker.dispatch('push', push({ data: { notificationId: 'n1', conversationId: 'abc' } }));
    expect(worker.shown).toEqual([]);
  });

  /* Le corps est descendu dans le Prisme du LECTEUR côté serveur
     (`NotificationService.servedBannerBody`). `translatedContent`, `content`,
     `originalLanguage` et `encryptedContent` sont des champs de SERVICE
     destinés à l'extension iOS : une seconde descente servirait, pour un même
     message, un texte différent de celui qu'iOS montre. */
  test('aucun champ de service du Prisme n’est lu par le worker', () => {
    for (const forbidden of ['translatedContent', 'translatedLanguage', 'originalLanguage', 'encryptedContent']) {
      expect({ forbidden, present: CODE.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });

  /* Cycle 125 — une protection de contenu se mesure sur tout ce que la charge
     TRANSPORTE. `notificationLocKey` DÉCLARE un contenu protégé (éphémère,
     vue unique, flouté, chiffré). Le worker ne rend AUCUNE URL venue de la
     charge : ni pièce jointe, ni avatar — l'icône est un actif statique de
     l'application. Une photo à vue unique sur un écran verrouillé est le
     défaut exact que ce dépôt a corrigé au prix fort. */
  test('la bannière ne rend aucune URL venue de la charge', async () => {
    const worker = mount();
    await worker.dispatch(
      'push',
      push({
        notification: { title: 'Awa', body: '👁️ 🖼️' },
        data: {
          notificationId: 'n1',
          conversationId: 'abc',
          notificationLocKey: 'notification.viewOnce',
          attachmentUrl: 'https://gate.meeshy.me/secret.png',
          senderAvatar: 'https://gate.meeshy.me/avatar.png',
          imageURL: 'https://gate.meeshy.me/avatar.png',
        },
      }),
    );
    const rendu = JSON.stringify(worker.shown[0]?.options ?? {});
    expect({ secret: rendu.includes('secret.png'), avatar: rendu.includes('avatar.png') }).toEqual({
      secret: false,
      avatar: false,
    });
  });

  test('la bannière ne garde de la charge que ce qui ROUTE le tap', async () => {
    const worker = mount();
    await worker.dispatch(
      'push',
      push({
        notification: { title: 'Awa', body: 'Bonjour' },
        data: { notificationId: 'n1', conversationId: 'abc', attachmentUrl: 'https://gate.meeshy.me/secret.png', senderDisplayName: 'Awa' },
      }),
    );
    expect(worker.shown[0]?.options['data']).toEqual({ notificationId: 'n1', conversationId: 'abc' });
  });

  test('`unreadCount` pose le badge de l’application', async () => {
    const worker = mount({ clients: [windowClient('visible')] });
    await worker.dispatch('push', push(banner({ notificationId: 'n1', conversationId: 'abc', unreadCount: '7' })));
    expect(worker.badges).toEqual([7]);
  });

  test('un `unreadCount` absent ou illisible ne pose aucun badge', async () => {
    const worker = mount();
    await worker.dispatch('push', push(banner({ notificationId: 'n1', unreadCount: 'beaucoup' })));
    await worker.dispatch('push', push(banner({ notificationId: 'n2' })));
    expect(worker.badges).toEqual([]);
  });
});

/**
 * UN PUSH REÇU PAR LE SW ACCUSE SA REMISE (#7368, W4) — critère de fin :
 * « onglet fermé, PWA suspendue … ⇒ envoyé jusqu'à reconnexion » ne doit
 * plus tenir. Jumeau web de `NSEDataSync.postDeliveryReceipt`
 * (`NSEDataSync.swift:453-466`), appelé SANS condition par
 * `NotificationService.didReceive` (`NotificationService.swift:65`) — même
 * discipline ici : `mount({ credential })` sème le double IndexedDB
 * EXACTEMENT comme la page l'aurait écrit (`delivery-receipt-credential.ts`),
 * preuve que les deux moitiés du jumeau ne divergent pas.
 */
describe('un push reçu par le SW accuse sa remise (#7368, W4)', () => {
  const registered: DeliveryReceiptCredential = {
    apiBase: 'https://gate.meeshy.me',
    credential: { kind: 'registered', token: 'jwt-abc' },
  };
  const eligible = (extra: Record<string, unknown> = {}) =>
    banner({ notificationId: 'n1', conversationId: 'conv-1', messageId: 'msg-1', type: 'new_message', ...extra });

  test('un message ARRIVÉ, crédential posé ⇒ un accusé part vers la route canonique', async () => {
    const worker = mount({ credential: registered });
    await worker.dispatch('push', push(eligible()));
    expect(worker.deliveries).toEqual([
      {
        url: 'https://gate.meeshy.me/api/v1/conversations/conv-1/receipts',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-abc' },
          body: JSON.stringify({ type: 'delivered', messageIds: ['msg-1'] }),
          keepalive: true,
        },
      },
    ]);
  });

  test('un invité de lien présente `X-Session-Token`, jamais `Authorization` — présenter un jeton d’invité en Bearer refuse (http.ts § Credential)', async () => {
    const guest: DeliveryReceiptCredential = {
      apiBase: 'https://gate.meeshy.me',
      credential: { kind: 'anonymous', sessionToken: 'anon_xyz' },
    };
    const worker = mount({ credential: guest });
    await worker.dispatch('push', push(eligible()));
    expect(worker.deliveries[0]?.init['headers']).toEqual({
      'Content-Type': 'application/json',
      'X-Session-Token': 'anon_xyz',
    });
  });

  test('aucun crédential posé par la page ⇒ aucun accusé — jamais une requête sans authentification', async () => {
    const worker = mount();
    await worker.dispatch('push', push(eligible()));
    expect(worker.deliveries).toEqual([]);
  });

  /* JUMEAU de `NotificationPayloadHelpers.messageArrivalTypes` — une réaction
     porte le `messageId` du message RÉAGI, pas remis. */
  test('une réaction porte le messageId du message réagi — elle n’est pas une remise', async () => {
    const worker = mount({ credential: registered });
    await worker.dispatch('push', push(eligible({ type: 'message_reaction' })));
    expect(worker.deliveries).toEqual([]);
  });

  test('un événement social (« j’aime », commentaire) ne déclenche aucun accusé', async () => {
    const worker = mount({ credential: registered });
    await worker.dispatch('push', push(eligible({ type: 'post_like' })));
    expect(worker.deliveries).toEqual([]);
  });

  test('sans conversationId ou sans messageId, aucun accusé — rien à cibler', async () => {
    const worker = mount({ credential: registered });
    await worker.dispatch('push', push(banner({ notificationId: 'n1', type: 'new_message', messageId: 'msg-1' })));
    await worker.dispatch('push', push(banner({ notificationId: 'n2', type: 'new_message', conversationId: 'conv-1' })));
    expect(worker.deliveries).toEqual([]);
  });

  /* D-11 point 1 supprime la BANNIÈRE système quand un onglet regarde déjà —
     l'accusé, lui, n'a rien à voir avec ce que le lecteur VOIT. */
  test('un onglet VISIBLE reçoit quand même l’accusé — seule la bannière système est supprimée (D-11)', async () => {
    const worker = mount({ credential: registered, clients: [windowClient('visible')] });
    await worker.dispatch('push', push(eligible()));
    expect({ shown: worker.shown, delivered: worker.deliveries.length }).toEqual({ shown: [], delivered: 1 });
  });

  test('un échec réseau de l’accusé n’empêche pas la bannière — best-effort, comportement PRÉCÉDENT conservé', async () => {
    const worker = mount({ credential: registered, fetchFails: true });
    await worker.dispatch('push', push(eligible()));
    expect(worker.shown.length).toBe(1);
  });

  /* Une conversation NEUVE annonce aussi l'arrivée d'un premier message —
     miroir exact de `deliveryReceiptTypes` (`messageArrivalTypes` UNION). */
  test('une conversation neuve accuse aussi son premier message', async () => {
    const worker = mount({ credential: registered });
    await worker.dispatch('push', push(eligible({ type: 'new_conversation_direct' })));
    expect(worker.deliveries.length).toBe(1);
  });
});

describe('le tap atterrit à l’adresse de la v2, jamais à celle du legacy', () => {
  const clic = (data: Record<string, unknown>) => {
    const closed: boolean[] = [];
    return {
      closed,
      event: { notification: { data, close: () => closed.push(true) } },
    };
  };

  test('une conversation ouvre `/c/<id>` — l’adresse du legacy `/conversations/<id>` n’existe plus', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', clic({ notificationId: 'n1', conversationId: 'abc' }).event);
    expect(worker.opened).toEqual(['/c/abc']);
  });

  test('la bannière se ferme au tap', async () => {
    const worker = mount();
    const { closed, event } = clic({ notificationId: 'n1', conversationId: 'abc' });
    await worker.dispatch('notificationclick', event);
    expect(closed).toEqual([true]);
  });

  test('un client déjà ouvert est FOCALISÉ et reçoit l’adresse, plutôt qu’un second onglet', async () => {
    const ouvert = windowClient('hidden');
    const worker = mount({ clients: [ouvert] });
    await worker.dispatch('notificationclick', clic({ notificationId: 'n1', conversationId: 'abc' }).event);
    expect({ opened: worker.opened, focused: ouvert.focused, messages: ouvert.messages }).toEqual({
      opened: [],
      focused: true,
      messages: [{ type: 'NOTIFICATION_CLICKED', url: '/c/abc', data: { notificationId: 'n1', conversationId: 'abc' } }],
    });
  });

  test('une story ouvre son lecteur, un réel le détail de la publication', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', clic({ postId: 'p1', postType: 'STORY' }).event);
    await worker.dispatch('notificationclick', clic({ postId: 'p1', postType: 'REEL' }).event);
    expect(worker.opened).toEqual(['/story/p1', '/post/p1']);
  });

  test('une demande d’ami ouvre l’onglet « Demandes » de la découverte, filtre compris', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', clic({ type: 'friend_request', friendRequestId: 'fr1' }).event);
    expect(worker.opened).toEqual(['/discover?onglet=requests&demandes=received']);
  });

  test('sans destination, le tap ouvre la liste des notifications — il atterrit toujours', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', clic({ type: 'un_type_sans_ecran' }).event);
    expect(worker.opened).toEqual(['/notifications']);
  });

  test('la table exposée au gate porte les motifs de la table de routes', () => {
    expect(mount().exports.PUSH_ROUTE_PATTERNS).toEqual({
      thread: '/c/$conversation',
      story: '/story/$post',
      post: '/post/$post',
      discover: '/discover',
      progression: '/me/progression',
      settings: '/settings',
      notifications: '/notifications',
    });
  });
});
