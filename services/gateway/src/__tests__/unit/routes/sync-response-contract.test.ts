/**
 * `GET /sync` — LE CONTRAT DE RÉPONSE (cycle 95).
 *
 * Extrait de `sync.test.ts` par #16586, et pour la raison que le cliquet de
 * taille énonce lui-même : « un fichier légitimement découpé fait disparaître
 * son nom sans faire rougir la garde ». Le fichier d'origine portait 1 616
 * lignes — 416 au-dessus du plafond DUR, donc interdit d'ajout — et la
 * correction de deux doubles qui répondaient à l'ORDRE D'APPEL le faisait
 * grossir de dix-sept lignes. Découper était la seule réponse qui ne soit ni
 * un renoncement ni un contournement.
 *
 * Ce que ce fichier garde est une question, et elle est distincte de celles qui
 * restent chez son voisin (validation, curseurs, checkpoint, tombstones,
 * budget d'octets, sessions anonymes, plancher d'historique) :
 *
 *   « que rend la requête, et que passe le gestionnaire au SÉRIALISEUR ? »
 *
 * Jusqu'au cycle 95 cette suite mesurait le `select` — « la projection charge-t-elle
 * bien les clés rendables ? » — et jamais la RÉPONSE. Les deux ne disent pas la
 * même chose : entre la ligne Prisma et le fil il y a `fast-json-stringify`,
 * qui ne laisse passer que le DÉCLARÉ. Tant que `/sync` n'avait aucun
 * `schema.response`, la distinction était sans objet — rien n'était gouverné,
 * donc rien n'était faux. Gouverner crée la possibilité même du désaccord, et
 * les témoins ci-dessous sont les désaccords qui étaient là depuis le début.
 *
 * Ils assertent sur les VALEURS servies, jamais sur `statusCode` : la route
 * rendait 200 pendant toute la vie des deux défauts.
 *
 * Le harnais est propre à ce fichier, comme celui de `sync-collections.test.ts`
 * et de `sync-location.test.ts` : c'est la maison, et un harnais partagé est un
 * lot à lui — #16598, qui mesure la duplication (douze suites de `/sync`, douze
 * `makePrisma`) et ce qu'elle a coûté le jour de ce découpage.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439000';

type TestAuthContext = { userId?: string; type?: 'user' | 'anonymous'; participantId?: string };

let mockAuthContext: TestAuthContext = { userId: USER_ID, type: 'user' };

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (req: FastifyRequest) => {
    (req as unknown as { authContext: TestAuthContext }).authContext = mockAuthContext;
  },
}));

import { syncRoutes, SYNC_MESSAGE_RENDERABLE_KEYS } from '../../../routes/sync';
import { syncMessageSelect } from '../../../routes/sync/messages';

type PrismaStub = {
  participant: { findMany: jest.Mock };
  message: { findMany: jest.Mock };
  conversationShareLink: { findMany: jest.Mock };
  userEventSeq: { findUnique: jest.Mock };
  userMessageDeletion: { findMany: jest.Mock };
  userConversationPreferences: { findMany: jest.Mock };
};

function makePrisma(over: Partial<Record<string, unknown>> = {}): PrismaStub {
  return {
    participant: { findMany: jest.fn<any>().mockResolvedValue([{ conversationId: 'c1' }]) },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    ...over,
  } as PrismaStub;
}

async function buildApp(prisma: PrismaStub): Promise<FastifyInstance> {
  mockAuthContext = { userId: USER_ID, type: 'user' };
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

const SINCE = '2026-07-01T00:00:00.000Z';

const READER_PARTICIPANT_ID = '507f1f77bcf86cd799439bbb';

/**
 * Un magasin de messages qui répond par CONTENU de `where`, jamais par ordre
 * d'appel (#16586) : la coupure de CITATION (#8630) ouvre une lecture
 * d'ancêtres (`id: { in: [...] }`), et une chaîne de `mockResolvedValueOnce`
 * lui servait la page des TOMBSTONES. Un double qui répond à l'ordre atteste un
 * ordre, pas un comportement.
 */
const messageStoreByWhere = (changed: unknown[], deleted: unknown[]) =>
  jest.fn<any>().mockImplementation((args: any) => {
    const where = args?.where ?? {};
    if (where.deletedAt && typeof where.deletedAt === 'object') return Promise.resolve(deleted);
    return Promise.resolve(where.id?.in ? [] : changed);
  });

