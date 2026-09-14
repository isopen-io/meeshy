/**
 * Tests de la migration 013 — exécutée par `vm`, pas dupliquée.
 *
 * `013_store_media_keys_not_urls.js` est un script mongosh autonome (pas de
 * module system) : ces tests l'évaluent TEL QUEL contre un `db` factice, en
 * observant les mêmes surfaces qu'une vraie passe — comptage, sauvegarde,
 * réécriture, idempotence — sans jamais réécrire sa logique ailleurs (donc
 * aucun risque de dérive entre le script réel et un « miroir » de test).
 *
 * Run:
 *   npx tsx scripts/migrations/mongodb/__tests__/013_store_media_keys_not_urls.test.ts
 *
 * Utilise `node:assert` — aucun runner externe : `scripts/` n'est couvert ni par
 * jest ni par vitest. Même harnais que scripts/migrations/__tests__/strip-spaces-from-usernames.test.ts.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// ---------------------------------------------------------------------------
// Minimal test harness (identique aux autres tests de scripts/migrations)
// ---------------------------------------------------------------------------

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];

function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

function runAll(): void {
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed += 1;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Fake Mongo — juste assez pour ce que le script appelle : find/updateOne
// sur des collections nommées, un upsert `$setOnInsert` qui ne réécrit pas
// une sauvegarde existante, un `$set` qui mute le document ciblé.
// ---------------------------------------------------------------------------

type Doc = Record<string, unknown>;

class FakeCollection {
  docs: Doc[];
  updateCalls: Array<{ filter: Doc; update: Doc; opts: Doc }> = [];

  constructor(docs: Doc[] = []) {
    this.docs = docs;
  }

  find(filtre: Record<string, RegExp>) {
    const [field, matcher] = Object.entries(filtre)[0] as [string, RegExp];
    const matched = this.docs.filter((d) => typeof d[field] === 'string' && matcher.test(d[field] as string));
    let i = 0;
    return {
      hasNext: () => i < matched.length,
      next: () => matched[i++],
    };
  }

  updateOne(filter: Doc, update: { $set?: Doc; $setOnInsert?: Doc }, opts: Doc = {}) {
    this.updateCalls.push({ filter, update, opts });
    let doc = this.docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v));
    const isNew = !doc;
    if (!doc) {
      if (!opts.upsert) return;
      doc = { ...filter };
      this.docs.push(doc);
    }
    if (update.$set) Object.assign(doc, update.$set);
    if (isNew && update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
  }
}

class FakeDb {
  private collections = new Map<string, FakeCollection>();

  getName(): string {
    return 'meeshy-test';
  }

  getCollection(name: string): FakeCollection {
    if (!this.collections.has(name)) this.collections.set(name, new FakeCollection());
    return this.collections.get(name)!;
  }
}

// ---------------------------------------------------------------------------
// Exécution du script réel dans un contexte `vm`
// ---------------------------------------------------------------------------

const SCRIPT_PATH = path.resolve(__dirname, '../013_store_media_keys_not_urls.js');
const SOURCE = readFileSync(SCRIPT_PATH, 'utf8');

function runMigration(opts: { docs: Record<string, Doc[]>; appliquer?: boolean }): {
  db: FakeDb;
  printed: string[];
} {
  const db = new FakeDb();
  for (const [collection, docs] of Object.entries(opts.docs)) {
    db.getCollection(collection).docs.push(...docs.map((d) => ({ ...d })));
  }
  const printed: string[] = [];
  const sandbox: Record<string, unknown> = {
    db,
    print: (s: string) => printed.push(s),
  };
  if (opts.appliquer) sandbox.APPLIQUER = true;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: SCRIPT_PATH });
  return { db, printed };
}

// ---------------------------------------------------------------------------
// La forme HÉRITÉE (#6390) : hôte + clé nue, sans route de flux
// ---------------------------------------------------------------------------

test('simulation : une adresse héritée avec hôte est COMPTÉE, rien n\'est écrit', () => {
  const { db, printed } = runMigration({
    docs: {
      MessageAttachment: [
        { _id: 'a1', fileUrl: 'https://gate.meeshy.me/2026/09/abc/photo.png' },
      ],
    },
    appliquer: false,
  });

  assert.ok(printed.some((l) => l.includes('MessageAttachment.fileUrl : 1 à réécrire')));
  assert.equal(db.getCollection('MessageAttachment').docs[0].fileUrl, 'https://gate.meeshy.me/2026/09/abc/photo.png');
  assert.equal(db.getCollection('MediaUrl_backup_013').docs.length, 0);
});

test('écriture : une adresse héritée avec hôte devient la clé nue, sauvegardée puis idempotente', () => {
  const first = runMigration({
    docs: {
      MessageAttachment: [
        { _id: 'a1', fileUrl: 'https://gate.meeshy.me/2026/09/abc/photo.png' },
      ],
    },
    appliquer: true,
  });

  const reecrit = first.db.getCollection('MessageAttachment').docs[0];
  assert.equal(reecrit.fileUrl, '2026/09/abc/photo.png');

  const sauvegarde = first.db.getCollection('MediaUrl_backup_013').docs;
  assert.equal(sauvegarde.length, 1);
  assert.equal(sauvegarde[0].valeurOrigine, 'https://gate.meeshy.me/2026/09/abc/photo.png');
  assert.equal(sauvegarde[0].collection, 'MessageAttachment');
  assert.equal(sauvegarde[0].champ, 'fileUrl');

  // Rejouer sur le résultat : plus rien à réécrire (le champ ne porte plus
  // la forme héritée), et la sauvegarde n'est pas doublée.
  const second = runMigration({
    docs: { MessageAttachment: [reecrit] },
    appliquer: true,
  });
  assert.ok(second.printed.some((l) => l.includes('MessageAttachment.fileUrl : 0 à réécrire')));
  assert.equal(second.db.getCollection('MediaUrl_backup_013').docs.length, 0);
});

test('écriture : un chemin relatif hérité (sans hôte) devient aussi la clé nue', () => {
  const { db } = runMigration({
    docs: {
      User: [{ _id: 'u1', avatar: '/2026/09/u1/avatar.png' }],
    },
    appliquer: true,
  });
  assert.equal(db.getCollection('User').docs[0].avatar, '2026/09/u1/avatar.png');
});

test('la forme historique (route de flux, encodée) reste reconnue', () => {
  const { db } = runMigration({
    docs: {
      MessageAttachment: [
        { _id: 'a2', fileUrl: '/api/v1/attachments/file/2026%2F09%2Fabc%2Fphoto.png' },
      ],
    },
    appliquer: true,
  });
  assert.equal(db.getCollection('MessageAttachment').docs[0].fileUrl, '2026/09/abc/photo.png');
});

test('une URL externe traverse inchangée — jamais comptée', () => {
  const { db, printed } = runMigration({
    docs: {
      MessageAttachment: [{ _id: 'a3', fileUrl: 'https://cdn.example.com/photo.jpg' }],
    },
    appliquer: true,
  });
  assert.ok(printed.some((l) => l.includes('MessageAttachment.fileUrl : 0 à réécrire')));
  assert.equal(db.getCollection('MessageAttachment').docs[0].fileUrl, 'https://cdn.example.com/photo.jpg');
});

test('le magasin STATIQUE (#4625) traverse inchangé — son chemin ne porte pas de date', () => {
  const { db, printed } = runMigration({
    docs: {
      Community: [{ _id: 'c1', avatar: 'https://static.meeshy.me/u/i/2025/11/banner.png' }],
    },
    appliquer: true,
  });
  assert.ok(printed.some((l) => l.includes('Community.avatar : 0 à réécrire')));
  assert.equal(db.getCollection('Community').docs[0].avatar, 'https://static.meeshy.me/u/i/2025/11/banner.png');
});

test('une clé déjà nue (cible finale) ne matche plus rien', () => {
  const { db, printed } = runMigration({
    docs: {
      Participant: [{ _id: 'p1', avatar: '2026/09/p1/avatar.png' }],
    },
    appliquer: true,
  });
  assert.ok(printed.some((l) => l.includes('Participant.avatar : 0 à réécrire')));
  assert.equal(db.getCollection('Participant').docs[0].avatar, '2026/09/p1/avatar.png');
});

test('les cinq champs cibles sont balayés, même sans aucune ligne à migrer', () => {
  const { printed } = runMigration({ docs: {}, appliquer: false });
  for (const ligne of [
    'MessageAttachment.fileUrl',
    'MessageAttachment.thumbnailUrl',
    'Participant.avatar',
    'User.avatar',
    'Community.avatar',
  ]) {
    assert.ok(printed.some((l) => l.startsWith(`  ${ligne} : 0 à réécrire`)), `manquant : ${ligne}`);
  }
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Running 013_store_media_keys_not_urls tests...\n');
runAll();
