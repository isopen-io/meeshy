/**
 * Le push de RÉVOCATION — la moitié « appareil » d'un retrait de notification.
 *
 * La famille `retract*` supprime la ligne et l'annonce sur le socket
 * (`notification:deleted`) ; un appareil dont le socket est mort garde donc la
 * bannière déjà livrée. Ce module construit, par destinataire, le push de
 * CONTRÔLE silencieux qui la retire : `data.type = 'notification_revoked'`,
 * `data.notificationIds` joints par virgule, et `data.conversationIds` — même
 * ordre, chaîne vide pour une ligne sans conversation — quand au moins une
 * ligne en porte une.
 *
 * Ce que cette suite fixe, parce que l'agent iOS implémente l'autre face du
 * contrat et que les deux doivent se lire dans la même forme :
 *
 *  1. UN push par destinataire et par lot, jamais un par ligne.
 *  2. Le lot est borné (≤ 40 ids) : la charge APNs l'est.
 *  3. Le push contourne les préférences (`bypassDnd`, `silent`) et ne vise que
 *     les tokens `apns` / `fcm` des plateformes MOBILES — jamais `voip`, jamais
 *     le web.
 *  4. Un envoi qui échoue ne fait jamais échouer le retrait qui l'a demandé.
 *  5. Une ligne dont AUCUN push n'est parti (`delivery.pushSent`) ne produit
 *     aucune révocation : il n'y a pas de bannière à retirer sur le téléphone.
 *  6. Les lots partent EN SÉRIE. L'audience d'un post se compte en dizaines de
 *     milliers de lignes (`retractPostNotifications`), et son drainage
 *     documente que « le pic reste celui d'un seul lot » : un `Promise.all`
 *     global sur tous les destinataires cassait cet invariant.
 *  7. Le TYPE de chaque ligne voyage à côté de sa conversation : c'est lui qui
 *     dit si la bannière a été posée sous l'index de la CONVERSATION (un
 *     arrivage de message, qui remplace la précédente) ou sous le sien. Sans
 *     lui, Android révoquait la bannière du dernier message d'un fil en
 *     retirant une simple réaction.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import {
  buildNotificationRevocationPushes,
  isNotificationRevocationPush,
  sendNotificationRevocationPushes,
  NOTIFICATION_REVOCATION_PUSH_BATCH_SIZE,
} from '../notificationRevocationPush';
import type { RetractedNotification } from '../retractedNotifications';

const ALICE = '64a000000000000000000001';
const BOB = '64a000000000000000000002';
const CONVERSATION_ID = '507f1f77bcf86cd799439021';

const sendToUser = jest.fn<any>();
const pushService = { sendToUser };

/**
 * Une ligne dont un push EST parti — l'état nominal d'une bannière à révoquer.
 * Explicite dans chaque témoin parce que c'est la condition d'existence du
 * push : `delivery.pushSent` est le seul témoin serveur qu'un appareil a bien
 * reçu quelque chose à retirer.
 */
const pushed = (row: Omit<RetractedNotification, 'pushSent'>): RetractedNotification => ({
  ...row,
  pushSent: true,
});

beforeEach(() => {
  jest.clearAllMocks();
  sendToUser.mockResolvedValue([]);
});

