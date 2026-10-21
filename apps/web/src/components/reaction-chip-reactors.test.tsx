import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { LONG_PRESS_MS, useLongPress } from '@/lib/view/long-press';
import { reactorsSheetStore } from '@/lib/view/reactors-sheet-store';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ReactionChip } from './message-blocks';

/**
 * L'APPUI LONG SUR UNE PILULE OUVRE « QUI A RÉAGI » (#10583) — miroir
 * `BubbleReactionsOverlay.pill` (iOS : toucher = basculer, maintenir = la
 * liste). Sur le web, le clic droit et la touche de menu contextuel font le
 * même geste. La pilule vit DANS une rangée qui porte son propre appui long
 * (le menu du message) : c'est la pilule qui répond, pas la rangée.
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
afterEach(() => {
  mounter.unmountAll();
  reactorsSheetStore.getState().close();
});

function Row({ journal, reactorsFor }: { readonly journal: string[]; readonly reactorsFor?: string }) {
  const rowPress = useLongPress({ onOpen: () => journal.push('menu') });
  return (
    <div data-row="m-1" {...rowPress}>
      <ReactionChip
        glyph="❤️"
        count={2}
        onToggle={() => journal.push('toggle')}
        {...(reactorsFor === undefined ? {} : { reactorsFor })}
      />
    </div>
  );
}

const monte = async (options: { readonly named: boolean } = { named: true }) => {
  const journal: string[] = [];
  const host = await mounter.mount(<Row journal={journal} {...(options.named ? { reactorsFor: 'm-1' } : {})} />);
  const chip = host.querySelector<HTMLButtonElement>('button[aria-label="Réagir avec ❤️"]');
  if (chip === null) throw new Error('pilule absente');
  return { journal, chip };
};

const opened = (): string | null => reactorsSheetStore.getState().messageId;

const pointer = (type: string): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { button: 0, clientX: 10, clientY: 10 });
  return event;
};

const hold = async (chip: HTMLElement, ms: number) => {
  await act(async () => {
    chip.dispatchEvent(pointer('pointerdown'));
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe('ReactionChip — maintenir une pilule ouvre la liste de qui a réagi', () => {
  test('elle annonce qu’elle ouvre un dialogue', async () => {
    const { chip } = await monte();
    expect(chip.getAttribute('aria-haspopup')).toBe('dialog');
  });

  test('un toucher court bascule la réaction et n’ouvre rien', async () => {
    const { chip, journal } = await monte();
    await act(async () => {
      chip.dispatchEvent(pointer('pointerdown'));
      chip.dispatchEvent(pointer('pointerup'));
      chip.click();
    });
    expect(journal).toEqual(['toggle']);
    expect(opened()).toBeNull();
  });

  test('un appui long ouvre la liste de CE message ; ni le menu de la rangée, ni la bascule au relâchement', async () => {
    const { chip, journal } = await monte();
    await hold(chip, LONG_PRESS_MS + 60);
    expect(opened()).toBe('m-1');
    await act(async () => {
      chip.dispatchEvent(pointer('pointerup'));
      chip.click();
    });
    expect(journal).toEqual([]);
  });

  test('le clic droit ouvre la liste, sans le menu du navigateur ni celui de la rangée', async () => {
    const { chip, journal } = await monte();
    const event = new Event('contextmenu', { bubbles: true, cancelable: true });
    await act(async () => {
      chip.dispatchEvent(event);
    });
    expect(opened()).toBe('m-1');
    expect(event.defaultPrevented).toBe(true);
    expect(journal).toEqual([]);
  });

  test('au clavier, Maj+F10 sur la pilule ouvre la liste', async () => {
    const { chip, journal } = await monte();
    await act(async () => {
      chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(opened()).toBe('m-1');
    expect(journal).toEqual([]);
  });

  test('sans message à nommer (hôte sans feuille), la pilule laisse l’appui long à la rangée', async () => {
    const { chip, journal } = await monte({ named: false });
    expect(chip.hasAttribute('aria-haspopup')).toBe(false);
    await hold(chip, LONG_PRESS_MS + 60);
    expect(opened()).toBeNull();
    expect(journal).toEqual(['menu']);
  });
});
