import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { DeclineReplyDeps } from '@/lib/calls/decline-reply';

import { CallDeclineSheet } from './call-decline-sheet';

/**
 * REFUSER AVEC UN MESSAGE (#8065) — la feuille de l'écran entrant : un
 * toucher sur une réponse rapide refuse l'appel et dépose le texte ; le texte
 * libre fait de même ; « Annuler » rend l'écran entrant intact.
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
  act(() => {
    root.unmount();
  });
  container.remove();
});

type Sent = Parameters<DeclineReplyDeps['send']>[0];

const mount = () => {
  const events: string[] = [];
  const sent: Sent[] = [];
  let closed = 0;
  const deps: DeclineReplyDeps = {
    decline: () => events.push('decline'),
    send: (message) => {
      events.push('send');
      sent.push(message);
    },
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <CallDeclineSheet call={{ conversationId: 'c-1', phase: { kind: 'incoming' } }} language="fr" deps={deps} onClose={() => (closed += 1)} />,
    );
  });
  return { events, sent, closed: () => closed };
};

const buttonNamed = (name: string): HTMLButtonElement => {
  const found = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === name || button.getAttribute('aria-label') === name);
  if (found === undefined) throw new Error(`bouton introuvable : ${name}`);
  return found;
};

describe('CallDeclineSheet', () => {
  test('propose les réponses rapides dans la langue du lecteur', () => {
    mount();
    const replies = Array.from(container.querySelectorAll('[data-call-decline-reply]')).map((node) => node.textContent?.trim());
    expect(replies).toEqual(['Je te rappelle.', 'Je suis en réunion.', 'Je ne peux pas parler pour l’instant.', 'Écris-moi, je te réponds vite.']);
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe('call-decline-title');
  });

  test('une réponse rapide refuse l’appel puis dépose son texte dans la conversation', () => {
    const { events, sent, closed } = mount();
    act(() => buttonNamed('Je suis en réunion.').click());
    expect(events).toEqual(['decline', 'send']);
    expect(sent).toEqual([{ conversationId: 'c-1', content: 'Je suis en réunion.', language: 'fr' }]);
    expect(closed()).toBe(1);
  });

  test('le texte libre part au bouton « Envoyer et refuser », qui reste inerte tant qu’il est vide', () => {
    const { sent } = mount();
    const send = buttonNamed('Envoyer et refuser');
    expect(send.disabled).toBe(true);
    const field = container.querySelector<HTMLInputElement>('[data-call-decline-custom]');
    if (field === null) throw new Error('champ libre absent');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(field, 'Dans dix minutes');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(buttonNamed('Envoyer et refuser').disabled).toBe(false);
    act(() => {
      field.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(sent).toEqual([{ conversationId: 'c-1', content: 'Dans dix minutes', language: 'fr' }]);
  });

  test('« Annuler » ferme la feuille sans refuser', () => {
    const { events, closed } = mount();
    act(() => buttonNamed('Annuler').click());
    expect(events).toEqual([]);
    expect(closed()).toBe(1);
  });
});

/**
 * LE RETOUR ANDROID REFERME LA FEUILLE (#8466) — dans la coque, le bouton
 * retour est un `popstate`. Sans `useBackDismiss`, la feuille restait ouverte
 * pendant que le retour faisait reculer la page sous l'écran d'appel.
 */
describe('CallDeclineSheet — le retour matériel', () => {
  test('popstate ⇒ la feuille se ferme sans refuser', () => {
    const { events, closed } = mount();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(events).toEqual([]);
    expect(closed()).toBe(1);
  });

  test('ouverte ⇒ pose une entrée d’historique que le retour consomme', () => {
    mount();
    expect(typeof (window.history.state as { backDismiss?: unknown } | null)?.backDismiss).toBe('string');
  });
});

