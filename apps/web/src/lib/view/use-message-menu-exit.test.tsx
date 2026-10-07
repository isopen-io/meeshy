import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { appQueryClient } from '@/lib/api/query-client';
import type { Message } from '@/lib/api/types';
import { sendSheetStore } from '@/lib/send/send-sheet-store';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useMessageMenu } from './use-message-menu';

/**
 * LA SÉLECTION ET LES GESTES SOUS LA LOI DE SORTIE (#9573) — une sélection qui
 * contient un message non transférable n'offre pas « Transférer » ; ce qui ne
 * sort pas ne se copie ni par le menu, ni par la barre, ni par un geste
 * qu'une autre porte (glissé, raccourci) rejouerait.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { EPHEMERAL, EPHEMERAL_AFTER_READ } = MESSAGE_EFFECT_FLAGS;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

type MenuApi = ReturnType<typeof useMessageMenu>;

const of = (id: string, overrides: Partial<Message> = {}): Message =>
  message({ id, senderId: 'u-other', content: `texte ${id}`, originalLanguage: 'fr', createdAt: minutesAgo(5), translations: [], ...overrides });

const ordinary = (id: string): Message => of(id);
const timedFlame = (id: string): Message => of(id, { effectFlags: EPHEMERAL, ephemeralDuration: 300 });
const afterRead = (id: string): Message => of(id, { effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ });
const viewOnce = (id: string): Message => of(id, { isViewOnce: true });

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  sendSheetStore.getState().close();
  act(() => root.unmount());
  container.remove();
});

function mount(messages: readonly Message[]): { api: () => MenuApi; announced: string[] } {
  const announced: string[] = [];
  let latest: MenuApi | undefined;
  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages,
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewerId: 'u-viewer',
      canStar: false,
      onReply: () => {},
      announce: (text) => announced.push(text),
    });
    return null;
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  return {
    api: () => {
      if (latest === undefined) throw new Error('hook non monté');
      return latest;
    },
    announced,
  };
}

const select = (api: () => MenuApi, ids: readonly string[]): void => {
  const [first, ...rest] = ids;
  if (first === undefined) return;
  act(() => api().onMenuAction(first, 'select'));
  rest.forEach((id) => act(() => api().onRowTap(id)));
};

const placedOf = (messages: readonly Message[]) => messages.map((m) => ({ message: { id: m.id } }));

describe('ce que la barre de sélection offre', () => {
  test('hors sélection, rien', () => {
    const { api } = mount([ordinary('m1')]);
    expect(api().selectionOffers).toEqual({ forward: false, copy: false });
  });

  test('des messages ordinaires : Transférer et Copier', () => {
    const { api } = mount([ordinary('m1'), ordinary('m2')]);
    select(api, ['m1', 'm2']);
    expect(api().selectionOffers).toEqual({ forward: true, copy: true });
  });

  test('une flamme à durée seule : Transférer, pas Copier', () => {
    const { api } = mount([timedFlame('f1')]);
    select(api, ['f1']);
    expect(api().selectionOffers).toEqual({ forward: true, copy: false });
  });

  test('un ordinaire ET une flamme à durée : Transférer, et Copier pour ce qui se copie', () => {
    const { api } = mount([ordinary('m1'), timedFlame('f1')]);
    select(api, ['m1', 'f1']);
    expect(api().selectionOffers).toEqual({ forward: true, copy: true });
  });

  const blockers: readonly (readonly [string, (id: string) => Message])[] = [
    ['une flamme après lecture', afterRead],
    ['une vue unique', viewOnce],
  ];
  blockers.forEach(([label, make]) => {
    test(`${label} dans la sélection : Transférer n’est pas offert`, () => {
      const { api } = mount([ordinary('m1'), make('x1')]);
      select(api, ['m1', 'x1']);
      expect(api().selectionOffers.forward).toBe(false);
    });
  });

  test('la décocher rend Transférer', () => {
    const { api } = mount([ordinary('m1'), afterRead('x1')]);
    select(api, ['m1', 'x1']);
    act(() => api().onRowTap('x1'));
    expect(api().selectionOffers.forward).toBe(true);
  });
});

describe('une porte qui rejoue le geste ne contourne pas la loi', () => {
  test('« Transférer » rejoué sur une flamme après lecture n’arme rien et dit pourquoi', () => {
    const { api, announced } = mount([afterRead('x1')]);
    act(() => api().onMenuAction('x1', 'forward'));
    expect(api().selection).toBe(null);
    expect(announced).toEqual(['Un message qui disparaît après lecture ne peut pas être transféré']);
  });

  test('« Imager » rejoué sur une flamme à durée n’ouvre pas l’atelier', () => {
    const { api } = mount([timedFlame('f1')]);
    act(() => api().onMenuAction('f1', 'export'));
    act(() => api().onMenuAction('f1', 'exportDiscussion'));
    expect(api().exportFor).toBe(null);
  });

  test('« Copier » rejoué sur une flamme à durée ne copie rien', () => {
    const { api, announced } = mount([timedFlame('f1')]);
    act(() => api().onMenuAction('f1', 'copy'));
    expect(announced).toEqual(['Message protégé']);
  });

  test('la barre validée sur une flamme après lecture refuse avec SON motif', () => {
    const messages = [afterRead('x1')];
    const { api, announced } = mount(messages);
    select(api, ['x1']);
    act(() => api().onForwardSelection(placedOf(messages)));
    expect(sendSheetStore.getState().request).toBe(null);
    expect(announced).toEqual(['Un message qui disparaît après lecture ne peut pas être transféré']);
  });

  test('une flamme à durée ouvre la feuille d’envoi avec sa borne', () => {
    const messages = [timedFlame('f1')];
    const { api } = mount(messages);
    select(api, ['f1']);
    act(() => api().onForwardSelection(placedOf(messages)));
    const request = sendSheetStore.getState().request;
    expect(request?.payload.kind === 'messages' ? request.payload.messages : null).toEqual([
      { id: 'f1', content: 'texte f1', originalLanguage: 'fr', maxDurationSeconds: 300 },
    ]);
  });
});
