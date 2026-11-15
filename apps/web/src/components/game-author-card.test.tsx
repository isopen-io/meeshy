import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { authorPlateOf } from '@/lib/game-photo/author-plate';
import { achievementMoment, missionMoment, rankMoment, type PhotoMoment } from '@/lib/game-photo/moments';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';

import { GameAuthorCard } from './game-author-card';

beforeAll(async () => {
  await loadGameCatalog('fr');
});

/**
 * LA CARTE POSÉE (#10816) — constat porteur : « le cadre prend tout l'écran
 * et ne dit rien sur l'auteur ». La célébration est une carte bornée, inclinée,
 * qui nomme son auteur : l'emblème, le moment, et la plaque gravée à son
 * pseudo, avec sa photo de profil. L'animation est une couche Lottie posée SUR
 * la plaque fixe — le moteur ne monte rien sous « Réduire les animations ».
 */
const render = (moment: PhotoMoment, avatar?: string) => {
  const plate = authorPlateOf(moment.emblem, { handle: 'atabeth', ...(avatar === undefined ? {} : { avatar }) }, 'fr');
  if (plate === null) throw new Error('plaque attendue');
  return renderToStaticMarkup(<GameAuthorCard moment={moment} plate={plate} dateLabel="16 octobre 2026" />);
};

describe('GameAuthorCard', () => {
  test('une carte bornée, jamais plein écran', () => {
    const html = render(achievementMoment('achievement.first_content', 'legendary'));
    expect(html).toContain('data-author-card="achievement"');
    expect(html).toMatch(/max-width:\s*300px/);
    expect(html).not.toMatch(/position:\s*fixed/);
  });

  test('elle se dit en une phrase : le moment et son auteur', () => {
    const html = render(rankMoment({ rank: 'voix', division: 2 }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Nouveau rang : Voix II — Rang atteint par @atabeth"');
  });

  test('le pseudo gravé, la photo de profil dans le médaillon', () => {
    const html = render(achievementMoment('achievement.first_content', 'rare'), 'https://cdn.test/a.jpg');
    expect(html).toContain('@atabeth');
    expect(html).toContain('href="https://cdn.test/a.jpg"');
  });

  test('l’animation est la couche Lottie du fini, posée sur la plaque fixe', () => {
    expect(render(missionMoment({ id: 'm1', templateKey: 'send_voice', target: 3 }))).toContain('data-lottie-layer="author-plate:scratch"');
    expect(render(achievementMoment('achievement.first_content', 'epic'))).toContain('data-lottie-layer="author-plate:emboss"');
  });
});
