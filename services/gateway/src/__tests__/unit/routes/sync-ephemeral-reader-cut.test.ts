/**
 * #16586 — `GET /sync/messages` sert le contenu d'un éphémère ÉCHU pour son
 * lecteur, et lui annonce une échéance de sept jours.
 *
 * QUATRIÈME porte de l'énumération ouverte par #16558, après #16578
 * (épingles), #16581 (message par identifiant) et #16583 (`/mentions/me`).
 * Trouvée en rejouant la commande que le doc-comment de `keepAliveForReader`
 * PRESCRIT à sa place — `grep -l 'prisma\.message\.' | xargs grep -L
 * 'keepAliveForReader'` — croisée avec « cette porte sert-elle
 * `Message.content` à un lecteur ? ».
 *
 * Le `where` de `syncMessages` ne portait que `deletedAt: null` et le plancher
 * d'historique. La ligne traversait ensuite le masquage personnel, les avis de
 * capture (#9629), la projection de vue unique PAR LECTEUR (#7578) et
 * l'ouverture au repos (#12822) — et jamais la loi de l'éphémère.
 *
 * ─── CE QUE LA COMPOSITION DES DEUX MANQUES PRODUISAIT ─────────────────────
 *
 * `Message.expiresAt` porte depuis #7451 l'heure INTERNE de destruction. Pour
 * une flamme-œil (#8302, SANS durée), `ephemeralSendFields` y pose le plafond
 * de rétention : SEPT JOURS. Un lecteur qui avait consommé sa flamme — la
 * bulle a disparu de son écran — recevait donc sur son autre appareil le texte
 * ENTIER, sous `expiresAt: +7 jours` et `ephemeralDuration: null`, soit AUCUN
 * drapeau qui lui ferait masquer la bulle. Une bulle ORDINAIRE pour un message
 * que son auteur croit détruit.
 *
 * ─── CE QUE CHAQUE TÉMOIN GARDE ────────────────────────────────────────────
 *
 *  1. une flamme-œil CONSOMMÉE hors grâce ne figure plus dans la page ;
 *  2. un éphémère VIVANT y figure avec l'échéance DU LECTEUR, pas la colonne
 *     interne — témoin de RANG, écrit sur un rang AUTRE que le premier ;
 *  3. LA CLÉ DE LECTEUR EST PAR CONVERSATION : deux conversations, deux clés,
 *     trois verdicts. Un code mono-clé passe au vert sur une page
 *     mono-conversation et échoue ici, parce qu'une clé étrangère fait
 *     paraître « décompte pas démarré » — donc servi — tout message de l'autre
 *     conversation ;
 *  4. la coupure de CITATION (#8630) : une réponse à ce qui est mort pour ce
 *     lecteur sort avec ce qu'elle cite ;
 *  5. non-régression : une page SANS éphémère ne coûte aucune lecture
 *     d'échéance ;
 *  6. non-régression : la coupure est décidable sous une projection
 *     `?fields=` qui ne nomme PAS les colonnes d'éphémère — sans quoi
 *     `?fields=messages.attachments` ferait sortir les URL signées d'un
 *     éphémère mort (leçon 275 : une protection se mesure sur tout ce que la
 *     charge TRANSPORTE).
 *
 * `@meeshy/shared/types/api-schemas` n'est PAS mocké : c'est
 * `fast-json-stringify` qu'on traverse — la couche où `expiresAt` est DÉCLARÉ.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { EPHEMERAL_UNAVAILABILITY_GRACE_MS } from '@meeshy/shared/utils/ephemeral-countdown';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

const USER_ID = '507f1f77bcf86cd799439000';
const CONV_A = '507f1f77bcf86cd799439a01';
const CONV_B = '507f1f77bcf86cd799439a02';
/** `Participant.id` du lecteur DANS chaque conversation — deux lignes, deux clés. */
const READER_IN_A = '507f1f77bcf86cd799439b01';
const READER_IN_B = '507f1f77bcf86cd799439b02';

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, _options: unknown) =>
    async (req: FastifyRequest) => {
      (req as unknown as { authContext: { userId: string; type: 'user' } }).authContext = {
        userId: USER_ID,
        type: 'user',
      };
    },
}));

jest.mock('../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { syncRoutes } from '../../../routes/sync';

/**
 * L'horloge RÉELLE : la route construit son propre `new Date()`, et
 * `jest.useFakeTimers()` suspend aussi les minuteries internes de Fastify —
 * `app.inject` ne rendrait jamais. Les échéances sont donc posées
 * RELATIVEMENT à maintenant, la seule façon honnête de dire « échu pour ce
 * lecteur ».
 */
const NOW = new Date();

/** Hors grâce : la passerelle ne doit plus servir du tout. */
const PAST_DEADLINE = new Date(NOW.getTime() - EPHEMERAL_UNAVAILABILITY_GRACE_MS - 60_000);
/** Dans la grâce : la bulle a quitté l'écran, le rattrapage reste permis. */
const WITHIN_GRACE = new Date(NOW.getTime() - 60_000);
/** Dix minutes devant le lecteur. */
const LIVE_DEADLINE = new Date(NOW.getTime() + 10 * 60_000);
/** La colonne INTERNE de destruction — le plafond de rétention. L'échéance de personne. */
const RAW_DESTRUCTION = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);

