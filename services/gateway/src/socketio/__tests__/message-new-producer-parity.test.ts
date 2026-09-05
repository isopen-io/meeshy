/**
 * `message:new` a DEUX producteurs, et un seul décodeur par client.
 *
 * - `MessageHandler.broadcastNewMessage` sert le transport socket
 *   (`message:send`) ;
 * - `MeeshySocketIOManager._broadcastNewMessage` sert le transport REST/ZMQ
 *   (`POST /conversations/:id/messages`, retour du traducteur, messages
 *   d'agent, routes de lien).
 *
 * Les deux construisent leur charge utile À LA MAIN, chacun dans son fichier.
 * Chaque moitié est cohérente avec elle-même — c'est la « quatrième famille »
 * (cf. `services/gateway/CLAUDE.md`) : rien ne garde contre deux producteurs du
 * MÊME événement qui ne disent pas la même chose du MÊME message. Les témoins
 * existants sont eux-mêmes en JUMELLES (un par producteur, chacun dans le
 * harnais de sa classe), donc structurellement incapables de voir un désaccord.
 *
 * Ce fichier fait se rencontrer les DEUX PRODUCTIONS RÉELLES : un seul
 * `MeeshySocketIOManager` est construit, et il porte le vrai `MessageHandler`
 * (non doublé ici, contrairement au harnais du manager). Le même message
 * traverse les deux chemins, et les deux charges utiles sont confrontées.
 *
 * Les affirmations sont SÉPARÉES parce que la séparation EST le diagnostic :
 * enveloppe E2EE, plafond de vue-unique, provenance de transfert, réponse à un
 * post — la première qui tombe nomme la famille de champs perdue, là où un
 * unique `toEqual` laisserait chercher partout.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Doubles `jest.mock` — sortis dans `helpers/message-new-parity-mocks.ts`
// (issue #5263, cliquet de taille) pour ramener ce fichier sous #4531. Le
// SEUL effet attendu de cet import est l'enregistrement des mocks côté
// socket.io / services / handlers : il doit rester TEXTUELLEMENT avant
// l'import de `MeeshySocketIOManager` ci-dessous, sans quoi le manager
// importerait les VRAIS modules avant que leurs doubles n'existent.
// ---------------------------------------------------------------------------
import { getIoState } from './helpers/message-new-parity-mocks';

// ---------------------------------------------------------------------------
// Import under test (after all mocks are set up)
// ---------------------------------------------------------------------------
import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import {
  makeTranslationService,
  makePrisma,
  makeContractMessage,
  seedParticipantsAlways,
  seedParticipantsBySelect,
  CONVERSATION_ID,
} from './helpers/message-new-parity-fixtures';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  declaredConversationUpdatedFields,
  contractKeepsIndexSignature,
} from './conversation-updated-declared-fields';

describe('message:new — les DEUX producteurs disent la même chose du même message', () => {
  let manager: any;
  let messageHandler: any;
  let prisma: ReturnType<typeof makePrisma>;
  let ioState: ReturnType<typeof getIoState>;

  /** Charge utile `message:new` réellement passée à `emit`, par producteur. */
  function emittedMessageNew(): Record<string, unknown> | undefined {
    const call = (ioState.toEmit.mock.calls as any[]).find(
      (c) => c[0] === SERVER_EVENTS.MESSAGE_NEW
    );
    return call?.[1] as Record<string, unknown> | undefined;
  }

  async function payloadFromRestPath(message: unknown): Promise<Record<string, unknown>> {
    ioState.toEmit.mockClear();
    await manager.broadcastMessage(message as any, CONVERSATION_ID);
    const payload = emittedMessageNew();
    expect(payload).toBeDefined();
    return payload as Record<string, unknown>;
  }

  async function payloadFromSocketPath(message: unknown): Promise<Record<string, unknown>> {
    ioState.toEmit.mockClear();
    await messageHandler.broadcastNewMessage(message as any, CONVERSATION_ID);
    const payload = emittedMessageNew();
    expect(payload).toBeDefined();
    return payload as Record<string, unknown>;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    ioState = getIoState();
    ioState.to.mockClear();
    ioState.toEmit.mockClear();
    ioState.sockets.sockets.clear();
    ioState.sockets.adapter.rooms.clear();

    prisma = makePrisma();
    manager = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
    await manager.initialize();
    // Le VRAI handler que le manager a construit — pas un second exemplaire :
    // les deux productions confrontées ici sont exactement celles que la
    // passerelle exécute.
    messageHandler = manager.messageHandler;
    expect(typeof messageHandler?.broadcastNewMessage).toBe('function');
  });

  it("l'enveloppe E2EE voyage par les DEUX transports", async () => {
    const message = makeContractMessage();

    const socketPayload = await payloadFromSocketPath(message);
    const restPayload = await payloadFromRestPath(message);

    // Le chemin socket la sert déjà — c'est la référence du contrat.
    expect(socketPayload.isEncrypted).toBe(true);
    expect(socketPayload.encryptionMode).toBe('e2ee');
    expect(socketPayload.encryptedContent).toBe('Y2lwaGVydGV4dA==');

    // Le chemin REST est celui de TOUT message chiffré envoyé depuis iOS
    // (`socketFirstEligible` exclut les DM chiffrés). Sans ces champs, et avec
    // `content` vide par construction, le destinataire reçoit une bulle vide
    // qu'il ne sait même pas être chiffrée.
    expect(restPayload.isEncrypted).toBe(true);
    expect(restPayload.encryptionMode).toBe('e2ee');
    expect(restPayload.encryptedContent).toBe('Y2lwaGVydGV4dA==');
    expect(restPayload.encryptionMetadata).toEqual({ iv: 'aXY=', authTag: 'dGFn' });
    expect(restPayload.encryptedPayload).toEqual(
      expect.objectContaining({ ciphertext: 'Y2lwaGVydGV4dA==' })
    );
  });

  it('le plafond de vue-unique voyage par les DEUX transports', async () => {
    const message = makeContractMessage();

    const socketPayload = await payloadFromSocketPath(message);
    const restPayload = await payloadFromRestPath(message);

    // `isViewOnce` seul ne dit pas COMBIEN de vues restent : les deux moitiés
    // du réglage doivent voyager ensemble, sinon le lecteur applique un
    // plafond qu'il a inventé.
    expect(socketPayload.isViewOnce).toBe(true);
    expect(socketPayload.maxViewOnceCount).toBe(3);
    expect(restPayload.isViewOnce).toBe(true);
    expect(restPayload.maxViewOnceCount).toBe(3);
  });

  it("la provenance d'un transfert voyage par les DEUX transports", async () => {
    const message = makeContractMessage();

    const socketPayload = await payloadFromSocketPath(message);
    const restPayload = await payloadFromRestPath(message);

    expect(socketPayload.forwardedFromId).toBe('msg-forwarded-source');
    expect(socketPayload.forwardedFromConversationId).toBe('conv-forwarded-source');
    expect(restPayload.forwardedFromId).toBe('msg-forwarded-source');
    expect(restPayload.forwardedFromConversationId).toBe('conv-forwarded-source');
  });

  it('la réponse à un post voyage par les DEUX transports', async () => {
    const message = makeContractMessage();

    const socketPayload = await payloadFromSocketPath(message);
    const restPayload = await payloadFromRestPath(message);

    expect(socketPayload.storyReplyToId).toBe('post-999999999999');
    expect(restPayload.storyReplyToId).toBe('post-999999999999');
  });

  it("le pseudo d'un expéditeur SANS COMPTE voyage par les DEUX transports", async () => {
    // Un invité de lien partagé n'a pas de ligne `User` : son `displayName`
    // tient lieu de handle. Le chemin REST le sert déjà ; sans lui la bulle
    // temps réel affiche un « @ » vide.
    const message = makeContractMessage({
      sender: {
        id: 'anon-participantId',
        userId: null,
        displayName: 'Invité',
        avatar: null,
        type: 'anonymous',
        user: null,
      },
    });

    const socketPayload = await payloadFromSocketPath(message);
    const restPayload = await payloadFromRestPath(message);

    expect((restPayload.sender as Record<string, unknown>).username).toBe('Invité');
    expect((socketPayload.sender as Record<string, unknown>).username).toBe('Invité');
  });

  it('le sticker (#4823) voyage par les DEUX transports, hissé depuis `metadata.sticker`', async () => {
    // Le hoist vit dans `buildMessageNewPayload`, pas chez les producteurs :
    // `location` a montré ce que coûte un hoist recopié par transport. iOS
    // rend la décoration animée depuis ce champ ; sans lui sur l'un des deux
    // chemins, la moitié des destinataires ne verrait que le PNG de repli.
    const sticker = { templateId: 'love.heart', slots: { caption: 'Toi' }, animation: 'heartbeat', emoji: '❤️' };
    const message = makeContractMessage({ metadata: { sticker } });

    const socketPayload = await payloadFromSocketPath(message);
    const restPayload = await payloadFromRestPath(message);

    expect(socketPayload.sticker).toEqual(sticker);
    expect(restPayload.sticker).toEqual(sticker);
  });

  it('les DEUX producteurs déclarent le MÊME jeu de clés de contrat', async () => {
    // Le cliquet de la famille : il tombe le jour où un producteur gagne un
    // champ que l'autre n'a pas, quelle que soit la famille — y compris une
    // famille que ce fichier n'a pas encore nommée.
    const message = makeContractMessage();

    const socketKeys = Object.keys(await payloadFromSocketPath(message));
    const restKeys = Object.keys(await payloadFromRestPath(message));

    // `forwardedFrom` / `forwardedFromConversation` / `postReplyTo` /
    // `mentionedUsers` sont des ENRICHISSEMENTS que seul le chemin socket va
    // chercher en base ; ils ne sont pas au contrat de ce témoin, qui garde la
    // charge utile DÉRIVÉE DU MESSAGE. `replyTo` est délibérément de forme
    // différente entre les deux (cf. les commentaires jumeaux aux deux sites).
    // `metadata` et `originalContent` restent HORS contrat PAR DÉCISION, et la
    // décision est écrite ici pour qu'elle ne se relise pas comme un oubli :
    //   - `originalContent` n'est pas une colonne, il DUPLIQUE `content` sur le
    //     fil ; l'ajouter au chemin socket doublerait le poids texte du chemin
    //     le plus chaud du service pour un alias que le web lit en second.
    //   - `metadata` est l'enveloppe brute d'où le chemin socket HISSE ce dont
    //     les clients ont besoin ; seul le chemin REST produit les familles de
    //     messages système (`callSummary`, `joinNotice`) qu'iOS y lit encore.
    // Les retirer du chemin REST serait un RETRAIT, qui demande d'abord de
    // relever leurs consommateurs sur les trois clients — donc un lot à part.
    const enrichments = new Set([
      'forwardedFrom', 'forwardedFromConversation', 'postReplyTo', 'mentionedUsers',
      'trackingLinks', 'location', 'replyTo',
      'metadata', 'originalContent',
    ]);
    const contractOf = (keys: string[]) =>
      keys.filter((k) => !enrichments.has(k)).sort();

    expect(contractOf(restKeys)).toEqual(contractOf(socketKeys));
  });

  /**
   * La citation d'un message PROTÉGÉ, sur les DEUX producteurs.
   *
   * `replyTo` est HORS du contrat de parité ci-dessus — les deux transports lui
   * donnent délibérément deux formes — et c'est exactement ce qui a laissé le
   * producteur REST/ZMQ reconstruire sa citation champ par champ SANS un seul
   * champ de protection : répondre à un message à vue unique republiait son
   * texte EN CLAIR dans la bulle temps réel, pendant que le même fil rechargé
   * par REST affichait « 👁️ 💬 ». La FORME diverge ; ce que la charge a le
   * DROIT de transporter, non.
   */
  const messageCitantUnSecret = () => makeContractMessage({
    replyTo: {
      id: 'msg-cite-000000000',
      senderId: 'sender-participantId',
      content: 'le code du coffre est 4271',
      originalLanguage: 'fr',
      messageType: 'text',
      createdAt: new Date('2026-08-22T09:59:00.000Z'),
      isViewOnce: true,
      translations: { en: { text: 'the vault code is 4271', translationModel: 'basic', createdAt: new Date() } },
    },
  });

  const attendCitationMasquee = (payload: Record<string, unknown>) => {
    const citation = payload.replyTo as Record<string, unknown>;
    expect(citation).toBeDefined();
    expect(String(citation['content'])).not.toContain('4271');
    expect(citation['translations']).toBeUndefined();
    // La protection VOYAGE : sans elle, un client ne peut pas SAVOIR qu'il rend
    // le placeholder d'un secret plutôt qu'un texte.
    expect(citation['isViewOnce']).toBe(true);
  };

  it('ne republie pas le texte d’un message cité à vue unique — producteur socket', async () => {
    attendCitationMasquee(await payloadFromSocketPath(messageCitantUnSecret()));
  });

  it('ne republie pas le texte d’un message cité à vue unique — producteur REST/ZMQ', async () => {
    attendCitationMasquee(await payloadFromRestPath(messageCitantUnSecret()));
  });

  // -------------------------------------------------------------------------
  // `conversation:updated` — le JUMEAU que les deux mêmes producteurs émettent
  // -------------------------------------------------------------------------

  /**
   * Charge utile `conversation:updated` réellement passée à `emit`.
   *
   * Un payload PAR destinataire (le Prisme de la ligne de liste est résolu pour
   * le lecteur) : on prend la première, les clés et l'horodatage ne dépendant
   * pas du destinataire.
   */
  function emittedConversationUpdated(): Record<string, unknown> | undefined {
    const call = (ioState.toEmit.mock.calls as any[]).find(
      (c) => c[0] === SERVER_EVENTS.CONVERSATION_UPDATED
    );
    return call?.[1] as Record<string, unknown> | undefined;
  }

  /** Fabrique unique : `helpers/message-new-parity-fixtures.ts`. */
  function seedParticipants(): void {
    seedParticipantsAlways(prisma);
  }

  async function updatedFromSocketPath(message: unknown): Promise<Record<string, unknown>> {
    seedParticipants();
    ioState.toEmit.mockClear();
    await messageHandler.broadcastNewMessage(message as any, CONVERSATION_ID);
    const payload = emittedConversationUpdated();
    expect(payload).toBeDefined();
    return payload as Record<string, unknown>;
  }

  async function updatedFromRestPath(message: unknown): Promise<Record<string, unknown>> {
    seedParticipants();
    ioState.toEmit.mockClear();
    await manager.broadcastMessage(message as any, CONVERSATION_ID);
    const payload = emittedConversationUpdated();
    expect(payload).toBeDefined();
    return payload as Record<string, unknown>;
  }

  it('les DEUX producteurs émettent `lastMessageAt` comme une CHAÎNE ISO', async () => {
    const message = makeContractMessage();

    const socketPayload = await updatedFromSocketPath(message);
    const restPayload = await updatedFromRestPath(message);

    // `updatedAt`, son jumeau déclaré dans le MÊME payload, est une chaîne ISO
    // depuis toujours. `lastMessageAt` partait en objet `Date` — le fil ne le
    // montrait pas (l'encodeur par défaut de socket.io est `JSON.stringify`,
    // qui rend exactement `toISOString()`), mais le contrat le montrait :
    // c'est le seul horodatage du payload dont le type dépendait de l'encodeur
    // au lieu d'être énoncé. Un témoin en cours de route — celui-ci — voyait
    // donc une `Date` là où les trois clients reçoivent une chaîne.
    for (const payload of [socketPayload, restPayload]) {
      expect(typeof payload.lastMessageAt).toBe('string');
      expect(payload.lastMessageAt).toBe('2026-08-22T10:00:00.000Z');
    }
  });

  it("aucun producteur n'émet un champ que le contrat ne DÉCLARE pas", async () => {
    // Le cliquet du lot : voir l'en-tête de `conversation-updated-declared-fields.ts`.
    // Le typage seul ne peut pas le tenir — une clé écrite dans la source d'un
    // spread est invisible au contrôle des propriétés excédentaires, et les
    // quatre émetteurs composent tous leur charge par spread.
    const message = makeContractMessage();
    const declared = declaredConversationUpdatedFields();

    const socketKeys = Object.keys(await updatedFromSocketPath(message));
    const restKeys = Object.keys(await updatedFromRestPath(message));

    for (const [transport, keys] of [['socket', socketKeys], ['REST/ZMQ', restKeys]] as const) {
      const undeclared = keys.filter((k) => !declared.has(k)).sort();
      expect({ transport, undeclared }).toEqual({ transport, undeclared: [] });
    }
  });

  it('le contrat ne garde AUCUNE signature d\'index', () => {
    // Sans elle, « déclaré » veut dire quelque chose ; avec elle, tout l'est
    // d'avance et le témoin ci-dessus ne peut plus tomber.
    expect(contractKeepsIndexSignature()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// La TROISIÈME porte de sortie du même message : la file hors ligne
// ---------------------------------------------------------------------------

/**
 * `message:new` a trois portes de sortie, et une seule est DURABLE.
 *
 * Le salon de conversation ne sert que les sockets connectés ; les rooms
 * personnelles ne servent que ce qui est connecté aussi. Un destinataire
 * DÉCONNECTÉ n'apprend l'existence de ce message que par `RedisDeliveryQueue`,
 * rejouée à sa reconnexion (`_drainPendingMessages`). Rien d'autre ne le
 * rattrape : aucun client ne re-demande spontanément un message qu'il n'a
 * jamais vu passer.
 *
 * Les témoins ci-dessous ne portent donc pas sur la FORME de ce qui est enfilé
 * (le fichier au-dessus s'en charge pour la charge utile) mais sur une
 * propriété de STRUCTURE des deux producteurs :
 *
 * > la garantie durable ne doit dépendre d'aucune des synchronisations
 * > COSMÉTIQUES qui l'entourent — ni de leur succès, ni de leur liste.
 *
 * C'est la règle que le dépôt applique déjà à l'instantané de reconnexion
 * (`_emitPresenceSnapshot` place le drain APRÈS son `try`, « pour qu'un accroc
 * Mongo sur l'instantané (cosmétique) n'échoue jamais le rejeu (destructif) »,
 * cf. `services/gateway/CLAUDE.md`). Les deux producteurs d'envoi la violaient
 * en sens inverse, chacun à sa façon.
 */
describe('message:new — la file hors ligne ne dépend pas de la synchro de liste', () => {
  let manager: any;
  let messageHandler: any;
  let prisma: ReturnType<typeof makePrisma>;
  let ioState: ReturnType<typeof getIoState>;
  let queue: { enqueue: jest.Mock };

  /** Fabrique unique : `helpers/message-new-parity-fixtures.ts`. */
  function seedParticipants(): void {
    seedParticipantsBySelect(prisma);
  }

  /** L'entrée réellement déposée pour ce destinataire, si elle existe. */
  function queuedFor(queueKey: string): Record<string, unknown> | undefined {
    const call = (queue.enqueue.mock.calls as any[]).find((c) => c[0] === queueKey);
    return call?.[1] as Record<string, unknown> | undefined;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    ioState = getIoState();
    ioState.to.mockClear();
    ioState.toEmit.mockClear();
    // `jest.clearAllMocks()` efface les APPELS, jamais les IMPLÉMENTATIONS :
    // sans cette ligne, un témoin qui fait lever `emit` le ferait lever pour
    // tous les suivants.
    ioState.toEmit.mockImplementation(() => undefined);
    ioState.sockets.sockets.clear();
    ioState.sockets.adapter.rooms.clear();

    prisma = makePrisma();
    manager = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
    await manager.initialize();
    messageHandler = manager.messageHandler;

    queue = { enqueue: jest.fn().mockResolvedValue(undefined) as jest.Mock };
    manager.setDeliveryQueue(queue as any);

    seedParticipants();
  });

  afterEach(() => {
    ioState.toEmit.mockImplementation(() => undefined);
  });

  it("le producteur REST/ZMQ enfile même quand `conversation:updated` LÈVE", async () => {
    // `io.to(room).emit(...)` lève quand l'adaptateur ou l'encodeur est en
    // défaut — le dépôt le dit lui-même à l'endroit où il s'en garde
    // (`emitWithSeq`). Ce n'est donc pas une panne hypothétique.
    ioState.toEmit.mockImplementation((event: string) => {
      if (event === SERVER_EVENTS.CONVERSATION_UPDATED) throw new Error('adapter down');
      return undefined;
    });

    await manager.broadcastMessage(makeContractMessage() as any, CONVERSATION_ID);

    // Le re-tri de la liste est perdu — c'est cosmétique, le client le retrouve
    // au prochain chargement. Le message, lui, n'a pas d'autre voie.
    expect(queuedFor('peer-userId')).toEqual(
      expect.objectContaining({ messageId: 'msg-123456789012' })
    );
  });

  it('le producteur WS enfile même quand `conversation:updated` LÈVE', async () => {
    ioState.toEmit.mockImplementation((event: string) => {
      if (event === SERVER_EVENTS.CONVERSATION_UPDATED) throw new Error('adapter down');
      return undefined;
    });

    await messageHandler.broadcastNewMessage(makeContractMessage() as any, CONVERSATION_ID);

    expect(queuedFor('peer-userId')).toEqual(
      expect.objectContaining({ messageId: 'msg-123456789012' })
    );
  });

  it("le producteur REST/ZMQ enfile même quand la requête SUPERSET tombe", async () => {
    // La requête qui échoue est celle du PRISME de la ligne de liste
    // (`user` + `joinedAt`) ; la file, elle, n'a besoin que de `{id, userId}`
    // et sait la faire elle-même. Faire dépendre la seconde de la première,
    // c'est perdre le message pour une préférence de langue illisible.
    (prisma.participant.findMany as any).mockImplementation(async (args: any) => {
      if (args?.select?.joinedAt) throw new Error('superset select unavailable');
      return [
        { id: 'sender-participantId', userId: 'sender-userId' },
        { id: 'peer-participantId', userId: 'peer-userId' },
      ];
    });

    await manager.broadcastMessage(makeContractMessage() as any, CONVERSATION_ID);

    expect(queuedFor('peer-userId')).toEqual(
      expect.objectContaining({ messageId: 'msg-123456789012' })
    );
  });

  it('le producteur WS enfile même quand la requête SUPERSET tombe', async () => {
    (prisma.participant.findMany as any).mockImplementation(async (args: any) => {
      if (args?.select?.joinedAt) throw new Error('superset select unavailable');
      return [
        { id: 'sender-participantId', userId: 'sender-userId' },
        { id: 'peer-participantId', userId: 'peer-userId' },
      ];
    });

    await messageHandler.broadcastNewMessage(makeContractMessage() as any, CONVERSATION_ID);

    expect(queuedFor('peer-userId')).toEqual(
      expect.objectContaining({ messageId: 'msg-123456789012' })
    );
  });

  it("aucun producteur n'enfile pour l'EXPÉDITEUR", async () => {
    await manager.broadcastMessage(makeContractMessage() as any, CONVERSATION_ID);
    expect(queuedFor('sender-userId')).toBeUndefined();

    queue.enqueue.mockClear();
    await messageHandler.broadcastNewMessage(makeContractMessage() as any, CONVERSATION_ID);
    expect(queuedFor('sender-userId')).toBeUndefined();
  });

  it('les DEUX producteurs enfilent la MÊME entrée de file', async () => {
    // Parité sur les champs que le DRAIN lit — le nom rejoué (`eventType`),
    // l'identité de dédup (`messageId` / `dedupKey`) et l'adresse
    // (`conversationId`). La charge utile est gardée par les témoins de
    // parité au-dessus ; ici c'est le contrat de la FILE qui est en jeu.
    const contractOf = (entry: Record<string, unknown> | undefined) => ({
      messageId: entry?.messageId,
      conversationId: entry?.conversationId,
      eventType: entry?.eventType,
      dedupKey: entry?.dedupKey,
    });

    await manager.broadcastMessage(makeContractMessage() as any, CONVERSATION_ID);
    const rest = contractOf(queuedFor('peer-userId'));

    queue.enqueue.mockClear();
    await messageHandler.broadcastNewMessage(makeContractMessage() as any, CONVERSATION_ID);
    const socket = contractOf(queuedFor('peer-userId'));

    expect(rest).toEqual(socket);
    expect(socket.eventType).toBe('new');
  });

  it("#3614 — le producteur REST/ZMQ enfile un message SANS expéditeur (agent, système)", async () => {
    // `Message.senderId` est requis en base (`schema.prisma`), mais l'objet
    // JS reçu par ce transport peut en manquer — un message d'agent ou
    // système construit sans identité de sender. `if (senderId)` englobait
    // TOUT le bloc — participants, enfilage durable, cosmétique — donc un tel
    // message n'était JAMAIS rejoué aux absents : la seule voie par laquelle
    // un destinataire déconnecté apprend son existence disparaissait
    // silencieusement. Le chemin WS (`MessageHandler.broadcastNewMessage`,
    // ci-dessous) n'a jamais posé cette garde.
    const messageSansExpediteur = makeContractMessage({ senderId: undefined, sender: undefined });

    await manager.broadcastMessage(messageSansExpediteur as any, CONVERSATION_ID);

    expect(queuedFor('peer-userId')).toEqual(
      expect.objectContaining({ messageId: 'msg-123456789012' })
    );
  });

  it('le producteur WS enfile aussi un message SANS expéditeur (parité)', async () => {
    const messageSansExpediteur = makeContractMessage({ senderId: undefined, sender: undefined });

    await messageHandler.broadcastNewMessage(messageSansExpediteur as any, CONVERSATION_ID);

    expect(queuedFor('peer-userId')).toEqual(
      expect.objectContaining({ messageId: 'msg-123456789012' })
    );
  });
});
