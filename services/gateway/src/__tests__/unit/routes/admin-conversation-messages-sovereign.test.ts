/**
 * `GET /admin/conversations/:conversationId/messages` — la route souveraine
 * sert désormais la MÊME FORME que la route utilisateur, gardée champ par
 * champ (#6862).
 *
 * ## Pourquoi ces témoins, et pas d'autres
 *
 * Élargir le `select` d'une route souveraine, c'est faire voyager PLUS de
 * données sous un régime de lecture privilégiée. La leçon 275 dit que la
 * protection se mesure sur tout ce que la charge TRANSPORTE, jamais sur sa
 * seule chaîne — et les quatre questions des cycles 123/124/125 se posent à
 * chaque champ ajouté : élit-il le bon rang ? qui l'affiche ? que
 * transporte-t-il À CÔTÉ ? et a-t-il le droit d'être là ?
 *
 * Quatre familles :
 *
 * 1. **LE RANG.** `requireAdminRank()` par-dessus `canManageConversations` —
 *    MODERATOR PORTE la permission (matrice centrale) et n'a pas le rang. Le
 *    seul témoin qui distingue une garde de rang d'une garde de permission.
 * 2. **LA PROTECTION DU MESSAGE.** `content: null` impose `translations`
 *    VIDES : servir la traduction en clair du texte qu'on vient de masquer
 *    est le défaut du cycle 123, une couche plus bas.
 * 3. **LA PROTECTION DE CE QUI VOYAGE À CÔTÉ.** La citation (`replyTo`) porte
 *    SA PROPRE protection — un message libre peut citer un message à vue
 *    unique. La pièce jointe aussi : transcription, pistes traduites,
 *    vignette, variantes d'image et `thumbHash` tombent avec l'URL.
 * 4. **LA FORME.** fast-json-stringify SUPPRIME ce que le schéma ne déclare
 *    pas : un champ ajouté au mapping et absent du schéma n'atteint PERSONNE
 *    (§ « Un schéma de réponse sans `properties` EFFACE »). Ces témoins
 *    traversent donc `app.inject()`, jamais le handler nu.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  mapSovereignMessageRow,
  type SovereignMessageRow,
} from '../../../routes/admin/sovereign-message-projection';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const CONVERSATION_ID = '507f1f77bcf86cd799439abc';
const MOTIF = 'audit de conformite du 2026-09-17';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

type AnyRecord = Record<string, unknown>;

/** Les arguments RÉELLEMENT remis à Prisma — un `select` se mesure sur la requête, jamais sur le rendu. */
type Espion = { findManyArgs: AnyRecord | null };

function createMockPrisma(rows: AnyRecord[], espion: Espion): PrismaClient {
  return {
    conversation: {
      findUnique: jest.fn(async () => ({ id: CONVERSATION_ID })),
    },
    message: {
      findMany: jest.fn(async (args?: AnyRecord) => {
        espion.findManyArgs = args ?? null;
        return rows;
      }),
      count: jest.fn(async () => rows.length),
    },
    adminAuditLog: {
      create: jest.fn(async () => ({ id: 'audit-1' })),
    },
  } as unknown as PrismaClient;
}

async function buildApp(prisma: PrismaClient, role: string | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  (app as unknown as { prisma: PrismaClient }).prisma = prisma;

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = role
      ? {
          type: 'registered',
          isAuthenticated: true,
          isAnonymous: false,
          userId: ADMIN_ID,
          registeredUser: { id: ADMIN_ID, role },
          hasFullAccess: true,
        }
      : { isAuthenticated: false, isAnonymous: false };
  });

  const { registerConversationMessagesSovereignRoute } = await import(
    '../../../routes/admin/conversation-messages-sovereign'
  );
  await app.register(
    async (instance) => {
      registerConversationMessagesSovereignRoute(instance);
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
  return app;
}

/** Une pièce jointe BRUTE, telle que Prisma la rend sous le `select` de la route. */
function pieceFixture(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: 'att-1',
    messageId: 'm-1',
    originalName: 'reunion.m4a',
    mimeType: 'audio/mp4',
    fileSize: 90210,
    width: null,
    height: null,
    duration: 12000,
    bitrate: 64000,
    sampleRate: 44100,
    codec: 'aac',
    channels: 1,
    fps: null,
    videoCodec: null,
    pageCount: null,
    lineCount: null,
    uploadedBy: 'u-1',
    isAnonymous: false,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    fileUrl: '/api/v1/attachments/file/uploads%2Freunion.m4a',
    thumbnailUrl: '/api/v1/attachments/file/uploads%2Freunion.jpg',
    thumbHash: 'YTQGFYQYd4h_iIeHh4d3iAeQhw',
    imageVariants: [{ url: '/api/v1/attachments/file/uploads%2Freunion-512.webp', size: 512, format: 'webp' }],
    metadata: { audioEffectsTimeline: [{ at: 0, effect: 'none' }] },
    transcription: { text: 'la reunion est deplacee a jeudi', segments: [] },
    translations: {
      en: { text: 'the meeting has moved to thursday', url: '/api/v1/attachments/file/uploads%2Fen.mp3' },
    },
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    ...overrides,
  };
}

