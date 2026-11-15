import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { installHapticsDriver, type HapticCue } from '@/lib/view/haptics';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MeeshyToggleRow, MeeshyToggleRowFace } from './meeshy-toggle-row';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/kit' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

const unmount = (): void => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
};

afterEach(() => {
  unmount();
  installHapticsDriver(null);
});

const mount = (element: ReactElement): HTMLElement => {
  unmount();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted = { container, root };
  return container;
};

const row = (container: HTMLElement): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>('button');
  if (found === null) throw new Error('ligne absente');
  return found;
};

const tap = (target: HTMLElement): void => {
  act(() => {
    target.click();
  });
};

const recordHaptics = (): HapticCue[] => {
  const played: HapticCue[] = [];
  installHapticsDriver({
    cue: (name) => {
      played.push(name);
      return true;
    },
    pattern: () => true,
  });
  return played;
};

describe('MeeshyToggleRow — la ligne entière est la cible', () => {
  test('un toucher sur la ligne part une fois, au relâcher dans la cible', () => {
    const calls: string[] = [];
    const container = mount(<MeeshyToggleRow title="Muet" onAction={() => calls.push('action')} />);
    tap(row(container));
    expect(calls).toEqual(['action']);
  });

  test('une ligne désactivée ne répond pas et ne joue aucune haptique', () => {
    const calls: string[] = [];
    const played = recordHaptics();
    const container = mount(<MeeshyToggleRow title="Muet" disabled onAction={() => calls.push('action')} />);
    tap(row(container));
    expect(calls).toEqual([]);
    expect(played).toEqual([]);
    expect(row(container).disabled).toBe(true);
  });

  test('l’haptique légère joue une fois par action sur une ligne active', () => {
    const played = recordHaptics();
    const container = mount(<MeeshyToggleRow title="Muet" onAction={() => {}} />);
    tap(row(container));
    expect(played).toEqual(['light']);
  });

  test('haptique none : aucune vibration, l’hôte joue la sienne', () => {
    const played = recordHaptics();
    const container = mount(<MeeshyToggleRow title="Muet" haptic="none" onAction={() => {}} />);
    tap(row(container));
    expect(played).toEqual([]);
  });
});

describe('MeeshyToggleRow — accessibilité', () => {
  test('le libellé est « titre, sous-titre » et un sous-titre blanc n’ajoute rien', () => {
    const container = mount(<MeeshyToggleRow title="Muet" subtitle="Son coupé" onAction={() => {}} />);
    expect(row(container).getAttribute('aria-label')).toBe('Muet, Son coupé');
    const blank = mount(<MeeshyToggleRow title="Muet" subtitle="  " onAction={() => {}} />);
    expect(row(blank).getAttribute('aria-label')).toBe('Muet');
  });

  test('une bascule se lit Activé ou Désactivé par le rôle interrupteur', () => {
    const on = mount(<MeeshyToggleRow title="Muet" accessory={{ type: 'toggle', isOn: true }} onAction={() => {}} />);
    expect(row(on).getAttribute('role')).toBe('switch');
    expect(row(on).getAttribute('aria-checked')).toBe('true');
    const off = mount(<MeeshyToggleRow title="Muet" accessory={{ type: 'toggle', isOn: false }} onAction={() => {}} />);
    expect(row(off).getAttribute('aria-checked')).toBe('false');
  });

  test('une valeur textuelle est décrite par la ligne', () => {
    const container = mount(<MeeshyToggleRow title="Langue du son" accessory={{ type: 'value', text: 'Wolof' }} onAction={() => {}} />);
    const describedBy = row(container).getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(container.querySelector(`[id="${describedBy}"]`)?.textContent).toBe('Wolof');
  });

  test('une case cochée et une coche portent leur état sélectionné', () => {
    const box = mount(<MeeshyToggleRow title="Amis" accessory={{ type: 'checkbox', isChecked: true }} onAction={() => {}} />);
    expect(row(box).getAttribute('role')).toBe('checkbox');
    expect(row(box).getAttribute('aria-checked')).toBe('true');
    const check = mount(<MeeshyToggleRow title="Lieu" accessory={{ type: 'check', isSelected: false }} onAction={() => {}} />);
    expect(row(check).getAttribute('aria-pressed')).toBe('false');
  });

  test('les emplacements décoratifs sont masqués aux lecteurs d’écran', () => {
    const container = mount(
      <MeeshyToggleRow title="Lieu" leading={<span data-testid="icon">i</span>} trailing={<span>x</span>} onAction={() => {}} />,
    );
    expect(container.querySelector('[data-testid="icon"]')?.parentElement?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('MeeshyToggleRowFace — le dessin seul', () => {
  test('dessine la ligne sans cible ni rôle, et porte l’état d’appui pour la capture', () => {
    const container = mount(<MeeshyToggleRowFace title="Plus" isPressed />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[data-pressed]')).not.toBeNull();
  });

  test('la variante destructive porte son attribut de variante', () => {
    const container = mount(<MeeshyToggleRowFace title="Tout effacer" kind="destructive" />);
    expect(container.querySelector('[data-kind="destructive"]')).not.toBeNull();
  });
});
