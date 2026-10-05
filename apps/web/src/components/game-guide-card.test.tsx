import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ONBOARDING_STEPS, guideMoment, type GuideEvent } from '@meeshy/shared/utils/game/guide';

import { cardOfMoment, cardOfStep, type GuideCard } from '@/lib/game-guide/card';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameGuideCard } from './game-guide-card';

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

const firstMint: GuideEvent = { kind: 'first-mint', levelBefore: 14, levelAfter: 9, tailwindUntilLevel: 14 };
const rank: GuideEvent = { kind: 'new-rank', rank: 'voix', division: 2, glory: 1700, gloryMissing: 300 };
const atRisk: GuideEvent = { kind: 'flame-at-risk', days: 6 };

const full = (event: GuideEvent): GuideCard => cardOfMoment(guideMoment(event, []));
const short = (event: GuideEvent): GuideCard => cardOfMoment(guideMoment(event, [event.kind]));
const stepCard = (index: number): GuideCard => {
  const step = ONBOARDING_STEPS[index];
  if (step === undefined) throw new Error('étape attendue');
  return cardOfStep(step);
};

const handlers = { onAction: () => undefined, onDismiss: () => undefined };
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/**
 * LA CARTE DU GUIDE (#9379) — Mee et Meo, sans bulle de conversation. Ce qui
 * vient d'arriver, ce que ça veut dire, l'étape d'après, un bouton qui y mène.
 * Complète la première fois, d'une ligne ensuite, « ? » la rouvre.
 */
