import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ENGAGEMENT_AXIS_WEIGHTS } from '@meeshy/shared/types/engagement';
import type { GameBlock } from '@meeshy/shared/types/game';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import { earnRules } from '@/lib/game/earn-rules';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameHero } from './game-hero';

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

type Props = Parameters<typeof GameHero>[0];
const base = (game: GameBlock, patch: Partial<Props> = {}): Props => ({ game, online: true, minting: false, onMint: () => undefined, ...patch });
const html = (patch: Parameters<typeof gameBlockFixture>[0] = {}, props: Partial<Props> = {}): string =>
  renderToStaticMarkup(<GameHero {...base(gameBlockFixture(patch), props)} />);
const squash = (value: string): string => value.replace(/\s+/g, ' ');
const text = (markup: string): string => squash(markup.replace(/<[^>]+>/g, ' '));

/**
 * LE HÉROS DE PROGRESSION (#5841) — pleine largeur, il répond à trois questions
 * dans l'ordre : où j'en suis, comment je gagne, comment je frappe. Tout ce
 * qu'il énumère vient de la loi (le barème, le prix servi) : il ne calcule
 * ni niveau, ni rang, ni prix.
 */
describe('où j’en suis', () => {
  const page = html();

  test('une section pleine largeur ancrée « game-level », teintée par son palier', () => {
    expect(page).toContain('id="game-level"');
    expect(page).toContain('data-game-hero="lueur"');
    expect(page).toMatch(/color-mix\(in srgb, var\(--game-tier-lueur\) 12%/);
  });

  test('le niveau et le palier se disent en titre', () => {
    expect(text(page)).toMatch(/Niveau 1[0-9]\s*·\s*Lueur/);
  });

  test('l’anneau de niveau est lu en toutes lettres', () => {
    expect(page).toMatch(/role="img"[^>]*aria-label="Niveau 1[0-9], palier Lueur, deuxième palier"/);
  });

  test('ce qui manque avant le niveau suivant', () => {
    expect(text(page)).toMatch(/Encore .* avant le niveau/);
  });

  test('le rang : blason, nom et division, Gloire, ancre « game-rank »', () => {
    expect(page).toContain('id="game-rank"');
    expect(page).toContain('Écho III');
    expect(page).toContain('Gloire 620');
    expect(page).toContain('data-game-rank="echo"');
  });

  test('une grande Signature en filigrane, décorative', () => {
    expect(page).toMatch(/data-game-hero-watermark=""[^>]*aria-hidden="true"|aria-hidden="true"[^>]*data-game-hero-watermark=""/);
  });

  test('sous le record : le record et le Vent arrière se disent', () => {
    expect(text(html({ score: 23, levelRecord: 14 }))).toContain('Record : niveau 14');
    expect(html()).not.toContain('Record :');
  });

  test('au sommet : « Tu es au sommet »', () => {
    expect(text(html({ score: 10 * 100 * 100 }))).toContain('Tu es au sommet');
  });

  test('Galaxie se teinte au prisme, pas d’un jeton absent', () => {
    expect(html({ score: 10 * 95 * 95 })).toContain('var(--game-prism-3)');
  });
});

describe('comment gagner — dérivé du barème', () => {
  const page = html();

  test('une puce par famille, de la plus généreuse à la plus modeste', () => {
    const chips = [...page.matchAll(/data-game-earn-chip="([a-z]+)"/g)].map((m) => m[1]);
    expect(chips).toEqual(earnRules().map((rule) => rule.family));
    expect(chips).toEqual(['content', 'social', 'conversation', 'comment', 'tool']);
  });

  test('chaque puce dit son nom et ses points, tirés du barème', () => {
    const body = text(page);
    for (const rule of earnRules()) expect(body).toContain(`+${rule.points}`);
    expect(body).toContain('Contenu');
    expect(body).toContain('+9');
    expect(ENGAGEMENT_AXIS_WEIGHTS['content.post']).toBe(9);
  });

  test('régler un poids change ce que le héros énumère, sans toucher une chaîne', () => {
    const rules = earnRules({ ...ENGAGEMENT_AXIS_WEIGHTS, 'comment.text': 20 });
    const markup = html({}, { rules });
    const chips = [...markup.matchAll(/data-game-earn-chip="([a-z]+)"/g)].map((m) => m[1]);
    expect(chips[0]).toBe('comment');
    expect(text(markup)).toContain('+20');
  });

  test('un toucher ouvre le carnet des règles, à la ligne qui parle des gains', () => {
    expect(page.match(/href="\/me\/progression\/regles\?regle=1"/g)).toHaveLength(5);
  });

  test('chaque puce se lit en entier et mesure 44 points', () => {
    expect(page).toMatch(/aria-label="Contenu : 9 points par geste\. Voir les règles\."/);
    expect(page).toMatch(/data-game-earn-chip="content"[^>]*min-height:44px/);
  });
});

describe('comment frapper — le prix est celui que le serveur sert', () => {
  test('prix, niveaux perdus et Gloire, puis le bouton', () => {
    const game = gameBlockFixture();
    const body = text(html());
    expect(body).toContain('Comment frapper');
    expect(body).toContain(squash(`${game.mint.price.toLocaleString('fr-FR')} points`));
    expect(body).toContain('une Meesh');
    expect(body).toContain(`coûte ${game.mint.levelsLost} niveau`);
    expect(body).toContain(`+${game.mint.gloryGained} Gloire`);
    expect(html()).toMatch(/data-game-hero-mint=""[^>]*>Frapper avec Mee et Meo</);
  });

  test('un prix servi autrement s’affiche tel quel : aucune constante locale', () => {
    const game = gameBlockFixture();
    const priced: GameBlock = { ...game, mint: { ...game.mint, price: 4321 } };
    expect(text(renderToStaticMarkup(<GameHero {...base(priced)} />))).toContain('4');
    expect(text(renderToStaticMarkup(<GameHero {...base(priced)} />))).toMatch(/4\s?321 points/);
  });

  test('sans assez de points : « Encore N points », lisible, jamais un bouton grisé à l’illisible', () => {
    const page = html({ score: 100, debitablePoints: 100 });
    const body = text(page);
    expect(page).not.toContain('data-game-hero-mint=""');
    expect(page).toMatch(/data-game-hero-missing=""[^>]*aria-disabled="true"/);
    expect(body).toMatch(/Encore [\d  ]+ points?/);
    expect(page).not.toMatch(/data-game-hero-missing=""[^>]*opacity/);
  });

  test('hors ligne, la frappe attend la connexion et le dit', () => {
    const page = html({}, { online: false });
    expect(page).toMatch(/data-game-hero-mint=""[^>]*disabled=""/);
    expect(text(page)).toContain('Hors ligne');
  });

  test('un refus se dit en alerte', () => {
    expect(html({}, { mintError: 'Pas assez de points convertibles pour frapper une Meesh.' })).toMatch(/role="alert"[^>]*>Pas assez/);
  });
});

describe('Mee sur le coin du héros', () => {
  test('la ligne courte du guide du moment, dite par Mee, qui ramène à la carte du guide', () => {
    const page = html({}, { guideLine: 'Ta Flamme brûle depuis six jours.' });
    expect(text(page)).toContain('Ta Flamme brûle depuis six jours.');
    expect(page).toContain('data-game-bird="meeGuide"');
    expect(page).toMatch(/data-game-hero-guide=""[^>]*data-game-guide-target="game-guide"|data-game-guide-target="game-guide"[^>]*data-game-hero-guide=""/);
  });

  test('sans carte du guide, Mee propose les règles', () => {
    const page = html({}, { guideLine: null });
    expect(text(page)).toContain('Une question ? Touche-moi');
    expect(page).toMatch(/<a[^>]*href="\/me\/progression\/regles"[^>]*data-game-hero-guide=""|<a[^>]*data-game-hero-guide=""[^>]*href="\/me\/progression\/regles"/);
  });
});

describe('les gestes', () => {
  test('toucher « Frapper » frappe, une fois', async () => {
    let minted = 0;
    const host = await mount(<GameHero {...base(gameBlockFixture(), { onMint: () => (minted += 1) })} />);
    const button = host.querySelector<HTMLButtonElement>('[data-game-hero-mint]');
    expect(button).not.toBeNull();
    if (button !== null) await click(button);
    expect(minted).toBe(1);
  });

  test('hors ligne, toucher « Frapper » ne frappe pas', async () => {
    let minted = 0;
    const host = await mount(<GameHero {...base(gameBlockFixture(), { online: false, onMint: () => (minted += 1) })} />);
    const button = host.querySelector<HTMLButtonElement>('[data-game-hero-mint]');
    if (button !== null) await click(button);
    expect(minted).toBe(0);
  });

  test('« Encore N points » n’ouvre rien et ne frappe rien', async () => {
    let minted = 0;
    const host = await mount(<GameHero {...base(gameBlockFixture({ score: 100, debitablePoints: 100 }), { onMint: () => (minted += 1) })} />);
    const button = host.querySelector<HTMLButtonElement>('[data-game-hero-missing]');
    expect(button).not.toBeNull();
    if (button !== null) await click(button);
    expect(minted).toBe(0);
  });
});

describe('les étoiles de Prestige sur l’anneau du héros (#9389)', () => {
  test('autant d’étoiles que de Prestiges, et l’anneau les dit aux lecteurs d’écran', () => {
    const markup = html({ prestige: 2 });
    expect((markup.match(/data-game-prestige-star/g) ?? []).length).toBe(2);
    expect(markup).toContain('Étoiles : 2 sur 5');
  });

  test('sans Prestige : aucune étoile', () => {
    expect(html()).not.toContain('data-game-prestige-star');
  });
});
