import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { GameAtlas } from '@/components/game-atlas';
import { GameLeague } from '@/components/game-league';
import { GameRequirementLine } from '@/components/game-touch';
import { GameSettings, type GameSettingsProps } from '@/components/game-settings';
import { GameShowcase } from '@/components/game-showcase';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { achievementMoment } from '@/lib/game-photo/moments';
import type { NotebookEntry } from '@/lib/game-photo/notebook';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { BadgesBody } from './progression-badges';
import { CarnetBody } from './progression-carnet';
import { SuccesBody } from './progression-succes';
import { AxisRow, GeneratedAchievements } from './progression-parts';
import { RulesBody } from './progression-rules';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/succes' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

/**
 * L'ÉPURE DU JEU, TROISIÈME LOT (#18148, #17584) — rien n'est dit deux fois, et les
 * repères propres à Meeshy (une médaille, un défi, un haut fait, la Chronique)
 * gardent UNE phrase lisible au repos, sans clic (règle 7).
 */
const visibleText = (host: Element): string => {
  const copy = host.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('.sr-only, [hidden], [aria-hidden="true"]')) hidden.remove();
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
};
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 15)));

const progress = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const game = gameBlockWithExtrasFixture();

const emptyNotebookEnv = (entries: readonly NotebookEntry[] = []) =>
  ({
    notebook: { defer: async () => true, keep: async () => true, list: async () => entries, remove: async () => true },
    referral: async () => null,
    now: () => new Date('2026-10-05T10:00:00.000Z'),
    playOptions: { reducedMotion: false, haptics: false, schedule: (run: () => void) => (run(), () => undefined) },
  }) as unknown as PhotoEnv;

describe('rien n’est dit deux fois', () => {
  test('Atlas : la valeur n’est dite qu’une fois en clair (l’en-tête) ; la jauge la garde pour le lecteur d’écran', async () => {
    const atlas = game.atlas;
    if (atlas === undefined) throw new Error('la fixture porte l’Atlas');
    const host = await mount(<GameAtlas atlas={atlas} visibility="me" online savingVisibility={false} onVisibility={() => undefined} />);
    expect(visibleText(host)).not.toMatch(/langues sur/);
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toMatch(/langues sur/);
  });

  test('Hauts faits : un seul nom et un seul compteur, ceux de l’en-tête de page ; une phrase dit ce qu’est un haut fait', async () => {
    const host = await mount(<SuccesBody progress={progress} env={emptyNotebookEnv()} />);
    await settle();
    const shown = visibleText(host);
    expect(shown).toContain('Un haut fait récompense une première fois ou un exploit.');
    expect(shown).not.toContain('Hauts faits');
    expect(shown).not.toMatch(/\d+ \/ \d+/);
    expect(host.querySelector('section[aria-labelledby="progression-achievements"] h2')?.textContent).toBe('Hauts faits');
    expect(shown).not.toContain('Obtenu le');
    expect(host.textContent).toContain('Obtenu le');
  });

  test('Défis : le titre ne se répète pas dans la page, une phrase d’orientation reste lue au repos', async () => {
    const sections = progress.achievementSections ?? [];
    const host = await mount(<GeneratedAchievements sections={sections} />);
    const shown = visibleText(host);
    expect(shown).toContain('Chaque défi est un palier à atteindre dans une famille de gestes.');
    expect(host.querySelector('#progression-generated')?.className).toContain('sr-only');
    expect(shown).not.toMatch(/^Défis/);
  });

  test('Défis : le compteur d’une famille se lit « 1/20 » (une valeur, un mot) ; l’en-tête de page porte le total', async () => {
    const sections = progress.achievementSections ?? [];
    const host = await mount(<GeneratedAchievements sections={sections} />);
    const shown = visibleText(host);
    for (const section of sections) expect(shown).toContain(`${section.unlockedCount}/${section.attainableCount}`);
    expect(shown).not.toMatch(/\d+ \/ \d+/);
  });

  test('Vitrine : le titre de carte ne répète ni le nom ni le compte déjà en en-tête', async () => {
    const trophies = game.trophies;
    if (trophies === undefined) throw new Error('la fixture porte les trophées');
    const host = await mount(
      <GameShowcase trophies={trophies} visibility="friends" online savingOrder={false} savingVisibility={false} errors={{}} onOrder={() => undefined} onVisibility={() => undefined} />,
    );
    const head = visibleText(host.querySelector('#game-showcase') as Element);
    expect(head).not.toMatch(/\d+ trophées/);
    expect(host.querySelector('#game-showcase-title')?.className).toContain('sr-only');
    expect(host.querySelector('#game-showcase-title')?.textContent).toContain('3 trophées');
  });
});