/**
 * La ligne que rend RÉELLEMENT `prisma.message.findMany` sous `syncMessageSelect`.
 *
 * `translations` y est une CARTE (`schema.prisma` : colonne `Json?`, « map:
 * langue -> données »), et `attachments[].reactions` la relation BRUTE que
 * `attachmentMediaSelect` charge. C'est la question qui départage un témoin
 * d'une fiction : non pas « à quoi ressemble cette réponse ? » mais « que rend
 * la requête, et que passe le gestionnaire au sérialiseur ? ».
 */
const syncMessageRow = () => ({
  id: 'm-contract-1',
  conversationId: 'c1',
  senderId: 'p-sender',
  content: 'bonjour',
  clientMessageId: 'cid_9f1c',
  originalLanguage: 'fr',
  translations: {
    en: {
      text: 'hello',
      translationModel: 'basic',
      confidenceScore: 0.93,
      createdAt: '2026-07-02T10:05:00.000Z',
    },
  },
  messageType: 'audio',
  messageSource: 'user',
  metadata: { postReplyTo: { id: 'post-1' } },
  isEdited: true,
  editedAt: new Date('2026-07-02T10:30:00.000Z'),
  replyToId: 'm-parent',
  reactionSummary: { '❤️': 2 },
  reactionCount: 2,
  validatedMentions: ['bob'],
  createdAt: new Date('2026-07-02T10:00:00.000Z'),
  updatedAt: new Date('2026-07-02T10:30:00.000Z'),
  attachments: [
    {
      id: 'att-1',
      messageId: 'm-contract-1',
      fileName: 'voix.m4a',
      originalName: 'voix.m4a',
      mimeType: 'audio/mp4',
      fileSize: 20480,
      fileUrl: 'https://cdn/voix.m4a',
      thumbnailUrl: null,
      thumbHash: 'AQIDBA==',
      imageVariants: null,
      width: null,
      height: null,
      duration: 4200,
      bitrate: 64000,
      sampleRate: 48000,
      codec: 'aac',
      channels: 1,
      fps: null,
      videoCodec: null,
      pageCount: null,
      lineCount: null,
      metadata: { waveform: [1, 2, 3] },
      uploadedBy: 'u-sender',
      isAnonymous: false,
      createdAt: new Date('2026-07-02T10:00:00.000Z'),
      transcription: { type: 'audio', text: 'bonjour', language: 'fr', confidence: 0.9, source: 'whisper' },
      // Les traductions d'une pièce jointe restent une CARTE par langue —
      // c'est leur forme canonique, à ne pas confondre avec celle du message.
      // Ses trois clés obligatoires (`type`, `transcription`, `createdAt`) ne
      // sont pas décoratives : `messageAttachmentSchema` les déclare `required`,
      // et fast-json-stringify REFUSE de sérialiser une entrée qui en manque
      // une. Une charge inventée l'aurait découvert en 500, pas en assertion.
      translations: {
        en: {
          type: 'audio',
          transcription: 'hello',
          url: 'https://cdn/voix-en.m4a',
          durationMs: 4200,
          createdAt: '2026-07-02T10:05:00.000Z',
        },
      },
      reactions: [
        { emoji: '👍', participantId: READER_PARTICIPANT_ID },
        { emoji: '👍', participantId: 'p-other' },
      ],
    },
  ],
  sender: {
    id: 'p-sender',
    userId: 'u-sender',
    displayName: 'Emetteur',
    avatar: null,
    type: 'user',
    role: 'member',
    language: 'fr',
    user: { id: 'u-sender', username: 'emetteur', displayName: 'Emetteur', avatar: null },
  },
});

/** Le lecteur EST participant de `c1` — sa ligne porte l'id que les réactions
 *  de pièce jointe doivent reconnaître comme « les siennes ». */
const readerMembership = () => ({
  id: READER_PARTICIPANT_ID,
  conversationId: 'c1',
  joinedAt: new Date('2026-06-15T00:00:00Z'),
  shareLinkId: null,
  permissions: null,
  anonymousSession: null,
});

