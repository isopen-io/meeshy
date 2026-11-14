import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ONBOARDING_STEPS } from '@meeshy/shared/utils/game/guide';

import { GameLeague } from '@/components/game-league';
import { GameSettings, type GameSettingsProps } from '@/components/game-settings';
import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { leagueWeekFixture } from '@/lib/api/game-v2-queries-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { stepCopy } from '@/lib/view/game-guide-copy';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/ligue' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

/** ÉPURE DU JEU 1/3 (#18148, #17584) : la ligne de Mee, la joute, l'atmosphère. */
const visibleText = (host: Element): string => {
  const copy = host.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('.sr-only, [hidden], [aria-hidden="true"]')) hidden.remove();
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
};
const infoButton = (host: ParentNode, question: string): HTMLButtonElement => {
  const button = [...host.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === question);
  if (button === undefined) throw new Error(`aucun (i) nommé « ${question} »`);
  return button;
};
const noteOf = (host: ParentNode, button: HTMLButtonElement): HTMLElement => {
  const note = host.querySelector<HTMLElement>(`[id="${button.getAttribute('aria-controls') ?? ''}"]`);
  if (note === null) throw new Error('note introuvable');
  return note;
};

const game = gameBlockWithExtrasFixture();
const welcome = ONBOARDING_STEPS[0];
if (welcome === undefined) throw new Error('la première étape existe');

describe('la ligne de Mee', () => {
  test('la carte repliée nomme le jeu (lexique game.intro), la carte dépliée garde la phrase complète', () => {
    const copy = stepCopy(welcome, { language: 'fr' });
    expect(copy.short).toBe('Le jeu en sept cartes');
    expect(copy.what).toContain('Salut, c’est Mee');
  });

  test('sept langues : la ligne courte est traduite, jamais le français copié', () => {
    const shorts = new Map(SUPPORTED_INTERFACE_LANGUAGES.map((language) => [language, stepCopy(welcome, { language }).short]));
    expect(shorts.get('en')).toBe('The game in seven cards');
    expect(shorts.get('es')).toBe('El juego en siete cartas');
    expect(shorts.get('pt')).toBe('O jogo em sete cartas');
    expect(shorts.get('de')).toBe('Das Spiel in sieben Karten');
    expect(shorts.get('it')).toBe('Il gioco in sette carte');
    expect(shorts.get('ar')).toBe('اللعبة في سبع بطاقات');
  });

  test('les autres étapes gardent leur phrase', () => {
    const next = ONBOARDING_STEPS[1];
    if (next === undefined) throw new Error('étape 2');
    const copy = stepCopy(next, { language: 'fr' });
    expect(copy.short).toBe(copy.what);
  });
});

describe('la joute dit ce qu’elle est', () => {
  const league = game.league;
  if (league === undefined) throw new Error('la fixture porte la ligue');
  const open = () => (
    <GameLeague
      league={league}
      levelRecord={14}
      week={{ status: 'ready', week: leagueWeekFixture() }}
      online
      now={new Date('2026-11-05T14:00:00')}
      consent={{ pending: false }}
      pseudonym={{ pending: false }}
      onConsent={() => undefined}
      onPseudonym={() => undefined}
      onRetryWeek={() => undefined}
    />
  );

  test('une phrase VUE au repos dit le groupe de 30, la montée et la descente', async () => {
    const host = await mount(open());
    expect(visibleText(host)).toContain('Chaque semaine, tu es classé dans un groupe de 30 : les 7 premiers montent d’un cercle, les 5 derniers descendent.');
  });

  test('une seule fois', async () => {
    const host = await mount(open());
    expect(visibleText(host).split('groupe de 30').length).toBe(2);
  });
});

describe('Mon atmosphère', () => {
  const settings = (current: GameSettingsProps['atmosphere']): GameSettingsProps => ({
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
    atmosphere: current,
    invitations: { current: 'every', onChange: () => undefined },
  });

  test('sans choix : le bouton dit « Choisir », la valeur « Afrique éternelle » sans « Pas encore choisie »', async () => {
    const host = await mount(<GameSettings {...settings({ current: null, onChange: () => undefined })} />);
    const card = host.querySelector('#game-settings-atmosphere') as Element;
    const shown = visibleText(card);
    expect(card.querySelector('[data-game-setting-atmosphere]')?.textContent).toBe('Choisir');
    expect(card.querySelector('[data-game-setting-atmosphere-current]')?.textContent).toBe('Afrique éternelle');
    expect(shown).toContain('Le monde de tes cadres de rang, dès Ambassadeur.');
    expect(shown).not.toContain('Pas encore choisie');
    expect(shown).not.toContain('décore tes photos');
  });

  test('« décore tes photos » est derrière « Que change mon atmosphère ? »', async () => {
    const host = await mount(<GameSettings {...settings({ current: null, onChange: () => undefined })} />);
    expect(noteOf(host, infoButton(host, 'Que change mon atmosphère ?')).textContent).toContain('décore tes photos');
  });

  test('avec un choix : le bouton dit « Changer »', async () => {
    const host = await mount(<GameSettings {...settings({ current: 'olympe', onChange: () => undefined })} />);
    expect(host.querySelector('[data-game-setting-atmosphere]')?.textContent).toBe('Changer');
  });

  test('sept langues : « Choisir » suit le lexique', async () => {
    const expected: Record<string, string> = { fr: 'Choisir', en: 'Choose', es: 'Elegir', pt: 'Escolher', de: 'Auswählen', it: 'Scegli', ar: 'اختيار' };
    const { gameText } = await import('@/lib/view/game-copy');
    expect(gameText('game.settings.atmosphere.choose')).toBe('Choisir');
    expect(Object.keys(expected)).toHaveLength(SUPPORTED_INTERFACE_LANGUAGES.length);
  });
});