describe('le carnet : la Chronique se dit, les cartes ne se répètent pas', () => {
  const standing = gameBlockFixture({ mintedLifetime: 21, flameRecord: 8, streak: 6 });

  test('une phrase sous le titre dit ce qu’est la Chronique ; « sur cet appareil » est derrière « Où vivent mes photos ? »', async () => {
    const host = await mount(<CarnetBody env={emptyNotebookEnv()} />);
    await settle();
    const shown = visibleText(host);
    expect(shown).toContain('La Chronique garde en photo les moments où tes aïeux se manifestent.');
    expect(shown).not.toContain('sur cet appareil');
    const button = [...host.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === 'Où vivent mes photos ?');
    expect(button).toBeDefined();
    expect(host.querySelector(`[id="${button?.getAttribute('aria-controls')}"]`)?.textContent).toBe('Tes photos vivent sur cet appareil.');
  });

  test('« Premiers pas » n’est dit qu’une fois : le surtitre de la carte ne répète pas son groupe', async () => {
    const host = await mount(<CarnetBody env={emptyNotebookEnv()} game={standing} />);
    await settle();
    const group = host.querySelector('[data-carnet-track="start"]') as Element;
    expect(visibleText(group).match(/Premiers pas/g)).toHaveLength(1);
    expect(visibleText(group)).toContain('Mon départ sur Meeshy');
  });

  test('« Photographier » ne se répète pas sur chaque carte : un bouton d’icône, le libellé est son nom accessible', async () => {
    const host = await mount(<CarnetBody env={emptyNotebookEnv()} game={standing} />);
    await settle();
    const buttons = [...host.querySelectorAll<HTMLElement>('[data-carnet-catch-up-take]')];
    expect(buttons.length).toBeGreaterThan(1);
    for (const button of buttons) {
      expect(visibleText(button)).toBe('');
      expect(button.getAttribute('aria-label')).toMatch(/^Photographier — /);
      expect(button.querySelector('svg')).not.toBeNull();
    }
    expect(visibleText(host)).not.toContain('Photographier');
  });

  test('un moment en attente garde son bouton d’action, nommé de même', async () => {
    const moment = achievementMoment('achievement.first_voice');
    const pending: NotebookEntry = {
      id: moment.id,
      momentId: moment.id,
      emblem: moment.emblem,
      kicker: moment.kicker,
      title: moment.title,
      status: 'pending',
      createdAt: '2026-10-04T10:00:00.000Z',
      expiresAt: '2026-10-11T10:00:00.000Z',
    };
    const host = await mount(<CarnetBody env={emptyNotebookEnv([pending])} />);
    await settle();
    const button = host.querySelector<HTMLElement>('[data-carnet-take]');
    expect(button?.getAttribute('aria-label')).toBe(`Photographier — ${moment.title}`);
    expect(visibleText(button as Element)).toBe('');
  });
});

describe('les médailles : une phrase, et aucun marqueur sans mot', () => {
  test('Médailles : « Une médaille se gagne par paliers, à force de gestes. » est lu sans clic', async () => {
    const host = await mount(<BadgesBody progress={progress} />);
    expect(visibleText(host)).toContain('Une médaille se gagne par paliers, à force de gestes.');
  });

  test('une médaille éteinte ne porte plus de « −N » nu : « jusqu’au palier » de la ligne le dit déjà', async () => {
    const off = progress.axes.find((axis) => axis.reachedCount === 0);
    if (off === undefined) throw new Error('la fixture porte un axe sans palier atteint');
    const host = await mount(<ul><AxisRow axis={off} /></ul>);
    expect(host.textContent).not.toMatch(/[−-]\d/);
  });
});

