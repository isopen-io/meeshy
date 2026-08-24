/**
 * L'édition d'un message ANNULE les notifications qu'il avait produites et les
 * REPRODUIT sur le nouveau texte.
 *
 * Le pendant exact du retrait (`retractMessageNotifications`), et la même cause
 * que toute la famille : la ligne `Notification` garde une copie DÉNORMALISÉE
 * du contenu — `content`, `metadata.messagePreview`, `metadata.messageContent`
 * — que rien ne relit jamais. Un retrait la rend mensongère et le retrait
 * l'emporte ; une ÉDITION la rend mensongère et RIEN ne passait la corriger :
 * le destinataire gardait indéfiniment, dans sa liste, le texte d'AVANT.
 *
 * Ce que « annuler ET reproduire » veut dire ici, et pourquoi ce n'est pas un
 * `delete` suivi d'un `create` :
 *
 *  1. **La ligne est réécrite EN PLACE, donc `isRead` survit.** Détruire puis
 *     recréer ferait repasser en NON LUE une notification déjà consommée : la
 *     moindre correction de faute de frappe re-sonnerait chez le destinataire,
 *     et le compteur de non-lus remonterait. L'édition doit rafraîchir le
 *     texte, pas ressusciter l'alerte.
 *  2. **L'annonce, elle, est bien un couple annuler/reproduire.** Les clients
 *     ne connaissent que `notification:deleted` et `notification:new` — il
 *     n'existe pas d'événement « modifiée ». Le couple exprime la mise à jour
 *     avec les deux seuls verbes que web et iOS savent déjà recevoir.
 *
 * Le témoin central de cette suite est la RECOMPOSITION du corps : `content`
 * n'est pas l'extrait, c'est ce que `buildMessageNotificationBodyI18n` en a
 * fait — l'extrait SUIVI des badges de pièces jointes. Comme l'extrait d'alors
 * est lisible dans `metadata.messagePreview`, le suffixe se déduit, et la
 * réécriture remplace le préfixe sans avoir à re-résoudre la langue du
 * destinataire ni à reconstruire la liste des pièces jointes.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { reproduceEditedMessageNotifications } from '../reproduceEditedMessageNotifications';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const RECIPIENT_ID = '64a000000000000000000001';

const findMany = jest.fn<any>();
const update = jest.fn<any>();
const announceNotificationsReproduced = jest.fn<any>();

/**
 * Cycle 123 bis — l'unité relit désormais les drapeaux de PROTECTION du message
 * édité, et son double doit les servir : un message PROTÉGÉ ne se démasque pas
 * par une édition, et la relecture est fail-CLOSED (absente ou en échec ⇒
 * « protégé », donc rien n'est réécrit). Sans ce délégué, TOUTE la suite
 * atteste un no-op — ce qui est exactement ce que le harnais faisait avant
 * qu'on l'aligne, et qu'aucun témoin n'aurait signalé comme une perte.
 */
const messageFindUnique = jest.fn<any>();
const ORDINARY_MESSAGE = {
  messageType: 'text',
  isEncrypted: false,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  createdAt: new Date('2026-08-24T10:00:00Z'),
};

const announcer = { announceNotificationsReproduced } as any;
const prisma = {
  notification: { findMany, update },
  message: { findUnique: messageFindUnique },
} as any;

/** Les données que la réécriture rend à `update` pour une ligne. */
function updatedData(index = 0): any {
  return update.mock.calls[index][0].data;
}

const row = (over: Record<string, unknown> = {}) => ({
  id: '607f1f77bcf86cd799439001',
  userId: RECIPIENT_ID,
  type: 'new_message',
  content: 'ancien texte',
  subtitle: null,
  context: {},
  metadata: { action: 'view_message', messagePreview: 'ancien texte' },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  update.mockResolvedValue({});
  messageFindUnique.mockResolvedValue(ORDINARY_MESSAGE);
  announceNotificationsReproduced.mockResolvedValue(undefined);
  findMany.mockResolvedValue([]);
});

