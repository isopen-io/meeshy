import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameMissions } from './game-missions';

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

const props = (patch: Parameters<typeof gameBlockFixture>[0] = {}, extra: Partial<Parameters<typeof GameMissions>[0]> = {}) => {
  const game = gameBlockFixture(patch);
  return {
    missions: game.missions,
    chest: game.chest,
    held: game.treasury.held,
    level: game.level.level,
    prismHour: game.boosts.prismHour,
    online: true,
    pendingRerollId: null,
    chestOpening: false,
    onReroll: () => undefined,
    onClaim: () => undefined,
    ...extra,
  } satisfies Parameters<typeof GameMissions>[0];
};

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('les missions du jour', () => {
  const page = text(renderToStaticMarkup(<GameMissions {...props()} />));

  test('trois missions, dites en clair, avec leur avancement et leur récompense', () => {
    expect(page).toContain('Envoyer 5 messages');
    expect(page).toContain('Répondre dans 3 conversations différentes');
    expect(page).toContain('Publier 2 posts');
    expect(page).toContain('5 / 5');
    expect(page).toContain('1 / 3');
    expect(page).toContain('+36 points');
  });

  test('une mission faite se dit faite', () => {
    expect(page).toContain('Faite');
  });

  test('la difficulté se lit', () => {
    expect(page).toContain('Facile');
    expect(page).toContain('Moyenne');
    expect(page).toContain('Difficile');
  });

  test('l’Heure du Prisme se dit, avec ses bornes', () => {
    expect(page).toMatch(/Heure du Prisme\s*:\s*\d{2}:\d{2}\s*–\s*\d{2}:\d{2}/);
  });

  test('la mission Or annonce sa Gloire', () => {
    const game = gameBlockFixture();
    const gold = { ...game.missions, items: [...game.missions.items.slice(0, 2), { ...game.missions.items[2]!, difficulty: 'gold' as const, glory: 40 }] };
    expect(text(renderToStaticMarkup(<GameMissions {...props({}, { missions: gold })} />))).toContain('+40 Gloire');
  });
});

describe('changer de mission', () => {
  test('une seule fois par jour : le bouton n’est posé que sur les missions à faire, avec son prix', () => {
    const html = renderToStaticMarkup(<GameMissions {...props()} />);
    expect(html.match(/data-game-reroll/g)).toHaveLength(2);
    expect(text(html)).toContain('Changer · 1 Meesh');
  });

  test('une fois le changement du jour pris : plus aucun bouton', () => {
    const html = renderToStaticMarkup(<GameMissions {...props({ rerollsUsedToday: 1 })} />);
    expect(html).not.toContain('data-game-reroll');
  });

  test('hors ligne : le bouton se tait et l’écran le dit', () => {
    const html = renderToStaticMarkup(<GameMissions {...props({}, { online: false })} />);
    expect(html).toContain('data-game-reroll=""');
    expect(html).toMatch(/data-game-reroll=""[^>]*disabled/);
  });

  test('le toucher envoie l’identifiant de LA mission', async () => {
    const asked: string[] = [];
    const host = await mount(<GameMissions {...props({}, { onReroll: (id) => asked.push(id) })} />);
    const buttons = host.querySelectorAll<HTMLElement>('[data-game-reroll]');
    await click(buttons[0] ?? null);
    expect(asked).toEqual(['m-medium']);
  });

  test('pendant le changement, la mission attend sa remplaçante', () => {
    const html = renderToStaticMarkup(<GameMissions {...props({}, { pendingRerollId: 'm-medium' })} />);
    expect(html).toMatch(/data-game-mission="m-medium"[^>]*aria-busy="true"/);
  });

  test('l’échec se lit sous les missions', () => {
    const html = renderToStaticMarkup(<GameMissions {...props({}, { errors: { reroll: 'Tu as déjà changé une mission aujourd’hui.' } })} />);
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain('déjà changé une mission');
  });
});

describe('le coffre', () => {
  test('fermé tant que les missions ne sont pas finies, avec ce qu’il contient AVANT l’ouverture', () => {
    const page = text(renderToStaticMarkup(<GameMissions {...props()} />));
    expect(page).toContain('Termine les missions du jour');
    expect(page).toMatch(/60 à 200 points/);
    expect(page).toContain('1 chance sur 6');
    expect(page).toContain('1 chance sur 20');
  });

  const done = (patch: Parameters<typeof gameBlockFixture>[0] = {}) => {
    const items = gameBlockFixture().missions.items.map((m) => ({ ...m, progress: m.target, completedAt: '2026-10-05T10:00:00.000Z' }));
    return props({ missions: items, ...patch });
  };

  test('prêt : un bouton, une seule façon de l’ouvrir', () => {
    const html = renderToStaticMarkup(<GameMissions {...done()} />);
    expect(html.match(/data-game-chest-open/g)).toHaveLength(1);
    expect(text(html)).toContain('Ouvrir le coffre');
  });

  test('le toucher ouvre', async () => {
    let opened = 0;
    const host = await mount(<GameMissions {...done()} onClaim={() => (opened += 1)} />);
    await click(host.querySelector('[data-game-chest-open]'));
    expect(opened).toBe(1);
  });

  test('ouvert : le contenu servi se montre, en récompenses posées sur le coffre', () => {
    const html = renderToStaticMarkup(
      <GameMissions {...done({ chestClaimed: true, chestReward: { points: 120, fragment: true, freeze: true } })} />,
    );
    expect(html.match(/data-game-reward/g)).toHaveLength(3);
    expect(text(html)).toContain('+120 points');
    expect(html).not.toContain('data-game-chest-open');
  });

  test('en cours d’ouverture : le coffre s’ouvre déjà, le contenu est attendu', () => {
    const html = renderToStaticMarkup(<GameMissions {...done({ chestClaimed: true })} chestOpening />);
    expect(html).toContain('data-game-chest="open"');
    expect(html).toMatch(/data-game-chest-state="opening"/);
  });
});

describe('avant le niveau 5', () => {
  test('les missions se disent verrouillées, avec la marche à franchir', () => {
    const page = text(renderToStaticMarkup(<GameMissions {...props({ score: 100, missions: [] })} />));
    expect(page).toContain('Les missions s’ouvrent au niveau 5');
    expect(page).not.toContain('Ouvrir le coffre');
  });
});
