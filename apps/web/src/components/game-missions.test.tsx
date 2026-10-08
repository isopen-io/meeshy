import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';
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

/** Midi LOCAL du jour de la fixture (`2026-10-05`) : les missions du jour sont dans leur plage. */
const FIXTURE_NOON = new Date(2026, 9, 5, 12);

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
    now: FIXTURE_NOON,
    ...extra,
  } satisfies Parameters<typeof GameMissions>[0];
};

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('les missions du jour', () => {
  const page = text(renderToStaticMarkup(<GameMissions {...props()} />));

  test('trois missions, dites en clair, avec leur avancement et leur récompense', () => {
    expect(page).toContain('Envoyer 5 messages');
    expect(page).toContain('Écrire dans 3 conversations différentes');
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

  test('avant le changement : les Meeshes en poche, son prix et ce qui restera (#9705)', () => {
    const page = text(renderToStaticMarkup(<GameMissions {...props({ balance: 3 })} />));
    expect(page).toContain('En poche 3 Meeshes');
    expect(page).toContain('Coûte 1 Meesh');
    expect(page).toContain('Restera 2 Meeshes');
  });

  test('sans Meesh : le changement n’est pas offert, et la ligne dit combien il manque', () => {
    const html = renderToStaticMarkup(<GameMissions {...props({ balance: 0 })} />);
    expect(html).not.toContain('data-game-reroll=""');
    expect(text(html)).toContain('Changer · 1 Meesh');
    expect(text(html)).toContain('Il manque 1 Meesh');
  });

  test('une fois le changement du jour pris : plus aucun bouton', () => {
    const html = renderToStaticMarkup(<GameMissions {...props({ rerollsUsedToday: 1 })} />);
    expect(html).not.toContain('data-game-reroll');
    expect(html).not.toContain('data-game-spend');
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
    expect(page).toMatch(/Faites \d \/ 3/);
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
    expect(page).toContain('Requis 5');
    expect(page).toMatch(/Il manque \d+ niveaux?/);
    expect(page).not.toContain('Ouvrir le coffre');
  });
});

/**
 * LE MINUTEUR DES MISSIONS DU JOUR (#9539) — « CHAQUE carte de mission porte un minuteur jusqu'à la fin de sa
 * plage » : celle d'une mission du jour est son jour (minuit local). Passé la fin, la carte dit « Terminée » ou
 * « Manquée » et le bouton « Changer » disparaît — à l'identique d'iOS (`GameMissionClock`).
 */
describe('le minuteur des missions du jour', () => {
  const at = (date: Date): string => renderToStaticMarkup(<GameMissions {...props()} now={date} />);
  const card = (html: string, id: string): string => {
    const from = html.slice(html.indexOf(`data-game-mission="${id}"`));
    return from.slice(0, from.indexOf('</li>'));
  };

  test('une mission à faire dit ce qu’il reste jusqu’à la fin du jour, heures ET minutes', () => {
    const html = at(new Date(2026, 9, 5, 22, 30));
    expect(text(card(html, 'm-medium'))).toContain('Se termine dans 1 h 30 min');
    expect(text(card(html, 'm-hard'))).toContain('Se termine dans 1 h 30 min');
  });

  test('une mission déjà faite n’a pas de décompte', () => {
    expect(card(at(new Date(2026, 9, 5, 22, 30)), 'm-easy')).not.toContain('data-game-mission-timer');
  });

  test('passé minuit : « Manquée » pour celles qui restaient, « Terminée » pour celle qui était faite, plus de décompte', () => {
    const html = at(new Date(2026, 9, 6, 0, 0));
    expect(text(card(html, 'm-medium'))).toContain('Manquée');
    expect(text(card(html, 'm-hard'))).toContain('Manquée');
    expect(text(card(html, 'm-easy'))).toContain('Terminée');
    expect(html).not.toContain('data-game-mission-timer');
  });

  test('passé minuit, l’action disparaît : aucun bouton « Changer »', () => {
    expect(at(new Date(2026, 9, 5, 23, 59))).toContain('data-game-reroll');
    expect(at(new Date(2026, 9, 6, 0, 0))).not.toContain('data-game-reroll');
  });

  test('un jour illisible (ancien serveur) : la carte reste celle d’avant, avec son action et sans minuteur', () => {
    const base = props();
    const html = renderToStaticMarkup(<GameMissions {...base} missions={{ ...base.missions, dayKey: 'demain' }} now={new Date(2026, 9, 9)} />);
    expect(html).toContain('data-game-reroll');
    expect(html).not.toContain('data-game-mission-timer');
    expect(text(html)).not.toContain('Manquée');
  });
});

/**
 * LA MISSION PERSONNELLE (#9539) — une mission de plus, servie à côté des trois du jour, avec sa PLAGE. La
 * carte porte un minuteur jusqu'à la fin de la plage ; passée la fin, elle dit « Terminée » ou « Manquée » et
 * l'action disparaît.
 */
describe('la mission personnelle du jour', () => {
  const personal = (patch: Record<string, unknown> = {}) => {
    const base = props();
    return {
      ...base,
      missions: {
        ...base.missions,
        personal: {
          id: 'm-perso',
          difficulty: 'easy' as const,
          templateKey: 'send-texts',
          signal: 'axis:chat.message',
          prism: false,
          target: 5,
          progress: 2,
          reward: 40,
          glory: 0,
          completedAt: null,
          startsAt: '2026-10-06T18:00:00.000Z',
          endsAt: '2026-10-06T20:00:00.000Z',
          state: 'active' as const,
          ...patch,
        },
      },
    };
  };
  const view = (now: string, patch: Record<string, unknown> = {}): string =>
    text(renderToStaticMarkup(<GameMissions {...personal(patch)} now={new Date(now)} />));

  test('sans mission personnelle (ancien serveur), aucune carte de plus', () => {
    expect(renderToStaticMarkup(<GameMissions {...props()} />)).not.toContain('data-game-personal');
  });

  test('en cours : le minuteur dit combien il reste jusqu’à la fin de la plage', () => {
    expect(view('2026-10-06T18:30:00.000Z')).toContain('Se termine dans 1 h 30 min');
    expect(view('2026-10-06T18:01:00.000Z')).toContain('Se termine dans 1 h 59 min');
    expect(view('2026-10-06T19:00:00.000Z')).toContain('Se termine dans 1 h ');
    expect(view('2026-10-06T19:30:00.000Z')).toContain('Se termine dans 30 min');
  });

  test('à venir : le minuteur dit dans combien de temps la plage s’ouvre', () => {
    expect(view('2026-10-06T16:00:00.000Z', { state: 'upcoming' })).toContain('Commence dans 2 h');
  });

  test('la plage passée sans la faire : « Manquée », plus de minuteur', () => {
    const html = view('2026-10-06T20:00:00.000Z');
    expect(html).toContain('Manquée');
    expect(html).not.toContain('Se termine dans');
  });

  test('faite : « Terminée », y compris une fois la plage passée', () => {
    expect(view('2026-10-06T18:45:00.000Z', { completedAt: '2026-10-06T18:40:00.000Z', progress: 5, state: 'completed' })).toContain('Terminée');
    expect(view('2026-10-06T23:00:00.000Z', { completedAt: '2026-10-06T18:40:00.000Z', progress: 5, state: 'completed' })).toContain('Terminée');
  });

  test('un titre, un avancement, une récompense : comme les missions du jour', () => {
    const html = view('2026-10-06T18:30:00.000Z');
    expect(html).toContain('Envoyer 5 messages');
    expect(html).toContain('2 / 5');
    expect(html).toContain('+40 points');
  });

  test('c’est une carte de plus dans la liste, jamais une mission du jour de moins', () => {
    const html = renderToStaticMarkup(<GameMissions {...personal()} now={new Date('2026-10-06T18:30:00.000Z')} />);
    expect(html.match(/data-game-mission="/g)).toHaveLength(3);
    expect(html.match(/data-game-personal="/g)).toHaveLength(1);
  });

  test('aucun bouton « Changer » sur la mission personnelle : on ne la tire pas deux fois', () => {
    const html = renderToStaticMarkup(<GameMissions {...personal()} now={new Date('2026-10-06T18:30:00.000Z')} />);
    const card = html.slice(html.indexOf('data-game-personal='));
    expect(card.slice(0, card.indexOf('</li>'))).not.toContain('data-game-reroll');
  });

  test('sans horloge injectée, la carte lit l’heure : une plage d’hier est manquée', () => {
    const html = text(renderToStaticMarkup(<GameMissions {...personal({ startsAt: '2020-01-01T18:00:00.000Z', endsAt: '2020-01-01T20:00:00.000Z' })} now={undefined} />));
    expect(html).toContain('Manquée');
  });

  describe('le minuteur ne coûte rien hors écran', () => {
    const live = { open: 0 };
    const realSet = globalThis.setInterval;
    const realClear = globalThis.clearInterval;
    const visibility = (state: 'visible' | 'hidden') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };
    const future = () => personal({ startsAt: new Date(Date.now() - 600_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString() });
    const mountLive = (patch: ReturnType<typeof future>) => mount(<GameMissions {...patch} now={undefined} />);

    afterEach(() => {
      globalThis.setInterval = realSet;
      globalThis.clearInterval = realClear;
      unmountAll();
      visibility('visible');
      live.open = 0;
    });
    const spy = () => {
      globalThis.setInterval = ((handler: () => void, ms?: number) => {
        live.open += 1;
        return realSet(handler, ms);
      }) as typeof setInterval;
      globalThis.clearInterval = ((id: Parameters<typeof clearInterval>[0]) => {
        live.open -= 1;
        realClear(id);
      }) as typeof clearInterval;
    };

    test('un seul intervalle tant que la plage court et que la vue est visible', async () => {
      spy();
      await mountLive(future());
      expect(live.open).toBe(1);
    });

    test('onglet caché : plus aucun intervalle ; de retour : il repart', async () => {
      spy();
      await mountLive(future());
      visibility('hidden');
      expect(live.open).toBe(0);
      visibility('visible');
      expect(live.open).toBe(1);
    });

    test('plage finie : aucun intervalle ne s’ouvre', async () => {
      spy();
      await mountLive(personal({ startsAt: '2020-01-01T18:00:00.000Z', endsAt: '2020-01-01T20:00:00.000Z' }));
      expect(live.open).toBe(0);
    });
  });
});