async function fetchSyncPage(): Promise<any> {
  const prisma = makePrisma();
  prisma.participant.findMany = jest.fn<any>().mockResolvedValue([readerMembership()]);
  prisma.message.findMany = messageStoreByWhere([syncMessageRow()], [
    { id: 'm-gone', conversationId: 'c1', deletedAt: new Date('2026-07-02T12:00:00.000Z') },
  ]);
  const app = await buildApp(prisma);
  const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
  await app.close();
  return JSON.parse(res.body);
}

describe('GET /sync — l’enveloppe réelle', () => {
  it('sert exactement les clés que le gestionnaire compose, aucune de moins', async () => {
    const body = await fetchSyncPage();

    expect(body.success).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual([
      'checkpoint', 'checkpointSeq', 'collections', 'gapAction', 'hasGap', 'hasMore', 'nextCursor',
    ]);
    expect(Object.keys(body.data.collections.messages).sort()).toEqual([
      'added', 'deleted', 'modified', 'nextCursor', 'truncated',
    ]);
  });

  it('ne perd aucune colonne que `syncMessageSelect` charge', async () => {
    const body = await fetchSyncPage();
    const served = new Set(Object.keys(body.data.collections.messages.added[0]));

    const composed = Object.keys(syncMessageRow());
    expect(composed.filter((k) => !served.has(k))).toEqual([]);
  });

  it('sert le bloc expéditeur et son utilisateur imbriqué', async () => {
    const body = await fetchSyncPage();
    const { sender } = body.data.collections.messages.added[0];

    expect(sender).toMatchObject({ id: 'p-sender', displayName: 'Emetteur', type: 'user', language: 'fr' });
    expect(sender.user).toMatchObject({ id: 'u-sender', username: 'emetteur' });
  });

  /**
   * `/sync` sert le profil d'un TIERS — l'expéditeur — et n'a AUCUN gate de
   * présence. La règle du dépôt n'autorise que deux issues, et c'est la seconde
   * qui est prise ici : ni le `select` ni le schéma ne portent `isOnline` /
   * `lastActiveAt`, donc rien à garder. C'est fail-closed, la posture du
   * cycle 93 — un gate sur une donnée que personne ne charge est du code mort
   * qui se périme, l'omission déclarée ne se périme pas.
   *
   * Ce témoin garde une PORTE, pas un bug : le jour où quelqu'un ajoute la
   * présence au `select` du rattrapage, il tombe et l'oblige à poser le gate
   * dans le MÊME lot — c'est la règle du cycle 84, et c'est ce qu'un piège armé
   * doit faire.
   */
  it('ne sert AUCUN champ de présence de l’expéditeur — ni au select, ni au schéma', async () => {
    const prisma = makePrisma();
    prisma.participant.findMany = jest.fn<any>().mockResolvedValue([readerMembership()]);
    const leaky = syncMessageRow();
    (leaky.sender as Record<string, unknown>).isOnline = true;
    (leaky.sender as Record<string, unknown>).lastActiveAt = new Date('2026-07-02T09:00:00Z');
    prisma.message.findMany = messageStoreByWhere([leaky], []);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    const { sender } = res.json().data.collections.messages.added[0];
    await app.close();

    // Le schéma est la garde : même posée sur l'objet, la présence ne sort pas.
    expect(sender).not.toHaveProperty('isOnline');
    expect(sender).not.toHaveProperty('lastActiveAt');

    // Et le select ne la demande pas — les deux moitiés, séparément.
    const senderSelect = prisma.message.findMany.mock.calls[0]![0]!.select.sender.select as Record<string, unknown>;
    expect(senderSelect.isOnline).toBeUndefined();
    expect(senderSelect.lastActiveAt).toBeUndefined();
  });

  it('conserve `metadata` et `reactionSummary`, deux objets de FORME LIBRE', async () => {
    const body = await fetchSyncPage();
    const message = body.data.collections.messages.added[0];

    // Sans `additionalProperties`, fast-json-stringify en vide le contenu en
    // silence — le piège que `messageSchema.metadata` documente déjà.
    expect(message.metadata).toEqual({ postReplyTo: { id: 'post-1' } });
    expect(message.reactionSummary).toEqual({ '❤️': 2 });
  });

  it('garde la tombstone entière — un client qui perd `deletedAt` ne sait plus dater la disparition', async () => {
    const body = await fetchSyncPage();

    expect(body.data.collections.messages.deleted[0]).toEqual({
      id: 'm-gone',
      conversationId: 'c1',
      deletedAt: '2026-07-02T12:00:00.000Z',
    });
  });
});