const EPHEMERAL_SECONDS = 30;
const AFTER_READ_FLAGS = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;
const DURATION_FLAGS = MESSAGE_EFFECT_FLAGS.EPHEMERAL;

const SINCE = '2026-07-01T00:00:00.000Z';

/** Une ligne `changed` minimale — les relations sélectionnées reviennent en tableau vide. */
const base = (id: string, conversationId: string, extra: Record<string, unknown> = {}) => ({
  id,
  conversationId,
  senderId: 's1',
  content: `texte de ${id}`,
  clientMessageId: null,
  originalLanguage: 'fr',
  translations: null,
  messageType: 'text',
  messageSource: 'user',
  metadata: null,
  isEdited: false,
  editedAt: null,
  replyToId: null,
  reactionSummary: null,
  reactionCount: 0,
  validatedMentions: [],
  attachments: [],
  sender: null,
  createdAt: new Date('2026-07-02T10:00:00Z'),
  updatedAt: new Date('2026-07-02T10:00:00Z'),
  isViewOnce: false,
  maxViewOnceCount: null,
  viewOnceCount: 0,
  isBlurred: false,
  effectFlags: 0,
  ephemeralDuration: null,
  expiresAt: null,
  ...extra,
});

/** Une flamme-œil (#8302) : aucune durée, la consommation pose l'échéance du lecteur. */
const afterReadFlame = (id: string, conversationId: string) =>
  base(id, conversationId, { effectFlags: AFTER_READ_FLAGS, ephemeralDuration: null, expiresAt: RAW_DESTRUCTION });

/** Un éphémère à DURÉE : `D(u) = première réception + durée`. */
const durationFlame = (id: string, conversationId: string) =>
  base(id, conversationId, {
    effectFlags: DURATION_FLAGS,
    ephemeralDuration: EPHEMERAL_SECONDS,
    expiresAt: RAW_DESTRUCTION,
  });

type StatusEntry = { messageId: string; participantId: string; ephemeralExpiresAt: Date };

/**
 * Un magasin qui HONORE la clé de lecteur : `MessageStatusEntry` est indexé par
 * `(messageId, participantId)`, et c'est tout l'enjeu du témoin 3 — un double
 * qui rendrait toutes les lignes quelle que soit la clé demandée laisserait
 * passer une implémentation mono-clé.
 */
function statusEntryStore(entries: readonly StatusEntry[]) {
  return jest.fn<any>().mockImplementation((args: any) => {
    const where = args?.where ?? {};
    const ids: string[] | undefined = where.messageId?.in ?? (where.messageId ? [where.messageId] : undefined);
    const participantId: string | undefined = where.participantId;
    return Promise.resolve(
      entries.filter(
        (e) =>
          (ids === undefined || ids.includes(e.messageId)) &&
          (participantId === undefined || e.participantId === participantId),
      ),
    );
  });
}

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    participant: {
      findMany: jest.fn<any>().mockImplementation((args: any) => {
        if (args?.where?.OR) return Promise.resolve([]);
        return Promise.resolve([
          { id: READER_IN_A, conversationId: CONV_A },
          { id: READER_IN_B, conversationId: CONV_B },
        ]);
      }),
      count: jest.fn<any>().mockResolvedValue(4),
    },
    messageStatusEntry: { findMany: statusEntryStore([]) },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    ...over,
  } as any;
}

/**
 * Le magasin de messages répond par CONTENU de `where`, jamais par ordre
 * d'appel : la remontée de citations (#8630) ouvre une lecture de plus, et une
 * chaîne de `mockResolvedValueOnce` la servirait avec la page des tombstones.
 */
function messageStore(rows: ReadonlyArray<Record<string, unknown>>) {
  return jest.fn<any>().mockImplementation((args: any) => {
    const where = args?.where ?? {};
    if (where.deletedAt && typeof where.deletedAt === 'object') return Promise.resolve([]);
    const ids: string[] | undefined = where.id?.in;
    if (ids) return Promise.resolve(rows.filter((r) => ids.includes(r.id as string)));
    return Promise.resolve(rows.filter((r) => r.deletedAt == null));
  });
}

