/**
 * Le rejeu hors ligne ne remet que ce qui est encore VIVANT (#16685).
 *
 * `enqueueForOfflineParticipants` écrit `payload: body` VERBATIM, et le drain
 * ne rejoue qu'un gate d'APPARTENANCE (`_dropEndedMemberships`, dont le
 * `select` ne lit que `{ conversationId, bannedAt }`). **Rien ne relit l'état
 * du MESSAGE.** Un message éphémère brûlé — `ExpiredMessagesCleanupService._burn`
 * pose `content: ''`, `encryptedContent: null`, `translations: null`,
 * `deletedAt`, et supprime les fichiers de pièce jointe en écrivant dans son
 * propre commentaire « Le contenu est détruit — c'est l'invariant qui compte » —
 * laisse une copie LISIBLE de son texte dans `delivery_queue:<userId>` (Redis,
 * AOF) pour le reste des 48 h de TTL, et le prochain drain l'émet.
 *
 * `NotificationService.messageLiveness` existe pour EXACTEMENT cette raison, et
 * sa raison est écrite sur place : « we MUST NOT leak the original content via
 * the banner ». Le chemin de REJEU, qui remet bien plus qu'une bannière, n'en
 * avait aucun équivalent — c'est la forme documentée « une garde d'admission se
 * pose sur CHAQUE chemin, pas sur le plus fréquenté ».
 *
 * ## Ce que ce fichier garde EN DEUX MOITIÉS, et pourquoi la seconde est
 * aussi importante que la première
 *
 * Une garde de vivacité posée sur TOUTES les entrées serait un défaut PIRE que
 * celui qu'elle corrige : `'deleted'` et `'expired'` ont pour UNIQUE objet
 * d'annoncer la mort du message. Les refuser parce que le message est mort
 * laisserait le client afficher indéfiniment un message détruit — et la
 * première moitié du lot aurait l'air de marcher.
 *
 * La loi qui sépare les deux ensembles EXISTE et était déjà déclarée :
 * `TextBearingQueuedEvent` (#12822) — « les familles dont la charge porte le
 * TEXTE d'un message, ou ce qui voyage avec lui ». Le gate s'y adosse ; il ne
 * réénumère pas, sans quoi les deux listes divergeraient au premier
 * `eventType` neuf.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Les doubles `jest.mock` doivent être enregistrés AVANT l'import du manager.
import { getIoState } from './helpers/message-new-parity-mocks';

import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import { makePrisma, makeTranslationService } from './helpers/message-new-parity-fixtures';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

/** Un ObjectId de fixture — la forme que la colonne porte RÉELLEMENT. */
function oid(seed: string): string {
  const hex = Buffer.from(seed).toString('hex');
  return (hex + '0'.repeat(24)).slice(0, 24);
}

const CONV = oid('conv-live');
const LIVE = oid('m-live');
const BURNED = oid('m-burned');
const LAPSED = oid('m-lapsed');
const VANISHED = oid('m-gone');

type MessageRow = { id: string; deletedAt?: Date | null; expiresAt?: Date | null };

