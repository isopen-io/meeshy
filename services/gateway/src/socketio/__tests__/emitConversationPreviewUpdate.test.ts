import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { LAST_MESSAGE_PREVIEW_MAX_LENGTH } from '../../routes/conversations/utils/last-message-preview';
import { emitConversationPreviewUpdate } from '../emitConversationPreviewUpdate';
import { declaredConversationUpdatedFields } from './conversation-updated-declared-fields';

type Emitted = { room: string; event: string; payload: any };

function makeIo(sink: Emitted[]) {
  return {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        sink.push({ room, event, payload });
      },
    }),
  };
}

function makePrisma(
  participants: Array<{ id?: string; userId: string | null; user?: unknown }>,
  latest:
    | ({ id: string; content: string | null; senderId: string; createdAt: Date } & {
        translations?: unknown;
        originalLanguage?: string | null;
      })
    | null,
) {
  return {
    participant: { findMany: jest.fn(async () => participants) },
    message: { findFirst: jest.fn(async () => latest) },
    // Personne n'a rien masqué : la sonde du masquage personnel ne trouve rien
    // et l'aperçu global est servi tel quel. C'est le cas de l'écrasante
    // majorité des diffusions, donc le défaut de ce double.
    userMessageDeletion: { findMany: jest.fn(async () => []) },
    userConversationPreferences: { findMany: jest.fn(async () => []) },
  } as any;
}

