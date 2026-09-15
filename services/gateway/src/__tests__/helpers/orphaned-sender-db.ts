/**
 * Une base MongoDB EN MÉMOIRE pour les expéditeurs orphelins (#6501).
 *
 * `repairOrphanedMessageSenders` ne parle à Mongo que par agrégation brute et
 * commande brute : un double qui rendrait une liste toute faite passerait aussi
 * bien sous un pipeline juste que sous un pipeline faux. Celui-ci INTERPRÈTE les
 * étapes émises (`$match`, `$group`, `$lookup`, `$sort`, `$limit`, `$project`)
 * avec les deux règles de Mongo qui font le défaut :
 *
 * - un `$lookup` sur un identifiant NUL ne trouve aucun participant ;
 * - `{ champ: null }` apparie un champ nul comme un champ ABSENT.
 *
 * Toute autre forme JETTE : un pipeline dont ce double ne sait rien doit faire
 * échouer le témoin, jamais passer en l'ignorant.
 *
 * Il tient aussi les deux contraintes que la production impose et qu'un double
 * ordinaire oublie — l'unicité de `_id`, et l'index unique de production
 * `(conversationId, userId, sessionTokenHash)`, sur lequel deux tombstones
 * `(C, null, null)` se percuteraient — et il LÈVE l'erreur de Prisma quand une
 * lecture charge un expéditeur absent : c'est ce qui permet aux témoins de route
 * et de pont de prouver le rejeu.
 */

import { jest } from '@jest/globals';

export type OrphanDbDocument = Record<string, unknown>;

export type OrphanDbMessage = OrphanDbDocument & {
  readonly id: string;
  readonly conversationId: string;
  readonly createdAt: Date;
};

export type OrphanDbParticipant = OrphanDbDocument & {
  readonly id: string;
  readonly conversationId: string;
};

export type OrphanDbConversation = {
  readonly id: string;
  lastMessageAt: Date;
  readonly createdAt: Date;
};

export type OrphanDbSeed = {
  readonly conversations?: readonly OrphanDbConversation[];
  readonly participants?: readonly OrphanDbParticipant[];
  readonly messages?: readonly OrphanDbMessage[];
  /** Identifiants dont la création de participant est refusée par la base. */
  readonly refuseParticipantCreate?: readonly string[];
  /** Identifiants qu'une passe CONCURRENTE pose juste avant : la création lève P2002. */
  readonly concurrentParticipantCreate?: readonly string[];
};

export const ORPHANED_SENDER_PRISMA_MESSAGE = [
  '',
  'Invalid `prisma.message.findMany()` invocation:',
  '',
  '',
  'Inconsistent query result: Field sender is required to return data, got `null` instead.',
].join('\n');

export const orphanedSenderPrismaError = (): Error => {
  const error = new Error(ORPHANED_SENDER_PRISMA_MESSAGE);
  error.name = 'PrismaClientUnknownRequestError';
  return error;
};

const uniqueViolation = (constraint: string): Error =>
  Object.assign(new Error(`Unique constraint failed on the constraint: \`${constraint}\``), { code: 'P2002' });

const ID_FIELDS = new Set(['_id', 'conversationId', 'senderId']);

const unsupported = (what: string, value: unknown): Error =>
  new Error(`base orpheline : ${what} non supporté ${JSON.stringify(value)}`);

function idOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && '$oid' in (value as OrphanDbDocument)) {
    return String((value as OrphanDbDocument).$oid);
  }
  throw unsupported('identifiant', value);
}

const readPath = (doc: OrphanDbDocument, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (current, key) => (current && typeof current === 'object' ? (current as OrphanDbDocument)[key] : undefined),
      doc
    );

const isMissing = (value: unknown): boolean => value === null || value === undefined;

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (condition === null) return isMissing(value);
  if (typeof condition !== 'object') return value === condition;
  const c = condition as OrphanDbDocument;
  if ('$oid' in c) return !isMissing(value) && idOf(value) === c.$oid;
  if ('$in' in c) return (c.$in as unknown[]).some((candidate) => matchesCondition(value, candidate));
  if ('$gt' in c) return !isMissing(value) && String(idOf(value)) > String(idOf(c.$gt));
  if ('$size' in c) return Array.isArray(value) && value.length === c.$size;
  throw unsupported('condition', condition);
}

const matchesFilter = (doc: OrphanDbDocument, filter: OrphanDbDocument): boolean =>
  Object.entries(filter).every(([path, condition]) => matchesCondition(readPath(doc, path), condition));

