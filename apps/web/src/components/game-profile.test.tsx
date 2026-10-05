import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import type { UserShowcaseResponse } from '@meeshy/shared/types/game';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { userShowcaseFixture } from '@/lib/api/game-v2-queries';

import { GameProfileOwn } from './game-profile-own';
import { ContactGameStrip, GameProfileVisitor } from './game-profile-visitor';

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const base = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const own = (game = gameBlockWithExtrasFixture({ prestige: 2 })): EngagementWithGame => ({ ...base, game });

/**
 * LE JEU SUR LES PROFILS (#9481, #5738) — le sien en entier (anneau à emblème et
 * chiffre romain, étoiles de Prestige, blason du rang et division, trésor,
 * Flamme, vitrine, médailles, entrée Progression) ; celui d’un autre : ce que SA
 * visibilité autorise, rien sinon — pas même la preuve qu’une vitrine existe.
 */
describe('mon profil', () => {
  const html = renderToStaticMarkup(<GameProfileOwn progress={own()} />);
  const t = text(html);

  test('l’anneau de niveau : palier, chiffre romain, étoiles de Prestige, lu en toutes lettres', () => {
    expect(html).toContain('data-game-tier-numeral');
    expect((html.match(/data-game-prestige-star/g) ?? []).length).toBe(2);
    expect(html).toContain('aria-label="Niveau');
  });

  test('le blason du rang avec sa division, la Gloire, le niveau', () => {
    expect(html).toContain('data-game-shield');
    expect(t).toMatch(/Niveau \d+ · /);
    expect(t).toContain('de Gloire');
  });

  test('le trésor et la Flamme', () => {
    expect(t).toMatch(/Meeshes?/);
    expect(t).toContain('Flamme : 6 jours');
  });

  test('la vitrine : jusqu’à quatre coupes, la porte vers toute la vitrine', () => {
    expect((html.match(/data-game-trophy="trophy/g) ?? []).length).toBe(3);
    expect(html).toContain('href="/me/progression/vitrine"');
    expect(t).toContain('Coupe d’argent — ligue Jade');
  });

  test('les meilleures médailles : le palier le plus haut d’abord, jamais une empreinte éteinte', () => {
    const medals = [...html.matchAll(/data-game-medal-axis="([^"]+)"/g)].map((m) => m[1]);
    expect(medals.length).toBeGreaterThan(0);
    expect(medals.length).toBeLessThanOrEqual(4);
    expect(html).not.toContain('data-game-imprint');
  });

  test('l’entrée vers Progression', () => {
    expect(html).toContain('href="/me/progression"');
    expect(t).toContain('Voir ma progression');
  });

  test('un ancien serveur (aucun bloc game) : rien ne se dessine', () => {
    expect(renderToStaticMarkup(<GameProfileOwn progress={base} />)).toBe('');
  });

  test('sans trophée : pas d’étagère, la carte reste', () => {
    const empty = renderToStaticMarkup(<GameProfileOwn progress={own({ ...gameBlockWithExtrasFixture(), trophies: { items: [], order: [] } })} />);
    expect(empty).not.toContain('data-game-profile-shelf');
    expect(empty).toContain('id="game-profile"');
  });

  test('un serveur sans extensions : la carte reste celle de la vague 1', () => {
    const old = renderToStaticMarkup(<GameProfileOwn progress={own(gameBlockFixture())} />);
    expect(old).toContain('data-game-shield');
    expect(old).not.toContain('data-game-profile-shelf');
  });
});

describe('le profil d’un autre', () => {
  const open = userShowcaseFixture();

  test('visible : la vitrine nommée, le MOIS d’obtention et jamais le jour', () => {
    const t = text(renderToStaticMarkup(<GameProfileVisitor showcase={open} name="Amina" />));
    expect(t).toContain('Vitrine de Amina');
    expect(t).toMatch(/Obtenu en (octobre|novembre|septembre) 2026/);
    expect(t).not.toMatch(/Obtenu le/);
  });

  test('fermée par son réglage : RIEN — pas un mot qui dise qu’elle existe', () => {
    expect(renderToStaticMarkup(<GameProfileVisitor showcase={{ visible: false, items: [], order: [] }} name="Amina" />)).toBe('');
  });

  test('pas encore chargée : rien', () => {
    expect(renderToStaticMarkup(<GameProfileVisitor showcase={undefined} name="Amina" />)).toBe('');
  });

  test('visible mais vide : rien', () => {
    expect(renderToStaticMarkup(<GameProfileVisitor showcase={{ visible: true, items: [], order: [] }} name="Amina" />)).toBe('');
  });

  test('un trophée d’une version plus récente ne se montre pas', () => {
    const future: UserShowcaseResponse = { visible: true, items: [{ key: 'trophy.cometa.9', awardedMonth: '2026-11' }], order: ['trophy.cometa.9'] };
    expect(renderToStaticMarkup(<GameProfileVisitor showcase={future} name="Amina" />)).toBe('');
  });

  test('l’ordre du membre est respecté, un trophée absent de l’ordre arrive à la suite', () => {
    const shown: UserShowcaseResponse = {
      visible: true,
      items: [
        { key: 'trophy.flame.100', awardedMonth: '2026-09' },
        { key: 'trophy.season-cup.1', awardedMonth: '2026-11' },
      ],
      order: ['trophy.season-cup.1'],
    };
    const keys = [...renderToStaticMarkup(<GameProfileVisitor showcase={shown} name="Amina" />).matchAll(/data-game-trophy="(trophy[^"]+)"/g)].map((m) => m[1]);
    expect(keys).toEqual(['trophy.season-cup.1', 'trophy.flame.100']);
  });
});

describe('la carte de contact', () => {
  test('trois coupes au plus, en lecture seule, nommées au lecteur d’écran', () => {
    const many: UserShowcaseResponse = {
      visible: true,
      items: ['trophy.flame.100', 'trophy.flame.365', 'trophy.season-cup.1', 'trophy.prestige.1'].map((key) => ({ key, awardedMonth: '2026-11' })),
      order: [],
    };
    const html = renderToStaticMarkup(<ContactGameStrip showcase={many} />);
    expect((html.match(/<li /g) ?? []).length).toBe(3);
    expect(html).not.toContain('<button');
    expect(text(html)).toContain('Trophée de Flamme');
  });

  test('fermée : rien', () => {
    expect(renderToStaticMarkup(<ContactGameStrip showcase={{ visible: false, items: [], order: [] }} />)).toBe('');
    expect(renderToStaticMarkup(<ContactGameStrip showcase={undefined} />)).toBe('');
  });
});
