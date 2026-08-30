/**
 * UNE loi de succession, posée par les DEUX portes.
 *
 * #4058 nomme la propriété dans son critère de fin : « règle de succession
 * implémentée **en un seul site partagé** par les deux portes (`leave.ts` et
 * `delete-for-me.ts` divergent aujourd'hui) ». Les témoins de comportement de
 * chaque porte resteraient VERTS si l'une des deux réécrivait la boucle chez
 * elle — c'est exactement comme la divergence s'est installée la première fois
 * (l'une refusait, l'autre transférait à un modérateur).
 *
 * Cette garde interroge la SOURCE, faute de quoi elle interrogerait deux
 * comportements identiques obtenus par deux chemins différents.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const RACINE = join(__dirname, '../../../../routes/conversations');

const PORTES = ['leave.ts', 'delete-for-me.ts'] as const;

/** Le code seul : un interdit cité dans un commentaire n'est pas un retour. */
const sansCommentaires = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const codeDe = (porte: string): string =>
  sansCommentaires(readFileSync(join(RACINE, porte), 'utf8'));

describe('la succession du créateur est écrite UNE fois', () => {
  it.each(PORTES)('%s appelle la loi partagée', porte => {
    expect(codeDe(porte)).toContain('resoudreSuccessionDuCreateur');
  });

  it.each(PORTES)("%s n'élit plus de successeur elle-même", porte => {
    const code = codeDe(porte);
    // Les deux formes par lesquelles la divergence est arrivée : une requête
    // qui cherche un rang précis, et une qui prend « le premier venu ».
    expect(code).not.toMatch(/memberRoleCasings\(\s*\[\s*'moderator'/);
    expect(code).not.toMatch(/participant\.findFirst\([\s\S]{0,400}orderBy:\s*\{\s*joinedAt/);
  });

  it("leave.ts ne REFUSE plus le départ du créateur", () => {
    // Le mur qu'était cette porte : `400` « transférez l'ownership ou
    // supprimez la conversation ». La décision porteur du 2026-08-28 l'a levé.
    expect(codeDe('leave.ts')).not.toContain('sendBadRequest');
  });
});