describe('buildNotificationRevocationPushes', () => {
  it('groupe les lignes par destinataire — un push par personne, les ids joints par virgule', () => {
    const pushes = buildNotificationRevocationPushes([
      pushed({ id: 'n1', userId: ALICE }),
      pushed({ id: 'n2', userId: BOB }),
      pushed({ id: 'n3', userId: ALICE }),
    ]);

    expect(pushes).toHaveLength(2);
    expect(pushes.find((push) => push.userId === ALICE)?.payload.data.notificationIds).toBe('n1,n3');
    expect(pushes.find((push) => push.userId === BOB)?.payload.data.notificationIds).toBe('n2');
  });

  it('porte la forme EXACTE du contrat de révocation', () => {
    const [push] = buildNotificationRevocationPushes([pushed({ id: 'n1', userId: ALICE })]);

    expect(push).toEqual({
      userId: ALICE,
      payload: {
        title: '',
        body: '',
        silent: true,
        data: { type: 'notification_revoked', notificationIds: 'n1' },
      },
      types: ['apns', 'fcm'],
      platforms: ['ios', 'android'],
      bypassDnd: true,
    });
  });

  /**
   * Le web est EXCLU, même motif que `call-push-mirroring`. Deux raisons qui se
   * cumulent :
   *
   *  - un push data-only sans `webpush.notification` fait afficher à Chrome sa
   *    bannière générique (« Ce site a été mis à jour en arrière-plan ») dès que
   *    le budget d'engagement est épuisé — une notification FANTÔME chez
   *    quelqu'un qui n'avait peut-être rien à faire disparaître ;
   *  - le contournement des préférences (`bypassDnd`) se justifie par
   *    l'INVISIBILITÉ du signal sur iOS et Android ; sur le web il ne l'est pas.
   *
   * L'onglet OUVERT retire sa bannière par le socket (`notification:deleted`,
   * déjà câblé) ; l'onglet fermé la garde jusqu'au clic, choix assumé.
   */
  it('ne vise JAMAIS la plateforme web — même pour un destinataire qui n’a que des tokens web', () => {
    const pushes = buildNotificationRevocationPushes([
      pushed({ id: 'n1', userId: ALICE }),
      pushed({ id: 'n2', userId: BOB, conversationId: CONVERSATION_ID, type: 'new_message' }),
    ]);

    expect(pushes).toHaveLength(2);
    pushes.forEach((push) => {
      expect(push.platforms).toEqual(['ios', 'android']);
      expect(push.platforms).not.toContain('web');
    });
  });

  it('ne joint conversationIds que si une ligne en porte — même ordre, vide pour les autres', () => {
    const [push] = buildNotificationRevocationPushes([
      pushed({ id: 'n1', userId: ALICE }),
      pushed({ id: 'n2', userId: ALICE, conversationId: CONVERSATION_ID }),
      pushed({ id: 'n3', userId: ALICE, conversationId: null }),
    ]);

    expect(push.payload.data.notificationIds).toBe('n1,n2,n3');
    expect(push.payload.data.conversationIds).toBe(`,${CONVERSATION_ID},`);
  });

  /**
   * Le défaut que ce champ ferme : `data.conversationId` est posé par le
   * gateway pour TOUS les types (`createNotification`), réactions comprises.
   * Un client qui révoque « par conversation » sans regarder le type annule la
   * bannière du DERNIER message du fil — un message valide, jamais lu.
   */
  it('joint le TYPE de chaque ligne à côté de sa conversation', () => {
    const [push] = buildNotificationRevocationPushes([
      pushed({ id: 'n1', userId: ALICE, conversationId: CONVERSATION_ID, type: 'message_reaction' }),
      pushed({ id: 'n2', userId: ALICE, conversationId: CONVERSATION_ID, type: 'new_message' }),
    ]);

    expect(push.payload.data.types).toBe('message_reaction,new_message');
  });

  it('laisse le type VIDE là où il n\'y a pas de conversation à qualifier', () => {
    const [push] = buildNotificationRevocationPushes([
      pushed({ id: 'n1', userId: ALICE, type: 'post_comment' }),
      pushed({ id: 'n2', userId: ALICE, conversationId: CONVERSATION_ID, type: 'new_message' }),
    ]);

    expect(push.payload.data.conversationIds).toBe(`,${CONVERSATION_ID}`);
    expect(push.payload.data.types).toBe(',new_message');
  });

  it('omet types quand aucune ligne ne porte de conversation — il ne qualifierait rien', () => {
    const [push] = buildNotificationRevocationPushes([
      pushed({ id: 'n1', userId: ALICE, type: 'post_comment' }),
      pushed({ id: 'n2', userId: ALICE, type: 'comment_reply' }),
    ]);

    expect(push.payload.data).not.toHaveProperty('types');
  });

  it('omet conversationIds quand aucune ligne ne porte de conversation', () => {
    const [push] = buildNotificationRevocationPushes([
      pushed({ id: 'n1', userId: ALICE }),
      pushed({ id: 'n2', userId: ALICE, conversationId: null }),
    ]);

    expect(push.payload.data).not.toHaveProperty('conversationIds');
  });

  it('découpe un destinataire en lots de 40 ids au plus', () => {
    const rows = Array.from({ length: NOTIFICATION_REVOCATION_PUSH_BATCH_SIZE * 2 + 1 }, (_, index) =>
      pushed({ id: `n${index}`, userId: ALICE })
    );

    const pushes = buildNotificationRevocationPushes(rows);

    expect(pushes).toHaveLength(3);
    const sizes = pushes.map((push) => push.payload.data.notificationIds.split(',').length);
    expect(sizes).toEqual([NOTIFICATION_REVOCATION_PUSH_BATCH_SIZE, NOTIFICATION_REVOCATION_PUSH_BATCH_SIZE, 1]);
    expect(pushes.flatMap((push) => push.payload.data.notificationIds.split(','))).toEqual(
      rows.map((row) => row.id)
    );
  });

  it('ne dit pas deux fois le même id à la même personne', () => {
    const [push] = buildNotificationRevocationPushes([
      pushed({ id: 'n1', userId: ALICE }),
      pushed({ id: 'n1', userId: ALICE }),
    ]);

    expect(push.payload.data.notificationIds).toBe('n1');
  });

  /**
   * `delivery.pushSent` n'est vrai que lorsqu'au moins un appareil a REÇU le
   * push nominal (GW7, `NotificationService`). Une ligne jamais poussée —
   * préférences fermées, aucun token, envoi échoué — n'a laissé aucune bannière
   * à retirer : la révoquer serait un réveil d'appareil pour rien, multiplié
   * par l'audience d'un post.
   */
  it('ne bâtit AUCUN push pour une ligne dont aucun push n’est parti', () => {
    const pushes = buildNotificationRevocationPushes([
      { id: 'n1', userId: ALICE, pushSent: false },
      { id: 'n2', userId: BOB, pushSent: false },
    ]);

    expect(pushes).toEqual([]);
  });

  /**
   * `pushSent` est REQUIS par le type — un producteur qui l'oublie ne compile
   * pas. La garde reste posée à l'exécution pour la charge qui arrive d'ailleurs
   * (JSON, appelant non typé) : l'absence vaut « rien n'est parti ».
   */
  it('ne bâtit rien non plus pour une ligne arrivée SANS le champ', () => {
    const untyped = [{ id: 'n1', userId: ALICE }] as unknown as RetractedNotification[];

    expect(buildNotificationRevocationPushes(untyped)).toEqual([]);
  });

  it('ne garde, chez un destinataire, que les lignes réellement poussées', () => {
    const [push] = buildNotificationRevocationPushes([
      { id: 'n1', userId: ALICE, pushSent: false },
      pushed({ id: 'n2', userId: ALICE }),
      { id: 'n3', userId: ALICE, pushSent: false },
    ]);

    expect(push.payload.data.notificationIds).toBe('n2');
  });

  it('ignore une ligne sans id ou sans destinataire', () => {
    const pushes = buildNotificationRevocationPushes([
      pushed({ id: '', userId: ALICE }),
      pushed({ id: 'n2', userId: '' }),
    ]);

    expect(pushes).toEqual([]);
  });
});

