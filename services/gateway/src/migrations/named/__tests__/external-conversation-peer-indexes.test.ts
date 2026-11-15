import type { Db } from 'mongodb';
import { NAMED_MIGRATIONS } from '../registry';
import { runNamedMigration } from '../runner';

/**
 * #17117 — les index de `ExternalConversationPeer`, posés par migration nommée
 * et jamais par `prisma db push` (#9035) : l'unicité de la conversation et du
 * triplet (utilisateur, réseau, numéro) — rouvrir rend la même conversation, deux
 * ouvertures simultanées n'en créent pas deux —, et l'index TTL sur `purgeAfter`
 * qui EFFACE le numéro de l'ami à l'échéance de conservation. L'index TTL porte
 * le NOM que Prisma lui donne : le moteur compare un index par nom et par clés,
 * jamais par ses options, et ne le recrée donc pas.
 */

const NAME = '2026-11-10-external-conversation-peer-indexes';
const COLLECTION = 'ExternalConversationPeer';

type Existing = { readonly name: string; readonly key: Record<string, number>; readonly expireAfterSeconds?: number };
type Write =
  | { readonly kind: 'createIndex'; readonly key: Record<string, number>; readonly options: Record<string, unknown> }
  | { readonly kind: 'command'; readonly command: Record<string, unknown> };

function fakeDb(params: { readonly collectionExists: boolean; readonly indexes: readonly Existing[] }, writes: Write[]): Db {
  const collection = () => ({
    listIndexes: () => ({ toArray: async () => [...params.indexes] }),
    createIndex: async (key: Record<string, number>, options: Record<string, unknown>) => {
      writes.push({ kind: 'createIndex', key, options });
      return String(options.name);
    },
  });
  return {
    collection,
    listCollections: () => ({ toArray: async () => (params.collectionExists ? [{ name: COLLECTION }] : []) }),
    command: async (command: Record<string, unknown>) => {
      writes.push({ kind: 'command', command });
      return { ok: 1 };
    },
  } as unknown as Db;
}

const run = async (params: Parameters<typeof fakeDb>[0], apply: boolean) => {
  const writes: Write[] = [];
  const lines: string[] = [];
  await runNamedMigration({ name: NAME, apply, db: fakeDb(params, writes), env: {}, log: (line) => lines.push(line) });
  return { writes, log: lines.join('\n') };
};

describe('index de ExternalConversationPeer (#17117)', () => {
  it('est enregistrée parmi les migrations nommées', () => {
    expect(NAMED_MIGRATIONS.map((migration) => migration.name)).toContain(NAME);
  });

  it('sur une base neuve : les deux unicités et l’index TTL sous le nom de Prisma', async () => {
    const { writes } = await run({ collectionExists: false, indexes: [] }, true);

    expect(writes).toEqual([
      { kind: 'createIndex', key: { conversationId: 1 }, options: { name: 'ExternalConversationPeer_conversationId_key', unique: true } },
      {
        kind: 'createIndex',
        key: { openedByUserId: 1, network: 1, handle: 1 },
        options: { name: 'ExternalConversationPeer_openedByUserId_network_handle_key', unique: true },
      },
      {
        kind: 'createIndex',
        key: { purgeAfter: 1 },
        options: { name: 'ExternalConversationPeer_purgeAfter_idx', expireAfterSeconds: 0 },
      },
    ]);
  });

  it('un index purgeAfter posé sans TTL (un db push de développement) devient TTL, sans être recréé', async () => {
    const { writes } = await run(
      { collectionExists: true, indexes: [{ name: 'ExternalConversationPeer_purgeAfter_idx', key: { purgeAfter: 1 } }] },
      true,
    );

    expect(writes).toContainEqual({
      kind: 'command',
      command: { collMod: COLLECTION, index: { keyPattern: { purgeAfter: 1 }, expireAfterSeconds: 0 } },
    });
    expect(writes.filter((write) => write.kind === 'createIndex' && 'purgeAfter' in write.key)).toEqual([]);
  });

  it('rejouée sur une base déjà migrée, elle ne touche plus à l’index TTL', async () => {
    const { writes } = await run(
      {
        collectionExists: true,
        indexes: [{ name: 'ExternalConversationPeer_purgeAfter_idx', key: { purgeAfter: 1 }, expireAfterSeconds: 0 }],
      },
      true,
    );

    expect(writes.filter((write) => write.kind === 'command')).toEqual([]);
    expect(writes.filter((write) => write.kind === 'createIndex' && 'purgeAfter' in write.key)).toEqual([]);
  });

  it('à blanc, elle dit ce qu’elle poserait sans rien écrire', async () => {
    const { writes, log } = await run({ collectionExists: false, indexes: [] }, false);

    expect(writes).toEqual([]);
    expect(log).toContain('ExternalConversationPeer_purgeAfter_idx');
  });
});
