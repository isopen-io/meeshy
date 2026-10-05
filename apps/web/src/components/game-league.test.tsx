import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GameLeagueBlock } from '@meeshy/shared/types/game';

import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { leagueFriendsFixture, leagueWeekFixture } from '@/lib/api/game-v2-queries';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameFriendsLeague } from './game-friends-league';
import { GameLeague, type GameLeagueProps } from './game-league';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, type, submit, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/ligue' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const league = (patch: Partial<GameLeagueBlock> = {}): GameLeagueBlock => {
  const block = gameBlockWithExtrasFixture().league;
  if (block === undefined) throw new Error('la fixture porte la ligue');
  return { ...block, ...patch };
};
const NOW = new Date('2026-11-05T14:00:00');

const props = (patch: Partial<GameLeagueProps> = {}): GameLeagueProps => ({
  league: league(),
  levelRecord: 14,
  week: { status: 'ready', week: leagueWeekFixture() },
  online: true,
  now: NOW,
  consent: { pending: false },
  pseudonym: { pending: false },
  onConsent: () => undefined,
  onPseudonym: () => undefined,
  onRetryWeek: () => undefined,
  ...patch,
});

/**
 * LA LIGUE PUBLIQUE (#9384) — quatre états de la passerelle, et un classement
 * qui ne montre que des pseudonymes. Rien d’une identité, rien d’une présence.
 */
describe('une ligue ouverte', () => {
  const page = renderToStaticMarkup(<GameLeague {...props()} />);

  test('la gemme, le nom de la ligue, le rang et la zone', () => {
    expect(page).toContain('data-game-league-gem="jade"');
    const t = text(page);
    expect(t).toContain('Jade');
    expect(t).toContain('Rang 8 sur 30');
    expect(t).toContain('Maintien');
  });

  test('le compte à rebours est calme : jours et heures, jamais des secondes', () => {
    expect(text(page)).toMatch(/Se ferme dans 3 j 6 h/);
    expect(page).not.toMatch(/\d+\s?s\b/);
  });

  test('les trente lignes du groupe, les zones nommées, ma ligne marquée', () => {
    expect((page.match(/data-game-standing=/g) ?? []).length).toBe(30);
    expect(page).toContain('data-game-zone="promotion"');
    expect(page).toContain('data-game-zone="relegation"');
    expect((page.match(/data-game-me=/g) ?? []).length).toBe(1);
  });

  test('chaque ligne n’est qu’un pseudonyme et des points : ni avatar, ni drapeau, ni langue', () => {
    expect(page).not.toMatch(/<img|flag|avatar|lang=/i);
    expect(text(page)).toContain('Colibri-');
  });

  test('l’écran dit que le classement des autres est figé, et que seule la ligne de la personne est en direct', () => {
    expect(text(page)).toContain('figé chaque jour à 4 h');
  });

  test('la coupe des trois premiers se dit au lecteur d’écran', () => {
    expect(text(page)).toContain('Coupe d’or');
  });

  test('l’écart à la montée se dit, et au sommet des ligues on le tait', () => {
    const near = league({ current: { ...(league().current as NonNullable<GameLeagueBlock['current']>), pointsToPromotion: 42, zone: 'safe' } });
    expect(text(renderToStaticMarkup(<GameLeague {...props({ league: near })} />))).toContain('Encore 42 points pour monter');
    const top = league({ current: { ...(league().current as NonNullable<GameLeagueBlock['current']>), pointsToPromotion: null, league: 'prisme' } });
    expect(text(renderToStaticMarkup(<GameLeague {...props({ league: top })} />))).toContain('Tu es au sommet des ligues.');
  });
});

describe('les états d’attente', () => {
  test('le classement qui charge : un squelette, jamais un spinner sur un cache non vide', () => {
    const html = renderToStaticMarkup(<GameLeague {...props({ week: { status: 'loading' } })} />);
    expect(html).toContain('data-game-skeleton');
    expect(html).not.toContain('data-game-standing=');
  });

  test('le classement en erreur : le message et « Réessayer »', async () => {
    let retried = 0;
    const host = await mount(<GameLeague {...props({ week: { status: 'error', message: 'panne' }, onRetryWeek: () => (retried += 1) })} />);
    expect(host.textContent).toContain('panne');
    await click(buttonNamed(host, 'Réessayer'));
    expect(retried).toBe(1);
  });

  test('consentie mais pas encore placée : l’écran dit quand', () => {
    const waiting = league({ current: null });
    expect(text(renderToStaticMarkup(<GameLeague {...props({ league: waiting, week: { status: 'ready', week: { ...leagueWeekFixture(), placed: false, entries: [] } } })} />))).toContain('Un groupe t’est attribué');
  });

  test('un groupe sans ligne : l’écran se tait poliment', () => {
    const html = renderToStaticMarkup(<GameLeague {...props({ week: { status: 'ready', week: { ...leagueWeekFixture(), entries: [] } } })} />);
    expect(text(html)).toContain('Le groupe se remplit');
  });
});