describe('drain hors ligne — la vivacité du message est relue avant toute émission', () => {
  let manager: any;
  let prisma: any;
  let ioState: ReturnType<typeof getIoState>;
  /** Tout ce que la lecture de vivacité a demandé, pour la garde d'agrégation. */
  let askedMessageIds: unknown[];

  /**
   * Le double REFUSE ce que le vrai client refuse.
   *
   * `Message.id` est une colonne ObjectId : mesuré contre le client généré,
   * une chaîne qui n'en est pas un atteint le moteur et lève
   * `Malformed ObjectID`. Un double permissif répondrait poliment à une
   * question que la production ne peut pas poser — c'est la leçon « un double
   * de test ment aussi par ce qu'il ACCEPTE », et sans ce refus la garde
   * d'agrégation de ce fichier ne pourrait pas tomber.
   */
  function seedMessages(rows: MessageRow[]): void {
    prisma.message.findMany = jest.fn(async (args: any) => {
      const ids: unknown[] = args?.where?.id?.in ?? [];
      askedMessageIds.push(...ids);
      for (const id of ids) {
        if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) {
          throw new Error(`Invalid \`prisma.message.findMany()\` invocation: Malformed ObjectID: ${String(id)}`);
        }
      }
      return rows
        .filter((row) => ids.includes(row.id))
        .map((row) => ({
          id: row.id,
          deletedAt: row.deletedAt ?? null,
          expiresAt: row.expiresAt ?? null,
        }));
    }) as any;
  }

  function queueOf(entries: unknown[]): any {
    return { drain: jest.fn<any>().mockResolvedValue(entries) };
  }

  /** Le lecteur est un membre VIVANT de `CONV` : le gate d'appartenance passe. */
  function seedLiveMembership(): void {
    prisma.participant.findMany = jest.fn(async (args: any) => {
      if (args?.select?.bannedAt) return [{ conversationId: CONV, bannedAt: null }];
      return [{ id: oid('p-reader'), userId: 'reader' }];
    }) as any;
  }

  function emittedWith(event: string): unknown[] {
    return (ioState.toEmit.mock.calls as any[]).filter((c) => c[0] === event).map((c) => c[1]);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    ioState = getIoState();
    ioState.to.mockClear();
    ioState.toEmit.mockClear();
    ioState.sockets.sockets.clear();
    ioState.sockets.adapter.rooms.clear();

    askedMessageIds = [];
    prisma = makePrisma();
    seedLiveMembership();
    seedMessages([]);
    manager = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
    await manager.initialize();
  });

  /**
   * LE témoin du lot. Rouge avant correction : le texte en clair du message
   * brûlé partait sur le fil, vers un destinataire que le serveur a pourtant
   * déjà privé de ce contenu partout ailleurs.
   */
  it('ne rejoue PAS le contenu d’un message que le serveur a détruit', async () => {
    seedMessages([{ id: BURNED, deletedAt: new Date('2026-11-07T10:00:00Z') }]);
    manager.setDeliveryQueue(queueOf([
      { payload: { id: BURNED, content: 'le secret qui devait brûler' }, conversationId: CONV, messageId: BURNED },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toEqual([]);
  });

  /**
   * La SECONDE moitié, et elle garde contre le correctif trop large : sans
   * elle, refuser toute entrée d'un message mort laisserait le client afficher
   * un message détruit pour toujours. C'est l'annonce de la mort — elle doit
   * passer PRÉCISÉMENT parce que le message est mort.
   */
  it('rejoue l’annonce d’expiration du MÊME message mort', async () => {
    seedMessages([{ id: BURNED, deletedAt: new Date('2026-11-07T10:00:00Z') }]);
    manager.setDeliveryQueue(queueOf([
      { payload: { messageId: BURNED, conversationId: CONV }, conversationId: CONV, messageId: BURNED, eventType: 'expired' },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_EXPIRED)).toEqual([
      { messageId: BURNED, conversationId: CONV },
    ]);
  });

  it('rejoue la suppression d’un message mort — même raison', async () => {
    seedMessages([{ id: BURNED, deletedAt: new Date('2026-11-07T10:00:00Z') }]);
    manager.setDeliveryQueue(queueOf([
      { payload: { messageId: BURNED, conversationId: CONV }, conversationId: CONV, messageId: BURNED, eventType: 'deleted' },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_DELETED)).toHaveLength(1);
  });

  it('rejoue le contenu d’un message encore vivant', async () => {
    seedMessages([{ id: LIVE, expiresAt: new Date('2099-01-01T00:00:00Z') }]);
    manager.setDeliveryQueue(queueOf([
      { payload: { id: LIVE, content: 'toujours là' }, conversationId: CONV, messageId: LIVE },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toEqual([{ id: LIVE, content: 'toujours là' }]);
  });

  /**
   * La fenêtre entre l'échéance et le passage du balayeur : la ligne est
   * encore ENTIÈRE, son texte intact, et elle est déjà due. Le verdict se lit
   * sur `expiresAt`, pas sur la trace du brûlage — s'en tenir à `deletedAt`
   * laisserait fuir tout ce que le balayeur n'a pas encore atteint.
   */
  it('ne rejoue pas le contenu d’un message dont l’échéance est passée, avant même le brûlage', async () => {
    seedMessages([{ id: LAPSED, expiresAt: new Date('2026-11-07T09:00:00Z') }]);
    manager.setDeliveryQueue(queueOf([
      { payload: { id: LAPSED, content: 'dû, pas encore balayé' }, conversationId: CONV, messageId: LAPSED },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toEqual([]);
  });

  /**
   * Fail-OPEN sur l'ABSENCE de preuve, fail-CLOSED sur la preuve — les deux
   * derniers états de la loi s'arbitrent à l'OPPOSÉ. Une ligne absente ne
   * prouve rien : une lecture servie par un secondaire en retard sur le jeu de
   * réplicas rend `null` pour un message parfaitement vivant, et une livraison
   * manquée ne se rattrape pas.
   */
  it('rejoue une entrée dont la ligne est ABSENTE — l’absence ne prouve rien', async () => {
    seedMessages([]);
    manager.setDeliveryQueue(queueOf([
      { payload: { id: VANISHED, content: 'sans preuve de mort' }, conversationId: CONV, messageId: VANISHED },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toHaveLength(1);
  });

  /**
   * Une lecture qui LÈVE rejoue tout : même arbitrage que le `catch` du gate
   * d'appartenance — « une absence de réponse n'autorise rien à conclure ».
   */
  it('rejoue tout quand la lecture de vivacité tombe', async () => {
    prisma.message.findMany = jest.fn<any>().mockRejectedValue(new Error('replica lag'));
    manager.setDeliveryQueue(queueOf([
      { payload: { id: LIVE, content: 'base muette' }, conversationId: CONV, messageId: LIVE },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toHaveLength(1);
  });

  /**
   * La leçon du cycle 112, portée à la lecture NEUVE : un champ que la requête
   * AGRÈGE n'a pas de correctif local. Un `messageId` que la colonne ne peut
   * pas porter ferait lever la lecture pour TOUT le lot — et le `catch`
   * fail-open transformerait une entrée corrompue en désactivation de la garde
   * pour les autres, c'est-à-dire en fuite du secret qu'on vient de fermer.
   */
  it('n’expose pas la lecture de vivacité à un messageId que la colonne ne peut pas porter', async () => {
    seedMessages([{ id: BURNED, deletedAt: new Date('2026-11-07T10:00:00Z') }]);
    manager.setDeliveryQueue(queueOf([
      { payload: { id: BURNED, content: 'le secret' }, conversationId: CONV, messageId: BURNED },
      { payload: { id: 'msg-lisible' }, conversationId: CONV, messageId: 'msg-lisible' },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(askedMessageIds.length).toBeGreaterThan(0);
    for (const id of askedMessageIds) {
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-fA-F]{24}$/);
    }
    // Et la garde a tenu pour l'entrée saine malgré la voisine illisible.
    expect(emittedWith(SERVER_EVENTS.MESSAGE_NEW)).toEqual([{ id: 'msg-lisible' }]);
  });

  /**
   * Les trois signaux qui AFFIRMENT la remise descendent de ce qui est
   * réellement parti — la règle que le gate d'appartenance énonce déjà :
   * « l'affirmer d'un message qu'on vient de refuser de livrer mentirait à son
   * auteur ».
   */
  it('ne compte pas une entrée refusée dans PENDING_MESSAGES_DELIVERED', async () => {
    seedMessages([
      { id: BURNED, deletedAt: new Date('2026-11-07T10:00:00Z') },
      { id: LIVE, expiresAt: new Date('2099-01-01T00:00:00Z') },
    ]);
    manager.setDeliveryQueue(queueOf([
      { payload: { id: LIVE, content: 'vivant' }, conversationId: CONV, messageId: LIVE },
      { payload: { id: BURNED, content: 'brûlé' }, conversationId: CONV, messageId: BURNED },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED)).toEqual([
      { count: 1, conversationIds: [CONV] },
    ]);
  });

  /**
   * La famille gardée est celle que `TextBearingQueuedEvent` DÉCLARE, pas
   * seulement `'new'` : une édition et une traduction transportent le texte du
   * message aussi sûrement que son arrivée.
   */
  it('refuse l’édition et la traduction d’un message détruit, pas seulement son arrivée', async () => {
    seedMessages([{ id: BURNED, deletedAt: new Date('2026-11-07T10:00:00Z') }]);
    manager.setDeliveryQueue(queueOf([
      { payload: { id: BURNED, content: 'texte édité' }, conversationId: CONV, messageId: BURNED, eventType: 'edited' },
      { payload: { messageId: BURNED, translations: { en: 'the secret' } }, conversationId: CONV, messageId: BURNED, eventType: 'translation' },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_EDITED)).toEqual([]);
    expect(emittedWith(SERVER_EVENTS.MESSAGE_TRANSLATION)).toEqual([]);
  });

  /**
   * Une épingle et une réaction ne portent que des identifiants et un emoji :
   * elles n'ont rien à garder, et les refuser priverait le client d'une
   * mutation parfaitement légitime sur un message dont il a le droit de
   * connaître le sort.
   */
  it('laisse passer les familles qui ne portent aucun texte', async () => {
    seedMessages([{ id: BURNED, deletedAt: new Date('2026-11-07T10:00:00Z') }]);
    manager.setDeliveryQueue(queueOf([
      { payload: { messageId: BURNED, conversationId: CONV }, conversationId: CONV, messageId: BURNED, eventType: 'unpinned' },
      { payload: { messageId: BURNED, emoji: '👍' }, conversationId: CONV, messageId: BURNED, eventType: 'reaction-added' },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(emittedWith(SERVER_EVENTS.MESSAGE_UNPINNED)).toHaveLength(1);
    expect(emittedWith(SERVER_EVENTS.REACTION_ADDED)).toHaveLength(1);
  });

  /**
   * La lecture NEUVE ne doit pas s'ouvrir du tout quand aucune entrée ne porte
   * de texte : le coût d'une garde se mesure aussi en requêtes qu'elle ajoute
   * au chemin le plus chaud du système (une tempête de reconnexions).
   */
  it('n’ouvre aucune lecture de vivacité quand aucune entrée ne porte de texte', async () => {
    seedMessages([]);
    manager.setDeliveryQueue(queueOf([
      { payload: { messageId: LIVE, emoji: '👍' }, conversationId: CONV, messageId: LIVE, eventType: 'reaction-added' },
    ]));

    await manager._drainPendingMessages('reader', false);

    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});