describe('GET /sync — `translations` a la forme du CONTRAT', () => {
  /**
   * Le défaut jumeau de celui que le cycle 94 bis a corrigé sur
   * `GET /messages/:messageId`, et il vivait ici pour la même raison : rien
   * n'était gouverné. `APIMessage.translations` se décode côté iOS avec un
   * `try` NON tolérant — une carte y fait échouer le décodage du message
   * ENTIER, pas seulement de ses traductions.
   */
  it('sert un TABLEAU, jamais la carte Mongo', async () => {
    const body = await fetchSyncPage();
    const { translations } = body.data.collections.messages.added[0];

    expect(Array.isArray(translations)).toBe(true);
    expect(translations).toHaveLength(1);
  });

  it('sert la forme que produit `transformTranslationsToArray`', async () => {
    const body = await fetchSyncPage();
    const [translation] = body.data.collections.messages.added[0].translations;

    expect(translation).toMatchObject({
      id: 'm-contract-1-en',
      messageId: 'm-contract-1',
      targetLanguage: 'en',
      translatedContent: 'hello',
      translationModel: 'basic',
    });
    expect(translation).not.toHaveProperty('text');
  });
});

describe('GET /sync — pièces jointes à la forme du fil', () => {
  /**
   * `attachmentMediaSelect` charge la relation `reactions` BRUTE
   * (`{emoji, participantId}`) ; le contrat de fil est `reactionSummary` +
   * `currentUserReactions`, produits par une agrégation serveur. Tant que la
   * réponse n'était pas gouvernée, la relation brute partait telle quelle —
   * une forme qu'aucun client ne décode, et qui fuite en prime QUI a réagi.
   */
  it('agrège les réactions par pièce jointe et retire les lignes brutes', async () => {
    const body = await fetchSyncPage();
    const [attachment] = body.data.collections.messages.added[0].attachments;

    expect(attachment.reactionSummary).toEqual({ '👍': 2 });
    expect(attachment).not.toHaveProperty('reactions');
  });

  it('reconnaît les réactions DU LECTEUR — par son `Participant.id` de CETTE conversation', async () => {
    const body = await fetchSyncPage();
    const [attachment] = body.data.collections.messages.added[0].attachments;

    expect(attachment.currentUserReactions).toEqual(['👍']);
  });

  /**
   * Le témoin ci-dessus ne peut pas tomber tout seul : le double Prisma rend sa
   * ligne d'appartenance quel que soit le `select`, donc `id` y est présent même
   * si la requête cesse de le demander. C'est la REQUÊTE qui porte le contrat —
   * mesuré : retirer `id: true` du select laisse le témoin de valeur VERT.
   */
  it('DEMANDE le `Participant.id` à Prisma — sans lui, aucune réaction n’est « la mienne »', async () => {
    const prisma = makePrisma();
    prisma.participant.findMany = jest.fn<any>().mockResolvedValue([readerMembership()]);
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    const select = prisma.participant.findMany.mock.calls[0]![0]!.select as Record<string, unknown>;
    expect(select.id).toBe(true);
    await app.close();
  });

  it('conserve le rendable — codecs, thumbHash, transcription et traductions audio', async () => {
    const body = await fetchSyncPage();
    const [attachment] = body.data.collections.messages.added[0].attachments;

    expect(attachment).toMatchObject({
      id: 'att-1',
      mimeType: 'audio/mp4',
      fileUrl: 'https://cdn/voix.m4a',
      thumbHash: 'AQIDBA==',
      duration: 4200,
      codec: 'aac',
      sampleRate: 48000,
      channels: 1,
    });
    expect(attachment.transcription.text).toBe('bonjour');
    // La carte par langue est ici la forme CANONIQUE — la déclarer en tableau
    // aurait détruit le Prisme audio en croyant réparer le Prisme texte.
    expect(attachment.translations.en).toMatchObject({
      type: 'audio',
      transcription: 'hello',
      url: 'https://cdn/voix-en.m4a',
    });
    expect(attachment.metadata).toEqual({ waveform: [1, 2, 3] });
  });
});
