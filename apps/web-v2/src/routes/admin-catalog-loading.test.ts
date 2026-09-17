import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { ROUTES } from './route-table';

/**
 * **TOUTE ROUTE D'ADMINISTRATION CHARGE LE CATALOGUE D'ADMINISTRATION** (#6733).
 *
 * ## Le défaut que ce témoin ferme
 *
 * Les clés `admin.*` vivent dans un SECOND catalogue, chargé à la demande
 * (#6871, #6834). `translateAdmin` **LÈVE** si ce catalogue n'est pas encore
 * chargé — même contrat que le catalogue commun, jamais un état à maquiller.
 * Or le routeur n'a qu'un seul `screenPrerequisite`, déjà pris par le
 * catalogue commun : c'est donc à CHAQUE chargeur d'écran d'administration
 * d'attendre le sien, en parallèle de son chunk.
 *
 * Un chargeur écrit en `import()` nu compile, se route, se rend — et PLANTE à
 * l'ouverture. **Rien ne pouvait le voir** : ni `tsc` (les deux formes typent
 * identiquement, `() => Promise<Module>` dans les deux cas), ni les témoins de
 * composants (aucun ne passe par le routeur : ils montent l'écran eux-mêmes
 * après avoir chargé le catalogue à la main), ni le gate de poids (un
 * `Promise.all` de moins ALLÈGE). C'est la forme la plus discrète du défaut :
 * l'oubli ne casse rien à la compilation, il casse à l'exécution, chez le seul
 * lecteur qui ouvre cet écran-là.
 *
 * Le doc-comment de `adminConversationsScreen` avoue d'ailleurs exactement ce
 * risque, en toutes lettres, depuis #6862 — sans qu'aucun gate ne le garde.
 *
 * ## Ce qu'il mesure, et pourquoi par le TEXTE
 *
 * Il lit la SOURCE de `route-table.tsx` et vérifie que toute route servant une
 * adresse `/adm…` désigne un chargeur qui appelle `loadAdminInterfaceCatalog`.
 *
 * Mesurer par l'EXÉCUTION — appeler le chargeur puis vérifier que
 * `translateAdmin` ne lève plus — serait un témoin qui MENT : le catalogue est
 * mémorisé dans une carte de module, partagée par tous les fichiers de témoins
 * du même processus, et `i18n-admin-catalog.test.ts` charge les SEPT langues.
 * Le catalogue serait déjà là, quoi que fasse le chargeur, et le témoin
 * verdirait sur un chargeur vide. Une lecture textuelle n'a pas cet angle
 * mort : elle mesure ce que le fichier DÉCLARE, ce qui est précisément la
 * chose oubliée.
 */

/* `node:fs` et non `Bun.file` : ce fichier passe aussi sous `tsc --noEmit`, qui
   ne connaît pas le global `Bun` — et `bun test` ne type RIEN (le gate de type
   est une PASSE SÉPARÉE dans ce chantier). Un témoin vert sous bun et rouge
   sous tsc bloquerait la chaîne sans qu'aucun test n'échoue. */
const SOURCE = readFileSync(fileURLToPath(new URL('./route-table.tsx', import.meta.url)), 'utf8');

/** Les chargeurs qui attendent VRAIMENT le catalogue d'administration. */
function chargeursAvecCatalogue(source: string): ReadonlySet<string> {
  const noms = new Set<string>();
  const declaration = /const\s+(\w+)\s*=\s*\(\)\s*=>\s*([\s\S]*?);\n/g;
  for (const correspondance of source.matchAll(declaration)) {
    const nom = correspondance[1];
    const corps = correspondance[2];
    if (nom !== undefined && corps !== undefined && corps.includes('loadAdminInterfaceCatalog')) noms.add(nom);
  }
  return noms;
}

/** Les routes d'administration : leur clé, leur adresse, le nom de leur chargeur. */
function routesAdministration(source: string): ReadonlyArray<{ clef: string; motif: string; chargeur: string }> {
  const entree = /(\w+):\s*\{\s*pattern:\s*'(\/adm[^']*)',\s*screen:\s*([^},]+)\s*\}/g;
  return [...source.matchAll(entree)].map(([, clef, motif, chargeur]) => ({
    clef: String(clef),
    motif: String(motif),
    chargeur: String(chargeur).trim(),
  }));
}

describe('le catalogue d’administration est chargé par CHAQUE route qui en a besoin', () => {
  test('l’extraction reconnaît la table — sinon elle rendrait zéro, ce qui ressemble à un succès', () => {
    // La garde de la garde : une analyse textuelle qui cesse de reconnaître sa
    // cible rend une liste VIDE, et une liste vide satisfait toute boucle.
    // C'est le défaut que `route-inventory.test.ts` a déjà payé sur l'autre
    // extracteur du dépôt.
    expect(routesAdministration(SOURCE).length).toBeGreaterThanOrEqual(8);
    expect(chargeursAvecCatalogue(SOURCE).size).toBeGreaterThanOrEqual(4);
  });

  test('chaque route /adm… désigne un chargeur qui attend le catalogue', () => {
    const avecCatalogue = chargeursAvecCatalogue(SOURCE);
    const sansCatalogue = routesAdministration(SOURCE).filter((route) => !avecCatalogue.has(route.chargeur));

    expect(sansCatalogue.map((route) => `${route.clef} (${route.motif})`)).toEqual([]);
  });

  test('toute route d’administration déclarée dans ROUTES est vue par l’extraction', () => {
    // Sans ce témoin, une route écrite dans une forme que l'expression ne
    // reconnaît pas serait simplement ABSENTE du contrôle ci-dessus — gardée
    // en apparence, jamais en fait.
    const vues = new Set(routesAdministration(SOURCE).map((route) => route.clef));
    const declarees = Object.entries(ROUTES)
      .filter(([, route]) => route.pattern.startsWith('/adm'))
      .map(([clef]) => clef);

    expect(declarees.filter((clef) => !vues.has(clef))).toEqual([]);
  });
});
