/**
 * Les effets DURABLES d'un retrait de message.
 *
 * Le cycle précédent laissait une piste précise : quatre écrivains basculent
 * `deletedAt` sur un `Message`, aucun ne désactive les `/l/<token>` que le
 * message emporte, « commencer par nommer la liste ». En la suivant, on trouve
 * que le correctif tel qu'énoncé — désactiver `where: { messageId }` — aurait
 * été une RÉGRESSION, et sur le chemin le plus courant.
 *
 * `findExistingTrackingLink(url, conversationId)` rend à TOUT message de la
 * conversation le lien déjà minté pour la même URL : une ligne `TrackingLink`
 * est PARTAGÉE entre messages. `messageId` n'en retient qu'un — le premier à
 * l'avoir réclamée à l'envoi (`updateTrackingLinksWithMessageId` filtre sur
 * `messageId: null`), le dernier au partage (`updateTrackingLinksMessageId`
 * écrase sans garde). Supprimer le premier message d'une URL citée deux fois
 * aurait donc coupé le lien que le second AFFICHE ENCORE.
 *
 * D'où le témoin central de cette suite — « un survivant protège le token » :
 * c'est lui, et lui seul, qui échouerait si quelqu'un remplaçait le décompte
 * par un filtre sur `messageId`.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Le singleton des compteurs est doublé ; `resolveAttachmentType` reste le VRAI
// (même table MIME → compteur que `recompute()`, cf. le jumeau côté post-save).
const mockOnMessageDeleted = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    onMessageDeleted: (...a: any[]) => mockOnMessageDeleted(...a),
  },
}));

import {
  applyMessageRemovalEffects,
  recomputeConversationLastMessageAt,
  trackingTokensOfMessage,
} from '../../../../services/messaging/messageRemovalEffects';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439022';
const CONVERSATION_CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const LAST_MESSAGE_AT = new Date('2026-08-09T12:00:00.000Z');
const SURVIVOR_CREATED_AT = new Date('2026-08-09T11:00:00.000Z');

const messageFindRaw = jest.fn<any>();
const messageFindFirst = jest.fn<any>();
const conversationFindUnique = jest.fn<any>();
const conversationUpdateMany = jest.fn<any>();
const trackingLinkUpdateMany = jest.fn<any>();

const prisma = {
  message: { findRaw: messageFindRaw, findFirst: messageFindFirst },
  conversation: { findUnique: conversationFindUnique, updateMany: conversationUpdateMany },
  trackingLink: { updateMany: trackingLinkUpdateMany },
} as any;

const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439033';
const SENDER_USER_ID = '507f1f77bcf86cd799439044';

function removedMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: SENDER_PARTICIPANT_ID,
    senderUserId: SENDER_USER_ID,
    messageType: 'text',
    attachmentMimeTypes: [] as readonly string[],
    content: 'regarde ça m+aB3xY9',
    metadata: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOnMessageDeleted.mockResolvedValue(undefined);
  messageFindRaw.mockResolvedValue([]);
  messageFindFirst.mockResolvedValue({ createdAt: SURVIVOR_CREATED_AT });
  conversationFindUnique.mockResolvedValue({
    lastMessageAt: LAST_MESSAGE_AT,
    createdAt: CONVERSATION_CREATED_AT,
  });
  conversationUpdateMany.mockResolvedValue({ count: 1 });
  trackingLinkUpdateMany.mockResolvedValue({ count: 1 });
});

describe('trackingTokensOfMessage', () => {
  it('lit les deux représentations : `m+<token>` du contenu ET metadata.trackingLinks', () => {
    // Les deux existent parce que les deux chemins de minting diffèrent : une
    // syntaxe explicite `[[url]]` RÉÉCRIT le contenu, une URL brute ne le
    // touche pas et ne laisse son token que dans les métadonnées. Ne lire
    // qu'une des deux laisserait la moitié des liens actifs pour toujours.
    const tokens = trackingTokensOfMessage(
      removedMessage({
        content: 'deux liens m+aB3xY9 et m+Zk12_-',
        metadata: { trackingLinks: [{ url: 'https://ex.com', token: 'RaW001' }] },
      })
    );

    expect(tokens.sort()).toEqual(['RaW001', 'Zk12_-', 'aB3xY9']);
  });

  it('déduplique un token cité deux fois', () => {
    const tokens = trackingTokensOfMessage(
      removedMessage({
        content: 'm+aB3xY9 puis encore m+aB3xY9',
        metadata: { trackingLinks: [{ url: 'https://ex.com', token: 'aB3xY9' }] },
      })
    );

    expect(tokens).toEqual(['aB3xY9']);
  });

  it('ignore un metadata qui ne porte pas de trackingLinks exploitables', () => {
    // `metadata` est un `Json?` PARTAGÉ (postReplyTo, location…) : tout ce qui
    // s'y trouve n'est pas un mapping de liens.
    expect(trackingTokensOfMessage(removedMessage({ content: null, metadata: { location: {} } }))).toEqual([]);
    expect(trackingTokensOfMessage(removedMessage({ content: null, metadata: { trackingLinks: 'nope' } }))).toEqual([]);
    expect(trackingTokensOfMessage(removedMessage({ content: null, metadata: [1, 2] }))).toEqual([]);
    expect(trackingTokensOfMessage(removedMessage({ content: null, metadata: null }))).toEqual([]);
  });

  it('écarte un token hors charset venu des métadonnées', () => {
    // Le charset sert deux fois : écarter l'improbable, et garantir qu'aucun
    // métacaractère n'entre dans le `$regex` du préfiltre Mongo.
    const tokens = trackingTokensOfMessage(
      removedMessage({
        content: null,
        metadata: { trackingLinks: [{ url: 'https://ex.com', token: '.*|(bad)' }, { url: 'https://ok.com', token: 'GooD01' }] },
      })
    );

    expect(tokens).toEqual(['GooD01']);
  });
});

describe('applyMessageRemovalEffects — liens de partage', () => {
  it('désactive le lien que plus aucun message vivant ne porte', async () => {
    messageFindRaw.mockResolvedValue([]);

    await applyMessageRemovalEffects(prisma, removedMessage());

    expect(trackingLinkUpdateMany).toHaveBeenCalledTimes(1);
    expect(trackingLinkUpdateMany).toHaveBeenCalledWith({
      where: {
        token: { in: ['aB3xY9'] },
        targetType: 'EXTERNAL',
        conversationId: CONVERSATION_ID,
        isActive: true,
      },
      data: { isActive: false },
    });
  });

  it("NE désactive PAS un lien qu'un autre message vivant affiche encore", async () => {
    // LE témoin de cette suite. Un filtre sur `TrackingLink.messageId` — le
    // correctif « évident » — couperait ici un lien parfaitement vivant.
    messageFindRaw.mockResolvedValue([
      { content: 'je remets le lien m+aB3xY9', metadata: null },
    ]);

    await applyMessageRemovalEffects(prisma, removedMessage());

    expect(trackingLinkUpdateMany).not.toHaveBeenCalled();
  });

  it('un survivant qui ne porte le token que dans ses métadonnées protège aussi', async () => {
    // Le survivant a cité l'URL BRUTE : son contenu ne contient aucun
    // `m+<token>`, seul son mapping le nomme. Ne décompter que les contenus
    // désactiverait un lien encore affiché.
    messageFindRaw.mockResolvedValue([
      { content: 'https://ex.com', metadata: { trackingLinks: [{ token: 'aB3xY9' }] } },
    ]);

    await applyMessageRemovalEffects(prisma, removedMessage());

    expect(trackingLinkUpdateMany).not.toHaveBeenCalled();
  });

  it("ne désactive que les tokens orphelins quand le message en portait plusieurs", async () => {
    messageFindRaw.mockResolvedValue([
      { content: 'seul celui-ci survit m+KeeP01', metadata: null },
    ]);

    await applyMessageRemovalEffects(
      prisma,
      removedMessage({ content: 'm+KeeP01 et m+Drop02' })
    );

    expect(trackingLinkUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ token: { in: ['Drop02'] } }) })
    );
  });

  it('interroge les survivants de la conversation en excluant le message retiré', async () => {
    await applyMessageRemovalEffects(prisma, removedMessage());

    expect(messageFindRaw).toHaveBeenCalledWith({
      filter: {
        conversationId: { $oid: CONVERSATION_ID },
        deletedAt: null,
        _id: { $ne: { $oid: MESSAGE_ID } },
        $or: [
          { 'metadata.trackingLinks.token': { $in: ['aB3xY9'] } },
          { content: { $regex: 'm\\+(aB3xY9)' } },
        ],
      },
      options: { projection: { content: 1, 'metadata.trackingLinks.token': 1 } },
    });
  });

  it("ne touche à rien quand le message ne portait aucun lien", async () => {
    await applyMessageRemovalEffects(prisma, removedMessage({ content: 'bonjour', metadata: null }));

    expect(messageFindRaw).not.toHaveBeenCalled();
    expect(trackingLinkUpdateMany).not.toHaveBeenCalled();
  });

  it("laisse le lien ACTIF quand le décompte échoue", async () => {
    // Le sens sûr : couper à tort casse un message vivant et rien ne le
    // rouvre ; laisser actif ne coûte qu'un clic compté en trop.
    messageFindRaw.mockRejectedValue(new Error('mongo down'));

    await applyMessageRemovalEffects(prisma, removedMessage());

    expect(trackingLinkUpdateMany).not.toHaveBeenCalled();
  });

  it("recalcule quand même lastMessageAt si la désactivation échoue", async () => {
    // Deux effets indépendants : l'un ne doit pas emporter l'autre.
    trackingLinkUpdateMany.mockRejectedValue(new Error('write failed'));

    await applyMessageRemovalEffects(prisma, removedMessage());

    expect(conversationUpdateMany).toHaveBeenCalledTimes(1);
  });
});

describe('applyMessageRemovalEffects — lastMessageAt', () => {
  it("ramène le curseur sur le dernier message vivant, sous garde CAS", async () => {
    await applyMessageRemovalEffects(prisma, removedMessage());

    expect(messageFindFirst).toHaveBeenCalledWith({
      where: { conversationId: CONVERSATION_ID, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID, lastMessageAt: LAST_MESSAGE_AT },
      data: { lastMessageAt: SURVIVOR_CREATED_AT },
    });
  });

  it("retombe sur la date de création de la conversation quand plus rien ne survit", async () => {
    messageFindFirst.mockResolvedValue(null);

    await applyMessageRemovalEffects(prisma, removedMessage());

    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID, lastMessageAt: LAST_MESSAGE_AT },
      data: { lastMessageAt: CONVERSATION_CREATED_AT },
    });
  });

  it("n'écrit rien quand la conversation a disparu", async () => {
    conversationFindUnique.mockResolvedValue(null);

    await recomputeConversationLastMessageAt(prisma, CONVERSATION_ID);

    expect(conversationUpdateMany).not.toHaveBeenCalled();
  });

  it("ne fait jamais échouer la suppression, déjà committée, si le recalcul jette", async () => {
    conversationFindUnique.mockRejectedValue(new Error('mongo down'));

    await expect(applyMessageRemovalEffects(prisma, removedMessage())).resolves.toBeUndefined();
  });
});

/**
 * Le décompte est le troisième effet du retrait, et le dernier arrivé. Il
 * vivait recopié dans UNE seule des quatre routes de suppression — celle
 * qu'empruntent iOS et la vue web — pendant que le comptage, lui, ne vivait que
 * dans le handler socket. Aucune des deux moitiés ne couvrait l'autre : un
 * message envoyé par REST puis supprimé décrémentait un compteur qu'il n'avait
 * jamais incrémenté. Les décréments sont atomiques et SANS plancher (choix
 * assumé, cf. la note du service), donc le total passait sous zéro sans
 * qu'aucun recalcul périodique ne vienne le relever.
 */
