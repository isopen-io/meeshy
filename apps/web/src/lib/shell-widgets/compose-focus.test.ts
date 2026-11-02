import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { CoqueNative } from '@/lib/native-shell';

import { COMPOSE_EVENT, ecouterDemandesDeReponse, focusComposerWhenReady } from './compose-focus';
import { WIDGETS_BRIDGE } from './channel';

/**
 * « RÉPONDRE » DEPUIS LE WIDGET (#10626) — Android ne permet pas de saisir
 * dans un widget : le toucher ouvre la conversation (lien profond), puis le
 * composeur prend le focus dès que le fil est peint.
 */
beforeAll(() => ensureHappyDomRegistered({ url: 'http://localhost/' }));
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const stepTimers = () => {
  let queue: Array<() => void> = [];
  return {
    set: (run: () => void) => {
      queue = [...queue, run];
      return queue.length;
    },
    tick: () => {
      const due = queue;
      queue = [];
      due.forEach((run) => run());
    },
  };
};

const composer = (doc: Document): HTMLTextAreaElement => {
  const host = doc.createElement('div');
  host.setAttribute('data-composer', '');
  const field = doc.createElement('textarea');
  host.appendChild(field);
  doc.body.appendChild(host);
  return field;
};

describe('focusComposerWhenReady', () => {
  test('attend que le fil de CETTE conversation soit peint, puis focalise son composeur', () => {
    const doc = document;
    const timers = stepTimers();
    let path = '/chats';

    focusComposerWhenReady({ conversationId: 'c1', doc, path: () => path, timers, now: () => 0 });
    const field = composer(doc);
    timers.tick();
    expect(doc.activeElement).not.toBe(field);

    path = '/c/c1';
    timers.tick();
    expect(doc.activeElement).toBe(field);
  });

  test('pose le curseur sans faire défiler le fil, comme le web (#12499)', () => {
    const doc = document;
    const timers = stepTimers();
    const field = composer(doc);
    const options: Array<FocusOptions | undefined> = [];
    field.focus = (given?: FocusOptions) => {
      options.push(given);
    };

    focusComposerWhenReady({ conversationId: 'c1', doc, path: () => '/c/c1', timers, now: () => 0 });
    timers.tick();
    expect(options).toEqual([{ preventScroll: true }]);
  });

  test('abandonne passé le délai, sans rien focaliser', () => {
    const doc = document;
    const timers = stepTimers();
    let clock = 0;

    focusComposerWhenReady({ conversationId: 'c1', doc, path: () => '/chats', timers, now: () => clock });
    clock = 10_000;
    timers.tick();
    const field = composer(doc);
    timers.tick();
    expect(doc.activeElement).not.toBe(field);
  });
});

describe('ecouterDemandesDeReponse', () => {
  test('relaie la conversation demandée par le widget, et ignore une charge illisible', () => {
    const rappels: Array<(donnees: unknown) => void> = [];
    const coque: CoqueNative = {
      PluginHeaders: [{ name: WIDGETS_BRIDGE }],
      addListener: (plugin, evenement, rappel) => {
        if (plugin === WIDGETS_BRIDGE && evenement === COMPOSE_EVENT) rappels.push(rappel);
        return { remove: async () => undefined };
      },
    };
    const demandes: string[] = [];
    expect(ecouterDemandesDeReponse(coque, (id) => demandes.push(id))).toBe(true);
    rappels[0]?.({ conversationId: 'c7' });
    rappels[0]?.({ conversationId: 42 });
    expect(demandes).toEqual(['c7']);
  });

  test('hors coque, rien n’est écouté', () => {
    expect(ecouterDemandesDeReponse(undefined, () => undefined)).toBe(false);
  });
});
