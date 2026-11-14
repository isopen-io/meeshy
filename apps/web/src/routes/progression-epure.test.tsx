import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { GameAtlas } from '@/components/game-atlas';
import { GameLeague } from '@/components/game-league';
import { GameSeason } from '@/components/game-season';
import { GameSettings, type GameSettingsProps } from '@/components/game-settings';
import { GameShowcase } from '@/components/game-showcase';
import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { leagueWeekFixture } from '@/lib/api/game-v2-queries-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { RulesBody } from './progression-rules';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/reglages' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

/**
 * L'ÉPURE DU JEU (#18148, #17584) — le jeu montre des valeurs, ses règles sont à
 * un toucher. Les témoins lisent ce que l'utilisateur LIT (le texte hors
 * `sr-only` et hors `hidden`) et ce qu'il PEUT ATTEINDRE (le (i) nommé par sa
 * question, sa note lue repliée, la rangée qui se déplie).
 */
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
  const id = button.getAttribute('aria-controls') ?? '';
  const note = host.querySelector<HTMLElement>(`[id="${id}"]`);
  if (note === null) throw new Error('note introuvable');
  return note;
};
const foldButton = (host: ParentNode, name: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find((button) => (button.textContent ?? '').includes(name));
  if (found === undefined) throw new Error(`aucune rangée « ${name} »`);
  return found;
};

const game = gameBlockWithExtrasFixture();
const settings = (patch: Partial<GameSettingsProps> = {}): GameSettingsProps => ({
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
  ...patch,
});

describe('les réglages du jeu : un libellé nomme, le détail est derrière un (i)', () => {
  test('« Jeu masqué » : une phrase courte au repos, le détail et la réouverture derrière « Que cache le masque ? »', async () => {
    const host = await mount(<GameSettings {...settings({ prefs: { hidden: true, celebrations: true } })} />);
    const shown = visibleText(host.querySelector('#game-settings-hidden') as Element);
    expect(shown).toContain('Masque le jeu sur cet appareil et le ferme aux autres.');
    expect(shown).not.toContain('te retire de la joute publique');
    expect(shown).not.toContain('restent fermés');
    const button = infoButton(host, 'Que cache le masque ?');
    const note = noteOf(host, button);
    expect(note.className).toContain('sr-only');
    expect(note.textContent).toContain('te retire de la joute publique');
    expect(note.textContent).toContain('Étincelles et trophées gardés');
    expect(note.textContent).toContain('restent fermés');
    await click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(noteOf(host, button).className).not.toContain('sr-only');
  });

  test('« Mon atmosphère » : « dès Ambassadeur » au repos, la suite derrière « Que change mon atmosphère ? »', async () => {
    const host = await mount(<GameSettings {...settings()} />);
    const shown = visibleText(host.querySelector('#game-settings-atmosphere') as Element);
    expect(shown).toContain('Le monde de tes cadres de rang, dès Ambassadeur.');
    expect(shown).not.toContain('ne recompose aucune photo');
    expect(noteOf(host, infoButton(host, 'Que change mon atmosphère ?')).textContent).toContain('ne recompose aucune photo');
  });

  test('« Me proposer d’immortaliser » : une phrase, la Chronique derrière « Que devient ma Chronique si je refuse ? »', async () => {
    const host = await mount(<GameSettings {...settings()} />);
    const shown = visibleText(host.querySelector('#game-settings-invitations') as Element);
    expect(shown).toContain('Mee et Meo t’invitent à photographier les moments qui comptent.');
    expect(shown).not.toContain('la Chronique garde tout');
    expect(noteOf(host, infoButton(host, 'Que devient ma Chronique si je refuse ?')).textContent).toContain('la Chronique garde tout');
    expect(host.querySelectorAll('#game-settings-invitations input[type="radio"]')).toHaveLength(3);
  });

  test('les notifications : le titre est « Notifications », la rangée un nom, « une par jour » derrière un (i)', async () => {
    const host = await mount(<GameSettings {...settings()} />);
    const card = host.querySelector('#game-settings-notifications') as Element;
    const shown = visibleText(card);
    expect(card.querySelector('h2')?.textContent).toBe('Notifications');
    expect(shown).toContain('Alliance, joute, voyage');
    expect(shown).not.toContain('au plus une par jour');
    expect(noteOf(host, infoButton(host, 'Combien de notifications par jour ?')).textContent).toContain('Au plus une par jour');
  });

  test('« Moments à immortaliser » : la rangée seule au repos, « Que fait cette notification ? » dit le reste ; l’interrupteur reste atteignable', async () => {
    const calls: boolean[] = [];
    const host = await mount(<GameSettings {...settings({ onGamePhoto: (on) => calls.push(on) })} />);
    const card = host.querySelector('#game-settings-notifications') as Element;
    expect(visibleText(card)).toContain('Moments à immortaliser');
    expect(visibleText(card)).not.toContain('une notification discrète');
    expect(noteOf(host, infoButton(host, 'Que fait cette notification ?')).textContent).toContain('une notification discrète');
    await click(host.querySelector('[data-game-setting-photo]'));
    expect(calls).toEqual([false]);
  });

  test('« Qui voit quoi » dit ce qui se règle ; la présence est derrière « Qui voit si je suis en ligne ? »', async () => {
    const host = await mount(<GameSettings {...settings()} />);
    const shown = visibleText(host.querySelector('#game-settings-visibility') as Element);
    expect(shown).toContain('Choisis qui voit ton rang, ton Héritage, tes trophées et ton Atlas.');
    expect(shown).not.toContain('personne ne voit si tu es en ligne');
    expect(noteOf(host, infoButton(host, 'Qui voit si je suis en ligne ?')).textContent).toContain('personne ne voit si tu es en ligne');
  });

  test('un seul (i) ouvert à la fois n’est pas requis ici, mais chaque (i) porte aria-controls vers une note existante', async () => {
    const host = await mount(<GameSettings {...settings()} />);
    for (const question of ['Que cache le masque ?', 'Que change mon atmosphère ?', 'Combien de notifications par jour ?']) {
      expect(noteOf(host, infoButton(host, question))).toBeTruthy();
    }
  });
});

