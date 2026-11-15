/**
 * Aucune lecture de présence RUNTIME ne contourne `presenceFor` (#4164).
 *
 * ## Pourquoi une garde NÉGATIVE, et de SOURCE
 *
 * Le défaut n'était pas une loi manquante — `resolvePresenceVisibility`,
 * `PresenceVisibilityService` et `presenceFor` existent et sont justes. C'était
 * un fichier qui ne les IMPORTAIT pas, et qui rejouait le repli à la main.
 *
 * Un témoin de comportement garde le cas d'aujourd'hui ; il ne dit rien du jour
 * où quelqu'un rouvre une seconde branche ailleurs dans le fichier — un cas
 * particulier pour les anonymes, un bypass ADMIN relu localement, un
 * `?.showOnline === false ? … : …` qui laisse passer l'inconnu. C'est
 * exactement ce que le site précédent contenait, et aucun témoin ne l'a vu.
 *
 * La garde interdit donc le MÉCANISME : toute lecture du checker runtime doit
 * être gouvernée par une visibilité venue de `presenceFor`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/** Les fichiers qui LISENT la présence runtime pour la servir en REST. */
const SURFACES = [
  'routes/directory/presence.ts',
  'routes/users/presence.ts',
] as const;

function source(relatif: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../..', relatif), 'utf8');
}

/** Les lignes de CODE — la documentation cite forcément ce qu'elle interdit. */
function lignesDeCode(texte: string): Array<{ ligne: string; numero: number }> {
  return texte
    .split('\n')
    .map((ligne, i) => ({ ligne: ligne.trim(), numero: i + 1 }))
    .filter(({ ligne }) =>
      !ligne.startsWith('//') && !ligne.startsWith('*') && !ligne.startsWith('/*')
    );
}

describe('La présence runtime ne se lit que sous `presenceFor`', () => {
  it('le balayage LIT bien ses fichiers — sinon il serait vert à vide', () => {
    // Une garde négative meurt en silence quand son terrain disparaît.
    for (const relatif of SURFACES) {
      expect(source(relatif).length).toBeGreaterThan(300);
    }
  });

  it('un seul fichier lit le checker, et il importe `presenceFor`', () => {
    const lecteurs = SURFACES.filter((relatif) =>
      lignesDeCode(source(relatif)).some(({ ligne }) => ligne.includes('presenceChecker'))
    );

    // L'alias ne doit RIEN lire lui-même : il délègue. Une seconde lecture
    // rouvrirait la possibilité de deux règles pour une même donnée.
    expect(lecteurs).toEqual(['routes/directory/presence.ts']);
    expect(source('routes/directory/presence.ts')).toContain("presenceFor");
  });

  it('aucune surface ne rejoue la politique de repli à la main', () => {
    // `isGlobalAdmin` relu localement, c'était la moitié de l'ancien défaut :
    // la politique d'entrée absente EST `presenceMissingEntryPolicy`, dérivée
    // de la loi partagée. La redéclarer, c'est créer une seconde loi.
    const fautifs = SURFACES.flatMap((relatif) =>
      lignesDeCode(source(relatif))
        .filter(({ ligne }) => /isGlobalAdmin|resolvePresenceVisibility\s*\(/.test(ligne))
        .map(({ numero, ligne }) => `${relatif}:${numero}  ${ligne}`)
    );

    expect(fautifs).toEqual([]);
  });

  it("aucune surface n'utilise l'idiome qui laisse passer l'INCONNU", () => {
    // `vis.get(id)?.showOnline === false ? false : x` — « seule une préférence
    // explicitement négative masque ». Un id absent y est RÉVÉLÉ, et le dépôt
    // a déjà payé ce piège ailleurs.
    const fautifs = SURFACES.flatMap((relatif) =>
      lignesDeCode(source(relatif))
        .filter(({ ligne }) => /\?\.showOnline|\?\.showLastSeenTimestamp/.test(ligne))
        .map(({ numero, ligne }) => `${relatif}:${numero}  ${ligne}`)
    );

    expect(fautifs).toEqual([]);
  });
});
