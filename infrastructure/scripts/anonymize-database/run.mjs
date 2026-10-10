// Le moteur : applique l'inventaire à une base, en écriture ou à blanc.

import { randomBytes } from 'node:crypto';
import { INVENTORY } from './inventory.mjs';
import { patchFor } from './patch.mjs';

export { newContext } from './context.mjs';

const BATCH = 500;

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

async function runTransform(db, spec, ctx, { dryRun, journal }) {
  const collection = db.collection(spec.collection);
  const cursor = collection.find(spec.filter ?? {}).batchSize(BATCH);
  const pending = [];
  const recorded = [];
  const all = [];
  const record = (entry) => {
    recorded.push(entry);
    all.push(entry);
  };
  const result = { matched: 0, modified: 0 };
  const flush = async () => {
    if (pending.length === 0) return;
    const ops = pending.splice(0, pending.length);
    const media = recorded.splice(0, recorded.length);
    if (dryRun) return;
    await journal?.media(media);
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
  return { ...result, manifest: all };
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

async function dropCollections(db, names, { dryRun }) {
  const report = [];
  for (const name of names) {
    const matched = await db.collection(name).countDocuments();
    if (!dryRun) await db.collection(name).drop();
    report.push({ collection: name, action: 'drop', matched, deleted: dryRun ? 0 : matched });
  }
  return report;
}

/**
 * Anonymise la base `db`. `drop` nomme les collections inconnues que
 * l'opérateur a demandé de retirer (après le relevé `auditCollections`).
 * `journal` (manifestJournal) reçoit l'état après chaque pré-passe et les
 * références de fichiers AVANT l'écriture qui les déréférence. En `dryRun`,
 * rien n'est écrit : `matched` compte ce qui serait modifié.
 */
export async function anonymizeDatabase(db, ctx, { dryRun = false, inventory = INVENTORY, journal = null, drop = [] } = {}) {
  ctx.startedAt ??= new Date();
  const manifest = [];
  const report = await dropCollections(db, drop, { dryRun });
  for (const spec of inventory) {
    if (spec.prepare) {
      await spec.prepare(db, ctx);
      if (!dryRun) await journal?.state(ctx);
    }
    const run = spec.action === 'purge' ? runPurge : spec.action === 'constant' ? runConstant : runTransform;
    const { manifest: recorded = [], ...outcome } = await run(db, spec, ctx, { dryRun, journal });
    manifest.push(...recorded);
    report.push({ collection: spec.collection, action: spec.action, ...outcome });
  }
  if (!dryRun) {
    await db.collection('_anonymizationRuns').insertOne({
      startedAt: ctx.startedAt,
      finishedAt: new Date(),
      keptLogins: ctx.keptUsernames.size,
      collections: report.map(({ collection, action, matched }) => ({ collection, action, matched })),
    });
  }
  return { report, manifest, missingKeepLogins: ctx.missingKeepLogins, keptCredentials: ctx.keptCredentials };
}
