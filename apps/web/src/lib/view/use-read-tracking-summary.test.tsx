import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRef, useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { useReadTracking } from './use-read-tracking';

/**
 * LE RÉSUMÉ VIVANT ACCUSE LA LECTURE (#10812) — miroir de
 * `markCaughtUpFromSummaryOrRiver` (iOS, #3901). Le Résumé ne monte aucune
 * rangée, donc aucune sentinelle : sans cette règle, une conversation ouverte
 * au-delà du seuil du Résumé (Meeshy Global, « 99+ ») ne voyait jamais son
 * curseur avancer, et rouvrir la conversation rouvrait le Résumé — la
 * pastille restait à vie.
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

type Mark = { readonly conversationId: string; readonly caughtUpToMessageId: string };

type Controls = {
  setSummaryShown: (shown: boolean) => void;
  setConversationId: (id: string) => void;
  setLastMessageId: (id: string | undefined) => void;
};

function Host(props: {
  readonly initialSummaryShown: boolean;
  readonly initialLastMessageId: string | undefined;
  readonly marks: Mark[];
  readonly controls: { current: Controls | null };
}) {
  const scroller = useRef<HTMLElement | null>(null);
  const [summaryShown, setSummaryShown] = useState(props.initialSummaryShown);
  const [conversationId, setConversationId] = useState('global');
  const [lastMessageId, setLastMessageId] = useState<string | undefined>(props.initialLastMessageId);
  props.controls.current = { setSummaryShown, setConversationId, setLastMessageId };
  useReadTracking({
    scroller,
    conversationId,
    lastMessageId,
    enabled: false,
    summaryShown,
    onMark: (id, caughtUpToMessageId) => props.marks.push({ conversationId: id, caughtUpToMessageId }),
  });
  return <main ref={scroller as never} />;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function mount(params: { readonly summaryShown: boolean; readonly lastMessageId: string | undefined }) {
  const marks: Mark[] = [];
  const controls: { current: Controls | null } = { current: null };
  act(() => {
    root.render(
      <Host initialSummaryShown={params.summaryShown} initialLastMessageId={params.lastMessageId} marks={marks} controls={controls} />,
    );
  });
  const control = (): Controls => {
    if (controls.current === null) throw new Error('host non monté');
    return controls.current;
  };
  return { marks, control };
}

describe('useReadTracking — le Résumé Vivant (#10812)', () => {
  test('quitter le Résumé pour le fil accuse la lecture jusqu’au dernier message connu', () => {
    const { marks, control } = mount({ summaryShown: true, lastMessageId: 'tip' });
    expect(marks).toEqual([]);

    act(() => control().setSummaryShown(false));

    expect(marks).toEqual([{ conversationId: 'global', caughtUpToMessageId: 'tip' }]);
  });

  test('quitter l’écran depuis le Résumé (retour à la liste) accuse la lecture', () => {
    const { marks } = mount({ summaryShown: true, lastMessageId: 'tip' });

    act(() => root.unmount());
    root = createRoot(container);

    expect(marks).toEqual([{ conversationId: 'global', caughtUpToMessageId: 'tip' }]);
  });

  test('passer à une autre conversation depuis le Résumé accuse la PREMIÈRE, à SA frontière', () => {
    const { marks, control } = mount({ summaryShown: true, lastMessageId: 'tip' });

    act(() => {
      control().setConversationId('other');
      control().setLastMessageId('other-tip');
    });

    expect(marks).toEqual([{ conversationId: 'global', caughtUpToMessageId: 'tip' }]);
  });

  test('la frontière qui avance pendant le Résumé est celle qui part', () => {
    const { marks, control } = mount({ summaryShown: true, lastMessageId: 'tip' });

    act(() => control().setLastMessageId('newer-tip'));
    act(() => control().setSummaryShown(false));

    expect(marks).toEqual([{ conversationId: 'global', caughtUpToMessageId: 'newer-tip' }]);
  });

  test('un Résumé sans frontière connue (fenêtre détachée, fil pas encore chargé) n’accuse rien', () => {
    const { marks, control } = mount({ summaryShown: true, lastMessageId: undefined });

    act(() => control().setSummaryShown(false));

    expect(marks).toEqual([]);
  });

  test('un fil jamais passé par le Résumé n’accuse rien en partant — la sentinelle reste seule juge', () => {
    const { marks } = mount({ summaryShown: false, lastMessageId: 'tip' });

    act(() => root.unmount());
    root = createRoot(container);

    expect(marks).toEqual([]);
  });
});
