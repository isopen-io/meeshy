import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { flameMoment } from '@/lib/game-photo/moments';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GamePhotoOffer } from './game-photo-offer';

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

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/**
 * LA PROPOSITION APRÈS LA CÉLÉBRATION (#9382) — Mee propose, sans bulle, et
 * sans jamais imposer : photographier maintenant, ou plus tard (le moment
 * attend sept jours dans le carnet).
 */
describe('GamePhotoOffer', () => {
  const moment = flameMoment(7);
  const noop = { onStart: () => undefined, onLater: () => undefined };

  test('Mee demande, le moment est nommé', () => {
    const page = text(renderToStaticMarkup(<GamePhotoOffer moment={moment} {...noop} />));
    expect(page).toContain('On immortalise ?');
    expect(page).toContain('7 jours de Flamme');
  });

  test('aucune bulle de conversation', () => {
    expect(renderToStaticMarkup(<GamePhotoOffer moment={moment} {...noop} />)).not.toContain('data-mascot-coach');
  });

  test('une région nommée, pas un dialogue qui prend le focus', () => {
    const html = renderToStaticMarkup(<GamePhotoOffer moment={moment} {...noop} />);
    expect(html).toContain('<section');
    expect(html).not.toContain('role="dialog"');
  });

  test('les deux gestes, de 44 points', () => {
    const html = renderToStaticMarkup(<GamePhotoOffer moment={moment} {...noop} />);
    expect(html).toContain('data-photo-offer-start');
    expect(html).toContain('data-photo-offer-later');
    for (const button of html.match(/<button[^>]*>/g) ?? []) expect(button).toContain('min-height:44px');
  });

  test('« Photographier » ouvre le moment, « Plus tard » le laisse en attente', async () => {
    const asked: string[] = [];
    const host = await mount(<GamePhotoOffer moment={moment} onStart={(m) => asked.push(`start:${m.id}`)} onLater={(m) => asked.push(`later:${m.id}`)} />);
    await click(host.querySelector('[data-photo-offer-start]'));
    await click(host.querySelector('[data-photo-offer-later]'));
    expect(asked).toEqual(['start:flame:7', 'later:flame:7']);
  });
});
