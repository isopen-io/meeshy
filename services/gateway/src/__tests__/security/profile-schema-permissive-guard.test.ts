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
  'routes/users/public-profile.ts',
  'routes/directory/people.ts',
  'routes/directory/person.ts',
  // #4184 — witness (d) : la réponse d'un changement de contact ne doit
  // porter AUCUN champ non déclaré (jeton, ancienne adresse, ou tout champ
  // voisin que le handler composerait par accident). Chaque schéma de réponse
  // de ce fichier déclare `properties` explicitement (`message`,
  // `pendingEmail`/`newEmail`/`pendingPhoneNumber`/`newPhoneNumber`) — aucun
  // `additionalProperties: true` : ce balayage le PROUVE, et gèle le fichier
  // contre toute régression future.
  'routes/users/contact-change.ts',
] as const;

/**
 * **L'unité d'un fichier découpé, jamais le seul fichier nommé (#4284).**
 *
 * `routes/users/profile.ts` est devenu une FAÇADE de ré-export de 40 lignes :
 * les trois routes GET dont ce témoin garde la porte (`/u/:username`,
 * `/users/:id`, `/users/id/:id`) vivent désormais dans `profile-lookups.ts`.
 * Lire le seul fichier nommé laissait donc ce témoin VERT en ne scannant plus
 * aucun schéma — et sa borne anti-vide ne pouvait pas l'attraper : la façade
 * pèse encore 1699 octets, bien au-delà des 500 exigés.
 *
 * C'est le mode de panne que la leçon 308 décrit, avec le tour de plus qui le
 * rend invisible : le terrain n'a pas DISPARU, il a MAIGRI. Une borne de
 * taille garde contre l'effacement, jamais contre le déménagement.
 *
 * Le balayage est un GLOB — `X.ts` plus tout `X-*.ts` du même répertoire —
 * jamais une liste de parties écrite à la main, qui se périmerait au prochain
 * découpage sans que rien ne rougisse.
 */
function uniteDeFichiers(relatif: string): readonly string[] {
  const complet = path.resolve(__dirname, '../..', relatif);
  const dossier = path.dirname(complet);
  const base = path.basename(complet, '.ts');
  return fs
    .readdirSync(dossier)
    .filter((nom) => nom === `${base}.ts` || (nom.startsWith(`${base}-`) && nom.endsWith('.ts')))
    .sort()
    .map((nom) => path.join(path.dirname(relatif), nom));
}

const FICHIERS_SCANNES = FICHIERS_DE_PROFIL.flatMap(uniteDeFichiers);

describe('Les schémas de profil déclarent ce qu’ils servent', () => {
  it.each(FICHIERS_SCANNES)('%s ne porte aucun `additionalProperties: true`', (relatif) => {
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
    for (const relatif of FICHIERS_SCANNES) {
      const complet = path.resolve(__dirname, '../..', relatif);
      expect(fs.existsSync(complet)).toBe(true);
      expect(fs.readFileSync(complet, 'utf8').length).toBeGreaterThan(500);
    }

    // BORNE de RÉSOLUTION, distincte de la borne de taille ci-dessus : un glob
    // cassé (répertoire ou base de nom mal calculés) rendrait le seul fichier
    // nommé, et ce témoin redeviendrait EN SILENCE celui, épinglé à un chemin,
    // qu'il remplace. `users/profile.ts` a trois frères depuis #4284 ; l'exiger
    // à la BAISSE (> 1, jamais une égalité) laisse un futur découpage en
    // ajouter sans faire rougir.
    expect(uniteDeFichiers('routes/users/profile.ts').length).toBeGreaterThan(1);
    expect(FICHIERS_SCANNES.length).toBeGreaterThan(FICHIERS_DE_PROFIL.length);
  });
});
