import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { GUIDE_ACTIONS } from '@meeshy/shared/utils/game/guide';
import { GUIDE_ACTIONS_V2 } from '@meeshy/shared/utils/game/guide-v2';
import { PROGRESSION_CONCEPTS } from '@meeshy/shared/utils/progression-layout';

import { guideActionTarget } from '@/lib/game-guide/action-target';
import { resolveTarget, type PushTapTarget } from '@/lib/notifications/target';
import { ROUTES, href } from '@/routes/route-table';

import {
  ANNEX_ROUTES,
  SUBPAGE_CONCEPT,
  chainBelow,
  gameScreenOf,
  levelOf,
  parentOf,
  redirectOf,
  subpageOf,
  upMove,
  type NavTarget,
} from './progression-nav';

/**
 * LA CARTE DE NAVIGATION DE PROGRESSION (#9563, amendement n° 4) — le témoin de
 * la carte écrite en commentaire de #9563 et #9564 avant le code :
 *
 *   · chaque route du jeu est un écran de la carte, à un niveau (1, 2 ou 3), avec
 *     UN parent d'un niveau au-dessus ;
 *   · « retour » recule jusqu'au parent quand il est dans la suite d'écrans du
 *     jeu, remplace sinon, et la pile reçoit les ancêtres d'un écran ouvert de
 *     l'extérieur ;
 *   · chaque entrée extérieure (notification, guide de Mee, bandeau du joueur,
 *     compteur de Meeshes) ouvre l'écran que la carte nomme, jamais la racine
 *     quand un concept est en cause.
 */

const pathOf = (target: NavTarget): string =>
  target.to === 'progressionConcept' ? href('progressionConcept', { concept: target.concept }) : href(target.to);

const GAME_ROUTES = Object.entries(ROUTES)
  .filter(([, route]) => route.pattern === '/me/progression' || route.pattern.startsWith('/me/progression/'))
  .map(([key]) => key);

const screenOfKey = (key: string) => gameScreenOf({ key, params: key === 'progressionConcept' ? { concept: 'flame' } : {} });

describe('trois niveaux, un parent chacun', () => {
  test('chaque route sous /me/progression est un écran de la carte, et aucune autre', () => {
    expect(GAME_ROUTES.length).toBeGreaterThanOrEqual(14);
    for (const key of GAME_ROUTES) expect({ key, mapped: screenOfKey(key) !== null }).toEqual({ key, mapped: true });
    for (const key of Object.keys(ROUTES).filter((name) => !GAME_ROUTES.includes(name))) {
      expect({ key, mapped: screenOfKey(key) }).toEqual({ key, mapped: null });
    }
  });

  test('Progression est au niveau 1 ; fiches et portes au niveau 2 ; sous-pages au niveau 3 ; jamais plus', () => {
    expect(levelOf({ kind: 'root' })).toBe(1);
    for (const concept of PROGRESSION_CONCEPTS) expect(levelOf({ kind: 'fiche', concept })).toBe(2);
    for (const route of ANNEX_ROUTES) expect(levelOf({ kind: 'annex', route })).toBe(2);
    for (const key of Object.keys(SUBPAGE_CONCEPT)) expect(levelOf(screenOfKey(key) ?? { kind: 'root' })).toBe(3);
  });

  test('le parent de chaque écran est d’un niveau au-dessus — Progression a pour parent l’extérieur du jeu', () => {
    expect(parentOf({ kind: 'root' })).toEqual({ to: 'list' });
    for (const key of GAME_ROUTES) {
      const screen = screenOfKey(key);
      if (screen === null || screen.kind === 'root') continue;
      const parent = gameScreenOf({ key: parentOf(screen).to, params: { concept: 'concept' in screen ? screen.concept : '' } });
      expect({ key, parentLevel: parent === null ? 0 : levelOf(parent) }).toEqual({ key, parentLevel: levelOf(screen) - 1 });
    }
  });

  test('une sous-page a pour parent la fiche de SON concept, et une fiche n’a que sa sous-page sous elle', () => {
    expect(parentOf({ kind: 'subpage', route: 'progressionLigue', concept: 'league' })).toEqual({ to: 'progressionConcept', concept: 'league' });
    expect(parentOf({ kind: 'subpage', route: 'progressionVitrine', concept: 'showcase' })).toEqual({ to: 'progressionConcept', concept: 'showcase' });
    for (const [route, concept] of Object.entries(SUBPAGE_CONCEPT)) expect(subpageOf(concept)).toBe(route as keyof typeof SUBPAGE_CONCEPT);
    for (const concept of ['level', 'points', 'meesh', 'glory', 'flame', 'missions', 'elans'] as const) expect(subpageOf(concept)).toBeUndefined();
  });

  test('l’ancienne adresse du Tableau de bord est Progression, et la redirection la remplace', () => {
    expect(gameScreenOf({ key: 'progressionTableau', params: {} })).toEqual({ kind: 'root' });
    expect(ROUTES.progressionTableau.pattern).toBe('/me/progression/tableau-de-bord');
    expect(redirectOf('/me/progression/tableau-de-bord', pathOf)).toBe('/me/progression');
    expect(redirectOf('/me/progression', pathOf)).toBeNull();
    expect(redirectOf('/me/progression/concept/flame', pathOf)).toBeNull();
  });
});