describe('reproduceEditedMessageNotifications', () => {
  describe('la copie dénormalisée suit le nouveau texte', () => {
    it('réécrit le corps et l’extrait d’un new_message', async () => {
      findMany.mockResolvedValue([row()]);

      const reproduced = await reproduceEditedMessageNotifications(
        prisma,
        { messageId: MESSAGE_ID, content: 'nouveau texte' },
        announcer
      );

      expect(reproduced).toBe(1);
      expect(updatedData()).toMatchObject({
        content: 'nouveau texte',
        metadata: expect.objectContaining({ messagePreview: 'nouveau texte' }),
      });
    });

    /**
     * Le témoin de la recomposition. `content` valait « ancien · 📎 2 fichiers »
     * — l'extrait PUIS ce que le constructeur de corps y a ajouté. Une
     * réécriture qui remplacerait `content` par le seul nouvel extrait
     * DÉTRUIRAIT les badges ; celle-ci ne remplace que le préfixe, déduit de
     * l'extrait qu'on avait stocké.
     */
    it('préserve les badges de pièces jointes en ne remplaçant que le préfixe', async () => {
      findMany.mockResolvedValue([
        row({
          content: 'ancien texte 📎 2 fichiers',
          metadata: { action: 'view_message', messagePreview: 'ancien texte' },
        }),
      ]);

      await reproduceEditedMessageNotifications(
        prisma,
        { messageId: MESSAGE_ID, content: 'nouveau texte' },
        announcer
      );

      expect(updatedData().content).toBe('nouveau texte 📎 2 fichiers');
    });

    /**
     * `user_mentioned` et `message_reply` écrivent l'extrait VERBATIM en
     * `content` — pas de badges, donc la substitution de préfixe rend
     * exactement le nouveau texte.
     */
    it.each(['user_mentioned', 'message_reply'])(
      'réécrit le corps verbatim d’un %s',
      async (type) => {
        findMany.mockResolvedValue([row({ type })]);

        await reproduceEditedMessageNotifications(
          prisma,
          { messageId: MESSAGE_ID, content: 'nouveau texte' },
          announcer
        );

        expect(updatedData().content).toBe('nouveau texte');
      }
    );

    /**
     * `message_reaction` est le cas où `content` NE DOIT PAS bouger : son corps
     * est « X a réagi ❤️ », une phrase qui ne dérive pas du texte du message.
     * Seule sa copie de l'extrait — sous une TROISIÈME clé, `messageContent` —
     * est concernée. Réécrire `content` ici remplacerait la phrase par le
     * message lui-même.
     */
    it('ne touche pas au corps d’un message_reaction, seulement à son extrait', async () => {
      findMany.mockResolvedValue([
        row({
          type: 'message_reaction',
          content: '❤️',
          metadata: { action: 'view_message', reactionEmoji: '❤️', messageContent: 'ancien texte' },
        }),
      ]);

      await reproduceEditedMessageNotifications(
        prisma,
        { messageId: MESSAGE_ID, content: 'nouveau texte' },
        announcer
      );

      // Le corps n'est pas « réécrit à l'identique » : il n'est pas écrit DU
      // TOUT. Une réécriture à l'identique dépendrait de la valeur relue, donc
      // écraserait une phrase re-localisée entre-temps.
      expect(updatedData()).not.toHaveProperty('content');
      expect(updatedData().metadata).toMatchObject({ messageContent: 'nouveau texte' });
    });

    /**
     * L'édition PURGE `Message.translations` (le pipeline retraduit le nouveau
     * texte). La traduction embarquée dans la notification décrit donc l'ANCIEN
     * texte, et c'est elle que le Prisme affiche en priorité : la laisser
     * afficherait l'ancien message traduit À LA PLACE du nouveau.
     */
    it.each(['new_message', 'user_mentioned', 'message_reply'])(
      'purge la traduction embarquée d’un %s, qui décrit l’ancien texte',
      async (type) => {
      // Les TROIS éventails de `messageNotificationFanOut` embarquent une
      // traduction depuis le cycle 122 : la mention et la réponse ont rejoint
      // `new_message`, qui la portait seul depuis le cycle 121. La purge est
      // type-agnostique et les couvrait déjà — ce témoin gèle le fait qu'elle
      // les couvre, plutôt que de laisser deux types nouvellement porteurs
      // reposer sur un témoin écrit pour un troisième.
      findMany.mockResolvedValue([
        row({
          type,
          context: { conversationId: 'c1', translatedContent: 'old text', translatedLanguage: 'en' },
        }),
      ]);

      await reproduceEditedMessageNotifications(
        prisma,
        { messageId: MESSAGE_ID, content: 'nouveau texte' },
        announcer
      );

      const context = updatedData().context;
      expect(context.translatedContent).toBeUndefined();
      expect(context.translatedLanguage).toBeUndefined();
      // Le reste du contexte est PRÉSERVÉ : la purge vise la traduction, pas le bloc.
      expect(context.conversationId).toBe('c1');
    });

    /**
     * Un extrait est TRONQUÉ à la création ; le réécrire entier gonflerait la
     * ligne à chaque édition d'un long message, et le client afficherait un
     * corps que rien ne borne.
     */
    it('tronque le nouvel extrait comme la création le faisait', async () => {
      findMany.mockResolvedValue([row()]);
      const long = 'x'.repeat(250);

      await reproduceEditedMessageNotifications(
        prisma,
        { messageId: MESSAGE_ID, content: long },
        announcer
      );

      const content: string = updatedData().content;
      expect(content.length).toBeLessThanOrEqual(101);
      expect(content.endsWith('…')).toBe(true);
    });
  });

  describe('annuler puis reproduire', () => {
    /**
     * L'annonce APRÈS l'écriture durable, comme dans toute la famille : ce que
     * les clients ré-affichent doit être ce que la base porte.
     */
    it('annonce la reproduction après la réécriture', async () => {
      findMany.mockResolvedValue([row()]);
      const order: string[] = [];
      update.mockImplementation(async () => {
        order.push('update');
        return {};
      });
      announceNotificationsReproduced.mockImplementation(async () => {
        order.push('announce');
      });

      await reproduceEditedMessageNotifications(
        prisma,
        { messageId: MESSAGE_ID, content: 'nouveau texte' },
        announcer
      );

      expect(order).toEqual(['update', 'announce']);
      expect(announceNotificationsReproduced).toHaveBeenCalledWith([
        expect.objectContaining({ id: '607f1f77bcf86cd799439001', userId: RECIPIENT_ID }),
      ]);
    });

    /**
     * `isRead` n'apparaît JAMAIS dans l'écriture. C'est ce qui distingue la
     * reproduction d'un `delete` + `create` : une notification déjà consommée
     * doit voir son texte se rafraîchir SANS repasser en non lue, sinon la
     * moindre correction de faute de frappe re-sonne et remonte le compteur.
     */
    it('ne ressuscite pas une notification déjà lue', async () => {
      findMany.mockResolvedValue([row()]);

      await reproduceEditedMessageNotifications(
        prisma,
        { messageId: MESSAGE_ID, content: 'nouveau texte' },
        announcer
      );

      expect(updatedData()).not.toHaveProperty('isRead');
      expect(updatedData()).not.toHaveProperty('readAt');
    });

    it('n’écrit ni n’annonce quand le message n’avait rien notifié', async () => {
      findMany.mockResolvedValue([]);

      const reproduced = await reproduceEditedMessageNotifications(
        prisma,
        { messageId: MESSAGE_ID, content: 'nouveau texte' },
        announcer
      );

      expect(reproduced).toBe(0);
      expect(update).not.toHaveBeenCalled();
      expect(announceNotificationsReproduced).not.toHaveBeenCalled();
    });

    /**
     * La reproduction est un EFFET de l'édition, jamais sa condition : le
     * nouveau contenu est déjà committé quand elle s'exécute.
     */
    it('réécrit même sans annonceur câblé', async () => {
      findMany.mockResolvedValue([row()]);

      const reproduced = await reproduceEditedMessageNotifications(
        prisma,
        { messageId: MESSAGE_ID, content: 'nouveau texte' },
        undefined
      );

      expect(reproduced).toBe(1);
      expect(update).toHaveBeenCalledTimes(1);
    });

    /**
     * Une ligne récalcitrante ne doit pas empêcher les autres destinataires
     * d'être rafraîchis — l'édition est déjà persistée pour tout le monde.
     */
    it('rafraîchit les autres lignes quand l’une échoue', async () => {
      findMany.mockResolvedValue([row(), row({ id: '607f1f77bcf86cd799439002' })]);
      update.mockRejectedValueOnce(new Error('write conflict'));

      const reproduced = await reproduceEditedMessageNotifications(
        prisma,
        { messageId: MESSAGE_ID, content: 'nouveau texte' },
        announcer
      );

      expect(reproduced).toBe(1);
      // Seule la ligne RÉELLEMENT réécrite est annoncée : annoncer l'autre
      // ferait ré-afficher un texte que la base ne porte pas.
      expect(announceNotificationsReproduced).toHaveBeenCalledWith([
        expect.objectContaining({ id: '607f1f77bcf86cd799439002' }),
      ]);
    });
  });

  describe('les entrées qui ne méritent pas d’aller jusqu’à Mongo', () => {
    it('ne lit même pas la base sans messageId', async () => {
      const reproduced = await reproduceEditedMessageNotifications(
        prisma,
        { messageId: '', content: 'nouveau texte' },
        announcer
      );

      expect(reproduced).toBe(0);
      expect(findMany).not.toHaveBeenCalled();
    });

    /**
     * Un contenu VIDE est un cas légitime — retirer la légende d'un message à
     * pièce jointe. Il ne doit pas être confondu avec « rien à faire » : la
     * copie dénormalisée doit bien perdre l'ancien texte.
     */
    it('traite un contenu vidé comme une édition, pas comme un no-op', async () => {
      findMany.mockResolvedValue([row()]);

      const reproduced = await reproduceEditedMessageNotifications(
        prisma,
        { messageId: MESSAGE_ID, content: '' },
        announcer
      );

      expect(reproduced).toBe(1);
      expect(updatedData().metadata).toMatchObject({ messagePreview: '' });
    });
  });
});

