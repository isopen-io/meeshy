/**
 * Aucun schéma de profil n'est PERMISSIF (#4161).
 *
 * `data: { type: 'object', additionalProperties: true }` désarme
 * `fast-json-stringify` : tout ce que le `select` charge part, sans qu'aucune
 * déclaration ne l'autorise. C'est le mécanisme EXACT qui laissait sortir six
 * champs privés — les trois langues du Prisme, `isActive`, `deactivatedAt`,
 * `updatedAt` — à un appelant ANONYME.
 *
 * ## Pourquoi une garde NÉGATIVE, et pas une liste de champs attendus
 *
 * Un témoin qui vérifie « la réponse porte bien id, username, avatar… » reste
 * VERT si `additionalProperties: true` revient : les champs attendus sont
 * toujours là, et six autres avec eux. Seule l'interdiction du mécanisme
 * empêche la classe.
 *
 * Elle est complémentaire du témoin de charge (`public-profile-leak.test.ts`),
 * qui garde les champs d'aujourd'hui ; celle-ci garde la PORTE.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * Les fichiers de routes qui servent un profil d'utilisateur.
 *
 * Liste EXPLICITE : un balayage large attraperait des `additionalProperties`
 * parfaitement légitimes — une carte à clés inconnues en déclare une
 * (`hourlyDistribution`, les préférences par catégorie), et le dépôt le
 * documente comme la forme JUSTE dans ce cas.
 */
const FICHIERS_DE_PROFIL = [
  'routes/users/profile.ts',
  'routes/directory/people.ts',
] as const;

describe('Les schémas de profil déclarent ce qu’ils servent', () => {
  it.each(FICHIERS_DE_PROFIL)('%s ne porte aucun `additionalProperties: true`', (relatif) => {
    const complet = path.resolve(__dirname, '../..', relatif);
    const source = fs.readFileSync(complet, 'utf8');

    const lignes = source.split('\n');
    const permissifs = lignes
      .map((ligne, i) => ({ ligne: ligne.trim(), numero: i + 1 }))
      // Les lignes de COMMENTAIRE sont écartées — `//`, `*` et `/*` : la
      // documentation de ce correctif cite forcément le mécanisme qu'il retire,
      // et une garde qui rougit sur sa propre explication ne garde rien.
      .filter(({ ligne }) =>
        /additionalProperties\s*:\s*true/.test(ligne)
        && !ligne.startsWith('//')
        && !ligne.startsWith('*')
        && !ligne.startsWith('/*')
      )
      .map(({ ligne, numero }) => `${relatif}:${numero}  ${ligne}`);

    expect(permissifs).toEqual([]);
  });

  it('le balayage LIT bien les fichiers — sans quoi il passerait au vert à vide', () => {
    // Une garde négative meurt en silence quand son terrain disparaît : un
    // fichier renommé rendrait `[]` et la garde serait verte en ne mesurant
    // plus rien (leçon 308).
    for (const relatif of FICHIERS_DE_PROFIL) {
      const complet = path.resolve(__dirname, '../..', relatif);
      expect(fs.existsSync(complet)).toBe(true);
      expect(fs.readFileSync(complet, 'utf8').length).toBeGreaterThan(500);
    }
  });
});
