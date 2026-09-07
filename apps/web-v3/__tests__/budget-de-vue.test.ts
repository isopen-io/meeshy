import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { estRolePremier, motifsDuRolePremier } from '../scripts/lib/budget-de-vue.mjs';

// #4764 (correction annexe) — `compare-rendu.js` choisissait la classe de
// budget d'une vue par une regex écrite à la main
// (`/^\/(l\/|stories\/|post\/|feed$)/`) qui ne reconnaissait ni `/posts/*`,
// ni `/reels/*`, ni `/moods/*`, ni `/chat/*`, ni `/login/*`, ni `/signup/*`,
// et jugeait `/feed` — une route du groupe `(connected)` — au budget serré du
// rôle premier. Le site unique de la zone est `budgets.json` (groupe
// `(public)`, § bundle-budget.test.ts « réclame toutes les routes de la
// lecture partagée, rôle premier ») ; ces témoins mesurent la classification
// contre CE fichier, jamais une copie.
describe('estRolePremier', () => {
  const budgets = JSON.parse(readFileSync(join(__dirname, '..', 'budgets.json'), 'utf8'));

  it('lit ses motifs dans le groupe (public) de budgets.json, jamais une copie', () => {
    const motifs = motifsDuRolePremier(budgets);

    expect(motifs).toEqual(
      expect.arrayContaining(['/l/*', '/stories/*', '/posts/*', '/post/*', '/reels/*', '/moods/*']),
    );
  });

  it.each([
    ['/l/:token', true],
    ['/stories/:id', true],
    ['/posts/:id', true],
    ['/post/:id', true],
    ['/reels/:id', true],
    ['/moods/:id', true],
    ['/chat/:lien', true],
  ])('reconnaît %s comme rôle premier', (route, attendu) => {
    expect(estRolePremier(route, budgets)).toBe(attendu);
  });

  it.each([
    ['/feed', false],
    ['/chats', false],
    ['/chats/:cle', false],
    ['/settings/profile', false],
  ])("ne classe pas %s en rôle premier — c'est le groupe (connected)", (route, attendu) => {
    expect(estRolePremier(route, budgets)).toBe(attendu);
  });

  it("classait /feed en rôle premier avec l'ancienne regex écrite à la main — plus maintenant", () => {
    const ancienneRegex = /^\/(l\/|stories\/|post\/|feed$)/;

    expect(ancienneRegex.test('/feed')).toBe(true);
    expect(estRolePremier('/feed', budgets)).toBe(false);
  });
});
