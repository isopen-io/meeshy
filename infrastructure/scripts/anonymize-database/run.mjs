// Le moteur : applique l'inventaire à une base, en écriture ou à blanc.

import { randomBytes } from 'node:crypto';
import { INVENTORY } from './inventory.mjs';
import { patchFor } from './patch.mjs';

const BATCH = 500;

export function newContext({ salt, keepLogins = [], hashRandomPassword, issuePassword = async () => null }) {
  return {
    salt,
    keepLogins: new Set(keepLogins),
    keptUsernames: new Set(),
    missingKeepLogins: [],
    users: new Map(),
    byUsername: new Map(),
    byEmail: new Map(),
    byPhone: new Map(),
    identityWords: new Set(),
    keptCredentials: [],
    hashRandomPassword,
    issuePassword,
  };
}

export function passwordHasher({ bcrypt, cost, dryRun }) {
  if (dryRun) return async () => null;
  return () => bcrypt.hash(randomBytes(32).toString('base64url'), cost);
}

/**
 * Un mot de passe NEUF pour un compte de recette — jamais le haché d'origine,
 * qui resterait exploitable si le compte est un compte réel copié de la
 * production. Le clair ne vit qu'en mémoire jusqu'au fichier `600` de la CLI.
 */
export function passwordIssuer({ bcrypt, cost, dryRun }) {
  if (dryRun) return async () => null;
  return async () => {
    const password = randomBytes(18).toString('base64url');
    return { password, hash: await bcrypt.hash(password, cost) };
  };
}

async function runTransform(db, spec, ctx, { dryRun, record }) {
  if (spec.prepare) await spec.prepare(db, ctx);
  const collection = db.collection(spec.collection);
  const cursor = collection.find(spec.filter ?? {}).batchSize(BATCH);
  const pending = [];
  const result = { matched: 0, modified: 0 };
  const flush = async () => {
    if (pending.length === 0) return;
    const ops = pending.splice(0, pending.length);
    if (dryRun) return;
    const written = await collection.bulkWrite(ops, { ordered: false });
    result.modified += written.modifiedCount;
  };
  for await (const doc of cursor) {
    const patch = patchFor(doc, ctx, spec.collection, record);
    await spec.transform(patch, ctx);
    const update = patch.build();
    if (!update) continue;
    result.matched += 1;
    pending.push({ updateOne: { filter: { _id: doc._id }, update } });
    if (pending.length >= BATCH) await flush();
  }
  await flush();
  return result;
}

async function runConstant(db, spec, _ctx, { dryRun }) {
  const collection = db.collection(spec.collection);
  if (dryRun) return { matched: await collection.countDocuments(spec.filter), modified: 0 };
  const written = await collection.updateMany(spec.filter, spec.update);
  return { matched: written.matchedCount, modified: written.modifiedCount };
}

async function runPurge(db, spec, _ctx, { dryRun }) {
  const collection = db.collection(spec.collection);
  const filter = spec.filter ?? {};
  if (dryRun) return { matched: await collection.countDocuments(filter), deleted: 0 };
  const removed = await collection.deleteMany(filter);
  return { matched: removed.deletedCount, deleted: removed.deletedCount };
}

/**
 * Anonymise la base `db`. Rend le rapport par collection et le manifeste des
 * fichiers référencés (chemins d'ORIGINE → remplaçant), que l'appelant écrit.
 * En `dryRun`, rien n'est écrit : `matched` compte ce qui serait modifié.
 */
export async function anonymizeDatabase(db, ctx, { dryRun = false, inventory = INVENTORY } = {}) {
  const manifest = [];
  const record = (entry) => manifest.push(entry);
  const report = [];
  for (const spec of inventory) {
    const run = spec.action === 'purge' ? runPurge : spec.action === 'constant' ? runConstant : runTransform;
    const outcome = await run(db, spec, ctx, { dryRun, record });
    report.push({ collection: spec.collection, action: spec.action, ...outcome });
  }
  if (!dryRun) {
    await db.collection('_anonymizationRuns').insertOne({
      at: new Date(),
      keptLogins: ctx.keptUsernames.size,
      collections: report.map(({ collection, action, matched }) => ({ collection, action, matched })),
    });
  }
  return { report, manifest, missingKeepLogins: ctx.missingKeepLogins, keptCredentials: ctx.keptCredentials };
}