describe('« retour » remonte au parent, jamais ailleurs', () => {
  const at = (paths: readonly string[]) => paths.map((path, index) => ({ path, key: `k${index}` }));

  test('le parent est sous nous dans le jeu : on y recule (même entrée, position retrouvée)', () => {
    expect(upMove({ parentPath: '/me/progression', entries: at(['/', '/me/progression', '/me/progression/concept/flame']), index: 2 })).toEqual({ kind: 'traverse', key: 'k1' });
    expect(
      upMove({ parentPath: '/me/progression/concept/league', entries: at(['/me/progression', '/me/progression/concept/league?x=1', '/me/progression/ligue']), index: 2 }),
    ).toEqual({ kind: 'traverse', key: 'k1' });
  });

  test('une montée vers une autre fiche (« Voir la fiche ») recule jusqu’à Progression, par-dessus les écrans du jeu', () => {
    const entries = at(['/me/progression', '/me/progression/concept/league', '/me/progression/ligue', '/me/progression/concept/glory']);
    expect(upMove({ parentPath: '/me/progression', entries, index: 3 })).toEqual({ kind: 'traverse', key: 'k0' });
  });

  test('jamais par-dessus un écran étranger au jeu : arrivé par lien profond, l’écran est remplacé par son parent', () => {
    expect(upMove({ parentPath: '/me/progression', entries: at(['/me/progression', '/notifications', '/me/progression/concept/flame']), index: 2 })).toEqual({ kind: 'replace' });
    expect(upMove({ parentPath: '/me/progression', entries: at(['/me/progression/concept/flame']), index: 0 })).toEqual({ kind: 'replace' });
  });

  test('sans historique lisible, on avance vers le parent', () => {
    expect(upMove({ parentPath: '/me/progression', entries: null, index: 0 })).toEqual({ kind: 'push' });
  });

  test('ouvert de l’extérieur, un écran reçoit ses ancêtres sous lui ; ouvert depuis le jeu, rien', () => {
    const fiche = { kind: 'fiche', concept: 'missions' } as const;
    const subpage = { kind: 'subpage', route: 'progressionSaison', concept: 'season' } as const;
    expect(chainBelow({ screen: fiche, previousPath: '/notifications', pathOf })).toEqual(['/me/progression']);
    expect(chainBelow({ screen: fiche, previousPath: null, pathOf })).toEqual(['/me/progression']);
    expect(chainBelow({ screen: subpage, previousPath: '/', pathOf })).toEqual(['/me/progression', '/me/progression/concept/season']);
    expect(chainBelow({ screen: subpage, previousPath: '/me/progression/concept/season', pathOf })).toEqual([]);
    expect(chainBelow({ screen: fiche, previousPath: '/me/progression/ligue', pathOf })).toEqual([]);
    expect(chainBelow({ screen: { kind: 'root' }, previousPath: '/', pathOf })).toEqual([]);
  });
});