describe('l’Atlas, la vitrine, le voyage et la joute ne disent rien deux fois', () => {
  const atlas = game.atlas;
  if (atlas === undefined) throw new Error('la fixture porte l’Atlas');

  test('Atlas : un seul titre vu, le tampon dit sa date seule (nom accessible inchangé), plus de « à découvrir »', async () => {
    const host = await mount(<GameAtlas atlas={atlas} visibility="me" online savingVisibility={false} onVisibility={() => undefined} />);
    const shown = visibleText(host);
    expect(shown).not.toContain('Atlas des langues');
    expect(shown).not.toMatch(/à découvrir/);
    expect(shown).not.toContain('Tampon du');
    expect(host.querySelector('legend')?.className).toContain('sr-only');
    const stamp = host.querySelector('[data-game-atlas-language]') as Element;
    expect(stamp.textContent).toContain('Tampon du');
    expect(host.querySelector('#game-atlas-title')?.className).toContain('sr-only');
  });

  test('Atlas : « privé par défaut » reste lu au repos ; ce que le jeu garde est derrière « Que garde le jeu de mes échanges ? »', async () => {
    const host = await mount(<GameAtlas atlas={atlas} visibility="me" online savingVisibility={false} onVisibility={() => undefined} />);
    expect(visibleText(host)).toContain('Ton Atlas est privé par défaut : tu choisis qui le voit.');
    expect(visibleText(host)).not.toContain('jamais l’interlocuteur');
    expect(noteOf(host, infoButton(host, 'Que garde le jeu de mes échanges ?')).textContent).toContain('jamais l’interlocuteur ni la conversation');
  });

  test('Vitrine : la carte ne redit ni « Tes trophées » ni « 3 trophées » (l’en-tête de page les porte) ; la date exacte est derrière un (i)', async () => {
    const trophies = game.trophies;
    if (trophies === undefined) throw new Error('la fixture porte les trophées');
    const host = await mount(
      <GameShowcase trophies={trophies} visibility="friends" online savingOrder={false} savingVisibility={false} errors={{}} onOrder={() => undefined} onVisibility={() => undefined} />,
    );
    const head = visibleText(host.querySelector('#game-showcase') as Element);
    expect(head).not.toMatch(/\d+ trophées/);
    expect(head).not.toContain('Tes trophées');
    expect(host.querySelector('#game-showcase-title')?.className).toContain('sr-only');
    expect(host.querySelector('#game-showcase-visibility legend')?.className).toContain('sr-only');
    expect(visibleText(host.querySelector('#game-showcase-visibility') as Element)).not.toContain('jamais la date exacte');
    expect(noteOf(host, infoButton(host, 'Un visiteur voit-il la date exacte ?')).textContent).toContain('jamais la date exacte');
  });

  test('Voyage : « 4 pas par halte » sans « Tout est gratuit » ; le manque de Meeshes ne s’écrit plus, la jauge reste', async () => {
    const season = game.season;
    if (season === undefined || season === null) throw new Error('la fixture porte la saison');
    const host = await mount(
      <GameSeason season={season} held={3} online claimingStep={null} buyingSeal={false} errors={{}} onClaim={() => undefined} onBuySeal={() => undefined} />,
    );
    const shown = visibleText(host);
    expect(shown).toContain('4 pas par halte.');
    expect(shown).not.toContain('Tout est gratuit');
    expect(shown).not.toContain('Il manque');
    expect(shown).toContain('Tu as 3 Meeshes');
    expect(shown).toContain('Il faut 10 Meeshes');
  });

  test('Joute : une seule ligne « Semaine du … » dans l’en-tête, le nom de joute n’a plus de titre mais garde sa phrase et sa sortie', () => {
    const league = game.league;
    if (league === undefined) throw new Error('la fixture porte la ligue');
    const html = renderToStaticMarkup(
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
      />,
    );
    expect(html).toMatch(/id="game-league-title"[^>]*>\s*Semaine du/);
    expect(html).not.toMatch(/id="game-league-title"[^>]*>[^<]*Joute/);
    expect(html).toMatch(/id="game-league-pseudonym-title" class="sr-only"/);
    expect(html).toContain('data-game-league-leave');
  });
});

