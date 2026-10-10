/**
 * ÉCRIT LA FIXTURE DE PARITÉ DE LA GÉOMÉTRIE DES CADRES (#8741).
 *
 *   bun run scripts/generate-frame-layout-fixture.ts
 *
 * Sortie : `packages/shared/design/call-capture-frames-layout.fixture.json`.
 * Le témoin `src/lib/calls/frames/frame-layout-fixture.test.ts` rougit si le
 * fichier suivi diverge de `frameSlots` : on relance ce script, et le diff dit
 * ce qui a bougé — iOS compare son port à ce même fichier.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { layoutFixtureText } from '../src/lib/calls/frames/frame-layout-fixture';

const target = fileURLToPath(new URL('../../../packages/shared/design/call-capture-frames-layout.fixture.json', import.meta.url));
writeFileSync(target, layoutFixtureText());
console.log(`fixture écrite : ${target}`);
