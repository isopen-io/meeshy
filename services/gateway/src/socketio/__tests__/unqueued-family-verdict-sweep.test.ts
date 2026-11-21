/**
 * @jest-environment node
 *
 * #20045 — le CLIQUET des familles `message:` / `attachment:` émises HORS de la
 * file de remise, et des citations qui les justifient.
 *
 * La table vit en production (`unqueuedFamilyVerdict.ts`) parce que son
 * exhaustivité doit tomber sous `tsc -p tsconfig.json`, le gate « Qualité TS »,
 * et non sous le cliquet A à plafond qui garde les seuls fichiers de test.
 * Ce témoin-ci garde l'autre moitié, que le typage ne peut pas voir : **une
 * citation qui a POURRI**.
 *
 * C'est le défaut exact trouvé en instruisant l'issue : `messages-writes.ts`
 * justifiait sa garde de confidentialité par « le web les persiste en cache
 * (`use-socket-cache-sync.ts`) » — un fichier qui n'existe plus. La garde
 * restait juste, sa raison était morte, et personne ne pouvait le savoir en
 * relisant le commentaire. Une raison fausse protège moins qu'une raison
 * absente : elle décourage la mesure qui la corrigerait.
 */
import { describe, it, expect } from '@jest/globals';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import { UNQUEUED_FAMILY_VERDICT } from '../unqueuedFamilyVerdict';
import { DRAINED_EVENT } from '../queuedEventContract';

const SRC_ROOT = join(__dirname, '../..');

/** Le NOM de constante sous lequel une famille s'émet — c'est lui qu'un site écrit. */
function constantNameOf(eventName: string): string | undefined {
  return Object.entries(SERVER_EVENTS).find(([, value]) => value === eventName)?.[0];
}

describe('#20045 — les familles émises hors file', () => {
  it('n’en déclare AUCUNE que la file sache déjà rejouer', () => {
    const queued = new Set<string>(Object.values(DRAINED_EVENT));
    const doublons = Object.keys(UNQUEUED_FAMILY_VERDICT).filter((name) => queued.has(name));

    expect(doublons).toEqual([]);
  });

  it('cite un site qui EXISTE, pour chacune', () => {
    const morts = Object.entries(UNQUEUED_FAMILY_VERDICT)
      .filter(([, verdict]) => !existsSync(join(SRC_ROOT, verdict.emittedAt)))
      .map(([name, verdict]) => `${name} → ${verdict.emittedAt}`);

    expect(morts).toEqual([]);
  });

  it('cite un site qui ÉMET bien la famille qu’il justifie', () => {
    const muets = Object.entries(UNQUEUED_FAMILY_VERDICT)
      .filter(([name, verdict]) => {
        const constante = constantNameOf(name);
        if (!constante) return true;
        const path = join(SRC_ROOT, verdict.emittedAt);
        if (!existsSync(path)) return false;
        return !readFileSync(path, 'utf8').includes(`SERVER_EVENTS.${constante}`);
      })
      .map(([name, verdict]) => `${name} → ${verdict.emittedAt}`);

    expect(muets).toEqual([]);
  });

  it('donne une RAISON non vide à chaque verdict', () => {
    const vides = Object.entries(UNQUEUED_FAMILY_VERDICT)
      .filter(([, verdict]) => verdict.because.trim().length === 0)
      .map(([name]) => name);

    expect(vides).toEqual([]);
  });
});