describe('applyMessageRemovalEffects — décompte des statistiques', () => {
  it('décompte le message retiré', async () => {
    await applyMessageRemovalEffects(prisma, removedMessage({ content: 'trois petits mots' }));

    expect(mockOnMessageDeleted).toHaveBeenCalledWith(
      prisma,
      CONVERSATION_ID,
      SENDER_USER_ID,
      'trois petits mots',
      [],
      'text'
    );
  });

  it('débite la MÊME clé que celle qui a été créditée à l\'envoi', async () => {
    // `senderUserId ?? senderId` — la règle de `recompute()`, mot pour mot.
    // Créditer l'utilisateur et débiter son Participant laisserait deux entrées
    // dans `participantStats`, l'une gonflée, l'autre plancher à zéro.
    await applyMessageRemovalEffects(prisma, removedMessage({ senderUserId: null }));

    expect(mockOnMessageDeleted.mock.calls[0][2]).toBe(SENDER_PARTICIPANT_ID);
  });

  it('décompte les pièces jointes CAPTURÉES avant leur suppression', async () => {
    // Deux des trois routes suppriment les `MessageAttachment` AVANT d'appeler
    // cette unité : relire la relation ici rendrait toujours une liste vide et
    // les compteurs image/audio/vidéo ne redescendraient jamais.
    await applyMessageRemovalEffects(
      prisma,
      removedMessage({ attachmentMimeTypes: ['image/png', 'audio/mpeg', 'text/csv'] })
    );

    expect(mockOnMessageDeleted.mock.calls[0][4]).toEqual(['image', 'audio', 'file']);
  });

  it('transmet le messageType, seul porteur du compteur de lieux', async () => {
    await applyMessageRemovalEffects(prisma, removedMessage({ messageType: 'location' }));

    expect(mockOnMessageDeleted.mock.calls[0][5]).toBe('location');
  });

  it('ne fait jamais échouer la suppression, déjà committée, si le décompte jette', async () => {
    mockOnMessageDeleted.mockRejectedValue(new Error('counters down'));

    await expect(applyMessageRemovalEffects(prisma, removedMessage())).resolves.toBeUndefined();
    expect(trackingLinkUpdateMany).toHaveBeenCalled();
    expect(conversationUpdateMany).toHaveBeenCalled();
  });
});
