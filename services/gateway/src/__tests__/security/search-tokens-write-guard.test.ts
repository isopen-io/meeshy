/**
 * Écrire un nom recalcule ses jetons de recherche (#4159).
 *
 * `User.searchTokens` est la colonne qui rend la recherche de personne
 * indexable. Elle n'a de valeur que si elle est RECALCULÉE à chaque écriture
 * d'un des quatre champs dont elle dérive — un compte dont le pseudo change
 * sans recalcul reste indexé sous l'ancien, et devient introuvable sous le
 * nouveau.
 *
 * ## Pourquoi une garde de SOURCE ici
 *
 * Six sites écrivent aujourd'hui un champ de nom. Les corriger un par un
 * produit un inventaire à tenir à jour, et personne ne se souviendra du
 * septième — c'est la forme exacte du relais de `createMentionNotificationsBatch`
 * (leçon 279), qui recopiait neuf champs et retenait en silence chaque champ
 * ajouté en amont.
 *
 * Cette garde est ce qui ferme la CLASSE. Elle balaie les sources et échoue dès
 * qu'une écriture sur `User` touche un nom sans écrire `searchTokens` dans le
 * même objet `data`.
 *
 * ## Sa limite, dite à voix haute
 *
 * Elle lit du TEXTE. Une écriture construite dynamiquement — un `data` assemblé
 * dans une variable, un `spread` d'objet — lui échappe. C'est le même angle
 * mort que le balayage d'enveloppes de #4192, et il est assumé : la garde
 * attrape la forme ORDINAIRE, qui est celle par laquelle le défaut revient.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/** Les quatre champs dont `searchTokens` dérive. */
const CHAMPS_DE_NOM = ['username', 'displayName', 'firstName', 'lastName'] as const;

/**
 * `routes/admin/roles.ts` n'est monté par personne — vérifié sur
 * `route-registration.ts`. L'audit le classe « code mort, patron dangereux » et
 * son retrait appartient à #4157. L'exclure ici plutôt que de le corriger évite
 * de faire croire qu'il sert.
 */
const CODE_MORT = ['routes/admin/roles.ts'];

/** Écritures dont le `data` est assemblé ailleurs — la garde ne peut pas les lire. */
const CONSTRUIT_DYNAMIQUEMENT: string[] = [];

/**
 * Rend le contenu de l'objet `data: { … }` d'un appel Prisma, découpé par
 * équilibre d'accolades — ou `null` si l'appel n'en porte pas.
 */
function objetData(source: string, depuis: number): string | null {
  const cle = source.indexOf('data', depuis);
  if (cle === -1) return null;
  const ouvrante = source.indexOf('{', cle);
  if (ouvrante === -1) return null;

  let profondeur = 0;
  for (let i = ouvrante; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    else if (source[i] === '}') {
      profondeur--;
      if (profondeur === 0) return source.slice(ouvrante + 1, i);
    }
  }
  return null;
}

function fichiersSources(racine: string): string[] {
  const sortie: string[] = [];
  const parcourir = (dossier: string) => {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (entree.name === '__tests__' || entree.name === 'node_modules') continue;
      const complet = path.join(dossier, entree.name);
      if (entree.isDirectory()) parcourir(complet);
      else if (entree.name.endsWith('.ts')) sortie.push(complet);
    }
  };
  parcourir(racine);
  return sortie;
}

describe('Une écriture de nom recalcule toujours ses jetons', () => {
  it('aucune écriture sur `User` ne touche un nom sans écrire `searchTokens`', () => {
    const racine = path.resolve(__dirname, '../..');
    const manquants: string[] = [];
    let ecrituresVues = 0;

    for (const fichier of fichiersSources(racine)) {
      const relatif = path.relative(racine, fichier);
      if (CODE_MORT.includes(relatif) || CONSTRUIT_DYNAMIQUEMENT.includes(relatif)) continue;

      const source = fs.readFileSync(fichier, 'utf8');
      const motif = /user\.(update|create|updateMany|upsert)\(\s*\{/g;

      for (const m of source.matchAll(motif)) {
        // L'objet `data` se découpe par ÉQUILIBRE D'ACCOLADES, pas par une
        // fenêtre de N caractères : une fenêtre happe le bloc voisin et
        // fabrique des faux positifs — mesuré, elle attribuait à un
        // `user.update` de `MaintenanceService` des champs appartenant à
        // l'appel d'à côté.
        const bloc = objetData(source, m.index! + m[0].length - 1);
        if (bloc === null) continue;

        const touche = CHAMPS_DE_NOM.filter((c) => new RegExp(`\\b${c}\\s*:`).test(bloc));
        if (touche.length === 0) continue;

        ecrituresVues++;
        if (!bloc.includes('searchTokens')) {
          const ligne = source.slice(0, m.index!).split('\n').length;
          manquants.push(`${relatif}:${ligne}  (écrit ${touche.join(', ')})`);
        }
      }
    }

    // Garde-fou du harnais : si le balayage cesse de trouver des écritures, la
    // garde passerait au vert en ne mesurant plus rien. C'est ainsi qu'une
    // garde négative meurt en silence.
    expect(ecrituresVues).toBeGreaterThanOrEqual(3);

    expect(manquants).toEqual([]);
  });
});
