import type { Db } from 'mongodb';
import type { NamedMigration } from './types';

/**
 * #17117 — les index de `ExternalConversationPeer` (l'adresse de l'ami d'une
 * conversation externe), à poser AVANT d'armer `EXTERNAL_CONVERSATIONS` sur un
 * environnement. Jamais par `prisma db push` (#9035). Additive et idempotente.
 *
 * - `conversationId` unique : une conversation a au plus une adresse.
 * - (`openedByUserId`, `network`, `handle`) unique : rouvrir le même ami rend la
 *   même conversation, et deux ouvertures simultanées n'en créent pas deux.
 * - `purgeAfter` en TTL (`expireAfterSeconds: 0`) : le moniteur TTL de MongoDB
 *   efface la ligne — donc le numéro en clair — à l'échéance de conservation.
 *   L'index porte le NOM que Prisma lui donne : le moteur compare un index par
 *   nom et par clés, jamais par ses options, et ne le recrée pas.
 */

const COLLECTION = 'ExternalConversationPeer';

const UNIQUE_INDEXES = [
  { key: { conversationId: 1 }, name: 'ExternalConversationPeer_conversationId_key' },
  { key: { openedByUserId: 1, network: 1, handle: 1 }, name: 'ExternalConversationPeer_openedByUserId_network_handle_key' },
] as const;

const TTL_KEY = { purgeAfter: 1 } as const;
const TTL_INDEX = 'ExternalConversationPeer_purgeAfter_idx';

type TtlState = 'absent' | 'without-ttl' | 'present';

async function ttlState(db: Db): Promise<TtlState> {
  const collections = await db.listCollections({ name: COLLECTION }).toArray();
  if (collections.length === 0) return 'absent';
  const indexes = await db.collection(COLLECTION).listIndexes().toArray();
  const existing = indexes.find((index) => JSON.stringify(index.key) === JSON.stringify(TTL_KEY));
  if (!existing) return 'absent';
  return typeof existing.expireAfterSeconds === 'number' ? 'present' : 'without-ttl';
}

async function ensureTtl(db: Db, state: TtlState): Promise<void> {
  if (state === 'present') return;
  if (state === 'without-ttl') {
    await db.command({ collMod: COLLECTION, index: { keyPattern: TTL_KEY, expireAfterSeconds: 0 } });
    return;
  }
  await db.collection(COLLECTION).createIndex(TTL_KEY, { name: TTL_INDEX, expireAfterSeconds: 0 });
}

export const externalConversationPeerIndexes: NamedMigration = {
  name: '2026-11-10-external-conversation-peer-indexes',
  issue: '#17117',
  summary: 'index de ExternalConversationPeer (conversationId unique, triplet utilisateur-réseau-numéro unique, TTL sur purgeAfter)',
  async run({ db, dryRun, log }) {
    const state = await ttlState(db);
    if (dryRun) {
      UNIQUE_INDEXES.forEach((index) => log(`  poserait l'index unique ${index.name}`));
      log(`  ${TTL_INDEX} : ${state === 'present' ? 'déjà TTL' : state === 'without-ttl' ? 'serait rendu TTL (collMod)' : 'serait créé en TTL'}`);
      return;
    }
    for (const index of UNIQUE_INDEXES) {
      await db.collection(COLLECTION).createIndex(index.key, { name: index.name, unique: true });
    }
    await ensureTtl(db, state);
    log('  index de ExternalConversationPeer vérifiés');
  },
};
