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
  sweepReach,
  FROZEN_UNGUARDED_LIVE_EMISSIONS,
  GATEWAY_SRC,
} from './live-emission-before-enqueue-sweep';

describe('#17026 — une émission vivante ne précède pas un enfilage durable sans garde', () => {
  it("le balayage ATTEINT les unités qui enfilent — mesuré par le balayage LUI-MÊME", () => {
    // La première version de ce témoin interrogeait une AUTRE regex, un AUTRE
    // prédicat de fichier, et ne dépouillait pas les commentaires : il comptait
    // sept fichiers où le nom d'enfilage n'apparaît que dans un commentaire, et
    // ne pouvait donc pas tomber quand le balayage cesse d'atteindre quoi que
    // ce soit. Un témoin de couverture doit interroger le MÊME code que ce
    // qu'il couvre.
    const reach = sweepReach(GATEWAY_SRC);

    // Les trois quantités dont dépend la capacité du cliquet à rendre un
    // constat. Elles sont volontairement BASSES : un plancher qui suit la
    // valeur du jour se casse au premier lot qui ajoute un enfilage, et ce
    // n'est pas ce qu'on garde ici — on garde « le balayage voit encore
    // quelque chose ».
    expect(reach.files).toBeGreaterThanOrEqual(8);
    expect(reach.enqueuePositions).toBeGreaterThanOrEqual(14);
    expect(reach.emitCandidates).toBeGreaterThanOrEqual(10);

    // Et surtout : l'ÉCART avec la version AVEUGLE aux helpers. Un plancher
    // absolu ne gardait la reconnaissance des helpers que par une marge
    // fortuite d'UNE unité (14 contre 9) — le premier `.emit(` direct ajouté
    // en amont d'un enfilage l'aurait restaurée en silence. L'écart, lui, ne
    // peut pas être restauré par accident : il mesure la propriété elle-même.
    const blind = sweepReach(GATEWAY_SRC, { helpersBlind: true });
    expect(reach.emitCandidates - blind.emitCandidates).toBeGreaterThanOrEqual(4);
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