describe('emitConversationPreviewUpdate', () => {
  const latest = {
    id: 'msg-latest',
    content: 'the current last message',
    senderId: 'participant-A',
    createdAt: new Date('2026-07-09T10:00:00Z'),
  };

  it('fans conversation:updated to every active participant user room with the recomputed latest preview', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma(
      [
        { id: 'p-A', userId: 'user-A' },
        { id: 'p-B', userId: 'user-B' },
        { id: 'p-C', userId: 'user-C' },
      ],
      latest,
    );

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted.map((e) => e.room).sort()).toEqual(['user:user-A', 'user:user-B', 'user:user-C']);
    for (const e of emitted) {
      expect(e.event).toBe(SERVER_EVENTS.CONVERSATION_UPDATED);
      expect(e.payload.conversationId).toBe('conv-1');
      expect(e.payload.lastMessageId).toBe('msg-latest');
      expect(e.payload.lastMessagePreview).toBe('the current last message');
      expect(e.payload.senderId).toBe('participant-A');
      // ConversationUpdatedEventData requires `updatedBy` — the User.id of whoever
      // triggered the edit/delete, NOT the (participant) senderId of the preview.
      expect(e.payload.updatedBy).toEqual({ id: 'user-editor' });
    }
    // Recompute must scope to non-deleted messages.
    expect((prisma.message.findFirst as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { conversationId: 'conv-1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  // Ce test affirmait l'inverse : « skips anonymous participants (no userId) ».
  // C'était le défaut, pas l'intention. Un participant sans compte a bien une
  // room personnelle — `AuthHandler` la nomme d'après son `Participant.id` — et
  // c'est par elle seule qu'il reçoit quoi que ce soit une fois sorti de la vue
  // conversation. Le sauter laissait un invité de lien partagé avec une ligne
  // de liste figée sur le texte d'avant l'édition, indéfiniment.
  it('addresses an accountless participant by its participant id, and dedupes repeated userIds', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma(
      [
        { id: 'p-A', userId: 'user-A' },
        { id: 'p-anon', userId: null },
        { id: 'p-A2', userId: 'user-A' },
      ],
      latest,
    );

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted.map((e) => e.room)).toEqual(['user:user-A', 'user:p-anon']);
  });

  it('selects the participant id, without which the fallback identity cannot be read', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([{ id: 'p-A', userId: 'user-A' }], latest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect((prisma.participant.findMany as jest.Mock).mock.calls[0][0]).toMatchObject({
      select: { id: true, userId: true },
    });
  });

  it('emits a null preview when the last message of the conversation was deleted', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([{ id: 'p-A', userId: 'user-A' }], null);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload.lastMessageId).toBeNull();
    expect(emitted[0].payload.lastMessagePreview).toBeNull();
    // Deleting the last message still carries the actor so clients can attribute
    // the change even when there is no surviving message to fall back on.
    expect(emitted[0].payload.updatedBy).toEqual({ id: 'user-editor' });
  });

  it('Lot 3 : restitue `location` quand le dernier message est geolocalise (et un contenu vide n est pas fabrique)', async () => {
    const GEO = { latitude: 48.8566, longitude: 2.3522, name: 'Tour Eiffel', address: null, category: null };
    const emitted: Emitted[] = [];
    const geoLatest: any = { ...latest, content: '', metadata: { location: GEO } };
    const prisma = makePrisma([{ id: 'p-A', userId: 'user-A' }], geoLatest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted[0].payload.location).toMatchObject({ latitude: 48.8566, name: 'Tour Eiffel' });
    // Constat, pas une exigence : content vide reste vide, aucun texte de
    // repli fabriqué côté serveur — au client de décider du rendu.
    expect(emitted[0].payload.lastMessagePreview).toBe('');
  });

  // --- Prisme Linguistique de la ligne de liste (cycle 69) ---------------
  //
  // Le défaut que ces témoins ferment : `GET /conversations` hydrate la ligne
  // avec `lastMessageTranslations` (la carte du prisme du lecteur), le client
  // PRÉFÈRE cette traduction à `lastMessagePreview`, et une édition périme la
  // colonne côté serveur (`translations: null`, routes/messages.ts) sans jamais
  // le dire sur le fil. La ligne restait donc sur l'ANCIEN texte traduit,
  // indéfiniment, jusqu'à un rechargement complet de la liste.
  const FR_READER = {
    id: 'p-fr',
    userId: 'user-fr',
    user: { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
  };
  const ES_READER = {
    id: 'p-es',
    userId: 'user-es',
    user: { systemLanguage: 'es', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
  };
  const englishLatest = {
    ...latest,
    content: 'Hello',
    originalLanguage: 'en',
    translations: {
      fr: { text: 'Bonjour', targetLanguage: 'fr' },
      es: { text: 'Hola', targetLanguage: 'es' },
    },
  };

  it('carries the reader-scoped preview translations and the original language', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([FR_READER], englishLatest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted[0].payload.lastMessageOriginalLanguage).toBe('en');
    expect(emitted[0].payload.lastMessageTranslations).toEqual({ fr: 'Bonjour' });
  });

  it('gives each recipient ITS OWN prism, never one payload shared by the room', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([FR_READER, ES_READER], englishLatest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    const byRoom = new Map(emitted.map((e) => [e.room, e.payload]));
    expect(byRoom.get('user:user-fr').lastMessageTranslations).toEqual({ fr: 'Bonjour' });
    expect(byRoom.get('user:user-es').lastMessageTranslations).toEqual({ es: 'Hola' });
  });

  // LE témoin du défaut. Une édition remet `Message.translations` à null dans la
  // MÊME écriture ; l'événement doit transporter ce vide pour que le client
  // périme sa carte. Un client ne peut pas le déduire : l'édition garde le même
  // `lastMessageId`, donc « vider quand l'id change » laisse passer exactement
  // ce cas — et vider inconditionnellement casserait le chemin d'envoi (cycle 65).
  it('carries a null translations map after an edit, so the client can expire its stale one', async () => {
    const emitted: Emitted[] = [];
    const editedLatest = { ...latest, content: 'Hello (edited)', originalLanguage: 'en', translations: null };
    const prisma = makePrisma([FR_READER], editedLatest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted[0].payload.lastMessagePreview).toBe('Hello (edited)');
    expect(emitted[0].payload.lastMessageTranslations).toBeNull();
    expect(emitted[0].payload.lastMessageOriginalLanguage).toBe('en');
  });

  it('selects the prism inputs it resolves from — the columns and the reader preferences', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([FR_READER], englishLatest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect((prisma.message.findFirst as jest.Mock).mock.calls[0][0]).toMatchObject({
      select: { translations: true, originalLanguage: true },
    });
    expect((prisma.participant.findMany as jest.Mock).mock.calls[0][0]).toMatchObject({
      select: { user: { select: { systemLanguage: true, deviceLocale: true } } },
    });
  });

  it('serves a null map to an accountless participant rather than another reader prism', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([{ id: 'p-anon', userId: null, user: null }], englishLatest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted[0].room).toBe('user:p-anon');
    expect(emitted[0].payload.lastMessageTranslations).toBeNull();
  });

  // --- Portée d'un rafraîchissement déclenché par une traduction (cycle 73) ---
  //
  // Une traduction qui atterrit N'EST PAS une édition : elle ne change l'aperçu
  // que pour les lecteurs qui LISENT cette langue, et seulement tant que le
  // message traduit est encore le dernier de la conversation. Sans ces deux
  // bornes, le chemin `message:translation` re-diffuserait la ligne entière à
  // tout le monde, une fois par langue de la conversation, sur le chemin le plus
  // chaud du service.
  it("n'émet aucun champ que le contrat ne DÉCLARE pas", async () => {
    // Le TROISIÈME émetteur de `conversation:updated`. Ses deux jumeaux
    // message-driven portent le même cliquet dans
    // `message-new-producer-parity.test.ts` — l'écart entre les trois est
    // exactement ce qui avait laissé `location` manquer sur un seul d'entre eux
    // (#3122), et le typage ne peut pas le voir : les trois composent leur
    // charge par spread, et une clé venue d'un spread est invisible au contrôle
    // des propriétés excédentaires. Voir `conversation-updated-declared-fields.ts`.
    const emitted: Emitted[] = [];
    const prisma = makePrisma([{ id: 'p-A', userId: 'user-A' }], latest);
    const declared = declaredConversationUpdatedFields();

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted).not.toHaveLength(0);
    for (const e of emitted) {
      const undeclared = Object.keys(e.payload).filter((k) => !declared.has(k)).sort();
      expect(undeclared).toEqual([]);
    }
  });

  it('émet `lastMessageAt` comme une CHAÎNE ISO, comme son jumeau `updatedAt`', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([{ id: 'p-A', userId: 'user-A' }], latest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted[0].payload.lastMessageAt).toBe('2026-07-09T10:00:00.000Z');
  });

  describe('scope', () => {
    it('skips the whole fan-out when the recomputed latest is not the message the caller scoped to', async () => {
      const emitted: Emitted[] = [];
      const prisma = makePrisma([FR_READER], englishLatest);

      await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor', undefined, {
        onlyIfLatestIs: 'msg-older',
      });

      expect(emitted).toEqual([]);
    });

    it('fans out normally when the scoped message IS the recomputed latest', async () => {
      const emitted: Emitted[] = [];
      const prisma = makePrisma([FR_READER], englishLatest);

      await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor', undefined, {
        onlyIfLatestIs: 'msg-latest',
      });

      expect(emitted).toHaveLength(1);
      expect(emitted[0].payload.lastMessageTranslations).toEqual({ fr: 'Bonjour' });
    });

    // Le lecteur espagnol reçoit exactement la même carte qu'avant l'arrivée du
    // français : un octet identique, donc un événement pur gaspillage. Le
    // filtrer n'est pas une optimisation opportuniste — c'est la définition de
    // « qui est concerné par CETTE traduction ».
    it('emits only to the readers whose own prism carries the language that just landed', async () => {
      const emitted: Emitted[] = [];
      const prisma = makePrisma([FR_READER, ES_READER], englishLatest);

      await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor', undefined, {
        onlyIfPreviewCarriesLanguage: 'fr',
      });

      expect(emitted.map((e) => e.room)).toEqual(['user:user-fr']);
      expect(emitted[0].payload.lastMessageTranslations).toEqual({ fr: 'Bonjour' });
    });

    it('matches the landed language case-insensitively, as the prism does everywhere else', async () => {
      const emitted: Emitted[] = [];
      const prisma = makePrisma([FR_READER, ES_READER], englishLatest);

      await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor', undefined, {
        onlyIfPreviewCarriesLanguage: 'FR',
      });

      expect(emitted.map((e) => e.room)).toEqual(['user:user-fr']);
    });

    // Règle #1 du Prisme : pas de traduction utile ⇒ l'original. Un participant
    // sans carte n'a rien appris de cette traduction.
    it('never emits to an accountless participant, whose map is null by construction', async () => {
      const emitted: Emitted[] = [];
      const prisma = makePrisma([{ id: 'p-anon', userId: null, user: null }], englishLatest);

      await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor', undefined, {
        onlyIfPreviewCarriesLanguage: 'fr',
      });

      expect(emitted).toEqual([]);
    });

    it('leaves the edit/delete callers untouched — no scope means every participant, whatever the latest', async () => {
      const emitted: Emitted[] = [];
      const prisma = makePrisma([FR_READER, ES_READER], englishLatest);

      await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

      expect(emitted.map((e) => e.room).sort()).toEqual(['user:user-es', 'user:user-fr']);
    });
  });

  // Les deux moitiés d'un même aperçu doivent porter le MÊME plafond. La carte
  // de traductions le respectait déjà (`buildLastMessagePreviewTranslations`),
  // l'aperçu de base partait brut : sous le Prisme, un lecteur servi par une
  // traduction recevait 300 points de code et son voisin servi par l'original
  // recevait le message entier, pour la même rangée de liste.
  it('caps the base preview at the same length as the translated previews it ships with', async () => {
    const emitted: Emitted[] = [];
    const hugeLatest = {
      ...latest,
      content: 'a'.repeat(LAST_MESSAGE_PREVIEW_MAX_LENGTH + 500),
      originalLanguage: 'en',
      translations: { fr: { text: 'b'.repeat(LAST_MESSAGE_PREVIEW_MAX_LENGTH + 500), targetLanguage: 'fr' } },
    };
    const prisma = makePrisma([FR_READER], hugeLatest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted[0].payload.lastMessagePreview).toHaveLength(LAST_MESSAGE_PREVIEW_MAX_LENGTH);
    expect(emitted[0].payload.lastMessageTranslations.fr).toHaveLength(LAST_MESSAGE_PREVIEW_MAX_LENGTH);
  });

  it('is a no-op when the Socket.IO layer is unavailable', async () => {
    const prisma = makePrisma([{ id: 'p-A', userId: 'user-A' }], latest);
    await expect(emitConversationPreviewUpdate(prisma, null, 'conv-1', 'user-editor')).resolves.toBeUndefined();
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  // ── Masquage personnel du dernier message ────────────────────────────────
  //
  // `GET /conversations` résout déjà l'aperçu sous le masquage personnel
  // (`resolveVisibleLastMessages`). Ce fan-out temps réel recalculait UN dernier
  // message global et le poussait à tout le monde : un lecteur qui avait fait
  // « supprimer pour moi » sur ce message se le voyait REVENIR dans sa ligne de
  // liste dès la mutation suivante de la conversation.
  function makeHidingPrisma(args: {
    participants: Array<{ id?: string; userId: string | null; user?: unknown }>;
    latest: any;
    hiddenBy?: string[];
    clearedBy?: string[];
    replacement?: any;
  }) {
    const findFirst = jest.fn(async (q: any) => {
      // La requête de repli porte le masquage du lecteur ; la requête globale non.
      const isFallback = q?.where?.id !== undefined || q?.where?.createdAt !== undefined;
      return isFallback ? (args.replacement ?? null) : args.latest;
    });
    return {
      participant: { findMany: jest.fn(async () => args.participants) },
      message: { findFirst },
      userMessageDeletion: {
        // Sert la sonde (`{ userId }`) ET le chargement complet du masquage des
        // seuls lecteurs concernés (`{ userId, messageId }`).
        findMany: jest.fn(async () =>
          (args.hiddenBy ?? []).map((userId) => ({ userId, messageId: args.latest?.id })),
        ),
      },
      userConversationPreferences: {
        findMany: jest.fn(async () =>
          (args.clearedBy ?? []).map((userId) => ({ userId, clearHistoryBefore: new Date('2030-01-01T00:00:00Z') })),
        ),
      },
    } as any;
  }

  it('never pushes back a last message the reader deleted for themselves', async () => {
    const emitted: Emitted[] = [];
    const prisma = makeHidingPrisma({
      participants: [
        { id: 'p-A', userId: 'user-A' },
        { id: 'p-B', userId: 'user-B' },
      ],
      latest,
      hiddenBy: ['user-A'],
      replacement: {
        id: 'msg-previous',
        content: 'the one before',
        senderId: 'participant-B',
        createdAt: new Date('2026-07-09T09:00:00Z'),
      },
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    const toA = emitted.find((e) => e.room === 'user:user-A')!;
    const toB = emitted.find((e) => e.room === 'user:user-B')!;
    // B n'a rien masqué : il reçoit l'aperçu global, inchangé.
    expect(toB.payload.lastMessageId).toBe('msg-latest');
    expect(toB.payload.lastMessagePreview).toBe('the current last message');
    // A l'a masqué : il reçoit SON dernier message visible, jamais celui-là.
    expect(toA.payload.lastMessageId).toBe('msg-previous');
    expect(toA.payload.lastMessagePreview).toBe('the one before');
    expect(toA.payload.senderId).toBe('participant-B');
    // CHAÎNE ISO, pas `Date` : ce témoin assertait la valeur d'AVANT
    // sérialisation, que le fil n'a jamais portée — l'encodeur de socket.io
    // rend `toISOString()`. C'est exactement l'écart que déclarer le champ a
    // rendu visible : tant que `lastMessageAt` n'était pas au contrat, son type
    // était décidé par l'encodeur, et un témoin en cours de route pouvait
    // attester une forme que personne ne reçoit.
    expect(toA.payload.lastMessageAt).toBe('2026-07-09T09:00:00.000Z');
  });

  it('serves a blank preview to a reader who cleared the whole history', async () => {
    const emitted: Emitted[] = [];
    const prisma = makeHidingPrisma({
      participants: [{ id: 'p-A', userId: 'user-A' }],
      latest,
      clearedBy: ['user-A'],
      replacement: null,
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload.lastMessageId).toBeNull();
    expect(emitted[0].payload.lastMessagePreview).toBeNull();
    expect(emitted[0].payload.lastMessageAt).toBeNull();
  });

  it('asks only whether THIS preview is hidden, never for the reader s whole deletion history', async () => {
    const prisma = makeHidingPrisma({
      participants: [{ id: 'p-A', userId: 'user-A' }],
      latest,
    });

    await emitConversationPreviewUpdate(prisma, makeIo([]), 'conv-1', 'user-editor');

    expect((prisma.userMessageDeletion.findMany as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { messageId: 'msg-latest', userId: { in: ['user-A'] } },
    });
  });

  it('costs nothing when the conversation has no message left to hide', async () => {
    const prisma = makeHidingPrisma({
      participants: [{ id: 'p-A', userId: 'user-A' }],
      latest: null,
    });

    await emitConversationPreviewUpdate(prisma, makeIo([]), 'conv-1', 'user-editor');

    expect(prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
    expect(prisma.userConversationPreferences.findMany).not.toHaveBeenCalled();
  });

  it('never throws and reports through onError when the query fails', async () => {
    const err = new Error('db down');
    const prisma = {
      participant: { findMany: jest.fn(async () => { throw err; }) },
      message: { findFirst: jest.fn(async () => latest) },
    } as any;
    const onError = jest.fn();

    await expect(
      emitConversationPreviewUpdate(prisma, makeIo([]), 'conv-1', 'user-editor', onError),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(err);
  });
});

/**
 * Troisième borne du fan-out : le LECTEUR.
 *
 * Les deux premières (`onlyIfLatestIs`, `onlyIfPreviewCarriesLanguage`) bornent
 * l'INSTANT et la LANGUE. Celle-ci borne l'AUDIENCE, et elle existe pour la
 * famille d'appelants que ce module n'avait pas encore : un masquage PERSONNEL
 * (« supprimer pour moi », « effacer l'historique »). Un tel geste ne change la
 * ligne de liste que de celui qui l'a fait — le dernier message global n'a pas
 * bougé d'un octet, donc tous les autres participants recevraient un payload
 * identique à l'octet près, à raison d'un événement chacun par geste.
 *
 * Elle borne aussi la SONDE : sans elle, `resolvePersonalPreviewOverrides`
 * demanderait à la base si CHAQUE participant a masqué cet aperçu, alors qu'un
 * seul vient de le faire et qu'on sait lequel.
 */
describe('emitConversationPreviewUpdate — scope.onlyForReaderUserId', () => {
  const latest = {
    id: 'msg-latest',
    content: 'the current last message',
    senderId: 'participant-A',
    createdAt: new Date('2026-08-15T10:00:00Z'),
  };

  function makeReaderPrisma(args: {
    participants: Array<{ id?: string; userId: string | null; user?: unknown }>;
    latest: any;
    hiddenBy?: string[];
    replacement?: any;
  }) {
    const findFirst = jest.fn(async (q: any) => {
      const isFallback = q?.where?.id !== undefined || q?.where?.createdAt !== undefined;
      return isFallback ? (args.replacement ?? null) : args.latest;
    });
    return {
      participant: { findMany: jest.fn(async () => args.participants) },
      message: { findFirst },
      userMessageDeletion: {
        findMany: jest.fn(async () =>
          (args.hiddenBy ?? []).map((userId) => ({ userId, messageId: args.latest?.id })),
        ),
      },
      userConversationPreferences: { findMany: jest.fn(async () => []) },
    } as any;
  }

  it('n adresse QUE la room du lecteur nommé, jamais celles de ses pairs', async () => {
    const emitted: Emitted[] = [];
    const prisma = makeReaderPrisma({
      participants: [
        { id: 'p-A', userId: 'user-A' },
        { id: 'p-B', userId: 'user-B' },
        { id: 'p-anon', userId: null },
      ],
      latest,
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-A', undefined, {
      onlyForReaderUserId: 'user-A',
    });

    expect(emitted.map((e) => e.room)).toEqual(['user:user-A']);
  });

  it('ne sonde le masquage personnel que pour ce lecteur', async () => {
    const prisma = makeReaderPrisma({
      participants: [
        { id: 'p-A', userId: 'user-A' },
        { id: 'p-B', userId: 'user-B' },
      ],
      latest,
    });

    await emitConversationPreviewUpdate(prisma, makeIo([]), 'conv-1', 'user-A', undefined, {
      onlyForReaderUserId: 'user-A',
    });

    expect((prisma.userMessageDeletion.findMany as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { messageId: 'msg-latest', userId: { in: ['user-A'] } },
    });
  });

  it('sert au lecteur borné SON propre dernier message visible', async () => {
    const emitted: Emitted[] = [];
    const prisma = makeReaderPrisma({
      participants: [
        { id: 'p-A', userId: 'user-A' },
        { id: 'p-B', userId: 'user-B' },
      ],
      latest,
      hiddenBy: ['user-A'],
      replacement: {
        id: 'msg-previous',
        content: 'the one before',
        senderId: 'participant-B',
        createdAt: new Date('2026-08-15T09:00:00Z'),
      },
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-A', undefined, {
      onlyForReaderUserId: 'user-A',
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].room).toBe('user:user-A');
    expect(emitted[0].payload.lastMessageId).toBe('msg-previous');
    expect(emitted[0].payload.lastMessagePreview).toBe('the one before');
  });

  it('n émet rien quand le lecteur nommé n est plus participant actif', async () => {
    const emitted: Emitted[] = [];
    const prisma = makeReaderPrisma({
      participants: [{ id: 'p-B', userId: 'user-B' }],
      latest,
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-A', undefined, {
      onlyForReaderUserId: 'user-A',
    });

    expect(emitted).toEqual([]);
    expect(prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
  });

  it('sans la borne, le fan-out reste complet — la borne est un CHOIX de l appelant', async () => {
    const emitted: Emitted[] = [];
    const prisma = makeReaderPrisma({
      participants: [
        { id: 'p-A', userId: 'user-A' },
        { id: 'p-B', userId: 'user-B' },
      ],
      latest,
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-A');

    expect(emitted.map((e) => e.room).sort()).toEqual(['user:user-A', 'user:user-B']);
  });

});
