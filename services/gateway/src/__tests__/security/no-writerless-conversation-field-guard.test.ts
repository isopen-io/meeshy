/**
 * Un champ PRÉSENT au modèle et ABSENT de toute écriture est un piège armé (#4345).
 *
 * `UserConversationPreferences.deletedForUserAt` a perdu son unique écrivain au
 * cycle #4332, qui a réaligné la corbeille sur `Participant.deletedForMe`. La
 * colonne, son `select`, ses deux projections et ses deux déclarations de
 * contrat sont restés — servant `null` sur le canal temps réel et `false` sur
 * REST, pour toute ligne, sans exception.
 *
 * Ce n'était pas du code mort inoffensif. Pour une conversation RÉELLEMENT
 * dans la corbeille, le fil affirmait « pas supprimée ». Un champ sans
 * écrivain ne se contente pas de ne rien dire : il dit le contraire de la
 * vérité dès que la vérité cesse d'être la valeur par défaut.
 *
 * Et le danger n'est pas seulement pour aujourd'hui : le jour où un lot repose
 * une écriture sur ce nom, tout le monde tiendra sa sémantique pour acquise en
 * lisant le schéma — sans savoir que deux clients (iOS
 * `ConversationListViewModel`, Android `ConversationFilter`) le filtrent encore
 * défensivement.
 *
 * ## Ce que cette garde vérifie, et ce qu'elle ne vérifie PAS
 *
 * Elle vérifie l'ABSENCE du nom dans les sources du gateway et les types
 * partagés. Elle ne vérifie pas « le champ a un écrivain » — c'est une
 * propriété qu'aucun balayage de texte ne peut établir. Le jour où le champ
 * doit revenir, il revient AVEC son écrivain, et cette garde se retire dans le
 * même commit : c'est ce retrait délibéré qui force la question.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RACINES = [
  join(__dirname, '../../../src'),
  join(__dirname, '../../../../../packages/shared/types'),
];

/** Le nom retiré, et celui de sa projection REST. */
const NOMS_SANS_ECRIVAIN = ['deletedForUserAt', 'isDeletedForUser'] as const;

function sourcesTypeScript(racine: string): string[] {
  const trouvees: string[] = [];
  const visiter = (dossier: string) => {
    for (const nom of readdirSync(dossier)) {
      if (nom === 'node_modules' || nom === 'dist' || nom === '__tests__' || nom === 'generated') continue;
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) visiter(chemin);
      else if (nom.endsWith('.ts') && !nom.endsWith('.test.ts') && !nom.endsWith('.d.ts')) trouvees.push(chemin);
    }
  };
  visiter(racine);
  return trouvees;
}

/**
 * Les COMMENTAIRES ont le droit de nommer le champ — c'est même souhaitable,
 * ils portent l'histoire du retrait. Seul le CODE est interdit. On retire donc
 * les commentaires avant de chercher, plutôt que d'exempter des fichiers : une
 * exemption par fichier aveuglerait le fichier entier.
 */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('Aucun champ de conversation sans écrivain ne survit dans le code (#4345)', () => {
  const fichiers = RACINES.flatMap(sourcesTypeScript);

  it('balaie réellement les deux racines — sinon une liste vide passerait au vert', () => {
    expect(fichiers.length).toBeGreaterThan(200);
    // Témoin de balayage : un nom dont on SAIT qu'il est présent. Sans lui,
    // un chemin erroné rendrait « aucune occurrence » et cette garde
    // affirmerait le contraire de ce qu'elle mesure.
    const temoin = fichiers.filter((f) => sansCommentaires(readFileSync(f, 'utf8')).includes('clearHistoryBefore'));
    expect(temoin.length).toBeGreaterThan(0);
  });

  it.each(NOMS_SANS_ECRIVAIN)('`%s` n\'apparaît dans AUCUN code', (nom) => {
    const coupables = fichiers.filter((f) => sansCommentaires(readFileSync(f, 'utf8')).includes(nom));
    expect(coupables.map((f) => f.replace(/.*\/(services|packages)\//, '$1/'))).toEqual([]);
  });
});