function groupKey(doc: OrphanDbDocument, spec: OrphanDbDocument): OrphanDbDocument {
  return Object.fromEntries(
    Object.entries(spec).flatMap(([key, expression]) => {
      if (typeof expression === 'string' && expression.startsWith('$')) {
        const value = readPath(doc, expression.slice(1));
        return value === undefined ? [] : [[key, value]];
      }
      const ifNull = (expression as OrphanDbDocument | null)?.$ifNull;
      if (Array.isArray(ifNull) && typeof ifNull[0] === 'string' && ifNull[0].startsWith('$')) {
        return [[key, readPath(doc, ifNull[0].slice(1)) ?? ifNull[1]]];
      }
      throw unsupported('expression de $group', expression);
    })
  );
}

const ID_ONLY_PIPELINE = JSON.stringify([{ $project: { _id: 1 } }]);

function toEjson(key: string, value: unknown): unknown {
  if (ID_FIELDS.has(key) && typeof value === 'string') return { $oid: value };
  if (key === '_id' && value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value as OrphanDbDocument).map(([k, v]) => [k, toEjson(k, v)]));
  }
  return value;
}

const docToEjson = (doc: OrphanDbDocument): OrphanDbDocument =>
  Object.fromEntries(Object.entries(doc).map(([key, value]) => [key, toEjson(key, value)]));

const asDocument = ({ id, ...rest }: OrphanDbDocument): OrphanDbDocument => ({ _id: id, ...rest });

