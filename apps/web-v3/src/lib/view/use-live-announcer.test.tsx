import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { useLiveAnnouncer } from './use-live-announcer';

/**
 * TÉMOIN (revue #5814, défaut majeur 9) — patron `message-menu.test.tsx`
 * (happy-dom + `createRoot` + `act`, timers RÉELS). Reproduit exactement le
 * scénario de la régression mesurée dans `recette6.mjs` : une annonce posée
 * par une source A (l'envoi), puis par une source B (le menu) — c'est LA
 * DERNIÈRE qui doit rester lisible, jamais la première parce qu'elle est
 * arrivée en premier.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  GlobalRegistrator.register();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function Harness({ onReady }: { onReady: (announce: (message: string) => void) => void }) {
  const { text, announce } = useLiveAnnouncer();
  onReady(announce);
  return <div role="status" data-live>{text}</div>;
}

function mount(onReady: (announce: (message: string) => void) => void): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness onReady={onReady} />);
  });
  return container;
}

const liveOf = (el: HTMLDivElement): string => el.querySelector('[data-live]')!.textContent ?? '';

describe('useLiveAnnouncer — une région, la dernière annonce gagne (#5814, défaut majeur 9)', () => {
  test('une annonce se lit', () => {
    let announce: (message: string) => void = () => {};
    const el = mount((fn) => {
      announce = fn;
    });
    act(() => {
      announce('Message envoyé');
    });
    expect(liveOf(el)).toBe('Message envoyé');
  });

  test('une SECONDE annonce, arrivée pendant que la première est encore visible, REMPLACE la première — jamais masquée par elle', () => {
    let announce: (message: string) => void = () => {};
    const el = mount((fn) => {
      announce = fn;
    });
    act(() => {
      announce('Message envoyé'); // source A — useSend, l'ancien bug la gardait pour le reste de la session
    });
    expect(liveOf(el)).toBe('Message envoyé');
    act(() => {
      announce('Message copié'); // source B — useMessageMenu, arrivée juste après
    });
    expect(liveOf(el)).toBe('Message copié');
  });

  test('une annonce s’efface après 1,5 s, comme l’ancien actionNotice', async () => {
    let announce: (message: string) => void = () => {};
    const el = mount((fn) => {
      announce = fn;
    });
    act(() => {
      announce('Message copié');
    });
    expect(liveOf(el)).toBe('Message copié');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1600));
    });
    expect(liveOf(el)).toBe('');
  });

  test('une SECONDE annonce réarme le minuteur — elle ne s’efface pas au moment où la PREMIÈRE aurait dû s’effacer', async () => {
    let announce: (message: string) => void = () => {};
    const el = mount((fn) => {
      announce = fn;
    });
    act(() => {
      announce('Message envoyé');
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000));
    });
    act(() => {
      announce('Message copié'); // posée à t=1000ms, alors que la première se serait effacée à t=1500ms
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700)); // t≈1700ms : la première serait déjà effacée, la seconde non
    });
    expect(liveOf(el)).toBe('Message copié');
  });
});
