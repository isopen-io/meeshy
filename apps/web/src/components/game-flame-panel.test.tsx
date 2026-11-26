import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameFlamePanel } from './game-flame-panel';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const out = { streak: 9, lastActiveDay: '2026-10-03', broken: { streak: 9, lastActiveDay: '2026-10-03' }, freezes: 0 } as const;

const props = (patch: Parameters<typeof gameBlockFixture>[0] = {}, extra: Partial<Parameters<typeof GameFlamePanel>[0]> = {}) => {
  const game = gameBlockFixture(patch);
  return {
    flame: game.flame,
    held: game.treasury.held,
    online: true,
    buyingFreeze: false,
    relighting: false,
    pausing: false,
    today: game.missions.dayKey,
    onBuyFreeze: () => undefined,
    onRelight: () => undefined,
    onPause: () => undefined,
    choosingGoal: false,
    goalSignSeen: false,
    onChooseGoal: () => undefined,
    onCloseGoalSign: () => undefined,
    ...extra,
  } satisfies Parameters<typeof GameFlamePanel>[0];
};

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/**
 * LA FLAMME : GELS ET RALLUMAGE (#9383) — ce qu'on peut faire de ses Meeshes
 * pour la protéger. Conception : jusqu'à deux gels en réserve (1 Meesh
 * chacun), rallumage sous 48 h (3 Meeshes) ; rien d'autre n'est jamais offert.
 */
describe('les gels', () => {
  test('la réserve se compte, et le prix se dit', () => {
    const page = text(renderToStaticMarkup(<GameFlamePanel {...props()} />));
    expect(page).toContain('Veilleuses : 1 / 2');
    expect(page).toContain('Prendre une Veilleuse · 1 Meesh');
  });

  test('le bonus de Flamme s’explique', () => {
    expect(text(renderToStaticMarkup(<GameFlamePanel {...props()} />))).toContain('+2 % d’étincelles par acte');
  });

  test('le toucher achète', async () => {
    let bought = 0;
    const host = await mount(<GameFlamePanel {...props({}, { onBuyFreeze: () => (bought += 1) })} />);
    await click(host.querySelector('[data-game-freeze-buy]'));
    expect(bought).toBe(1);
  });

  test('réserve pleine : plus de bouton, la raison est dite', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({ freezes: 2 })} />);
    expect(html).not.toContain('data-game-freeze-buy');
    expect(text(html)).toContain('Tes Veilleuses sont au complet');
  });

  test('trésor vide : le bouton se tait et dit combien il manque', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({ balance: 0 })} />);
    expect(html).toMatch(/data-game-freeze-buy=""[^>]*disabled/);
    expect(text(html)).toContain('Tu as Aucune Meesh');
    expect(text(html)).toContain('Il manque 1 Meesh');
  });

  test('avant l’achat : les Meeshes en poche et le prix du gel — jamais ce qui restera (#9705, #11178)', () => {
    const page = text(renderToStaticMarkup(<GameFlamePanel {...props({ balance: 4 })} />));
    expect(page).toContain('Tu as 4 Meeshes');
    expect(page).toContain('Il faut 1 Meesh');
    expect(page).not.toContain('3 Meeshes');
  });

  test('hors ligne : le bouton se tait', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({}, { online: false })} />);
    expect(html).toMatch(/data-game-freeze-buy=""[^>]*disabled/);
  });

  test('en cours d’achat : occupé', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({}, { buyingFreeze: true })} />);
    expect(html).toMatch(/data-game-freeze-buy=""[^>]*disabled/);
    expect(html).toContain('aria-busy="true"');
  });

  test('l’échec se lit', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({}, { errors: { freeze: 'Deux Veilleuses gardent déjà ta Flamme : c’est le plus possible.' } })} />);
    expect(html).toContain('role="alert"');
  });
});

