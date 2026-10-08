import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ENGAGEMENT_FAMILY_TOP_POINTS } from '@meeshy/shared/types/engagement-operations';
import type { GameBlock } from '@meeshy/shared/types/game';
import { gloryLadder } from '@meeshy/shared/utils/game/glory';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import { earnRules } from '@/lib/game/earn-rules';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameHero } from './game-hero';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { unmountAll } = createActMounter();

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
const base = (game: GameBlock, patch: Partial<Props> = {}): Props => ({ game, ...patch });
const html = (patch: Parameters<typeof gameBlockFixture>[0] = {}, props: Partial<Props> = {}): string =>
  renderToStaticMarkup(<GameHero {...base(gameBlockFixture(patch), props)} />);
const squash = (value: string): string => value.replace(/\s+/g, ' ');
const text = (markup: string): string => squash(markup.replace(/<[^>]+>/g, ' '));

/**
 * LE HÉROS DE PROGRESSION (#5841) — pleine largeur, il répond à deux questions
 * dans l'ordre : où j'en suis, comment je gagne. Tout ce qu'il énumère vient de
 * la loi (le barème) : il ne calcule ni niveau, ni rang, ni prix. La frappe a
 * son propre héros (#9537).
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
    expect(page).toContain('Murmure IV');
    expect(page).toContain('Gloire 620');
    expect(page).toContain('data-game-rank="murmure"');
  });

  const echoIV = gloryLadder().find((step) => step.rank === 'echo' && step.division5 === 4)!;

  test('la division à cinq crans se lit et se compte en encoches ; le niveau est gravé sur le blason (#9636)', () => {
    const shown = html({ glory: echoIV.minGlory });
    expect(text(shown)).toContain('Écho IV');
    expect(shown.match(/data-game-notch="on"/g)).toHaveLength(2);
    expect(shown).toMatch(/data-game-level-engraving=""[\s\S]*?>11<\/text>/);
  });

  test('un serveur d’avant #9636, sans division5 : la division héritée (III), trois encoches', () => {
    const game = gameBlockFixture({ glory: echoIV.minGlory });
    const { division5: _d5, mythic: _m, ...legacy } = game.glory;
    const shown = renderToStaticMarkup(<GameHero {...base({ ...game, glory: legacy })} />);
    expect(text(shown)).toContain('Écho III');
    expect(shown.match(/data-game-notch="on"/g)).toHaveLength(3);
  });

  test('un Mythe se dit avec sa place, son halo porte son émission (#9636)', () => {
    const shown = html({ glory: 1_200_000, mythic: true, mythicSeat: { number: 7, edition: 31 } });
    expect(text(shown)).toContain('Mythe n° 7');
    expect(shown).toContain('data-game-mythic-halo="31"');
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
    expect(chips).toEqual(['content', 'comment', 'social', 'conversation', 'tool']);
  });

  test('chaque puce dit son nom et ses points, tirés du barème', () => {
    const body = text(page);
    for (const rule of earnRules()) expect(body.replace(/\s/g, '')).toContain(`+${rule.points}`);
    expect(body).toContain('Contenu jusqu’à +1 000');
    expect(ENGAGEMENT_FAMILY_TOP_POINTS.content).toBe(1000);
  });

  test('régler un poids change ce que le héros énumère, sans toucher une chaîne', () => {
    const rules = earnRules({ ...ENGAGEMENT_FAMILY_TOP_POINTS, comment: 5000 });
    const markup = html({}, { rules });
    const chips = [...markup.matchAll(/data-game-earn-chip="([a-z]+)"/g)].map((m) => m[1]);
    expect(chips[0]).toBe('comment');
    expect(text(markup)).toContain('+5 000');
  });

  /* Les puces menaient au carnet des règles ; depuis #9563 (amendement n° 2) chaque famille se touche et ouvre SES précisions. */
  test('un toucher ouvre les précisions de la famille : cinq boutons, un par famille', () => {
    const opened = [...page.matchAll(/<button[^>]*data-detail="elan:([a-z]+)"/g)].map((m) => m[1]);
    expect(opened).toHaveLength(5);
    expect(new Set(opened).size).toBe(5);
    expect(page).not.toContain('regles?regle=1');
  });

  test('chaque puce se lit en entier et mesure 44 points', () => {
    expect(text(page)).toContain('Contenu jusqu’à +1 000');
    expect(page).toMatch(/data-game-earn-chip="content"[^>]*min-height:44px/);
  });
});

describe('la frappe n’est plus ici : UNE seule section de frappe (#9537)', () => {
  test('aucun bouton de frappe, aucun prix, aucune pièce — le héros de frappe est ailleurs', () => {
    const page = html();
    expect(page).not.toContain('data-game-hero-mint');
    expect(page).not.toContain('data-game-hero-missing');
    expect(page).not.toContain('data-game-coin');
    expect(text(page)).not.toContain('Comment frapper');
    expect(text(page)).not.toContain('Frapper');
  });

  test('court : aucune phrase d’explication — le palier ne se dit pas deux fois, le rang tient en deux lignes', () => {
    const page = html();
    expect((text(page).match(/Lueur/g) ?? []).length).toBeLessThanOrEqual(2);
    expect(text(page)).not.toMatch(/de Gloire avant/);
  });
});

describe('Mee sur le coin du héros', () => {
  test('la ligne courte du guide du moment, dite par Mee, qui ramène à la carte du guide', () => {
    const page = html({}, { guideLine: 'Ta Flamme brûle depuis six jours.' });
    expect(text(page)).toContain('Ta Flamme brûle depuis six jours.');
    expect(page).toContain('data-game-bird="meeGuide"');
    expect(page).toMatch(/data-game-hero-guide=""[^>]*data-game-guide-target="game-guide"|data-game-guide-target="game-guide"[^>]*data-game-hero-guide=""/);
  });

  /* La carte de navigation (#9563, amendement n° 4) retire les chemins transverses : le héros vit dans la fiche du Niveau, et son lien vers les règles en était un. */
  test('sans ligne du guide, Mee ne se montre pas : aucun lien vers les règles depuis la fiche du Niveau', () => {
    const page = html({}, { guideLine: null });
    expect(page).not.toContain('data-game-hero-guide');
    expect(page).not.toContain('href="/me/progression/regles"');
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