export function makeOrphanedSenderDb(seed: OrphanDbSeed = {}) {
  const state = {
    conversations: (seed.conversations ?? []).map((conversation) => ({ ...conversation })),
    participants: (seed.participants ?? []).map((participant) => ({ ...participant })) as OrphanDbParticipant[],
    messages: (seed.messages ?? []).map((message) => ({ ...message })) as OrphanDbMessage[],
  };
  const refused = new Set(seed.refuseParticipantCreate ?? []);
  const concurrent = new Set(seed.concurrentParticipantCreate ?? []);

  const collection = (name: unknown): OrphanDbDocument[] => {
    if (name === 'Message') return state.messages.map(asDocument);
    if (name === 'Participant') return state.participants.map(asDocument);
    if (name === 'Conversation') return state.conversations.map(asDocument);
    throw unsupported('collection', name);
  };

  const lookup = (docs: OrphanDbDocument[], stage: OrphanDbDocument): OrphanDbDocument[] => {
    const inner = stage.pipeline;
    if (inner !== undefined && JSON.stringify(inner) !== ID_ONLY_PIPELINE) throw unsupported('$lookup.pipeline', inner);
    const foreign = collection(stage.from);
    return docs.map((doc) => {
      const local = readPath(doc, String(stage.localField));
      const matches = foreign.filter((row) => {
        const value = readPath(row, String(stage.foreignField));
        return isMissing(local) ? isMissing(value) : !isMissing(value) && idOf(value) === idOf(local);
      });
      return { ...doc, [String(stage.as)]: inner ? matches.map((row) => ({ _id: row._id })) : matches };
    });
  };

  const applyStage = (docs: OrphanDbDocument[], stage: OrphanDbDocument): OrphanDbDocument[] => {
    const operators = Object.keys(stage);
    if (operators.length !== 1) throw unsupported('étape', stage);
    const [operator] = operators;
    const arg = stage[operator] as OrphanDbDocument;
    switch (operator) {
      case '$match':
        return docs.filter((doc) => matchesFilter(doc, arg));
      case '$group': {
        if (Object.keys(arg).some((key) => key !== '_id')) throw unsupported('$group', arg);
        const groups = new Map<string, OrphanDbDocument>();
        docs.forEach((doc) => {
          const key = groupKey(doc, arg._id as OrphanDbDocument);
          groups.set(JSON.stringify(key), { _id: key });
        });
        return [...groups.values()];
      }
      case '$lookup':
        return lookup(docs, arg);
      case '$sort':
        if (JSON.stringify(arg) !== JSON.stringify({ _id: 1 })) throw unsupported('$sort', arg);
        return [...docs].sort((a, b) => (JSON.stringify(a._id) < JSON.stringify(b._id) ? -1 : 1));
      case '$limit':
        return docs.slice(0, Number(arg));
      case '$project':
        return docs.map((doc) =>
          Object.fromEntries(Object.keys(arg).filter((key) => key in doc).map((key) => [key, doc[key]]))
        );
      default:
        throw unsupported('opérateur', operator);
    }
  };

  const identity = (row: OrphanDbDocument): string =>
    JSON.stringify([row.conversationId, row.userId ?? null, row.sessionTokenHash ?? null]);

  const insertParticipant = (data: OrphanDbDocument): void => {
    const id = String(data.id);
    if (state.participants.some((participant) => participant.id === id)) throw uniqueViolation('_id_');
    if (state.participants.some((participant) => identity(participant) === identity(data))) {
      throw uniqueViolation('unique_conversation_identity');
    }
    state.participants.push({ ...data, id, conversationId: String(data.conversationId) });
  };

  const prisma = {
    message: {
      aggregateRaw: jest.fn(async (args: { pipeline: OrphanDbDocument[] }) =>
        args.pipeline.reduce(applyStage, collection('Message')).map(docToEjson)
      ),
      deleteMany: jest.fn(async (args: { where: { id?: { in?: string[] } } }) => {
        const ids = args.where?.id?.in;
        if (!Array.isArray(ids) || Object.keys(args.where).length !== 1) throw unsupported('deleteMany', args);
        const before = state.messages.length;
        state.messages = state.messages.filter((message) => !ids.includes(message.id));
        return { count: before - state.messages.length };
      }),
      findFirst: jest.fn(async (args: any) => {
        const { conversationId, deletedAt, ...rest } = args?.where ?? {};
        if (Object.keys(rest).length > 0 || deletedAt !== null || args?.orderBy?.createdAt !== 'desc') {
          throw unsupported('findFirst', args);
        }
        const newest = state.messages
          .filter((message) => message.conversationId === conversationId && isMissing(message.deletedAt))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        return newest ? { createdAt: newest.createdAt } : null;
      }),
      /**
       * La forme UNIQUE qu'un résolveur de portée (#6516) est autorisé à
       * poser : des ids seuls, jamais `sender`. Toute autre forme jette —
       * c'est ce qui prouve qu'un résolveur ne redemande pas ce qui a fait
       * échouer la lecture qu'il répare.
       */
      findMany: jest.fn(async (args: any) => {
        const where = args?.where ?? {};
        const ids = where?.id?.in;
        const select = args?.select ?? {};
        const selectsOnlyConversationId = Object.keys(select).length === 1 && select.conversationId === true;
        if (!Array.isArray(ids) || Object.keys(where).length !== 1 || !selectsOnlyConversationId) {
          throw unsupported('findMany', args);
        }
        return state.messages.filter((message) => ids.includes(message.id)).map((message) => ({
          conversationId: message.conversationId,
        }));
      }),
    },
    participant: {
      create: jest.fn(async (args: { data: OrphanDbDocument }) => {
        const id = String(args.data.id);
        if (refused.has(id)) throw new Error('écriture refusée');
        if (concurrent.has(id)) {
          concurrent.delete(id);
          insertParticipant({ ...args.data });
          throw uniqueViolation('_id_');
        }
        insertParticipant(args.data);
        return { ...args.data };
      }),
    },
    conversation: {
      findUnique: jest.fn(async (args: any) => {
        const conversation = state.conversations.find((row) => row.id === args.where.id);
        return conversation ? { lastMessageAt: conversation.lastMessageAt, createdAt: conversation.createdAt } : null;
      }),
      updateMany: jest.fn(async (args: any) => {
        const conversation = state.conversations.find(
          (row) => row.id === args.where.id && row.lastMessageAt.getTime() === args.where.lastMessageAt?.getTime()
        );
        if (!conversation) return { count: 0 };
        conversation.lastMessageAt = args.data.lastMessageAt;
        return { count: 1 };
      }),
    },
    conversationMessageStats: { findUnique: jest.fn(async () => null) },
    $runCommandRaw: jest.fn(async (command: any) => {
      if (command?.update !== 'Message' || !Array.isArray(command.updates)) throw unsupported('commande', command);
      const modified = command.updates.reduce((total: number, update: any) => {
        const set = update?.u?.$set;
        if (!set || Object.keys(update.u).length !== 1 || update.multi !== true) throw unsupported('update', update);
        const targets = state.messages.filter((message) => matchesFilter(asDocument(message), update.q));
        targets.forEach((message) => {
          Object.entries(set as OrphanDbDocument).forEach(([key, value]) => {
            (message as OrphanDbDocument)[key] = ID_FIELDS.has(key) ? idOf(value) : value;
          });
        });
        return total + targets.length;
      }, 0);
      return { n: modified, nModified: modified, ok: 1 };
    }),
  };

  /** Ce que Prisma fait d'une ligne lue AVEC son expéditeur : il le joint, ou il rejette toute la lecture. */
  const withSender = (message: OrphanDbMessage): OrphanDbMessage & { sender: OrphanDbParticipant } => {
    const sender = state.participants.find((participant) => participant.id === message.senderId);
    if (!sender) throw orphanedSenderPrismaError();
    return { ...message, sender };
  };

  return { state, prisma, withSender };
}

export type OrphanedSenderDb = ReturnType<typeof makeOrphanedSenderDb>;