describe('la première fois : la version complète', () => {
  const page = text(renderToStaticMarkup(<GameGuideCard card={full(firstMint)} {...handlers} />));

  test('les trois parties, dans l’ordre', () => {
    const order = ['Ta première Meesh est frappée', 'de 14 à 9', 'niveau 14'].map((part) => page.indexOf(part));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('un bouton qui y mène, avec son libellé', () => {
    expect(page).toContain('Reprendre mes niveaux');
  });

  test('qui parle : Mee et Meo ensemble pour un grand moment', () => {
    expect(page).toContain('Mee et Meo');
    const html = renderToStaticMarkup(<GameGuideCard card={full(firstMint)} {...handlers} />);
    expect(html.match(/data-game-bird=/g)).toHaveLength(2);
  });

  test('un seul locuteur pour un moment simple', () => {
    const html = renderToStaticMarkup(<GameGuideCard card={full(atRisk)} {...handlers} />);
    expect(html.match(/data-game-bird=/g)).toHaveLength(1);
    expect(text(html)).toContain('Meo');
  });

  test('aucune bulle de conversation, et les dessins sont décoratifs', () => {
    const html = renderToStaticMarkup(<GameGuideCard card={full(firstMint)} {...handlers} />);
    expect(html).not.toContain('data-mascot-coach');
    expect(html).not.toContain('role="status"');
    expect(html.match(/<svg[^>]*aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test('la carte se lit en entier : une région nommée, pas un dialogue qui vole le focus', () => {
    const html = renderToStaticMarkup(<GameGuideCard card={full(firstMint)} {...handlers} />);
    expect(html).toContain('<section');
    expect(html).toContain('aria-labelledby');
    expect(html).not.toContain('role="dialog"');
  });

  test('les boutons font 44 points au moins', () => {
    const html = renderToStaticMarkup(<GameGuideCard card={full(firstMint)} {...handlers} />);
    for (const button of html.match(/<button[^>]*>/g) ?? []) expect(button).toContain('min-height:44px');
  });
});

describe('les fois suivantes : une ligne, et « ? » rouvre', () => {
  test('la version courte ne dit que la ligne courte', () => {
    const page = text(renderToStaticMarkup(<GameGuideCard card={short(atRisk)} {...handlers} />));
    expect(page).toContain('Ta Flamme s’éteint à minuit : un geste suffit.');
    expect(page).not.toContain('Fais une mission facile, ou achète un gel.');
  });

  test('le « ? » est toujours là et annonce son état', () => {
    const html = renderToStaticMarkup(<GameGuideCard card={short(atRisk)} {...handlers} />);
    expect(html).toMatch(/data-game-guide-help=""[^>]*aria-expanded="false"/);
  });

  test('le toucher déplie la version complète', async () => {
    const host = await mount(<GameGuideCard card={short(atRisk)} {...handlers} />);
    expect(host.textContent).not.toContain('Fais une mission facile');
    await click(host.querySelector('[data-game-guide-help]'));
    expect(host.textContent).toContain('Fais une mission facile, ou achète un gel.');
    expect(host.querySelector('[data-game-guide-help]')?.getAttribute('aria-expanded')).toBe('true');
  });

  test('la version complète n’a pas besoin du « ? » pour se montrer', () => {
    expect(text(renderToStaticMarkup(<GameGuideCard card={full(atRisk)} {...handlers} />))).toContain('Fais une mission facile');
  });
});

describe('les gestes de la carte', () => {
  test('le bouton principal envoie la carte', async () => {
    const acted: string[] = [];
    const host = await mount(<GameGuideCard card={full(atRisk)} {...handlers} onAction={(card) => acted.push(card.key)} />);
    await click(host.querySelector('[data-game-guide-action]'));
    expect(acted).toEqual(['flame-at-risk']);
  });

  test('« Plus tard » écarte la carte', async () => {
    const dismissed: string[] = [];
    const host = await mount(<GameGuideCard card={full(atRisk)} {...handlers} onDismiss={(card) => dismissed.push(card.key)} />);
    await click(host.querySelector('[data-game-guide-dismiss]'));
    expect(dismissed).toEqual(['flame-at-risk']);
  });
});

describe('une étape de l’intégration', () => {
  test('« Étape 3 sur 7 »', () => {
    expect(text(renderToStaticMarkup(<GameGuideCard card={stepCard(2)} {...handlers} />))).toContain('Étape 3 sur 7');
  });

  test('chaque carte peut se passer : « Passer », et « Passer l’intégration » quand on peut tout passer', () => {
    const html = renderToStaticMarkup(<GameGuideCard card={stepCard(2)} {...handlers} onSkipAll={() => undefined} />);
    expect(text(html)).toContain('Passer');
    expect(html).toContain('data-game-guide-skip-all');
    expect(text(html)).toContain('Passer l’intégration');
  });

  test('sans onSkipAll : pas de bouton pour tout passer', () => {
    expect(renderToStaticMarkup(<GameGuideCard card={stepCard(2)} {...handlers} />)).not.toContain('data-game-guide-skip-all');
  });

  test('un moment (hors intégration) ne propose pas de tout passer', () => {
    const html = renderToStaticMarkup(<GameGuideCard card={full(atRisk)} {...handlers} onSkipAll={() => undefined} />);
    expect(html).not.toContain('data-game-guide-skip-all');
  });

  test('« Passer l’intégration » le dit à l’hôte', async () => {
    let skipped = 0;
    const host = await mount(<GameGuideCard card={stepCard(0)} {...handlers} onSkipAll={() => (skipped += 1)} />);
    await click(host.querySelector('[data-game-guide-skip-all]'));
    expect(skipped).toBe(1);
  });
});

describe('les grands moments se photographient', () => {
  test('un moment qui se photographie propose « Immortaliser » à côté de son bouton', async () => {
    let photos = 0;
    const host = await mount(<GameGuideCard card={full(firstMint)} {...handlers} onPhoto={() => (photos += 1)} />);
    await click(host.querySelector('[data-game-guide-photo]'));
    expect(photos).toBe(1);
  });

  test('un moment qui ne se photographie pas ne le propose pas', () => {
    expect(renderToStaticMarkup(<GameGuideCard card={full(atRisk)} {...handlers} onPhoto={() => undefined} />)).not.toContain('data-game-guide-photo');
  });

  test('quand le bouton principal EST la photo, il n’est pas doublé', () => {
    const html = renderToStaticMarkup(<GameGuideCard card={full(rank)} {...handlers} onPhoto={() => undefined} />);
    expect(html.match(/data-game-guide-photo|data-game-guide-action/g)).toHaveLength(1);
  });
});
