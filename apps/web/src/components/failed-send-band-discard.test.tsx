import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FailedSendBand } from './message-blocks';

/**
 * #12632 — LA BANDE « NON ENVOYÉ » PORTE « ABANDONNER ». Un refus permanent
 * n'avait plus aucun geste : la bulle restait jusqu'au rechargement. Il gagne
 * l'abandon ; un refus passager garde « Réessayer » et le gagne aussi. Chaque
 * geste est une cible de 44 px, et aucun bouton n'en contient un autre.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr')]);
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let root: Root;

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  document.documentElement.lang = 'fr';
});

function mount(node: Parameters<Root['render']>[0]): HTMLElement {
  document.documentElement.lang = 'fr';
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(node));
  return container;
}

const discardOf = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('button[data-send-discard]');

describe('« Abandonner » sur la bande d’un envoi en échec', () => {
  test('un refus permanent porte le geste, en 44 px, et il abandonne CET envoi', () => {
    const discarded: string[] = [];
    const host = mount(<FailedSendBand reason="refusé" onDiscard={() => discarded.push('x')} textColor="var(--color-error)" />);
    const band = host.querySelector('[data-send-failed="permanent"]');
    const button = discardOf(host);
    expect(band).not.toBeNull();
    expect(button?.textContent).toBe('Abandonner');
    expect(button?.style.minHeight).toBe('44px');
    expect(button?.style.minWidth).toBe('44px');
    expect(button?.getAttribute('data-variant')).toBe('destructive');
    act(() => button?.click());
    expect(discarded).toEqual(['x']);
  });

  test('un refus passager garde « Réessayer » et gagne « Abandonner », deux boutons distincts', () => {
    const retried: string[] = [];
    const discarded: string[] = [];
    const host = mount(<FailedSendBand onRetry={() => retried.push('r')} onDiscard={() => discarded.push('d')} textColor="var(--color-error)" />);
    const retry = host.querySelector<HTMLButtonElement>('button[data-send-failed="retryable"]');
    const discard = discardOf(host);
    expect(retry?.querySelector('[data-send-retry]')?.textContent).toBe('Réessayer');
    expect(retry?.style.minHeight).toBe('44px');
    expect(retry?.contains(discard)).toBe(false);
    expect(host.querySelectorAll('button button').length).toBe(0);
    act(() => discard?.click());
    expect(discarded).toEqual(['d']);
    expect(retried).toEqual([]);
    act(() => retry?.click());
    expect(retried).toEqual(['r']);
  });

  test('sans geste d’abandon remis, la bande reste telle qu’elle était', () => {
    const host = mount(<FailedSendBand textColor="var(--color-error)" />);
    expect(discardOf(host)).toBeNull();
    expect(host.querySelector('[data-send-failed="permanent"]')).not.toBeNull();
  });
});