describe('le rallumage', () => {
  test('une Flamme vivante ne propose pas de rallumage', () => {
    expect(renderToStaticMarkup(<GameFlamePanel {...props()} />)).not.toContain('data-game-relight');
  });

  test('éteinte et rallumable : le bouton, son prix, la série reprise', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({ ...out, balance: 5 })} />);
    expect(html).toContain('data-game-relight=""');
    expect(text(html)).toContain('Rallumer la Flamme · 3 Meesh');
    expect(text(html)).not.toContain('2 Meeshes');
  });

  test('le toucher rallume', async () => {
    let relit = 0;
    const host = await mount(<GameFlamePanel {...props({ ...out, balance: 5 }, { onRelight: () => (relit += 1) })} />);
    await click(host.querySelector('[data-game-relight]'));
    expect(relit).toBe(1);
  });

  test('éteinte sans de quoi payer : pas de bouton (le bloc ne dit pas si la fenêtre est ouverte), le manque est dit', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({ ...out, balance: 1 })} />);
    expect(html).not.toContain('data-game-relight');
    expect(text(html)).toContain('Il te faut 3 Meeshes pour la rallumer');
    expect(text(html)).toContain('Il manque 2 Meeshes');
    expect(text(html)).not.toContain('ne peut plus être rallumée');
  });

  test('éteinte depuis trop longtemps : on dit qu’une nouvelle commence, sans bouton', () => {
    const late = props({ streak: 9, lastActiveDay: '2026-09-20', broken: { streak: 9, lastActiveDay: '2026-09-20' }, freezes: 0, balance: 5 });
    const html = renderToStaticMarkup(<GameFlamePanel {...late} />);
    expect(html).not.toContain('data-game-relight');
    expect(text(html)).toContain('Une nouvelle Flamme commence');
  });
});

describe('le rallumage par l’effort (#20471)', () => {
  test('éteinte, la fenêtre ouverte : combien de rêves complets la rallument, et jusqu’à quand', () => {
    const page = text(renderToStaticMarkup(<GameFlamePanel {...props({ ...out, balance: 5, effortDreamDays: [] })} />));
    expect(page).toContain('Encore 2 rêves complets d’ici demain soir et ta Flamme de 9 jours revient, sans payer.');
    expect(page).toContain('Rallumer la Flamme · 3 Meesh');
  });

  test('le dernier jour, un rêve fait : « aujourd’hui », au singulier', () => {
    const lastDay = { streak: 1, lastActiveDay: '2026-10-04', broken: { streak: 9, lastActiveDay: '2026-10-02' }, freezes: 0 } as const;
    const page = text(renderToStaticMarkup(<GameFlamePanel {...props({ ...lastDay, effortDreamDays: ['2026-10-04'] })} />));
    expect(page).toContain('Encore 1 rêve complet aujourd’hui et ta Flamme de 9 jours revient, sans payer.');
  });

  test('sans de quoi payer, l’effort la rallume encore : jamais « ne peut plus être rallumée »', () => {
    const page = text(renderToStaticMarkup(<GameFlamePanel {...props({ ...out, balance: 5, lastRelightDay: '2026-10-01', effortDreamDays: [] })} />));
    expect(page).toContain('Encore 2 rêves complets');
    expect(page).not.toContain('ne peut plus être rallumée');
  });

  test('une forme illisible se tait : rien de neuf ne s’affiche', async () => {
    const { readEffortRelight } = await import('@/lib/view/game-copy');
    expect(readEffortRelight({ lostDays: 9, dreamsDone: 0, dreamsNeeded: 2, closesOn: '2026-10-05', daysLeft: 1 })).toEqual({ lostDays: 9, dreamsDone: 0, dreamsNeeded: 2, closesOn: '2026-10-05', daysLeft: 1 });
    expect(readEffortRelight({ lostDays: 0, dreamsDone: 0, dreamsNeeded: 2, closesOn: '2026-10-05', daysLeft: 1 })).toBeNull();
    expect(readEffortRelight({ lostDays: 9, dreamsDone: 0, dreamsNeeded: 2, closesOn: 'demain', daysLeft: 1 })).toBeNull();
    expect(readEffortRelight(null)).toBeNull();
  });

  test('devant un serveur qui ne le sert pas, rien de neuf ne s’affiche', () => {
    expect(text(renderToStaticMarkup(<GameFlamePanel {...props({ ...out, balance: 5 })} />))).not.toContain('rêve complet');
  });

  test('dit dans les sept langues', async () => {
    const { loadGameCatalog, translateGame, translateGamePlural } = await import('@/lib/i18n-game-catalog');
    const languages = ['fr', 'en', 'es', 'pt', 'it', 'de', 'ar'] as const;
    await Promise.all(languages.map((language) => loadGameCatalog(language)));
    for (const language of languages) {
      const dreams = translateGamePlural(language, 'game.flame_panel.effort_dreams', 2);
      for (const key of ['game.flame_panel.effort_relight_today', 'game.flame_panel.effort_relight_tomorrow'] as const) {
        const line = translateGame(language, key, { dreams, days: '9' });
        expect(line).toContain(dreams);
        expect(line).not.toContain('{');
      }
    }
  });
});

