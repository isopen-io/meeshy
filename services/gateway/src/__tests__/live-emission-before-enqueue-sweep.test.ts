/**
 * Le cliquet de #17026 — aucune émission vivante non gardée en amont d'un
 * enfilage durable.
 *
 * Le détail de la règle, de ses limites et de la réparation attendue vit dans
 * `live-emission-before-enqueue-sweep.ts`. Ce fichier gèle l'inventaire, et
 * prouve d'abord que le balayage BALAIE — une garde négative dont le balayage
 * rend `[]` reste verte, et c'est le piège exact de cette famille de cliquets.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';

import {
  sweepUnguardedLiveEmissions,
  FROZEN_UNGUARDED_LIVE_EMISSIONS,
  GATEWAY_SRC,
} from './live-emission-before-enqueue-sweep';

describe('#17026 — une émission vivante ne précède pas un enfilage durable sans garde', () => {
  it("le balayage ATTEINT les unités qui enfilent — sans quoi son vert ne dit rien", () => {
    // La condition minimale pour que ce cliquet puisse tomber : il doit voir
    // les fichiers où la règle s'applique. On l'interroge sur sa propre
    // couverture plutôt que de la supposer.
    const { readFileSync } = require('fs') as typeof import('fs');
    const { walk } = require('./detached-promise-catch-sweep') as typeof import('./detached-promise-catch-sweep');
    const enfileurs = walk(GATEWAY_SRC).filter(
      (file) =>
        file.endsWith('.ts') &&
        !file.includes('__tests__') &&
        !file.endsWith('.test.ts') &&
        /enqueueForOfflineParticipants|_enqueueOfflineEventForParticipants|enqueueOfflineMessageMutation/.test(
          readFileSync(file, 'utf8'),
        ),
    );

    expect(enfileurs.length).toBeGreaterThanOrEqual(10);
  });

  it("l'inventaire est VIDE, et le reste", () => {
    const found = sweepUnguardedLiveEmissions(GATEWAY_SRC);

    // Un message d'échec qui NOMME le site : sans lui, le cliquet dit « 1 au
    // lieu de 0 » et laisse chercher dans dix-neuf fichiers.
    expect(found.map((f) => `${f.file} « ${f.emission} »`)).toEqual(
      FROZEN_UNGUARDED_LIVE_EMISSIONS.map((f) => `${f.file} « ${f.emission} »`),
    );
    expect(FROZEN_UNGUARDED_LIVE_EMISSIONS).toEqual([]);
  });
});
