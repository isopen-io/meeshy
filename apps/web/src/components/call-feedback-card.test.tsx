import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { CallFeedbackIssue, CallFeedbackRating } from '@/lib/calls/call-feedback';

import { CallFeedbackCard } from './call-feedback-card';

/**
 * LA CARTE DE NOTE D'APRÈS-APPEL (#8072) — un geste pour la note nominale :
 * 4 ou 5 étoiles partent d'un toucher ; en dessous, la carte demande ce qui a
 * gêné avant d'envoyer. « Plus tard » ferme sans rien envoyer.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = (media: 'audio' | 'video' = 'audio') => {
  const rated: [CallFeedbackRating, readonly CallFeedbackIssue[]][] = [];
  let skipped = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <CallFeedbackCard
        prompt={{ callId: 'call-1', title: 'Amina', media }}
        language="fr"
        onRate={(rating, issues) => rated.push([rating, issues])}
        onSkip={() => (skipped += 1)}
      />,
    );
  });
  return { rated, skipped: () => skipped };
};

const button = (label: string): HTMLButtonElement => {
  const found = Array.from(container.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label);
  if (found === undefined) throw new Error(`bouton introuvable : ${label}`);
  return found;
};

describe('CallFeedbackCard', () => {
  test('nomme l’appel et propose cinq étoiles', () => {
    mount();
    expect(container.textContent).toContain('Comment était l’appel avec Amina ?');
    expect(container.querySelectorAll('[data-call-feedback-star]').length).toBe(5);
  });

  test('une bonne note part d’un seul toucher', () => {
    const { rated } = mount();
    act(() => button('5 sur 5').click());
    expect(rated).toEqual([[5, []]]);
  });

  test('une note basse demande ce qui a gêné, puis part avec les motifs choisis', () => {
    const { rated } = mount();
    act(() => button('2 sur 5').click());
    expect(rated).toEqual([]);
    expect(container.textContent).toContain('Qu’est-ce qui a gêné ?');
    expect(container.textContent).not.toContain('Image de mauvaise qualité');
    act(() => button('Écho').click());
    expect(button('Écho').getAttribute('aria-pressed')).toBe('true');
    act(() => button('Envoyer').click());
    expect(rated).toEqual([[2, ['echo']]]);
  });

  test('après un appel vidéo, la qualité d’image fait partie des motifs', () => {
    mount('video');
    act(() => button('1 sur 5').click());
    expect(container.textContent).toContain('Image de mauvaise qualité');
  });

  test('« Plus tard » ferme sans rien envoyer', () => {
    const { rated, skipped } = mount();
    act(() => button('Plus tard').click());
    expect(rated).toEqual([]);
    expect(skipped()).toBe(1);
  });
});
