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
const notificationFindMany = jest.fn<any>();
const notificationDeleteMany = jest.fn<any>();

const prisma = {
  message: { findRaw: messageFindRaw, findFirst: messageFindFirst },
  conversation: { findUnique: conversationFindUnique, updateMany: conversationUpdateMany },
  trackingLink: { updateMany: trackingLinkUpdateMany },
  notification: { findMany: notificationFindMany, deleteMany: notificationDeleteMany },
} as any;

/**
 * Le double des notifications APPLIQUE le `where` qu'il reçoit, aux deux bouts.
 *
 * Un double qui rendrait ses lignes quel que soit le filtre laisserait passer
 * les deux erreurs qui comptent ici, et dans les deux sens : ne rien filtrer
 * (le rappel emporte l'inbox entière) autant que filtrer sur rien (la ligne
 * rappelée survit). `undefined` vaut « aucune contrainte » — la sémantique de
 * Prisma, où `deleteMany({})` supprime tout — pour que l'absence de garde en
 * production se voie comme une suppression trop LARGE et non comme un no-op.
 */
const OTHER_MESSAGE_ID = '507f1f77bcf86cd799439055';
const MENTIONED_USER_ID = '64a000000000000000000001';
const REPLIED_USER_ID = '64a000000000000000000002';

interface NotificationRow {
  id: string;
  userId: string;
  messageId: string | null;
  /** Relu par le retrait : la révocation push ne vise que ce qui est parti. */
  delivery?: { pushSent: boolean };
}

let notificationRows: NotificationRow[] = [];

const matchesWhere = (row: NotificationRow, where: { messageId?: string } | undefined): boolean =>
  where?.messageId === undefined || row.messageId === where.messageId;

function seedNotifications(rows: NotificationRow[]): void {
  notificationRows = [...rows];
}

const ANCHORED_ON_REMOVED: NotificationRow[] = [
  { id: 'notif-mention', userId: MENTIONED_USER_ID, messageId: MESSAGE_ID, delivery: { pushSent: true } },
  { id: 'notif-reply', userId: REPLIED_USER_ID, messageId: MESSAGE_ID, delivery: { pushSent: true } },
];
const ANCHORED_ELSEWHERE: NotificationRow = {
  id: 'notif-autre-message',
  userId: MENTIONED_USER_ID,
  messageId: OTHER_MESSAGE_ID,
};

const announceNotificationsRetracted = jest.fn<any>();
const announcer = { announceNotificationsRetracted } as any;

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
  seedNotifications([]);
  announceNotificationsRetracted.mockResolvedValue(undefined);
  // Projette ce que le retrait SÉLECTIONNE, `delivery` compris : la révocation
  // push le lit pour ne réveiller que les appareils qui portent une bannière.
  notificationFindMany.mockImplementation(async ({ where }: any) =>
    notificationRows
      .filter((row) => matchesWhere(row, where))
      .map(({ id, userId, delivery }) => ({ id, userId, delivery }))
  );
  notificationDeleteMany.mockImplementation(async ({ where }: any) => {
    const kept = notificationRows.filter((row) => !matchesWhere(row, where));
    const count = notificationRows.length - kept.length;
    notificationRows = kept;
    return { count };
  });
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

/**
 * Le quatrième effet du retrait : les notifications que le message a produites.
 *
 * Supprimer un message, dans ce produit, est un RAPPEL. Le cycle précédent a
 * retiré le message rappelé de l'inbox de mentions ; il a laissé derrière lui
 * l'inbox de notifications, qui porte le MÊME contenu par une autre voie —
 * `Notification.content` et `metadata.messagePreview` sont l'extrait du
 * message, dénormalisé à la création. Aucun filtre à la lecture ne pouvait le
 * rattraper : la ligne ne relit jamais le message, elle en garde une COPIE.
 *
 * D'où le retrait durable, et ici plutôt qu'ailleurs : quatre écrivains
 * basculent `deletedAt`, trois passent par cette unité, et un effet ajouté ici
 * s'applique aux trois. La cascade `Notification.message` ne se déclenche pas —
 * une cascade demande une suppression PHYSIQUE, le retrait doux ne bascule
 * qu'une colonne. Même mécanisme que les `TrackingLink` et que les `Mention`
 * des deux cycles précédents.
 */
describe('applyMessageRemovalEffects — notifications ancrées sur le message', () => {
  it("retire les notifications que le message rappelé a produites", async () => {
    seedNotifications([...ANCHORED_ON_REMOVED, ANCHORED_ELSEWHERE]);

    await applyMessageRemovalEffects(prisma, removedMessage(), announcer);

    expect(notificationRows.map((row) => row.id)).toEqual(['notif-autre-message']);
  });

  it("laisse intactes les notifications d'un AUTRE message de la conversation", async () => {
    // Le témoin : il interdit d'élargir. Un retrait sans garde — ou gardé sur
    // la conversation plutôt que sur le message — viderait l'inbox de lignes
    // qui pointent vers des messages toujours affichés.
    seedNotifications([ANCHORED_ELSEWHERE]);

    await applyMessageRemovalEffects(prisma, removedMessage(), announcer);

    expect(notificationRows).toEqual([ANCHORED_ELSEWHERE]);
    expect(announceNotificationsRetracted).not.toHaveBeenCalled();
  });

  it("annonce chaque ligne retirée à son destinataire", async () => {
    // Sans l'annonce, la cloche resterait sur un compteur qui inclut des
    // lignes que le serveur vient de supprimer : le badge afficherait 3 pour
    // une liste de 2, jusqu'au prochain démarrage à froid.
    seedNotifications(ANCHORED_ON_REMOVED);

    await applyMessageRemovalEffects(prisma, removedMessage(), announcer);

    expect(announceNotificationsRetracted).toHaveBeenCalledWith([
      { id: 'notif-mention', userId: MENTIONED_USER_ID, pushSent: true },
      { id: 'notif-reply', userId: REPLIED_USER_ID, pushSent: true },
    ]);
  });

  it("n'annonce rien quand le message n'avait produit aucune notification", async () => {
    await applyMessageRemovalEffects(prisma, removedMessage(), announcer);

    expect(notificationDeleteMany).not.toHaveBeenCalled();
    expect(announceNotificationsRetracted).not.toHaveBeenCalled();
  });

  it("retire les lignes même sans annonceur câblé", async () => {
    // L'écriture durable ne dépend PAS du câblage socket. Un script de
    // maintenance, un worker sans `io`, un test : le rappel doit emporter la
    // copie du contenu dans tous les cas — seule l'annonce est optionnelle.
    seedNotifications(ANCHORED_ON_REMOVED);

    await applyMessageRemovalEffects(prisma, removedMessage());

    expect(notificationRows).toEqual([]);
  });

  it("ne fait pas échouer le retrait, déjà committé, quand l'annonce jette", async () => {
    seedNotifications(ANCHORED_ON_REMOVED);
    announceNotificationsRetracted.mockRejectedValue(new Error('socket down'));

    await expect(
      applyMessageRemovalEffects(prisma, removedMessage(), announcer)
    ).resolves.toBeUndefined();
    expect(notificationRows).toEqual([]);
  });

  it("recalcule quand même lastMessageAt si le retrait des notifications échoue", async () => {
    // Quatre effets indépendants : l'un ne doit pas emporter les autres.
    notificationFindMany.mockRejectedValue(new Error('mongo down'));

    await applyMessageRemovalEffects(prisma, removedMessage(), announcer);

    expect(conversationUpdateMany).toHaveBeenCalledTimes(1);
    expect(trackingLinkUpdateMany).toHaveBeenCalledTimes(1);
  });
});
