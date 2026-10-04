import { useRef } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useThreadOpenScroll } from './use-thread-open-scroll';
import type { UnreadBoundarySnapshot } from './unread-boundary';
import type { PlacedLike } from './unread-separator';

/**
 * **L'OUVERTURE SUR LE SÉPARATEUR NE DÉPEND PAS DE L'ORDRE D'ARRIVÉE DES DEUX
 * REQUÊTES DU FIL** (#7202, W3, D-L2 — défaut trouvé en revue).
 *
 * `useThreadData` compose DEUX requêtes indépendantes (`GET /conversations/:id`
 * et `GET …/messages`) et `routes/thread.tsx` ne monte `<main ref={scroller}>`
 * qu'au `status === 'success'` — donc SEULEMENT quand les deux ont répondu.
 * Quand les MESSAGES répondent les premiers, `lastMessageId` est déjà défini
 * pendant le rendu du squelette : l'effet d'ouverture s'exécute alors avec
 * `scroller.current === null`, repart aussitôt, et ne se rejoue PLUS jamais
 * si sa seule dépendance est la queue du fil. Le fil s'ouvrait alors ni sur
 * le séparateur, ni en bas : en HAUT de la fenêtre virtualisée.
 *
 * Le témoin monte donc l'hôte dans le MÊME ordre que l'écran réel : rangées
 * connues d'abord, cadre de défilement ensuite.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const PLACED: readonly PlacedLike[] = ['m-1', 'm-2', 'm-3'].map((id) => ({ message: { id } }));
const BOUNDARY: UnreadBoundarySnapshot = { firstUnreadId: 'm-2', unreadCount: 2 };

type Jump = { readonly index: number };

function Hote({
  ready,
  unreadBoundary,
  jumps,
  anchor,
  placed = PLACED,
  followTail,
  pins,
}: {
  readonly ready: boolean;
  readonly unreadBoundary: UnreadBoundarySnapshot;
  readonly jumps: Jump[];
  readonly anchor?: { readonly messageId: string; readonly anchored: string[] };
  readonly placed?: readonly PlacedLike[];
  readonly followTail?: boolean;
  readonly pins?: { count: number };
}) {
  const scroller = useRef<HTMLElement | null>(null);
  const virtualizer = useRef<Pick<Virtualizer<HTMLElement, Element>, 'scrollToIndex'>>({
    scrollToIndex: (index: number) => {
      jumps.push({ index });
    },
  });

  useThreadOpenScroll({
    scroller,
    conversationId: 'c-non-lus',
    placed,
    unreadBoundary,
    ready,
    virtualizer: virtualizer.current,
    onProgrammaticScroll: () => {
      if (pins !== undefined) pins.count += 1;
    },
    ...(followTail !== undefined ? { followTail } : {}),
    ...(anchor !== undefined ? { anchorMessageId: anchor.messageId, onAnchor: (id: string) => anchor.anchored.push(id) } : {}),
  });

  if (!ready) return <div data-squelette />;
  return <main ref={scroller as never} data-fil />;
}

describe('useThreadOpenScroll — D-L2 tient quel que soit l’ordre d’arrivée des deux requêtes', () => {
  test('les MESSAGES arrivent avant la CONVERSATION : le fil s’ouvre quand même SUR le séparateur', async () => {
    const jumps: Jump[] = [];
    const host = await mounter.mount(<Hote ready={false} unreadBoundary={null} jumps={jumps} />);
    expect(host.querySelector('[data-fil]')).toBe(null);
    expect(jumps).toEqual([]);

    await mounter.rerender(host, <Hote ready unreadBoundary={BOUNDARY} jumps={jumps} />);

    expect(jumps).toEqual([{ index: 1 }]);
  });

  test('les deux requêtes répondent ensemble : le saut a lieu une seule fois', async () => {
    const jumps: Jump[] = [];
    const host = await mounter.mount(<Hote ready unreadBoundary={BOUNDARY} jumps={jumps} />);
    expect(jumps).toEqual([{ index: 1 }]);

    await mounter.rerender(host, <Hote ready unreadBoundary={BOUNDARY} jumps={jumps} />);
    expect(jumps).toEqual([{ index: 1 }]);
  });

  test('tout est lu : aucun saut vers un séparateur, l’ancrage en bas reprend la main', async () => {
    const jumps: Jump[] = [];
    const host = await mounter.mount(<Hote ready={false} unreadBoundary={null} jumps={jumps} />);
    await mounter.rerender(host, <Hote ready unreadBoundary={null} jumps={jumps} />);

    expect(jumps).toEqual([]);
  });
});

describe('useThreadOpenScroll — une ouverture ancrée remet le message au saut du fil (#9294)', () => {
  test('ancrée : le saut reçoit le message une fois, sans saut au séparateur', async () => {
    const jumps: Jump[] = [];
    const anchored: string[] = [];
    const anchor = { messageId: 'm-1', anchored };
    const host = await mounter.mount(<Hote ready={false} unreadBoundary={null} jumps={jumps} anchor={anchor} />);
    expect(anchored).toEqual([]);

    await mounter.rerender(host, <Hote ready unreadBoundary={BOUNDARY} jumps={jumps} anchor={anchor} />);
    await mounter.rerender(host, <Hote ready unreadBoundary={BOUNDARY} jumps={jumps} anchor={anchor} />);

    expect(anchored).toEqual(['m-1']);
    expect(jumps).toEqual([]);
  });
});

/**
 * #7420 — UN FIL ANCRÉ AUTOUR D'UN MESSAGE NE SUIT PAS SA QUEUE. Sa queue y
 * change parce que la fenêtre arrive, s'étend vers le présent ou le rejoint —
 * jamais parce qu'un message vient d'arriver : s'ancrer en bas arracherait le
 * lecteur au message qu'il est venu lire. Revenu au présent, l'ancrage en bas
 * reprend la main.
 */
describe('useThreadOpenScroll — la queue d’un fil ancré ne se suit pas (#7420)', () => {
  const nextFrames = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const withTail = (id: string): readonly PlacedLike[] => [...PLACED, { message: { id } }];

  test('ancré : la queue qui change ne ramène pas en bas ; revenu au présent, si', async () => {
    const jumps: Jump[] = [];
    const pins = { count: 0 };
    const host = await mounter.mount(<Hote ready unreadBoundary={null} jumps={jumps} pins={pins} />);
    await nextFrames();
    expect(pins.count).toBe(1);

    await mounter.rerender(host, <Hote ready unreadBoundary={null} jumps={jumps} pins={pins} placed={withTail('m-4')} followTail={false} />);
    await nextFrames();
    expect(pins.count).toBe(1);

    await mounter.rerender(host, <Hote ready unreadBoundary={null} jumps={jumps} pins={pins} placed={withTail('m-5')} followTail />);
    await nextFrames();
    expect(pins.count).toBe(2);
  });
});