describe('les trois autres accès', () => {
  test('verrouillée : le niveau d’ouverture et le niveau RECORD de la personne', () => {
    const html = text(renderToStaticMarkup(<GameLeague {...props({ league: league({ access: 'locked', current: null }), levelRecord: 7 })} />));
    expect(html).toContain('s’ouvre au niveau 10');
    expect(html).toContain('Tu es au niveau 7');
  });

  test('fermée aux mineurs : la ligue entre amis, elle, reste ouverte', () => {
    expect(text(renderToStaticMarkup(<GameLeague {...props({ league: league({ access: 'minor', current: null }) })} />))).toContain('ligue entre amis');
  });

  test('en attente de consentement : la notice COMPLÈTE précède le geste', () => {
    const html = text(renderToStaticMarkup(<GameLeague {...props({ league: league({ access: 'consent-required', current: null }) })} />));
    for (const part of ['Ce que les autres voient', 'Qui le voit', 'Comment on te place', 'Un risque à connaître', 'retirer ton accord']) expect(html).toContain(part);
    expect(html).toContain('J’accepte et je rejoins');
  });
});

describe('le consentement et le pseudonyme', () => {
  const asking = props({ league: league({ access: 'consent-required', current: null }) });

  test('accepter sans pseudonyme : le serveur en tire un', async () => {
    const calls: Array<readonly [boolean, string | undefined]> = [];
    const host = await mount(<GameLeague {...asking} onConsent={(consent, name) => calls.push([consent, name])} />);
    await submit(host);
    expect(calls).toEqual([[true, undefined]]);
  });

  test('accepter avec un pseudonyme choisi', async () => {
    const calls: Array<readonly [boolean, string | undefined]> = [];
    const host = await mount(<GameLeague {...asking} onConsent={(consent, name) => calls.push([consent, name])} />);
    type(host, '#game-league-pseudonym', 'Aigrette-77');
    await submit(host);
    expect(calls).toEqual([[true, 'Aigrette-77']]);
  });

  test('un pseudonyme de forme invalide ne part pas, et le dit', async () => {
    let calls = 0;
    const host = await mount(<GameLeague {...asking} onConsent={() => (calls += 1)} />);
    type(host, '#game-league-pseudonym', '!!');
    await submit(host);
    expect(calls).toBe(0);
    expect(host.textContent).toContain('n’est pas valable');
  });

  test('le refus de la passerelle s’affiche sous le champ', async () => {
    const host = await mount(<GameLeague {...asking} consent={{ pending: false, error: 'Ce pseudonyme est déjà pris.' }} />);
    expect(host.textContent).toContain('déjà pris');
  });

  test('hors ligne : le geste est suspendu et le dit', async () => {
    const host = await mount(<GameLeague {...asking} online={false} />);
    expect(host.querySelector<HTMLButtonElement>('[data-game-pseudonym-submit]')?.disabled).toBe(true);
    expect(host.textContent).toContain('Hors ligne');
  });

  test('quitter la ligue : un geste, sans pseudonyme', async () => {
    const calls: Array<readonly [boolean, string | undefined]> = [];
    const host = await mount(<GameLeague {...props({ onConsent: (consent, name) => calls.push([consent, name]) })} />);
    await click(host.querySelector('[data-game-league-leave]'));
    expect(calls).toEqual([[false, undefined]]);
  });

  test('changer de pseudonyme : jamais vide', async () => {
    const calls: string[] = [];
    const host = await mount(<GameLeague {...props({ onPseudonym: (name) => calls.push(name) })} />);
    await submit(host.querySelector('#game-league-pseudonym-title')?.closest('section') ?? host);
    expect(calls).toEqual([]);
    type(host, '#game-league-pseudonym', 'Heron.2');
    await submit(host.querySelector('#game-league-pseudonym-title')?.closest('section') ?? host);
    expect(calls).toEqual(['Heron.2']);
  });
});

describe('la ligue entre amis', () => {
  const names = new Map([['friend-1', 'Amina'], ['friend-2', 'Léa']]);

  test('les noms des amis, le total de la semaine, ma ligne marquée', () => {
    const html = renderToStaticMarkup(<GameFriendsLeague state={{ status: 'ready', data: leagueFriendsFixture() }} names={names} now={NOW} onRetry={() => undefined} />);
    expect(text(html)).toContain('Amina');
    expect(text(html)).toContain('Léa');
    expect(text(html)).toContain('Toi');
    expect((html.match(/data-game-me=/g) ?? []).length).toBe(1);
  });

  test('un ami dont le nom est inconnu : jamais son identifiant', () => {
    const html = renderToStaticMarkup(<GameFriendsLeague state={{ status: 'ready', data: leagueFriendsFixture() }} names={new Map()} now={NOW} onRetry={() => undefined} />);
    expect(html).not.toContain('friend-1');
    expect(text(html)).toContain('Un ami');
  });

  test('seul dans la ligue : on invite à ajouter des amis', () => {
    const solo = { ...leagueFriendsFixture(), entries: leagueFriendsFixture().entries.filter((entry) => entry.isMe) };
    expect(text(renderToStaticMarkup(<GameFriendsLeague state={{ status: 'ready', data: solo }} names={names} now={NOW} onRetry={() => undefined} />))).toContain('Ajoute des amis');
  });
});
