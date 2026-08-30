/**
 * Aucun commentaire du gateway n'affirme plus, AU PRÉSENT, que le serveur
 * tourne sans `trustProxy` (#4357).
 *
 * ## Le fait
 *
 * `server.ts` pose `trustProxy: resolveTrustProxy()` sur ses deux instances,
 * et `config/trust-proxy.ts` fait défaut à UN maillon (#4137, livrée et
 * fermée). `request.ip` est donc l'adresse RÉELLE de l'appelant, pas celle du
 * conteneur Traefik.
 *
 * ## Pourquoi une garde plutôt qu'une simple correction
 *
 * L'affirmation périmée s'était propagée dans SIX fichiers **par copie** : un
 * auteur lisait le doc-comment du voisin et le reprenait, chacun de bonne foi.
 * Elle a fini par tromper une session entière, qui l'a répétée dans quatre
 * messages de commit, trois commentaires d'issue et une leçon — en surestimant
 * la gravité d'un vrai défaut, ce qui est une manière de le mal corriger.
 *
 * Corriger les six sites sans garde laisserait le septième arriver par le même
 * chemin. C'est le motif que le dépôt connaît sous le nom de garde NÉGATIVE :
 * elle n'a de valeur que si on l'a vue rougir.
 *
 * ## Ce qui reste AUTORISÉ, et pourquoi
 *
 * Les formulations CONDITIONNELLES (« sans cette option, `request.ip` serait
 * … ») et au PASSÉ (« avant que #4137 ne pose `trustProxy` ») sont justes et
 * utiles : elles expliquent pourquoi l'option est là. Seule l'affirmation au
 * présent est interdite. La garde distingue les deux par la présence d'un
 * marqueur de temps ou de condition dans la même phrase.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..', '..', '..');

/** Le fichier qui DÉFINIT l'option explique légitimement son absence. */
const DEFINITION = new Set([
  path.join(SRC, 'config', 'trust-proxy.ts'),
  path.join(SRC, 'server.ts'),
  path.join(SRC, '__tests__', 'unit', 'config', 'trust-proxy.test.ts'),
  __filename,
]);

/** L'affirmation interdite : le serveur tourne SANS `trustProxy`. */
const AFFIRMATION = /(?:tourne|tournant|est|fonctionne)\s+(?:donc\s+)?sans\s+[`']?trustProxy/i;

/**
 * Ce qui DÉSAMORCE l'affirmation dans la même phrase : une condition, un
 * passé, ou une référence explicite au lot qui a posé l'option.
 */
const DESAMORCAGE = /\bsans cette option\b|\bavant que\b|\bavant #?4137\b|\bvalait\b|\bserait\b|\bétait\b|\bjusqu'à #?4137\b/i;

function fichiersSource(dossier: string, acc: string[] = []): string[] {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (entree.name !== 'node_modules') fichiersSource(complet, acc);
      continue;
    }
    if (entree.name.endsWith('.ts')) acc.push(complet);
  }
  return acc;
}

function sitesFautifs(): string[] {
  const fautifs: string[] = [];
  for (const fichier of fichiersSource(SRC)) {
    if (DEFINITION.has(fichier)) continue;
    const lignes = fs.readFileSync(fichier, 'utf8').split('\n');
    lignes.forEach((ligne, i) => {
      // La phrase peut courir sur deux lignes de commentaire : on lit la ligne
      // et sa suivante pour chercher le désamorçage, sinon un « sans cette
      // option, … \n … sans trustProxy » serait compté à tort.
      const contexte = `${lignes[i - 1] ?? ''} ${ligne} ${lignes[i + 1] ?? ''}`;
      if (AFFIRMATION.test(ligne) && !DESAMORCAGE.test(contexte)) {
        fautifs.push(`${path.relative(SRC, fichier)}:${i + 1}`);
      }
    });
  }
  return fautifs;
}

describe("Aucun commentaire n'affirme au présent que le gateway tourne sans trustProxy (#4357)", () => {
  it('balaie bien tout src/ — un glob qui rate le dossier passerait au vert pour rien', () => {
    expect(fichiersSource(SRC).length).toBeGreaterThan(500);
  });

  it("ne trouve aucune affirmation au présent", () => {
    expect(sitesFautifs()).toEqual([]);
  });
});
