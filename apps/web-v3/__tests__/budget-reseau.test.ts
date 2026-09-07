import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GROUPE_ROLE_PREMIER, cleDeBudget, pathnameDeRoute } from '../scripts/lib/budget-reseau.mjs';

// Les groupes RÉELS de budgets.json — un témoin qui fabriquerait ses propres
// motifs dirait ce que son auteur croit, jamais ce que le dépôt classe déjà en
// rôle premier (voir issue #5473 : la regex de compare-rendu.js divergeait de
// ce fichier).
type Groupe = { readonly id: string; readonly motifs: readonly string[] };
const budgets = JSON.parse(readFileSync(join(__dirname, '..', 'budgets.json'), 'utf8')) as {
  groupes: readonly Groupe[];
};

describe('cleDeBudget — classe une route par le groupe (public) de budgets.json', () => {
  it.each([
    '/l/lien-vivant',
    '/stories/abc',
    '/posts/abc',
    '/post/abc',
    '/reels/abc',
    '/moods/abc',
    '/chat/abc',
  ])('%s est du rôle premier', (route) => {
    expect(cleDeBudget(route, budgets.groupes)).toBe('role-premier');
  });

  it.each(['/feed', '/chats/abc', '/settings/profil'])('%s est du budget défaut', (route) => {
    expect(cleDeBudget(route, budgets.groupes)).toBe('defaut');
  });

  it("classe /feed en défaut — régression de l'ancienne regex, qui le reconnaissait à tort", () => {
    // L'ancienne regex `/^\/(l\/|stories\/|post\/|feed$)/` matchait `/feed`
    // comme rôle premier ; `/feed` vit dans le groupe (connected).
    expect(cleDeBudget('/feed', budgets.groupes)).not.toBe('role-premier');
  });

  it('/posts/* (pluriel) est reconnu — artefact corrigé de la regex qui ne reconnaissait que /post/*', () => {
    expect(cleDeBudget('/posts/abc', budgets.groupes)).toBe('role-premier');
  });

  it('ignore la chaîne de requête pour classer la route', () => {
    // /login vit dans le groupe (public), mais une route de vue.json porte sa
    // chaîne de requête inline (« /login?returnUrl=/chat/:lien ») — aucun motif
    // de budgets.json ne porte de « ? ».
    expect(cleDeBudget('/login?returnUrl=/chat/:lien', budgets.groupes)).toBe('role-premier');
  });

  it("classe une route inconnue en défaut, jamais en rôle premier par accident", () => {
    expect(cleDeBudget('/inconnue-de-personne', budgets.groupes)).toBe('defaut');
  });
});

describe('pathnameDeRoute', () => {
  it('retire la chaîne de requête', () => {
    expect(pathnameDeRoute('/login?returnUrl=/chat/:lien')).toBe('/login');
  });

  it('laisse une route sans chaîne de requête inchangée', () => {
    expect(pathnameDeRoute('/stories/:id')).toBe('/stories/:id');
  });
});

describe('GROUPE_ROLE_PREMIER', () => {
  it('nomme le groupe (public) réellement déclaré dans budgets.json', () => {
    expect(budgets.groupes.some((g) => g.id === GROUPE_ROLE_PREMIER)).toBe(true);
  });
});