/** Un message BRUT, tel que Prisma le rend sous le `select` de la route. */
function messageFixture(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: 'm-1',
    conversationId: CONVERSATION_ID,
    senderId: 'participant-1',
    content: 'la reunion est deplacee a jeudi',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    metadata: { location: { lat: 48.85, lng: 2.35 } },
    isEdited: false,
    editedAt: null,
    replyToId: null,
    storyReplyToId: null,
    forwardedFromId: null,
    forwardedFromConversationId: null,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    pinnedAt: null,
    pinnedBy: null,
    reactionSummary: { '❤️': 3 },
    reactionCount: 3,
    validatedMentions: ['alice'],
    translations: {
      en: { text: 'the meeting has moved to thursday', translationModel: 'premium', createdAt: new Date('2026-09-01T10:00:01.000Z') },
    },
    // Les six colonnes de `messageContentProtectionSelect` + les deux compteurs
    // de vue unique : un message LIBRE par défaut.
    isViewOnce: false,
    maxViewOnceCount: null,
    viewOnceCount: 0,
    isBlurred: false,
    effectFlags: 0,
    expiresAt: null,
    isEncrypted: false,
    encryptionMode: null,
    sender: {
      id: 'participant-1',
      userId: 'user-1',
      type: 'user',
      displayName: 'Alice',
      avatar: null,
      nickname: null,
      user: { id: 'user-1', username: 'alice', displayName: 'Alice Martin', avatar: null },
    },
    replyTo: null,
    attachments: [],
    _count: { attachments: 0 },
    ...overrides,
  };
}

/** Un message CITÉ brut, tel que Prisma le rend sous `replyTo: { select: … }`. */
function citationFixture(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: 'm-0',
    conversationId: CONVERSATION_ID,
    deletedAt: null,
    content: 'le code du coffre est 4821',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
    senderId: 'participant-2',
    metadata: { secret: 'coffre' },
    translations: {
      en: { text: 'the safe code is 4821', translationModel: 'premium', createdAt: new Date('2026-09-01T09:00:01.000Z') },
    },
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    expiresAt: null,
    isEncrypted: false,
    encryptionMode: null,
    sender: {
      id: 'participant-2',
      userId: 'user-2',
      type: 'user',
      displayName: 'Bob',
      avatar: null,
      nickname: null,
      user: { id: 'user-2', username: 'bob', displayName: 'Bob Durand', avatar: null },
    },
    ...overrides,
  };
}