describe('la Flamme en veille (#20509)', () => {
  test('allumée, la carte propose une veille de 1 à 7 jours, sept jours choisis d’avance', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props()} />);
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/data-game-pause-days="/g)?.length).toBe(7);
    expect(html).toContain('data-game-pause-days="7" aria-checked="true"');
    expect(text(html)).toContain('Mettre en veille · 7 jours');
    expect(text(html)).toContain('une fois par trimestre');
  });

  test('deux gestes : la durée, puis l’annonce', async () => {
    const asked: number[] = [];
    const host = await mount(<GameFlamePanel {...props({}, { onPause: (days) => asked.push(days) })} />);
    await click(host.querySelector('[data-game-pause-days="3"]'));
    expect(host.querySelector('[data-game-pause-days="3"]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('Mettre en veille · 3 jours');
    await click(host.querySelector('[data-game-flame-pause]'));
    expect(asked).toEqual([3]);
  });

  test('à risque, la veille se propose aussi : elle garde la Flamme dès demain', () => {
    expect(renderToStaticMarkup(<GameFlamePanel {...props({ lastActiveDay: '2026-10-04' })} />)).toContain('data-game-flame-pause=""');
  });

  test('en veille, la carte dit jusqu’à quand, et l’annonce se tait', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({ pause: { from: '2026-10-03', until: '2026-10-09' } })} />);
    expect(text(html)).toContain('Ta Flamme est en veille jusqu’au vendredi 9 octobre.');
    expect(html).not.toContain('data-game-flame-pause=""');
    expect(html).not.toContain('role="radiogroup"');
  });

  test('annoncée pour demain, la carte le dit', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({ pause: { from: '2026-10-06', until: '2026-10-08' } })} />);
    expect(text(html)).toContain('Ta Flamme se met en veille demain, jusqu’au jeudi 8 octobre.');
    expect(html).not.toContain('data-game-flame-pause=""');
  });

  test('le trimestre pris, l’annonce se tait et la carte dit dès quand la prochaine sera possible (#20517)', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({ pause: { from: '2026-10-01', until: '2026-10-02' } })} />);
    expect(text(html)).toContain('Ta prochaine veille sera possible dès le 1 janvier.');
    expect(html).toContain('data-game-flame-pause-next=""');
    expect(html).not.toContain('data-game-flame-pause=""');
    expect(html).not.toContain('role="radiogroup"');
  });

  test('sans Flamme, ou éteinte, rien à mettre en veille', () => {
    expect(renderToStaticMarkup(<GameFlamePanel {...props({ streak: 0, lastActiveDay: null })} />)).not.toContain('data-game-flame-pause=""');
    expect(renderToStaticMarkup(<GameFlamePanel {...props({ ...out, balance: 5 })} />)).not.toContain('data-game-flame-pause=""');
  });

  test('hors ligne, l’annonce attend ; en vol, elle dit qu’elle travaille', () => {
    expect(renderToStaticMarkup(<GameFlamePanel {...props({}, { online: false })} />)).toMatch(/data-game-flame-pause="" disabled=""/);
    expect(renderToStaticMarkup(<GameFlamePanel {...props({}, { pausing: true })} />)).toContain('aria-busy="true"');
  });

  test('un refus se dit à sa place', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({}, { errors: { pause: 'Ta Flamme a déjà eu sa veille ce trimestre.' } })} />);
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain('Ta Flamme a déjà eu sa veille ce trimestre.');
  });
});

