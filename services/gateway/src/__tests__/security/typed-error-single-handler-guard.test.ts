/**
 * Une SEULE décision rend les erreurs typées (#4212).
 *
 * Le dépôt portait DEUX handlers : celui de `custom-errors.ts`, qui rendait
 * correctement toute la hiérarchie et n'était **enregistré nulle part**, et
 * celui de `server.ts`, seul vivant, qui ne connaissait que trois sous-classes
 * sur dix-neuf. Les seize autres tombaient dans le repli générique — code
 * juste, message faux, champs propres jetés.
 *
 * > Deux handlers dont un mort n'est pas un état tenable : le mort donne
 * > l'illusion que la question est traitée, et c'est ce qui a laissé le défaut
 * > vivre. Ses témoins étaient verts.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const RACINE = path.resolve(__dirname, '../..');

function source(relatif: string): string {
  return fs.readFileSync(path.join(RACINE, relatif), 'utf8');
}

function lignesDeCode(texte: string): Array<{ ligne: string; numero: number }> {
  return texte
    .split('\n')
    .map((ligne, i) => ({ ligne: ligne.trim(), numero: i + 1 }))
    .filter(({ ligne }) => !ligne.startsWith('//') && !ligne.startsWith('*') && !ligne.startsWith('/*'));
}

describe('Un seul handler, et il DÉLÈGUE la décision', () => {
  it('le balayage LIT ses fichiers — sinon il serait vert à vide', () => {
    expect(source('server.ts').length).toBeGreaterThan(1000);
    expect(source('errors/custom-errors.ts').length).toBeGreaterThan(1000);
  });

  it("il n'existe qu'UN `setErrorHandler` dans tout le service", () => {
    const enregistrements: string[] = [];
    const parcourir = (dossier: string) => {
      for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
        const complet = path.join(dossier, entree.name);
        if (entree.isDirectory()) {
          if (entree.name !== '__tests__' && entree.name !== 'node_modules') parcourir(complet);
        } else if (entree.name.endsWith('.ts')) {
          for (const { ligne, numero } of lignesDeCode(fs.readFileSync(complet, 'utf8'))) {
            if (ligne.includes('setErrorHandler(')) {
              enregistrements.push(`${path.relative(RACINE, complet)}:${numero}`);
            }
          }
        }
      }
    };
    parcourir(RACINE);

    expect(enregistrements).toEqual(['server.ts:' + enregistrements[0]?.split(':')[1]]);
    expect(enregistrements).toHaveLength(1);
  });

  it('le handler enregistré APPELLE `typedErrorResponse` — il ne réécrit pas la hiérarchie', () => {
    const serveur = source('server.ts');

    expect(serveur).toContain('typedErrorResponse(error)');

    // Aucune branche `instanceof` par sous-classe : c'est le motif qui a
    // produit trois cas traités et seize oubliés. La décision est UNE.
    const branches = lignesDeCode(serveur)
      .filter(({ ligne }) => /instanceof\s+\w*(Authentication|Translation|UserLocked|RateLimit|UserInactive|EmailNotVerified)\w*Error/.test(ligne))
      .map(({ numero, ligne }) => `server.ts:${numero}  ${ligne}`);

    expect(branches).toEqual([]);
  });

  it("le handler MORT n'est plus exporté — un second handler ne peut pas revenir en silence", () => {
    const erreurs = source('errors/custom-errors.ts');

    const exportsDeHandler = lignesDeCode(erreurs)
      .filter(({ ligne }) => /export\s+function\s+errorHandler\b/.test(ligne))
      .map(({ numero }) => `custom-errors.ts:${numero}`);

    expect(exportsDeHandler).toEqual([]);
  });
});