async function lire(role: string, rows: AnyRecord[] = [messageFixture()], motif: string = MOTIF) {
  const espion: Espion = { findManyArgs: null };
  const prisma = createMockPrisma(rows, espion);
  const app = await buildApp(prisma, role);
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/admin/conversations/${CONVERSATION_ID}/messages?reason=${encodeURIComponent(motif)}`,
    headers: { authorization: 'Bearer x' },
  });
  await app.close();
  return { res, espion };
}

/**
 * Les CHEMINS d'une charge — `a.b`, `liste[].c` — en sautant les valeurs
 * `undefined` (une clé absente de la projection n'a rien à survivre).
 *
 * Une `Date` ne rend aucune entrée à `Object.entries` et une chaîne ISO n'en
 * rend aucune non plus : les deux côtés se comparent donc sans que le format
 * d'horloge crée une fausse divergence.
 */
function cheminsDe(valeur: unknown, prefixe = ''): readonly string[] {
  if (valeur === null || typeof valeur !== 'object') return [];
  if (Array.isArray(valeur)) return valeur.length > 0 ? cheminsDe(valeur[0], `${prefixe}[]`) : [];
  return Object.entries(valeur as AnyRecord).flatMap(([clef, sous]) =>
    sous === undefined ? [] : [`${prefixe}${clef}`, ...cheminsDe(sous, `${prefixe}${clef}.`)],
  );
}

/** La PREMIÈRE ligne servie, après la sérialisation — jamais l'objet du handler. */
async function premiereLigne(rows: AnyRecord[], role = 'ADMIN'): Promise<AnyRecord> {
  const { res } = await lire(role, rows);
  expect(res.statusCode).toBe(200);
  return (res.json().data as AnyRecord[])[0];
}

// ---------------------------------------------------------------------------
// 1 — LE RANG
// ---------------------------------------------------------------------------

describe('GET /admin/conversations/:id/messages — le rang', () => {
  it('sert un BIGBOSS', async () => {
    const { res } = await lire('BIGBOSS');
    expect(res.statusCode).toBe(200);
  });

  it('sert un ADMIN — directive porteur du 2026-09-16', async () => {
    const { res } = await lire('ADMIN');
    expect(res.statusCode).toBe(200);
  });

  it("refuse un MODERATOR — il PORTE `canManageConversations`, il n'a pas le RANG", async () => {
    const { res } = await lire('MODERATOR');
    expect(res.statusCode).toBe(403);
  });

  it('refuse un AUDIT', async () => {
    const { res } = await lire('AUDIT');
    expect(res.statusCode).toBe(403);
  });

  it('refuse un motif de moins de dix caractères AU SCHÉMA, avant le handler', async () => {
    const { res, espion } = await lire('ADMIN', [messageFixture()], 'court');
    expect(res.statusCode).toBe(400);
    expect(espion.findManyArgs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2 — LA FORME : ce que le SCHÉMA laisse passer
// ---------------------------------------------------------------------------

describe('GET /admin/conversations/:id/messages — la forme SERVIE', () => {
  it('sert `senderId` au PREMIER NIVEAU, résolu en `User.id` — sans lui le regroupement du fil casse', async () => {
    const ligne = await premiereLigne([messageFixture()]);
    // `continues()` (apps/web/src/lib/grouping.ts) compare `senderId` : en
    // base c'est un `Participant.id`, que les clients comparent à un `User.id`.
    expect(ligne.senderId).toBe('user-1');
    expect(ligne.senderParticipantId).toBe('participant-1');
  });

  it('sert `conversationId`, `messageSource`, `metadata`, `reactionSummary` et `reactionCount`', async () => {
    const ligne = await premiereLigne([messageFixture()]);
    expect(ligne.conversationId).toBe(CONVERSATION_ID);
    expect(ligne.messageSource).toBe('user');
    expect(ligne.metadata).toEqual({ location: { lat: 48.85, lng: 2.35 } });
    expect(ligne.reactionSummary).toEqual({ '❤️': 3 });
    expect(ligne.reactionCount).toBe(3);
  });

  it('sert les traductions en TABLEAU — la carte Mongo brute ne se décode chez aucun client', async () => {
    const ligne = await premiereLigne([messageFixture()]);
    const traductions = ligne.translations as AnyRecord[];
    expect(Array.isArray(traductions)).toBe(true);
    expect(traductions).toHaveLength(1);
    expect(traductions[0]).toMatchObject({
      messageId: 'm-1',
      targetLanguage: 'en',
      translatedContent: 'the meeting has moved to thursday',
    });
  });

  it('sert les colonnes BRUTES de protection — sans elles la bulle ne distingue pas voilé / consumé / expiré', async () => {
    const ligne = await premiereLigne([
      messageFixture({ isViewOnce: true, maxViewOnceCount: 2, viewOnceCount: 1, content: 'secret' }),
    ]);
    expect(ligne.isViewOnce).toBe(true);
    expect(ligne.maxViewOnceCount).toBe(2);
    expect(ligne.viewOnceCount).toBe(1);
    expect(ligne.isBlurred).toBe(false);
    expect(ligne.effectFlags).toBe(0);
  });

  it('conserve `isProtected` et `attachmentCount` — servis par CETTE route seule, déjà consommés côté v2', async () => {
    const ligne = await premiereLigne([
      messageFixture({ attachments: [pieceFixture()], _count: { attachments: 3 } }),
    ]);
    expect(ligne.isProtected).toBe(false);
    expect(ligne.attachmentCount).toBe(3);
  });

  it('sert la transcription ET les pistes traduites d\'une pièce LIBRE', async () => {
    const ligne = await premiereLigne([
      messageFixture({ attachments: [pieceFixture()], _count: { attachments: 1 } }),
    ]);
    const piece = (ligne.attachments as AnyRecord[])[0];
    expect(piece.transcription).toEqual({ text: 'la reunion est deplacee a jeudi', segments: [] });
    expect(piece.translations).toEqual({
      en: { text: 'the meeting has moved to thursday', url: '/api/v1/attachments/file/uploads%2Fen.mp3' },
    });
    expect(piece.fileUrl).toBe('/api/v1/attachments/file/uploads%2Freunion.m4a');
  });

  it('sert la citation en OBJET, avec son expéditeur', async () => {
    const ligne = await premiereLigne([
      messageFixture({ replyToId: 'm-0', replyTo: citationFixture() }),
    ]);
    const citation = ligne.replyTo as AnyRecord;
    expect(citation).toBeTruthy();
    expect(citation.id).toBe('m-0');
    expect(citation.content).toBe('le code du coffre est 4821');
    expect((citation.sender as AnyRecord).displayName).toBe('Bob');
    expect(Array.isArray(citation.translations)).toBe(true);
  });

  it('conserve l\'ordre DESCENDANT et la pagination à la racine', async () => {
    const { res, espion } = await lire('ADMIN');
    expect(espion.findManyArgs?.orderBy).toEqual({ createdAt: 'desc' });
    expect(res.json().pagination).toMatchObject({ offset: 0, hasMore: false });
  });

  /**
   * LE TÉMOIN QUI GARDE LA PORTE POUR LE PROCHAIN CHAMP.
   *
   * Les témoins ci-dessus nomment les champs que CE lot ajoute — ils ne diront
   * rien du suivant. Celui-ci confronte MÉCANIQUEMENT les deux moitiés de la
   * même forme : les chemins que la projection COMPOSE et ceux qui survivent au
   * sérialiseur RÉEL de la route. Un champ ajouté au mapping et oublié au
   * schéma n'atteint personne, et c'est le seul témoin qui le dira sans qu'on
   * ait pensé à lui.
   *
   * Le sens compte : on n'exige pas l'égalité des deux ensembles, seulement
   * qu'AUCUN chemin composé ne soit PERDU. Déclarer un champ que la projection
   * ne compose pas ne fabrique rien (fast-json-stringify n'invente pas de clé)
   * — c'est l'asymétrie du sérialiseur, et elle rend le superset sans risque
   * dans ce sens-là.
   */
  it('déclare au schéma TOUT ce que la projection compose — à chaque profondeur', async () => {
    const ligneComplete = messageFixture({
      editedAt: new Date('2026-09-01T11:00:00.000Z'),
      isEdited: true,
      storyReplyToId: 'post-1',
      forwardedFromId: 'm-source',
      forwardedFromConversationId: 'c-source',
      pinnedAt: new Date('2026-09-01T12:00:00.000Z'),
      pinnedBy: 'user-1',
      maxViewOnceCount: 3,
      viewOnceCount: 1,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      replyToId: 'm-0',
      replyTo: citationFixture(),
      attachments: [pieceFixture()],
      _count: { attachments: 1 },
    });

    const { res } = await lire('ADMIN', [ligneComplete]);
    expect(res.statusCode).toBe(200);

    const compose = mapSovereignMessageRow(ligneComplete as unknown as SovereignMessageRow);
    const servi = (res.json().data as AnyRecord[])[0];

    const perdus = cheminsDe(compose).filter((chemin) => !cheminsDe(servi).includes(chemin));
    expect(perdus).toEqual([]);
    // Et la mesure n'est pas triviale : la forme complète porte plus de cent
    // chemins. Un ensemble vide des DEUX côtés passerait sans rien mesurer.
    expect(cheminsDe(compose).length).toBeGreaterThan(100);
  });

  /**
   * LA PROVENANCE VOYAGE AVEC LE MÉDIA.
   *
   * `attachmentMediaSelect` porte `capturedInApp` avec sa raison écrite sur
   * place : « la feuille de partage lit ce drapeau sur l'attachement livré par
   * la LISTE de messages pour décider si publier demande confirmation. Absent
   * d'ici, la garde ne se déclenche jamais. » La modale d'administration rend
   * LA VRAIE VUE conversation du produit : lui servir une pièce sans sa
   * provenance arme exactement le piège que ce commentaire décrit.
   *
   * Ce n'est pas du CONTENU — un booléen de provenance ne restitue rien — donc
   * il voyage sans garde, comme les horloges.
   */
  it('sert `capturedInApp` — sans lui, la garde de publication ne se déclenche jamais', async () => {
    const ligne = await premiereLigne([
      messageFixture({ attachments: [pieceFixture({ capturedInApp: true })], _count: { attachments: 1 } }),
    ]);
    expect((ligne.attachments as AnyRecord[])[0].capturedInApp).toBe(true);
  });

  /**
   * L'EXCEPTION EST NOMMÉE, JAMAIS HÉRITÉE.
   *
   * Le doc-comment de `sovereignAttachmentSelect` AFFIRME qu'il reprend
   * `attachmentMediaSelect` champ pour champ « sauf `fileName` et
   * `reactions` ». Une affirmation se vérifie comme telle (§ « un commentaire
   * qui ÉNONCE une contrainte est une AFFIRMATION ») — et la première mesure a
   * rendu une TROISIÈME omission que personne n'avait nommée.
   *
   * Ce témoin est la forme OUTILLÉE de la question : il compare les deux jeux
   * de clés et exige que l'écart soit EXACTEMENT l'ensemble déclaré. Le jour où
   * `attachmentMediaSelect` gagne un champ, c'est ici que quelqu'un devra dire
   * s'il le sert ou pourquoi il ne le sert pas.
   */
  it("ne s'écarte d'`attachmentMediaSelect` que sur `fileName` et `reactions` — nommées, jamais héritées", async () => {
    const { attachmentMediaSelect } = await import('../../../services/attachments/attachmentIncludes');
    const { sovereignAttachmentSelect } = await import('../../../routes/admin/sovereign-message-projection');

    const canonique = Object.keys(attachmentMediaSelect);
    const souverain = new Set(Object.keys(sovereignAttachmentSelect));
    const omises = canonique.filter((clef) => !souverain.has(clef)).sort();

    expect(omises).toEqual(['fileName', 'reactions']);
    // Et la mesure n'est pas triviale : le jeu canonique est large.
    expect(canonique.length).toBeGreaterThan(20);
  });

  it('ne sert JAMAIS `fileName` — il est le basename de `fileUrl`, donc l\'URL reconstructible d\'une pièce masquée', async () => {
    const ligne = await premiereLigne([
      messageFixture({ attachments: [pieceFixture({ isViewOnce: true })], _count: { attachments: 1 } }),
    ]);
    const piece = (ligne.attachments as AnyRecord[])[0];
    expect(piece).not.toHaveProperty('fileName');
    // Et le `select` ne le DEMANDE pas non plus : ce qu'on ne charge pas ne
    // peut pas fuir par un spread voisin.
    const { espion } = await lire('ADMIN');
    const select = (espion.findManyArgs?.select as AnyRecord).attachments as AnyRecord;
    expect((select.select as AnyRecord).fileName).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3 — LA PROTECTION DU MESSAGE : ce qui tombe AVEC le texte
// ---------------------------------------------------------------------------

describe('GET /admin/conversations/:id/messages — un message PROTÉGÉ', () => {
  const protections: ReadonlyArray<readonly [string, AnyRecord]> = [
    ['à vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['expiré', { expiresAt: new Date('2020-01-01T00:00:00.000Z') }],
    ['chiffré', { isEncrypted: true, encryptionMode: 'e2ee' }],
  ];

  it.each(protections)('ne laisse partir AUCUNE traduction — %s', async (_nom, drapeaux) => {
    const ligne = await premiereLigne([messageFixture(drapeaux)]);

    expect(ligne.isProtected).toBe(true);
    expect(ligne.content).toBeNull();
    // Le défaut du cycle 123, une couche plus bas : servir la traduction EN
    // CLAIR du texte qu'on vient de masquer.
    expect(ligne.translations).toEqual([]);
    expect(JSON.stringify(ligne)).not.toContain('the meeting has moved to thursday');
  });

  it('retient `metadata` et `validatedMentions` — ils sont DÉRIVÉS du texte masqué', async () => {
    const ligne = await premiereLigne([messageFixture({ isViewOnce: true })]);
    expect(ligne.metadata).toBeUndefined();
    expect(ligne.validatedMentions).toEqual([]);
    expect(JSON.stringify(ligne)).not.toContain('48.85');
  });

  it('retient tout ce que ses PIÈCES transportent — transcription, pistes, vignette, variantes, thumbHash', async () => {
    const ligne = await premiereLigne([
      messageFixture({ isViewOnce: true, attachments: [pieceFixture()], _count: { attachments: 1 } }),
    ]);
    const piece = (ligne.attachments as AnyRecord[])[0];

    // La pièce reste LISTÉE : constater qu'un média existe n'ouvre pas son contenu.
    expect(piece.id).toBe('att-1');
    expect(piece.originalName).toBe('reunion.m4a');
    expect(piece.fileSize).toBe(90210);
    expect(piece.isProtected).toBe(true);

    expect(piece.fileUrl).toBeNull();
    expect(piece.thumbnailUrl).toBeNull();
    expect(piece.thumbHash).toBeNull();
    expect(piece.imageVariants).toEqual([]);
    expect(piece.transcription).toBeUndefined();
    expect(piece.translations).toBeUndefined();
    expect(piece.metadata).toBeUndefined();

    const brut = JSON.stringify(ligne);
    expect(brut).not.toContain('uploads%2Fen.mp3');
    expect(brut).not.toContain('uploads%2Freunion-512.webp');
    expect(brut).not.toContain('la reunion est deplacee a jeudi');
  });
});

// ---------------------------------------------------------------------------
// 4 — LA PROTECTION DE CE QUI VOYAGE À CÔTÉ
// ---------------------------------------------------------------------------

describe('GET /admin/conversations/:id/messages — la citation a SA PROPRE protection', () => {
  it('un message LIBRE citant un message À VUE UNIQUE rend une citation MASQUÉE', async () => {
    const ligne = await premiereLigne([
      messageFixture({ replyToId: 'm-0', replyTo: citationFixture({ isViewOnce: true }) }),
    ]);

    // Le message qui CITE est libre : son propre texte part.
    expect(ligne.isProtected).toBe(false);
    expect(ligne.content).toBe('la reunion est deplacee a jeudi');

    const citation = ligne.replyTo as AnyRecord;
    expect(citation.isProtected).toBe(true);
    expect(citation.content).toBeNull();
    expect(citation.translations).toEqual([]);
    expect(citation.metadata).toBeUndefined();

    const brut = JSON.stringify(ligne);
    expect(brut).not.toContain('le code du coffre est 4821');
    expect(brut).not.toContain('the safe code is 4821');
  });

  it('une citation CHIFFRÉE ne laisse pas non plus partir son texte', async () => {
    const ligne = await premiereLigne([
      messageFixture({ replyToId: 'm-0', replyTo: citationFixture({ isEncrypted: true, encryptionMode: 'e2ee' }) }),
    ]);
    const citation = ligne.replyTo as AnyRecord;
    expect(citation.isProtected).toBe(true);
    expect(citation.content).toBeNull();
  });

  /**
   * LE `where` DE LA ROUTE NE GOUVERNE QUE LA LIGNE QU'IL SÉLECTIONNE.
   *
   * `deletedAt: null` dit « un message supprimé n'est plus servable du tout »,
   * et la route l'écrit dans son propre en-tête. La CITATION n'est pas
   * sélectionnée par ce `where` : c'est une relation, chargée par son id. Un
   * message supprimé après avoir été cité sortait donc en entier — texte,
   * traductions, `metadata` — par la seule porte que le `where` ne franchit
   * pas. C'est la forme du cycle 124 : une restriction DÉCLARÉE que l'objet
   * voisin ne respecte pas.
   */
  it('une citation dont le message a été SUPPRIMÉ ne laisse rien partir — le `where` ne la sélectionne pas', async () => {
    const ligne = await premiereLigne([
      messageFixture({
        replyToId: 'm-0',
        replyTo: citationFixture({ deletedAt: new Date('2026-09-02T08:00:00.000Z') }),
      }),
    ]);
    const citation = ligne.replyTo as AnyRecord;
    expect(citation.isProtected).toBe(true);
    expect(citation.content).toBeNull();
    expect(citation.translations).toEqual([]);
    expect(citation.metadata).toBeUndefined();

    const brut = JSON.stringify(ligne);
    expect(brut).not.toContain('le code du coffre est 4821');
    expect(brut).not.toContain('the safe code is 4821');
  });

  /**
   * LA LIGNE D'AUDIT NOMME UNE CONVERSATION ; LA CITATION PEUT EN NOMMER UNE
   * AUTRE.
   *
   * `admitAttachmentReply` (#6601) refuse à l'ENVOI qu'un `replyToId` désigne
   * un message d'une autre conversation — mais « une garde d'écriture ne dit
   * rien des lignes écrites AVANT elle » (`citedAttachmentBackfill.ts`, qui
   * revérifie pour cette raison exacte). Une citation héritée hors périmètre
   * ferait sortir le texte d'une conversation que le motif écrit ne nomme pas,
   * sous une trace qui en nomme une autre.
   */
  it("une citation portée par une AUTRE conversation ne laisse rien partir — la trace ne la nomme pas", async () => {
    const ligne = await premiereLigne([
      messageFixture({
        replyToId: 'm-0',
        replyTo: citationFixture({ conversationId: '507f1f77bcf86cd799439fff' }),
      }),
    ]);
    const citation = ligne.replyTo as AnyRecord;
    expect(citation.isProtected).toBe(true);
    expect(citation.content).toBeNull();
    expect(citation.translations).toEqual([]);
    expect(JSON.stringify(ligne)).not.toContain('le code du coffre est 4821');
  });

  it('charge les DEUX colonnes d\'admission de la citation — une garde se mesure sur la requête', async () => {
    const { espion } = await lire('ADMIN');
    const select = (espion.findManyArgs?.select as AnyRecord).replyTo as AnyRecord;
    expect((select.select as AnyRecord).deletedAt).toBe(true);
    expect((select.select as AnyRecord).conversationId).toBe(true);
  });
});

describe('GET /admin/conversations/:id/messages — une PIÈCE protégée seule', () => {
  it('reste listée sans URL, sans transcription et sans piste traduite, sur un message LIBRE', async () => {
    const ligne = await premiereLigne([
      messageFixture({ attachments: [pieceFixture({ isViewOnce: true })], _count: { attachments: 1 } }),
    ]);

    expect(ligne.isProtected).toBe(false);
    expect(ligne.content).toBe('la reunion est deplacee a jeudi');

    const piece = (ligne.attachments as AnyRecord[])[0];
    expect(piece.id).toBe('att-1');
    expect(piece.originalName).toBe('reunion.m4a');
    expect(piece.duration).toBe(12000);
    expect(piece.isProtected).toBe(true);
    expect(piece.isViewOnce).toBe(true);

    expect(piece.fileUrl).toBeNull();
    expect(piece.thumbnailUrl).toBeNull();
    expect(piece.thumbHash).toBeNull();
    expect(piece.imageVariants).toEqual([]);
    expect(piece.transcription).toBeUndefined();
    expect(piece.translations).toBeUndefined();

    const brut = JSON.stringify(piece);
    expect(brut).not.toContain('uploads%2Fen.mp3');
    expect(brut).not.toContain('the meeting has moved to thursday');
  });

  it('une pièce FLOUTÉE sur un message libre tombe de la même façon', async () => {
    const ligne = await premiereLigne([
      messageFixture({ attachments: [pieceFixture({ isBlurred: true })], _count: { attachments: 1 } }),
    ]);
    const piece = (ligne.attachments as AnyRecord[])[0];
    expect(piece.isProtected).toBe(true);
    expect(piece.fileUrl).toBeNull();
    expect(piece.transcription).toBeUndefined();
  });
});
