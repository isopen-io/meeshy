// Témoins de la ligne de commande (#9663) : monde fermé des collections, garde
// de cible après connexion, oplog, drapeaux inconnus, reprise après
// interruption. Base jetable : un replica set d'un membre.
//
//   node --import tsx --test infrastructure/scripts/anonymize-database*.test.mjs

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from './anonymize-database.mjs';
import { ProductionGuardError, STAGING_TARGET } from './anonymize-database/guard.mjs';
import { anonymizeDatabase, newContext, passwordHasher, passwordIssuer } from './anonymize-database/run.mjs';
import { verifyDatabase } from './anonymize-database/verify.mjs';
import { INVENTORY } from './anonymize-database/inventory.mjs';
import { manifestJournal } from './anonymize-database/state.mjs';
import { PINNED } from './anonymize-database/deps.mjs';
import { loadBcrypt, loadMongo } from './anonymize-database/deps.mjs';
import { startMongo, targetFlags, uriFor } from './anonymize-database/test-mongo.mjs';
import { seed as seedWith } from './anonymize-database/test-seed.mjs';
import * as s from './anonymize-database/synth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const TEST_ENV = { MEESHY_ENV: 'test' };

let mongo;
let driver;
let bcrypt;

before(async () => {
  driver = await loadMongo();
  bcrypt = await loadBcrypt();
  mongo = await startMongo();
});

after(async () => {
  await mongo?.stop();
});

let counter = 0;
async function freshDb() {
  const db = mongo.client.db(`anon_cli_${process.pid}_${counter++}`);
  await db.dropDatabase();
  const ids = await seedWith(db, { ObjectId: driver.ObjectId, Binary: driver.Binary, bcrypt });
  return { db, ids };
}

async function snapshot(db) {
  const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
  return Object.fromEntries(await Promise.all(names.map(async (n) => [n, await db.collection(n).find().sort({ _id: 1 }).toArray()])));
}

const workdir = () => mkdtempSync(path.join(tmpdir(), 'anon-cli-'));

async function run(db, args, { target = targetFlags(mongo) } = {}) {
  const lines = [];
  const code = await main(['--uri', uriFor(mongo, db.databaseName), ...target, ...args], { env: TEST_ENV, log: (l) => lines.push(l) });
  return { code, lines, text: lines.join('\n') };
}

const write = (dir) => ['--i-know-this-is-not-production', '--bcrypt-cost', '4', '--manifest', path.join(dir, 'm.jsonl')];

describe('drapeaux', () => {
  it('un drapeau inconnu est refusé avant toute connexion — `--dryrun` mal tapé n’écrit rien', async () => {
    const { db } = await freshDb();
    const before = await snapshot(db);
    await assert.rejects(run(db, ['--i-know-this-is-not-production', '--dryrun']), (e) => e instanceof ProductionGuardError && /--dryrun/.test(e.message));
    await assert.rejects(run(db, ['--dry-run=non']), ProductionGuardError);
    await assert.rejects(run(db, ['--sample-size', '10', '--dry-run']), /--sample-size/);
    assert.deepEqual(await snapshot(db), before);
  });
});