describe('chaque entrée extérieure ouvre l’écran que la carte nomme', () => {
  const pathOfTap = (target: PushTapTarget | null): string => {
    if (target === null) return 'rien';
    const url =
      target.route === 'progression'
        ? href('progression', undefined, target.search)
        : target.route === 'progressionLigue' || target.route === 'progressionSaison'
          ? href(target.route)
          : `hors du jeu : ${target.route}`;
    return redirectOf(url, pathOf) ?? url;
  };

  test('les notifications du jeu', () => {
    const expected: Readonly<Record<string, string>> = {
      game_mission_window: '/me/progression/concept/missions?section=gestures',
      game_duo_invited: '/me/progression/ligue',
      game_duo_accepted: '/me/progression/ligue',
      game_league_result: '/me/progression/ligue',
      game_season_step: '/me/progression/saison',
      level_up: '/me/progression/concept/level',
      streak_milestone: '/me/progression/concept/flame',
      badge_earned: '/me/progression/concept/badges',
      achievement_unlocked: '/me/progression/concept/succes',
      ACHIEVEMENT_UNLOCKED: '/me/progression/concept/succes',
    };
    for (const [type, path] of Object.entries(expected)) {
      expect({ type, path: pathOfTap(resolveTarget({ type })) }).toEqual({ type, path });
      expect({ type, hinted: pathOfTap(resolveTarget({ type, route: 'progression' })) }).toEqual({ type, hinted: path });
    }
    expect(pathOfTap(resolveTarget({ type: 'game_autre', route: 'progression' }))).toBe('/me/progression');
  });

  test('une section inconnue ouvre Progression', () => {
    expect(redirectOf('/me/progression?section=inconnue', pathOf)).toBeNull();
    for (const concept of PROGRESSION_CONCEPTS) {
      expect(redirectOf(`/me/progression?section=${concept}`, pathOf)).toBe(
        concept === 'missions' ? '/me/progression/concept/missions?section=gestures' : `/me/progression/concept/${concept}`,
      );
    }
  });

  test('le guide de Mee ouvre une FICHE — jamais une sous-page ni la racine', () => {
    const expected: Readonly<Record<string, string>> = {
      'see-level': 'level',
      'see-progress': 'level',
      'see-next-tier': 'level',
      'prestige-or-stay': 'level',
      'see-missions': 'missions',
      'open-first-mission': 'missions',
      'regain-levels': 'missions',
      'do-easy-mission-or-freeze': 'missions',
      'do-easiest-mission': 'missions',
      'see-flame': 'flame',
      'relight-flame': 'flame',
      'see-meeshes': 'meesh',
      'mint-or-climb': 'meesh',
      'see-mint-preview': 'meesh',
      'keep-or-spend': 'meesh',
      'see-rank': 'glory',
      'relight-badge': 'badges',
      'see-league': 'league',
      'see-season': 'season',
      'see-trophies': 'showcase',
      'see-atlas': 'atlas',
    };
    for (const action of [...GUIDE_ACTIONS, ...GUIDE_ACTIONS_V2]) {
      const target = guideActionTarget(action);
      const concept = expected[action];
      if (concept !== undefined) expect({ action, target }).toEqual({ action, target: { kind: 'fiche', concept } });
      else expect({ action, kind: target.kind === 'route' ? `route:${target.to}` : target.kind }).toEqual({ action, kind: action.includes('photo') ? 'photo' : 'route:list' });
    }
  });

  const APP = resolve(import.meta.dir, '../..');
  const read = (path: string) => readFileSync(join(APP, path), 'utf8');

  test('le bandeau du joueur ouvre la fiche du Niveau', () => {
    expect(/to="progressionConcept"\s+params=\{\{ concept: 'level' \}\}/.test(read('components/player-banner.tsx'))).toBe(true);
  });

  test('le retour de chaque écran du jeu vient de la carte : aucune route ne le déclare', () => {
    const routes = readdirSync(join(APP, 'routes')).filter((name) => /^progression.*\.tsx$/.test(name) && !name.includes('.test.'));
    for (const name of routes) {
      const source = read(`routes/${name}`);
      expect({ name, back: /\bback=\{/.test(source) || /\bconcept="[a-z]+"/.test(source) }).toEqual({ name, back: false });
    }
  });
});
