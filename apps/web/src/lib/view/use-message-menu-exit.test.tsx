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

/**
 * LE GESTIONNAIRE, PAS LE BOUTON (#9573) — masquer une entrée ne ferme rien si
 * son gestionnaire reste ouvert (glissé, raccourci, autre surface, état
 * périmé). Chaque geste de SORTIE du hook, appelé EN DIRECT sur chaque nature
 * non ordinaire : rien dans le presse-papiers, aucun atelier, aucune feuille
 * d'envoi, aucune sélection armée par un transfert interdit.
 */
describe('chaque gestionnaire de sortie, appelé en direct, consulte la loi', () => {
  const written: string[] = [];
  let realClipboard: PropertyDescriptor | undefined;
  let realExec: typeof document.execCommand;

  beforeAll(() => {
    realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    realExec = document.execCommand;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
    document.execCommand = () => {
      written.push('execCommand');
      return true;
    };
  });

  afterAll(() => {
    if (realClipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard');
    else Object.defineProperty(navigator, 'clipboard', realClipboard);
    document.execCommand = realExec;
  });

  afterEach(() => {
    written.length = 0;
  });

  const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
  const pieceOnce = (id: string): Message => of(id, { attachments: [{ isViewOnce: true, isBlurred: false, mimeType: 'image/jpeg' }] as unknown as NonNullable<Message['attachments']> });
  const undeclared = (id: string): Message => of(id, { expiresAt: new Date(Date.now() + 60_000) });

  const SEALED: readonly (readonly [string, (id: string) => Message, boolean])[] = [
    ['flamme à durée', timedFlame, true],
    ['flamme après lecture', afterRead, false],
    ['vue unique', viewOnce, false],
    ['pièce à vue unique', pieceOnce, false],
    ['éphémère sans durée lisible', undeclared, false],
  ];

  test('témoin de contrôle : un message ordinaire, lui, se copie et s’image', async () => {
    const { api } = mount([ordinary('m1')]);
    act(() => api().onMenuAction('m1', 'copy'));
    await flush();
    expect(written).toEqual(['texte m1']);
    act(() => api().onMenuAction('m1', 'export'));
    expect(api().exportFor).not.toBe(null);
  });

  SEALED.forEach(([label, make, forwardable]) => {
    test(`${label} : Copier, Imager, Export rapide, Imager la discussion — aucun effet`, async () => {
      const { api } = mount([make('x1')]);
      (['copy', 'export', 'exportQuick', 'exportDiscussion'] as const).forEach((id) => act(() => api().onMenuAction('x1', id)));
      await flush();
      expect(written).toEqual([]);
      expect(api().exportFor).toBe(null);
      expect(sendSheetStore.getState().request).toBe(null);
    });

    test(`${label} : traduire puis copier ne copie pas la traduction`, async () => {
      const { api } = mount([make('x1')]);
      act(() => api().onPickLanguage('x1', 'en'));
      act(() => api().onMenuAction('x1', 'copy'));
      await flush();
      expect(written).toEqual([]);
    });

    test(`${label} : « Copier » de la barre de sélection ne copie rien d’elle`, async () => {
      const messages = [ordinary('m1'), make('x1')];
      const { api } = mount(messages);
      select(api, ['m1', 'x1']);
      act(() => api().onCopySelection(placedOf(messages)));
      await flush();
      expect(written).toEqual(['texte m1']);
    });

    test(`${label} : l’étiquette du menu ne cite pas son texte`, () => {
      const { api } = mount([make('x1')]);
      const element = document.createElement('div');
      element.dataset.row = 'x1';
      const event = { nativeEvent: new Event('contextmenu'), preventDefault: () => {}, currentTarget: element };
      act(() => api().longPress.onContextMenu(event as never));
      expect(api().menuData).toBeDefined();
      expect(api().menuData?.subjectLabel ?? '').not.toContain('texte x1');
    });

    if (!forwardable) {
      test(`${label} : « Transférer » n’arme aucune sélection et la barre n’ouvre aucune feuille`, () => {
        const messages = [ordinary('m1'), make('x1')];
        const { api } = mount(messages);
        act(() => api().onMenuAction('x1', 'forward'));
        expect(api().selection).toBe(null);
        select(api, ['m1', 'x1']);
        act(() => api().onForwardSelection(placedOf(messages)));
        expect(sendSheetStore.getState().request).toBe(null);
      });
    }
  });
});

/**
 * UNE RÉPONSE QUI CITE UN CONTENU PROTÉGÉ (décision porteur du 2026-10-08,
 * #9573) — « Imager », « Export rapide » et « Imager la discussion » ne sont
 * pas rendus, et leur gestionnaire appelé par une autre porte n'ouvre aucun
 * atelier ; « Imager la discussion » d'un message ordinaire disparaît aussi
 * quand la discussion peinte CONTIENT une telle réponse. Copier, transférer et
 * répondre restent offerts.
 */
describe('une réponse qui cite un contenu protégé ne s’image pas', () => {
  const replying = (id: string, quoted: Message, minutes = 4): Message => of(id, { replyTo: quoted, createdAt: minutesAgo(minutes) });
  const openMenu = (api: () => MenuApi, id: string): void => {
    const element = document.createElement('div');
    element.dataset.row = id;
    const event = { nativeEvent: new Event('contextmenu'), preventDefault: () => {}, currentTarget: element };
    act(() => api().longPress.onContextMenu(event as never));
  };

  const QUOTED: readonly (readonly [string, Message])[] = [
    ['une flamme à durée', timedFlame('q1')],
    ['une flamme après lecture', afterRead('q1')],
    ['une vue unique', of('q1', { effectFlags: 0, isViewOnce: true })],
    ['un message flouté', of('q1', { effectFlags: 0, isBlurred: true })],
    ['un message chiffré', of('q1', { effectFlags: 0, isEncrypted: true })],
    ['un message dont la nature n’est pas déclarée', ordinary('q1')],
  ];

  test('témoin : citer un message ordinaire DÉCLARÉ laisse Imager et Imager la discussion', () => {
    const declared = of('q1', { effectFlags: 0 });
    const { api } = mount([declared, replying('r1', declared)]);
    openMenu(api, 'r1');
    expect(api().menuData?.items.map((item) => item.id)).toContain('export');
    expect(api().menuData?.forwardItems.map((item) => item.id)).toEqual(['forward', 'exportDiscussion']);
    act(() => api().onMenuAction('r1', 'exportDiscussion'));
    expect(api().exportFor).toEqual({ messageId: 'r1', quick: false, scope: 'discussion' });
  });

  QUOTED.forEach(([label, quoted]) => {
    test(`citer ${label} : le menu ne rend ni Imager ni Imager la discussion, Copier et Transférer demeurent`, () => {
      const { api } = mount([quoted, replying('r1', quoted)]);
      openMenu(api, 'r1');
      const items = api().menuData?.items.map((item) => item.id) ?? [];
      expect(items).not.toContain('export');
      expect(items).not.toContain('exportQuick');
      expect(items).toContain('copy');
      expect(items).toContain('forward');
      expect(api().menuData?.forwardItems.map((item) => item.id)).toEqual(['forward']);
    });

    test(`citer ${label} : Imager, Export rapide et Imager la discussion appelés en direct n’ouvrent rien`, () => {
      const { api } = mount([quoted, replying('r1', quoted)]);
      (['export', 'exportQuick', 'exportDiscussion'] as const).forEach((id) => act(() => api().onMenuAction('r1', id)));
      expect(api().exportFor).toBe(null);
    });

    test(`un message ordinaire dont la discussion contient une réponse qui cite ${label} : Imager seul, sans Imager la discussion`, () => {
      const { api } = mount([quoted, replying('r1', quoted), of('m2', { createdAt: minutesAgo(3) })]);
      openMenu(api, 'm2');
      expect(api().menuData?.items.map((item) => item.id)).toContain('export');
      expect(api().menuData?.forwardItems.map((item) => item.id)).toEqual(['forward']);
      act(() => api().onMenuAction('m2', 'exportDiscussion'));
      expect(api().exportFor).toBe(null);
      act(() => api().onMenuAction('m2', 'export'));
      expect(api().exportFor).toEqual({ messageId: 'm2', quick: false });
    });
  });
});
