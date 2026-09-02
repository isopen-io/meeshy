/**
 * LA CONFORMITÉ D'UN ÉCRAN, JOUÉE SUR LA CHAÎNE.
 *
 *   bun run apps/web-v3/scripts/conformite-des-vues.ts rich thread
 *
 * `compare-rendu.js` navigue vers un `--base`. Tant que ce `--base` était un
 * `next start` NU — sans passerelle derrière —, aucune vue du MEMBRE n'était
 * mesurable : `/chats/:cle` et `/chats/:id` redirigent un visiteur sans créance
 * vers `/login`, et `rapport-conformite.json` ne contenait que `vitrine`. Le
 * critère de fin de `thread`, `join`, `rights` et `rich` nommait donc une
 * mesure que le dépôt ne savait pas produire.
 *
 * Ce script monte la MÊME chaîne que les specs de chaîne (`e2e/visual/lib/
 * serveurs.ts` : la passerelle de bouchon, puis l'artefact de `next build`) et
 * appelle `compare-rendu.js` dessus. Il ne réécrit NI la passerelle, NI les
 * seuils, NI la sélection : il ne fait que TENIR les deux bouts, ce qui est
 * exactement ce qui manquait.
 *
 * Il est en TypeScript et se lance sous `bun` parce que la passerelle de
 * bouchon l'est : la recopier en `.mjs` en ferait une jumelle, et un bouchon qui
 * ne ressemble pas au serveur ne prouve rien (§ 9.4).
 *
 * L'ÉTAT DE SESSION est déclaré par vue dans `jetons-de-vues.json`
 * (`"@session": "membre"`) et traduit en cookies par `compare-rendu.js` — les
 * mêmes que ceux que cette passerelle reconnaît, ce que
 * `__tests__/conformite-des-vues.test.ts` oppose aux constantes du dépôt.
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { passerelleDeBouchon, RACINE_V3, serveurDeLaV3 } from '../e2e/visual/lib/serveurs';

const DESIGN = join(RACINE_V3, '..', '..', 'docs', 'product', 'MeeshyWebV3Design');

const vues = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));

const principal = async (): Promise<number> => {
  const passerelle = await passerelleDeBouchon();
  const v3 = await serveurDeLaV3(passerelle.base);
  try {
    // `spawnSync` BLOQUERAIT la boucle d'événements de ce processus — celui-là
    // même qui HÉBERGE la passerelle de bouchon : le navigateur recevrait « le
    // service ne répond pas » et l'outil mesurerait l'écran de panne contre la
    // cible d'un fil. Mesuré : `structure=0.54` sur un code conforme.
    return await new Promise<number>((resoud) => {
      const enfant = spawn(
        'node',
        [join(DESIGN, 'compare-rendu.js'), '--base', v3.base, ...(vues.length > 0 ? ['--vues', vues.join(',')] : [])],
        { stdio: 'inherit', cwd: RACINE_V3 },
      );
      enfant.on('exit', (code) => resoud(code ?? 2));
      enfant.on('error', () => resoud(2));
    });
  } finally {
    await v3.ferme();
    await passerelle.ferme();
  }
};

principal().then(
  (code) => process.exit(code),
  (erreur: unknown) => {
    process.stderr.write(`[conformité] ÉCHEC : ${String(erreur)}\n`);
    process.exit(2);
  },
);