describe('sendNotificationRevocationPushes', () => {
  it('envoie chaque lot à son destinataire par le service push', async () => {
    await sendNotificationRevocationPushes({
      pushService,
      revoked: [pushed({ id: 'n1', userId: ALICE }), pushed({ id: 'n2', userId: BOB })],
    });

    expect(sendToUser).toHaveBeenCalledTimes(2);
    expect(sendToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ALICE,
        payload: expect.objectContaining({
          silent: true,
          data: { type: 'notification_revoked', notificationIds: 'n1' },
        }),
        types: ['apns', 'fcm'],
        bypassDnd: true,
      })
    );
    expect(sendToUser).toHaveBeenCalledWith(expect.objectContaining({ userId: BOB }));
  });

  /**
   * Le push est un EFFET du retrait, jamais sa condition : la ligne est déjà
   * partie de la base quand il s'exécute. Un transport en panne se journalise
   * et ne remonte pas — et la panne d'un destinataire n'emporte pas les autres.
   */
  it('ne rejette jamais — un envoi qui lève laisse partir les autres', async () => {
    sendToUser
      .mockRejectedValueOnce(new Error('apns down'))
      .mockResolvedValueOnce([]);

    await expect(
      sendNotificationRevocationPushes({
        pushService,
        revoked: [pushed({ id: 'n1', userId: ALICE }), pushed({ id: 'n2', userId: BOB })],
      })
    ).resolves.toBeUndefined();

    expect(sendToUser).toHaveBeenCalledTimes(2);
  });

  it('ne fait rien sans service push câblé (processus sans transport)', async () => {
    await expect(
      sendNotificationRevocationPushes({ pushService: undefined, revoked: [pushed({ id: 'n1', userId: ALICE })] })
    ).resolves.toBeUndefined();
  });

  /**
   * `retractPostNotifications` documente son drainage ainsi : « les lots
   * s'enchaînent en SÉRIE, si bien que le pic reste celui d'un seul lot quelle
   * que soit la taille de l'audience » — et il parle d'une audience de 40 000
   * lignes. Un `Promise.all` sur tous les destinataires rendait ce plafond
   * caduc : l'envoi partait en une seule rafale.
   */
  it('enchaîne les envois EN SÉRIE — jamais deux en vol à la fois', async () => {
    let inFlight = 0;
    let peak = 0;
    sendToUser.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
      return [];
    });

    const revoked = Array.from({ length: 12 }, (_, index) =>
      pushed({ id: `n${index}`, userId: `user-${index}` })
    );

    await sendNotificationRevocationPushes({ pushService, revoked });

    expect(sendToUser).toHaveBeenCalledTimes(12);
    expect(peak).toBe(1);
  });

  it('ne fait rien sur une liste vide', async () => {
    await sendNotificationRevocationPushes({ pushService, revoked: [] });

    expect(sendToUser).not.toHaveBeenCalled();
  });
});

describe('isNotificationRevocationPush', () => {
  it('reconnaît la charge de révocation à son type de données', () => {
    expect(isNotificationRevocationPush({ data: { type: 'notification_revoked', notificationIds: 'n1' } })).toBe(true);
    expect(isNotificationRevocationPush({ data: { type: 'new_message' } })).toBe(false);
    expect(isNotificationRevocationPush({})).toBe(false);
  });
});
