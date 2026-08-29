/**
 * Le motif `query.success ? query.data : { … }` est INTERDIT dans `routes/posts/`
 * et `routes/social/` (issue #4149, critère 8, 3e puce).
 *
 * Ce motif avale l'échec d'un `safeParse` Zod et sert silencieusement une
 * PREMIÈRE PAGE comme si la query avait été valide — c'était le défaut n°1 de
 * l'issue : sur les réels, un `?seed=` malformé basculait sans le dire
 * « à partir de ce réel » vers « Pour toi ». `posts/feed.ts` en portait SEPT
 * exemplaires ; ce lot les a tous remplacés par un `safeParse` + 400 explicite
 * (voir `no-silent-query-fallback-guard` ci-dessous et
 * `posts/feed.test.ts` § « Query invalide ⇒ 400 »).
 *
 * ## Le glob doit RATER le fichier pour que la garde meure en silence
 *
 * C'est un balayage NÉGATIF : sans témoin qui prouve qu'il balaie bien le bon
 * dossier, un glob qui rate `routes/posts/` passerait au vert pour une
 * mauvaise raison — zéro fichier trouvé, zéro motif trouvé. Le second `it`
 * ci-dessous tient cette preuve : il compte les FICHIERS balayés, pas
 * seulement les motifs.
 *
 * ## `comments.ts` — dette NOMMÉE, pas silence
 *
 * `posts/comments.ts` porte encore le motif (deux occurrences) — il appartient
 * à une AUTRE issue que #4149 (territoire distinct dans ce lot à quatre
 * agents : « posts/interactions.ts, posts/core.ts, posts/comments.ts
 * appartiennent à d'autres issues »). Le nommer en DETTE plutôt que
 * l'ignorer empêche « hors de mon territoire » de se confondre avec
 * « je n'ai pas regardé » — et fait rougir ce témoin le jour où l'entrée ne
 * désigne plus rien (le nettoyage devient visible, pas silencieux). Patron
 * emprunté à `alias-deprecation-guard.test.ts` / `deprecated-alias-headers-guard.test.ts`
 * (mêmes contraintes multi-agents, même solution).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROUTES_DIR = join(__dirname, '../../../../routes');
const DOSSIERS_BALAYES = [join(ROUTES_DIR, 'posts'), join(ROUTES_DIR, 'social')];

// Capture `<x>.success ? <y>.data : {` quel que soit le nom des variables —
// c'est la FORME qui est interdite, pas un identifiant précis. Le `{` final
// exclut à dessein les replis LÉGITIMES vers une valeur scalaire
// (`parsed.success ? parsed.data.emoji : '❤️'`, `interactions.ts:66`,
// `comments.ts:586/686` — un défaut de réaction documenté, pas une page
// silencieuse) : ceux-là ne portent jamais d'accolade ouvrante après `:`.
const MOTIF_INTERDIT = /\.success\s*\?\s*[\w.]+\.data\s*:\s*\{/;

const DETTE: readonly string[] = ['comments.ts'];

function fichiersSource(dossier: string): string[] {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((nom) => nom.endsWith('.ts') && !nom.endsWith('.test.ts'))
    .map((nom) => join(dossier, nom));
}

function fichiersPortantLeMotif(): string[] {
  return DOSSIERS_BALAYES.flatMap(fichiersSource).filter((chemin) =>
    MOTIF_INTERDIT.test(readFileSync(chemin, 'utf8')),
  );
}

describe('Aucune query invalide ne retombe en silence sur une première page (#4149)', () => {
  it('balaie bien routes/posts (le glob ne doit jamais rater ce dossier)', () => {
    // `comments.ts`, `core.ts`, `feed.ts`, `hashtag.ts`… au moins une dizaine
    // de fichiers sources aujourd'hui. Un chiffre bas signalerait un glob cassé
    // plutôt qu'un dossier propre — c'est la preuve que la garde n'est pas
    // verte par accident.
    expect(fichiersSource(join(ROUTES_DIR, 'posts')).length).toBeGreaterThan(8);
  });

  it("n'admet le motif interdit dans routes/posts et routes/social que pour la dette nommée", () => {
    const porteurs = fichiersPortantLeMotif().map((chemin) => chemin.split('/').pop());
    const horsDette = porteurs.filter((nom) => !DETTE.includes(nom as string));
    expect(horsDette).toEqual([]);
  });

  it('la dette nommée existe et porte encore le motif — sinon la retirer de la liste', () => {
    const porteurs = new Set(fichiersPortantLeMotif().map((chemin) => chemin.split('/').pop()));
    const perimee = DETTE.filter((nom) => !porteurs.has(nom));
    expect(perimee).toEqual([]);
  });

  it('feed.ts en particulier ne porte plus AUCUNE occurrence (les sept corrigées par #4149)', () => {
    const source = readFileSync(join(ROUTES_DIR, 'posts', 'feed.ts'), 'utf8');
    const occurrences = source.match(new RegExp(MOTIF_INTERDIT, 'g')) ?? [];
    expect(occurrences).toEqual([]);
  });
});