describe('l’objectif de Flamme (#20521)', () => {
  const firstDay = { streak: 1, goal: null } as const;
  const running = { streak: 9, goal: { target: 14, chosenAtStreak: 1 } } as const;
  const reached = { streak: 7, goal: { target: 7, chosenAtStreak: 1 } } as const;

  test('au premier jour, la carte propose 7, 14 ou 30 jours, et ne rien choisir ne coûte rien', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props(firstDay)} />);
    expect(html.match(/data-game-flame-goal="/g)?.length).toBe(3);
    expect(text(html)).toContain('7 jours');
    expect(text(html)).toContain('30 jours');
    expect(html).toContain('role="group"');
  });

  test('un geste choisit l’objectif', async () => {
    const asked: number[] = [];
    const host = await mount(<GameFlamePanel {...props(firstDay, { onChooseGoal: (target) => asked.push(target) })} />);
    await click(host.querySelector('[data-game-flame-goal="14"]'));
    expect(asked).toEqual([14]);
  });

  test('passé le premier jour, sans objectif, rien ne se propose', () => {
    expect(renderToStaticMarkup(<GameFlamePanel {...props({ goal: null })} />)).not.toContain('data-game-flame-goal');
    expect(renderToStaticMarkup(<GameFlamePanel {...props()} />)).not.toContain('data-game-flame-goal');
  });

  test('en cours, la carte dit ce qu’il reste, et ne propose rien d’autre', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props(running)} />);
    expect(text(html)).toContain('Objectif : 14 jours de Flamme. Encore 5 jours.');
    expect(html).not.toContain('data-game-flame-goal="');
  });

  test('atteint, les aïeux le saluent et la marche suivante se propose ; « Plus tard » la ferme', async () => {
    const chosen: number[] = [];
    const closed: number[] = [];
    const host = await mount(
      <GameFlamePanel {...props(reached, { onChooseGoal: (target) => chosen.push(target), onCloseGoalSign: (target) => closed.push(target) })} />,
    );
    expect(host.textContent).toContain('Tes aïeux saluent ta Flamme : 7 jours tenus');
    expect(host.querySelector('[data-game-flame-goal-sign]')?.getAttribute('role')).toBe('status');
    await click(host.querySelector('[data-game-flame-goal="14"]'));
    expect(chosen).toEqual([14]);
    await click(host.querySelector('[data-game-flame-goal-later]'));
    expect(closed).toEqual([7]);
  });

  test('le signe déjà fermé, ou déjà dit par Mee et Meo, ne se redit pas ; la marche suivante reste à portée', async () => {
    const chosen: number[] = [];
    const host = await mount(<GameFlamePanel {...props(reached, { goalSignSeen: true, onChooseGoal: (target) => chosen.push(target) })} />);
    expect(host.querySelector('[data-game-flame-goal-sign]')).toBeNull();
    expect(host.querySelector('[data-game-flame-goal-later]')).toBeNull();
    expect(host.textContent).not.toContain('Tes aïeux saluent');
    expect(host.textContent).toContain('Objectif de 7 jours tenu.');
    await click(host.querySelector('[data-game-flame-goal="14"]'));
    expect(chosen).toEqual([14]);
  });

  test('une Flamme cassée fait tomber l’objectif sans le dire comme un échec', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({ ...out, goal: { target: 14, chosenAtStreak: 1, brokenOn: '2026-10-04' } })} />);
    expect(html).not.toContain('data-game-flame-goal');
    expect(text(html)).not.toContain('Objectif');
  });

  test('hors ligne, le choix attend ; en vol, il dit qu’il travaille ; un refus se dit à sa place', () => {
    expect(renderToStaticMarkup(<GameFlamePanel {...props(firstDay, { online: false })} />)).toMatch(/data-game-flame-goal="7" disabled=""/);
    expect(renderToStaticMarkup(<GameFlamePanel {...props(firstDay, { choosingGoal: true })} />)).toMatch(/data-game-flame-goal="7" disabled="" aria-busy="true"/);
    const html = renderToStaticMarkup(<GameFlamePanel {...props(firstDay, { errors: { goal: 'Cet objectif ne se propose pas aujourd’hui.' } })} />);
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain('Cet objectif ne se propose pas aujourd’hui.');
  });
});
