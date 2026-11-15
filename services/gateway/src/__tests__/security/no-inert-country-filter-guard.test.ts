/**
 * `allowedCountries` ne peut pas revenir dans une loi d'admission sans résolveur (#4354).
 *
 * #4167 l'a retiré de `admitLinkEntry()` : le filtrer exigerait une base GeoIP
 * que la passerelle n'embarque pas, et **un contrôle décoratif est pire qu'une
 * absence, parce qu'on compte dessus**. #4354 a propagé la décision aux deux
 * autres surfaces — l'API de création, qui l'acceptait encore, et l'affichage,
 * qui le montrait comme appliqué.
 *
 * Cette garde ferme le retour en arrière le plus coûteux : quelqu'un rebranche
 * le champ dans la loi d'admission, sans résolveur, et l'écran redevient
 * crédible pendant que rien n'est filtré.
 *
 * ## Ce qu'elle mesure, et ce qu'elle ne mesure pas
 *
 * Elle vérifie l'ABSENCE du nom dans `linkAdmission.ts` hors commentaires — les
 * commentaires ont le droit de porter l'histoire de la décision, et c'est même
 * souhaitable. Elle ne vérifie pas « un résolveur existe » : c'est
 * inétablissable par un balayage. Le jour où le champ revient AVEC son
 * résolveur, cette garde se retire dans le même commit, et c'est ce retrait
 * délibéré qui force la question.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const LOI = join(__dirname, '../../services/conversations/linkAdmission.ts');

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('Aucun filtre par pays sans résolveur (#4354)', () => {
  const source = readFileSync(LOI, 'utf8');

  it('lit bien la loi d\'admission — sinon l\'absence ne prouverait rien', () => {
    // Témoin de balayage : le champ VOISIN, qui lui est réel et appliqué.
    // Sans lui, un chemin erroné rendrait « aucune occurrence » et cette garde
    // affirmerait le contraire de ce qu'elle mesure.
    expect(sansCommentaires(source)).toContain('allowedIpRanges');
  });

  it('`allowedCountries` n\'apparaît dans AUCUN code de la loi d\'admission', () => {
    expect(sansCommentaires(source)).not.toContain('allowedCountries');
  });
});
