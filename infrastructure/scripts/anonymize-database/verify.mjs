// Le contrôle final : relit TOUS les documents de chaque collection de
// l'inventaire (sous 1 000 comptes, un parcours complet coûte peu) et ÉCHOUE si
// un champ garde une forme réelle, si une collection n'est ni inventoriée ni
// déclarée sans donnée personnelle, si `User` est vide ou si aucun document
// n'a été relu (mauvaise base). Il ne rend jamais une valeur — seulement la
// collection, l'`_id`, le chemin et la règle — pour qu'un échec ne recopie pas
// dans un journal la donnée qu'il signale.
//
// `oplogLeftovers` dit si `local.oplog.rs` remonte AVANT le début de
// l'exécution : les insertions de la restauration y gardent alors les
// originaux, quel que soit l'état de la base.

import { INVENTORY } from './inventory.mjs';
import { jsonCheck } from './patch.mjs';
import { auditCollections } from './collections.mjs';
import { loadMongo } from './deps.mjs';

const valueAt = (doc, path) => path.split('.').reduce((v, key) => (v == null ? v : v[key]), doc);

function docViolations(spec, doc, ctx) {
  const id = doc._id?.toHexString?.() ?? String(doc._id);
  return Object.entries(spec.checks).flatMap(([field, pred]) => {
    const value = valueAt(doc, field);
    if (pred === 'json' || pred === 'settings') {
      return jsonCheck(value, ctx, pred === 'json' ? 'strict' : 'settings').map((v) => ({ collection: spec.collection, id, field: v.path ? `${field}.${v.path}` : field, rule: v.rule }));
    }
    return pred(value, doc, ctx) ? [] : [{ collection: spec.collection, id, field, rule: 'forme non synthétique' }];
  });
}

async function readAll(collection, spec, ctx, violations) {
  let reread = 0;
  for await (const doc of collection.find(spec.filter ?? {}).batchSize(500)) {
    reread += 1;
    violations.push(...docViolations(spec, doc, ctx));
  }
  return reread;
}

export async function verifyDatabase(db, ctx, { inventory = INVENTORY } = {}) {
  const checked = [];
  const violations = [];
  const { unknown } = await auditCollections(db, { inventory });
  unknown.forEach((name) => violations.push({ collection: name, id: '*', field: '*', rule: 'collection ni inventoriée ni déclarée sans donnée personnelle' }));
  for (const spec of inventory) {
    const collection = db.collection(spec.collection);
    if (spec.action === 'purge') {
      const remaining = await collection.countDocuments(spec.filter ?? {});
      checked.push({ collection: spec.collection, reread: remaining });
      if (remaining > 0) violations.push({ collection: spec.collection, id: '*', field: '*', rule: `${remaining} document(s) à purger subsistent` });
      continue;
    }
    if (!spec.checks) continue;
    checked.push({ collection: spec.collection, reread: await readAll(collection, { ...spec, filter: spec.action === 'constant' ? {} : spec.filter }, ctx, violations) });
  }
  const users = checked.find((c) => c.collection === 'User')?.reread ?? 0;
  const reread = checked.reduce((n, c) => n + c.reread, 0);
  if (users === 0) violations.push({ collection: 'User', id: '*', field: '*', rule: 'aucun compte relu : base vide ou mauvaise base' });
  if (reread === 0) violations.push({ collection: '*', id: '*', field: '*', rule: 'aucun document relu : base vide ou mauvaise base' });
  return { checked, violations, reread };
}

/** La date de début de la dernière exécution terminée, lue dans `_anonymizationRuns`. */
export async function lastRunStart(db) {
  const [last] = await db.collection('_anonymizationRuns').find({ startedAt: { $type: 'date' } }).sort({ startedAt: -1 }).limit(1).toArray();
  return last?.startedAt ?? null;
}

/**
 * Les entrées de `local.oplog.rs` dont l'horodatage est ANTÉRIEUR OU ÉGAL (à la
 * seconde) au début de l'exécution. Un serveur sans oplog (hors replica set)
 * n'en a aucune.
 */
export async function oplogLeftovers(client, since) {
  const local = client.db('local');
  if ((await local.listCollections({ name: 'oplog.rs' }, { nameOnly: true }).toArray()).length === 0) return { present: false, older: 0 };
  const seconds = Math.floor(since.getTime() / 1000);
  const { Timestamp } = await loadMongo();
  const older = await local.collection('oplog.rs').countDocuments({ ts: { $lte: new Timestamp({ t: seconds, i: 0xffffffff }) } });
  return { present: true, older };
}
