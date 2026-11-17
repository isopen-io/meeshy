/**
 * #18924 — L'ARBITRAGE DE MON PROFIL SYNCHRONISÉ VIT HORS DE ZOD. Un client web
 * qui applique `profile:updated` n'a besoin que des neuf champs, de leurs types
 * et de la règle « jamais plus ancien » ; les importer de `own-profile-sync.ts`
 * tirait `zod` CLASSIQUE dans le morceau partagé du web (8,69 → 18,21 Ko gzip),
 * même piège que `game-sync.ts` (#10904 → `game-sync-order.ts`). La passerelle,
 * elle, garde son import : `own-profile-sync.ts` réexporte ces symboles.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as order from '../own-profile-sync-order';
import * as contract from '../own-profile-sync';

describe('own-profile-sync-order — le module que le web importe ne tire pas zod', () => {
  it('aucun import à l’exécution : ni zod, ni module qui le porterait', () => {
    const source = readFileSync(join(__dirname, '..', 'own-profile-sync-order.ts'), 'utf8');

    expect(source).not.toMatch(/^\s*import\s+(?!type\b)/m);
    expect(source).not.toMatch(/^\s*export\s+(?!type\b)[^;]*\bfrom\s/m);
  });

  it('le contrat de la passerelle réexporte les MÊMES symboles : une seule règle, une seule liste de champs', () => {
    expect(contract.ownProfileSnapshotIsStale).toBe(order.ownProfileSnapshotIsStale);
    expect(contract.OWN_PROFILE_FIELDS).toBe(order.OWN_PROFILE_FIELDS);
  });

  it('le schéma de la passerelle décrit exactement les champs du module sans zod', () => {
    expect(Object.keys(contract.ownProfileSnapshotSchema.shape).sort()).toEqual([...order.OWN_PROFILE_FIELDS].sort());
  });
});