describe('le carnet des règles : rangées repliées, une seule ouverte à la fois', () => {
  test('les concepts sont des rangées : tous les noms au repos, aucun corps vu, un seul s’ouvre', async () => {
    const host = await mount(<RulesBody />);
    const rows = [...host.querySelectorAll('[data-rules-concept]')];
    expect(rows.length).toBeGreaterThanOrEqual(16);
    expect(rows.every((row) => row.querySelector('[hidden]') !== null)).toBe(true);
    const [first, second] = rows;
    const firstName = first?.querySelector('button')?.textContent ?? '';
    await click(first?.querySelector('button') ?? null);
    expect(first?.querySelector('[hidden]')).toBeNull();
    expect(visibleText(first as Element)).toContain(firstName.replace(/[+−]/g, '').trim());
    await click(second?.querySelector('button') ?? null);
    expect(first?.querySelector('[hidden]')).not.toBeNull();
    expect(second?.querySelector('[hidden]')).toBeNull();
  });

  test('« Chaque élément du jeu, en clair » a disparu : le titre de la section suffit', async () => {
    const host = await mount(<RulesBody />);
    expect(visibleText(host)).not.toContain('Chaque élément du jeu, en clair.');
    expect(visibleText(host)).toContain('Chaque concept, en clair');
  });

  test('la section des médailles est repliée ; ?section=badges l’ouvre', async () => {
    const closed = await mount(<RulesBody />);
    const closedPanel = closed.querySelector('#medailles-panel');
    expect(closedPanel?.hasAttribute('hidden')).toBe(true);
    unmountAll();
    const opened = await mount(<RulesBody badges />);
    expect(opened.querySelector('#medailles-panel')?.hasAttribute('hidden')).toBe(false);
    expect(visibleText(opened)).toContain('Cuivre');
  });

  test('les neuf familles dessinées sont repliées, une seule ouverte à la fois, et la ligne ne répète plus le titre', async () => {
    const host = await mount(<RulesBody />);
    const families = [...host.querySelectorAll('[data-game-atlas-family]')];
    expect(families).toHaveLength(9);
    expect(families.every((family) => family.querySelector('[hidden]') !== null)).toBe(true);
    await click(families[0]?.querySelector('button') ?? null);
    expect(families[0]?.querySelector('[hidden]')).toBeNull();
    expect(visibleText(families[0] as Element)).toContain('Dix jusqu’à 100, puis un par centaine, Singularité dès 1000.');
    expect(visibleText(families[0] as Element)).not.toContain('Vingt états de la lumière :');
    await click(families[1]?.querySelector('button') ?? null);
    expect(families[0]?.querySelector('[hidden]')).not.toBeNull();
  });

  test('les sept cartes de l’intégration tiennent en une rangée repliée, atteignable', async () => {
    const host = await mount(<RulesBody />);
    const row = foldButton(host, 'Les sept cartes de Mee et Meo');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector(`[id="${row.getAttribute('aria-controls')}"]`)?.textContent).toContain('Étape 7 sur 7');
    await click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(visibleText(host)).toContain('Étape 7 sur 7');
  });
});