/**
 * Cycle 123 bis — une édition ne DÉMASQUE pas un message protégé.
 *
 * Les lignes d'un message éphémère / à vue unique / flouté / chiffré portent un
 * placeholder posé par l'éventail (`protectedPreview`), et cette réécriture y
 * substituait le nouveau texte EN CLAIR — pour tous ceux déjà notifiés, des
 * TIERS — avant de le réannoncer. Mesuré : rien n'interdit d'éditer un message
 * protégé (`messageEditAdmission` / `messageEditContent` ne portent aucun de
 * ces drapeaux).
 *
 * Ne rien réécrire est la bonne issue et pas seulement la prudente : le
 * placeholder ne dérive pas du contenu, donc une édition du contenu ne le
 * périme pas — et sa seule part variable, la durée d'un éphémère, ne bouge pas
 * non plus.
 */
describe('reproduceEditedMessageNotifications — la protection survit à l\'édition', () => {
  const maskedRow = {
    id: 'n-1',
    userId: RECIPIENT_ID,
    type: 'new_message',
    content: '👁️ 💬',
    context: { messageId: MESSAGE_ID, notificationLocKey: 'notification.view_once_message' },
    metadata: { messagePreview: '👁️ 💬' },
  };

  it('n\'écrit RIEN quand le message est à vue unique', async () => {
    findMany.mockResolvedValue([maskedRow]);
    messageFindUnique.mockResolvedValue({ ...ORDINARY_MESSAGE, isViewOnce: true });

    const count = await reproduceEditedMessageNotifications(
      prisma, { messageId: MESSAGE_ID, content: 'le code du coffre est 4242' }, announcer
    );

    expect(update).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  it('n\'ANNONCE rien non plus — une annonce ferait relire la ligne', async () => {
    findMany.mockResolvedValue([maskedRow]);
    messageFindUnique.mockResolvedValue({ ...ORDINARY_MESSAGE, isBlurred: true });

    await reproduceEditedMessageNotifications(
      prisma, { messageId: MESSAGE_ID, content: 'secret' }, announcer
    );

    expect(announceNotificationsReproduced).not.toHaveBeenCalled();
  });

  it('fail-CLOSED — une relecture qui LÈVE laisse les copies intactes', async () => {
    // L'inverse de l'arbitrage best-effort du reste de l'unité, et c'est
    // délibéré : une copie périmée se rattrape, un secret poussé non.
    findMany.mockResolvedValue([maskedRow]);
    messageFindUnique.mockRejectedValue(new Error('mongo down'));

    const count = await reproduceEditedMessageNotifications(
      prisma, { messageId: MESSAGE_ID, content: 'secret' }, announcer
    );

    expect(update).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  it('fail-CLOSED — un message VOLATILISÉ laisse les copies intactes', async () => {
    findMany.mockResolvedValue([maskedRow]);
    messageFindUnique.mockResolvedValue(null);

    await reproduceEditedMessageNotifications(
      prisma, { messageId: MESSAGE_ID, content: 'secret' }, announcer
    );

    expect(update).not.toHaveBeenCalled();
  });
});