async function injectMessages(prisma: any, qs = ''): Promise<any> {
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', null as never);
  await app.register(syncRoutes);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages${qs}` });
  await app.close();
  return res;
}

const servedIds = (res: any): string[] => {
  const messages = res.json().data.collections.messages;
  return [...messages.added, ...messages.modified].map((m: any) => m.id);
};

const servedById = (res: any, id: string): any => {
  const messages = res.json().data.collections.messages;
  return [...messages.added, ...messages.modified].find((m: any) => m.id === id);
};

describe('GET /sync/messages — la coupure de service par lecteur de l’éphémère (#16586)', () => {
  it('ne sert plus une flamme-œil CONSOMMÉE hors grâce — ni son texte, ni sa ligne', async () => {
    const prisma = makePrisma({
      message: { findMany: messageStore([afterReadFlame('m-flame', CONV_A), base('m-plain', CONV_A)]) },
      messageStatusEntry: {
        findMany: statusEntryStore([
          { messageId: 'm-flame', participantId: READER_IN_A, ephemeralExpiresAt: PAST_DEADLINE },
        ]),
      },
    });

    const res = await injectMessages(prisma);
    expect(res.statusCode).toBe(200);
    expect(servedIds(res)).toEqual(['m-plain']);
    // Pas seulement la ligne : rien de ce que la ligne TRANSPORTAIT (leçon 275).
    expect(res.payload).not.toContain('texte de m-flame');
    expect(res.payload).toContain('texte de m-plain');
  });

  it('sert encore la flamme-œil consommée DANS la grâce — la fenêtre de rattrapage est la directive', async () => {
    const prisma = makePrisma({
      message: { findMany: messageStore([afterReadFlame('m-flame', CONV_A)]) },
      messageStatusEntry: {
        findMany: statusEntryStore([
          { messageId: 'm-flame', participantId: READER_IN_A, ephemeralExpiresAt: WITHIN_GRACE },
        ]),
      },
    });

    const res = await injectMessages(prisma);
    expect(servedIds(res)).toEqual(['m-flame']);
  });

  it('sert l’échéance DU LECTEUR, jamais la colonne interne de destruction', async () => {
    const prisma = makePrisma({
      message: { findMany: messageStore([durationFlame('m-live', CONV_A)]) },
      messageStatusEntry: {
        findMany: statusEntryStore([
          { messageId: 'm-live', participantId: READER_IN_A, ephemeralExpiresAt: LIVE_DEADLINE },
        ]),
      },
    });

    const res = await injectMessages(prisma);
    const served = servedById(res, 'm-live');
    expect(served.expiresAt).toBe(LIVE_DEADLINE.toISOString());
    expect(served.expiresAt).not.toBe(RAW_DESTRUCTION.toISOString());
    // La DURÉE, elle, est la même pour tout le monde : les trois clients en
    // dérivent leur décompte local (#7451).
    expect(served.ephemeralDuration).toBe(EPHEMERAL_SECONDS);
  });

  it('résout la clé de lecteur PAR CONVERSATION — trois verdicts sur deux conversations', async () => {
    const prisma = makePrisma({
      message: {
        findMany: messageStore([
          durationFlame('m-dead-a', CONV_A),
          durationFlame('m-dead-b', CONV_B),
          durationFlame('m-live-b', CONV_B),
        ]),
      },
      messageStatusEntry: {
        findMany: statusEntryStore([
          { messageId: 'm-dead-a', participantId: READER_IN_A, ephemeralExpiresAt: PAST_DEADLINE },
          { messageId: 'm-dead-b', participantId: READER_IN_B, ephemeralExpiresAt: PAST_DEADLINE },
          { messageId: 'm-live-b', participantId: READER_IN_B, ephemeralExpiresAt: LIVE_DEADLINE },
        ]),
      },
    });

    const res = await injectMessages(prisma);
    // Une clé unique (celle de A) ne verrait AUCUNE échéance pour les lignes de
    // B : « décompte pas démarré » ⇒ servies. Le témoin tombe alors sur
    // `m-dead-b`.
    expect(servedIds(res)).toEqual(['m-live-b']);
  });

  it('emporte la RÉPONSE à ce qui est mort pour ce lecteur (#8630)', async () => {
    const quoted = durationFlame('m-quoted', CONV_A);
    const reply = base('m-reply', CONV_A, { replyToId: 'm-quoted' });
    const prisma = makePrisma({
      message: { findMany: messageStore([quoted, reply]) },
      messageStatusEntry: {
        findMany: statusEntryStore([
          { messageId: 'm-quoted', participantId: READER_IN_A, ephemeralExpiresAt: PAST_DEADLINE },
        ]),
      },
    });

    const res = await injectMessages(prisma);
    expect(servedIds(res)).toEqual([]);
  });

  it('une page SANS éphémère ne coûte aucune lecture d’échéance', async () => {
    const prisma = makePrisma({
      message: { findMany: messageStore([base('m1', CONV_A), base('m2', CONV_B)]) },
    });

    const res = await injectMessages(prisma);
    expect(servedIds(res).sort()).toEqual(['m1', 'm2']);
    expect(prisma.messageStatusEntry.findMany).not.toHaveBeenCalled();
  });

  it('coupe aussi sous une projection qui ne NOMME pas les colonnes d’éphémère', async () => {
    const prisma = makePrisma({
      message: { findMany: messageStore([afterReadFlame('m-flame', CONV_A), base('m-plain', CONV_A)]) },
      messageStatusEntry: {
        findMany: statusEntryStore([
          { messageId: 'm-flame', participantId: READER_IN_A, ephemeralExpiresAt: PAST_DEADLINE },
        ]),
      },
    });

    const res = await injectMessages(prisma, '&fields=messages.attachments');
    expect(servedIds(res)).toEqual(['m-plain']);
  });
});
