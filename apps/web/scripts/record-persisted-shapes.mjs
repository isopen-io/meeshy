#!/usr/bin/env node
/**
 * RÉENREGISTRE L'EMPREINTE DES FORMES PERSISTÉES (#18923) —
 * `node scripts/record-persisted-shapes.mjs`, depuis `apps/web`.
 *
 * Sous le MÊME `CACHE_SCHEMA`, il refuse un changement que l'ancien cache ne
 * supporterait pas (champ requis ajouté, type changé, conteneur remplacé) : il
 * faut d'abord incrémenter `CACHE_SCHEMA` (`src/lib/api/query-client.ts`),
 * ce qui purge une fois le cache des lecteurs. Un changement lisible (champ
 * optionnel ajouté, champ retiré) se réenregistre sans incrément. Le cache
 * survit aux versions ; c'est cette empreinte qui l'autorise.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { LOCK_FILE, WEB_ROOT, describePersistedShapes, judgePersistedShapes, readCacheSchema } from './lib/persisted-shapes.mjs';

const schema = readCacheSchema();
const current = describePersistedShapes();
const lock = existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : null;
const verdict = lock === null ? { status: 'absent', problems: [] } : judgePersistedShapes({ lock, current, schema });

if (verdict.status === 'incompatible') {
  console.error(`✗ Sous CACHE_SCHEMA ${schema}, ces formes persistées ne se liraient plus depuis un cache existant :`);
  for (const problem of verdict.problems) console.error(`  - ${problem}`);
  console.error('Incrémentez CACHE_SCHEMA dans src/lib/api/query-client.ts, puis relancez ce script.');
  process.exit(1);
}

writeFileSync(LOCK_FILE, `${JSON.stringify({ schema, ...current }, null, 1)}\n`);
console.log(`✓ ${path.relative(WEB_ROOT, LOCK_FILE)} — ${Object.keys(current.families).length} familles sous CACHE_SCHEMA ${schema} (${verdict.status}).`);