describe('monde fermé des collections', () => {
  it('une collection ni inventoriée ni déclarée est refusée AVANT toute écriture', async () => {
    const { db } = await freshDb();
    await db.collection('MessageTranslation').insertOne({ translatedContent: 'Mon adresse : 10 rue des Essais', targetLanguage: 'en' });
    await db.collection('User_backup_20260901').insertOne({ username: 'jeanne.essai', email: 'jeanne.essai@real-mail.test' });
    await db.collection('user_conversation_preferences').insertOne({ customName: 'Maman' });
    const before = await snapshot(db);
    const dir = workdir();
    await assert.rejects(run(db, write(dir)), (e) => e instanceof ProductionGuardError && ['MessageTranslation', 'User_backup_20260901', 'user_conversation_preferences'].every((c) => e.message.includes(c)));
    assert.deepEqual(await snapshot(db), before, 'rien n’est écrit');
    rmSync(dir, { recursive: true, force: true });
  });

  it('--drop-collection retire une collection inconnue nommée, jamais une collection inventoriée', async () => {
    const { db } = await freshDb();
    await db.collection('User_backup_20260901').insertOne({ email: 'jeanne.essai@real-mail.test' });
    const dir = workdir();
    await assert.rejects(run(db, [...write(dir), '--drop-collection', 'User_backup_20260901', '--drop-collection', 'User']), /ne retire jamais une collection inventoriée : User$/);
    const dry = await run(db, ['--dry-run', '--drop-collection', 'User_backup_20260901']);
    assert.equal(dry.code, 0);
    assert.match(dry.text, /User_backup_20260901/);
    assert.ok((await db.listCollections({ name: 'User_backup_20260901' }).toArray()).length === 1, 'à blanc, rien n’est retiré');
    const done = await run(db, [...write(dir), '--oplog-rebuild-pending', '--drop-collection', 'User_backup_20260901']);
    assert.equal(done.code, 0, done.text);
    assert.equal((await db.listCollections({ name: 'User_backup_20260901' }).toArray()).length, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('le contrôle échoue sur une collection inconnue apparue, sur une base vide ou mal nommée', async () => {
    const { db } = await freshDb();
    const ctx = newContext({ salt: s.newSalt(), hashRandomPassword: passwordHasher({ bcrypt, cost: 4 }), issuePassword: passwordIssuer({ bcrypt, cost: 4 }) });
    await anonymizeDatabase(db, ctx);
    await db.collection('MessageTranslation').insertOne({ translatedContent: 'Bonjour Jeanne' });
    const { violations } = await verifyDatabase(db, ctx);
    assert.ok(violations.some((v) => v.collection === 'MessageTranslation'), 'collection inconnue non signalée');

    const withoutUsers = mongo.client.db(`anon_cli_sans_compte_${process.pid}`);
    await withoutUsers.dropDatabase();
    await withoutUsers.collection('Conversation').insertOne({ identifier: 'mshy_0123456789abcdef', type: 'group', title: 'Phare.' });
    const noAccount = await verifyDatabase(withoutUsers, ctx);
    assert.ok(noAccount.reread > 0);
    assert.ok(noAccount.violations.some((v) => v.collection === 'User' && /aucun compte/.test(v.rule)), 'une base sans compte passe le contrôle');

    const empty = mongo.client.db(`anon_cli_vide_${process.pid}`);
    await empty.dropDatabase();
    const dir = workdir();
    const outcome = await run(empty, [...write(dir), '--oplog-rebuild-pending']);
    assert.equal(outcome.code, 2, 'une base sans compte ne passe pas le contrôle');
    assert.match(outcome.text, /User/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('garde de cible après connexion', () => {
  it('la cible attendue par défaut est celle du compose de staging', () => {
    const compose = readFileSync(path.join(repoRoot, 'infrastructure/docker/compose/docker-compose.staging.yml'), 'utf8');
    const initiate = /rs\.initiate\(\{\s*_id:\s*"([^"]+)",\s*members:\s*\[\{\s*_id:\s*0,\s*host:\s*"([^"]+)"/.exec(compose);
    assert.ok(initiate, 'rs.initiate introuvable dans le compose de staging');
    assert.deepEqual(STAGING_TARGET, { setName: initiate[1], hosts: [initiate[2]] });
  });

  it('refuse, sans rien écrire, un serveur que hello ne désigne pas comme la cible attendue', async () => {
    const { db } = await freshDb();
    const before = await snapshot(db);
    const dir = workdir();
    await assert.rejects(run(db, write(dir), { target: [] }), (e) => e instanceof ProductionGuardError && /database-staging:27017/.test(e.message));
    await assert.rejects(run(db, write(dir), { target: ['--expect-replica-set', mongo.target.setName, '--expect-host', 'database-staging:27017'] }), ProductionGuardError);
    await assert.rejects(run(db, write(dir), { target: ['--expect-replica-set', 'rs0', ...mongo.target.hosts.flatMap((h) => ['--expect-host', h])] }), ProductionGuardError);
    await assert.rejects(run(db, ['--verify-only', '--manifest', path.join(dir, 'm.jsonl')], { target: [] }), ProductionGuardError);
    assert.deepEqual(await snapshot(db), before);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('oplog', () => {
  it('le contrôle final échoue tant que l’oplog garde des entrées antérieures à l’exécution, et dit quoi faire', async () => {
    const { db } = await freshDb();
    const dir = workdir();
    const outcome = await run(db, write(dir));
    assert.equal(outcome.code, 2);
    assert.match(outcome.text, /oplog/i);
    assert.match(outcome.text, /volume neuf/);
    const oplog = JSON.stringify(await mongo.client.db('local').collection('oplog.rs').find({}).toArray());
    assert.ok(oplog.includes('jeanne.essai@real-mail.test'), 'le témoin suppose que l’oplog garde l’original');
    const verify = await run(db, ['--verify-only', '--manifest', path.join(dir, 'm.jsonl')]);
    assert.equal(verify.code, 2, '--verify-only rougit aussi sur l’ancien oplog');
    const pending = await run(db, ['--verify-only', '--oplog-rebuild-pending', '--manifest', path.join(dir, 'm.jsonl')]);
    assert.equal(pending.code, 0, pending.text);
    assert.match(pending.text, /PAS servable/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('après restauration dans un mongod NEUF, le contrôle passe et aucun original n’est dans le nouvel oplog', async () => {
    const { db } = await freshDb();
    const dir = workdir();
    const manifest = path.join(dir, 'm.jsonl');
    assert.equal((await run(db, [...write(dir), '--oplog-rebuild-pending'])).code, 0);
    const fresh = await startMongo();
    try {
      const target = fresh.client.db(db.databaseName);
      for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
        const docs = await db.collection(name).find().toArray();
        if (docs.length > 0) await target.collection(name).insertMany(docs);
      }
      const lines = [];
      const code = await main(['--uri', uriFor(fresh, db.databaseName), ...targetFlags(fresh), '--verify-only', '--manifest', manifest], { env: TEST_ENV, log: (l) => lines.push(l) });
      assert.equal(code, 0, lines.join('\n'));
      const oplog = JSON.stringify(await fresh.client.db('local').collection('oplog.rs').find({}).toArray());
      assert.doesNotMatch(oplog, /real-mail|33612345678|jeanne\.essai/);
    } finally {
      await fresh.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('reprise après interruption', () => {
  it('une relance avec le même manifeste garde les mots d’identité et les relations, sans valeur réelle en clair', async () => {
    const { db, ids } = await freshDb();
    const dir = workdir();
    const manifest = path.join(dir, 'm.jsonl');
    const salt = s.newSalt();
    const ctx = newContext({ salt, keepLogins: [], hashRandomPassword: passwordHasher({ bcrypt, cost: 4 }), issuePassword: passwordIssuer({ bcrypt, cost: 4 }) });
    const journal = manifestJournal(manifest);
    await journal.open(salt, { resume: false });
    const cut = INVENTORY.findIndex((spec) => spec.collection === 'UserContact');
    await anonymizeDatabase(db, ctx, { inventory: INVENTORY.slice(0, cut), journal });

    const outcome = await run(db, [...write(dir), '--oplog-rebuild-pending']);
    assert.equal(outcome.code, 0, outcome.text);
    const recette = await db.collection('User').findOne({ _id: ids.recette });
    const contact = await db.collection('UserContact').findOne({ _id: ids.contact });
    assert.equal(contact.phoneNumbers[0], recette.phoneNumber, 'le contact rapproché suit encore son compte après reprise');
    assert.equal(contact.emails[0], recette.email);
    const prefs = await db.collection('user_preferences').findOne();
    assert.ok(s.isSyntheticText(prefs.application.voiceProfile), 'le filtre d’identité survit à la reprise');
    const rows = readFileSync(manifest, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const state = rows.filter((r) => typeof r.original !== 'string');
    assert.ok(state.some((r) => r.kind === 'identity' && r.words.length > 0));
    assert.ok(rows.some((r) => typeof r.original === 'string'), 'les références de fichiers de la première passe sont gardées');
    assert.doesNotMatch(JSON.stringify(state), /jeanne|essai|real-mail|33612345678|698765432/i, 'l’état du manifeste ne porte aucune valeur réelle en clair');
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuse un --salt qui contredit le sel du manifeste', async () => {
    const { db } = await freshDb();
    const dir = workdir();
    const manifest = path.join(dir, 'm.jsonl');
    const journal = manifestJournal(manifest);
    await journal.open(s.newSalt(), { resume: false });
    await assert.rejects(run(db, [...write(dir), '--salt', s.newSalt()]), /sel/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('dépendances', () => {
  it('versions EXACTES, et la procédure installe exactement celles-là', () => {
    Object.values(PINNED).forEach((version) => assert.match(version, /^\d+\.\d+\.\d+$/));
    const readme = readFileSync(path.join(here, 'README-anonymize-database.md'), 'utf8');
    const install = /npm install[^\n]*/.exec(readme)?.[0] ?? '';
    assert.ok(install.includes(`mongodb@${PINNED.mongodb}`) && install.includes(`bcryptjs@${PINNED.bcryptjs}`), install);
    assert.doesNotMatch(readme, /mongodb@7 |bcryptjs@3 /);
  });
});