describe('les verrous : une ligne d’état et une jauge sans légende', () => {
  test('l’exigence se lit « 11 / 100 » ; Niveau et Requis ne sont plus que pour le lecteur d’écran', async () => {
    const host = await mount(<GameRequirementLine concept="prestige" current={11} required={100} />);
    expect(visibleText(host)).toBe('11 / 100');
    expect(host.textContent).toContain('Niveau');
    expect(host.textContent).toContain('Requis');
  });

  test('l’exigence du record se lit « 11 / 20 »', async () => {
    const host = await mount(<GameRequirementLine concept="league" current={11} required={20} record />);
    expect(visibleText(host)).toBe('11 / 20');
    expect(host.textContent).toContain('Au plus haut');
  });

  test('la joute verrouillée ne redit pas « Tu es au niveau » ni son titre ; la jauge reste', async () => {
    const league = { ...(game.league as NonNullable<typeof game.league>), access: 'locked' as const };
    const host = await mount(
      <GameLeague
        league={league}
        levelRecord={4}
        week={{ status: 'loading' }}
        online
        now={new Date('2026-11-05T14:00:00')}
        consent={{ pending: false }}
        pseudonym={{ pending: false }}
        onConsent={() => undefined}
        onPseudonym={() => undefined}
        onRetryWeek={() => undefined}
      />,
    );
    const shown = visibleText(host);
    expect(shown).not.toContain('Tu es au niveau');
    expect(shown).toContain('4 / 10');
    expect(host.querySelector('#game-league-locked-title')?.className).toContain('sr-only');
  });
});

describe('les règles ne se redisent pas', () => {
  test('la règle 1 ne redit pas son titre ; la règle 2 ne répète pas ce que disent les règles 3 et 4', async () => {
    const host = await mount(<RulesBody />);
    const text = host.textContent ?? '';
    expect(text).toContain('Écrire, parler, publier, réagir, inviter. Une publication en fait jaillir selon qui peut la voir : public, communauté ou amis. Les limites portent sur tes gestes, jamais sur tes étincelles.');
    expect(text).not.toContain('chaque vrai échange fait jaillir');
    expect(text).not.toContain('Une frappe en fige une part');
    expect(text).toContain('un million d’étincelles pour le niveau 100');
  });
});

describe('les réglages : le titre de section porte le verbe, la rangée un nom', () => {
  const settings: GameSettingsProps = {
    prefs: { hidden: false, celebrations: true },
    visibility: game.visibility,
    league: game.league,
    online: true,
    savingVisibility: false,
    leavingLeague: false,
    errors: {},
    onCelebrations: () => undefined,
    onHidden: () => undefined,
    onVisibility: () => undefined,
    onLeaveLeague: () => undefined,
    gameNotifications: true,
    onGameNotifications: () => undefined,
    gamePhoto: true,
    onGamePhoto: () => undefined,
    atmosphere: { current: null, onChange: () => undefined },
    invitations: { current: 'every', onChange: () => undefined },
  };

  test('« Masquer » en titre, « Le jeu » en rangée ; la phrase décrit le geste', async () => {
    const host = await mount(<GameSettings {...settings} />);
    const block = host.querySelector('#game-settings-hidden') as Element;
    const shown = visibleText(block);
    expect(host.querySelector('#game-settings-hidden-title')?.textContent).toBe('Masquer');
    expect(shown).toContain('Le jeu');
    expect(shown).not.toContain('Jeu masqué');
    expect(shown).not.toContain('Masquer le jeu');
    expect(shown).toContain('Masque le jeu sur cet appareil et le ferme aux autres.');
    expect(block.querySelector('[data-game-setting-hidden]')).not.toBeNull();
  });
});
