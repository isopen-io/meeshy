// Le contrôle d'échantillonnage : relit un échantillon de chaque collection de
// l'inventaire et ÉCHOUE si un champ garde une forme réelle. Il ne rend jamais
// une valeur — seulement la collection, l'`_id`, le chemin et la règle — pour
// qu'un échec ne recopie pas dans un journal la donnée qu'il signale.

import { INVENTORY } from './inventory.mjs';
import { jsonCheck } from './patch.mjs';

const valueAt = (doc, path) => path.split('.').reduce((v, key) => (v == null ? v : v[key]), doc);

function docViolations(spec, doc, ctx) {
  const id = doc._id.toHexString();
  return Object.entries(spec.checks).flatMap(([field, pred]) => {
    const value = valueAt(doc, field);
    if (pred === 'json') {
      return jsonCheck(value, ctx).map((v) => ({ collection: spec.collection, id, field: v.path ? `${field}.${v.path}` : field, rule: v.rule }));
    }
    return pred(value, doc, ctx) ? [] : [{ collection: spec.collection, id, field, rule: 'forme non synthétique' }];
  });
}

export async function verifyDatabase(db, ctx, { sampleSize = 200, inventory = INVENTORY } = {}) {
  const checked = [];
  const violations = [];
  for (const spec of inventory) {
    const collection = db.collection(spec.collection);
    if (spec.action === 'purge') {
      const remaining = await collection.countDocuments(spec.filter ?? {});
      checked.push({ collection: spec.collection, sampled: remaining });
      if (remaining > 0) violations.push({ collection: spec.collection, id: '*', field: '*', rule: `${remaining} document(s) à purger subsistent` });
      continue;
    }
    if (!spec.checks) continue;
    const sample = await collection.aggregate([{ $sample: { size: sampleSize } }]).toArray();
    checked.push({ collection: spec.collection, sampled: sample.length });
    sample.forEach((doc) => violations.push(...docViolations(spec, doc, ctx)));
  }
  return { checked, violations };
}
