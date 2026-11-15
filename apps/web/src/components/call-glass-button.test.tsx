import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallButton } from './call-glass-button';

/**
 * LE BOUTON LÉGENDÉ D'UNE RANGÉE (#8735) — l'icône ET sa légende sont UNE
 * cible : la légende (« Caméra », « Retourner ») était posée À CÔTÉ du bouton,
 * et le doigt qui la touchait ne déclenchait rien. Le nom accessible reste le
 * libellé complet, la légende n'est pas lue deux fois.
 */

describe('CallButton', () => {
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

  const mount = (caption: string | undefined) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const pressed: string[] = [];
    act(() => root.render(<CallButton label="Couper la caméra" glyph={<svg data-glyph="" />} onPress={() => void pressed.push('press')} {...(caption === undefined ? {} : { caption })} data={{ 'data-call-control': 'camera' }} />));
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, pressed, done };
  };

  test('toucher la légende déclenche le bouton : l’icône et son mot sont une seule cible', () => {
    const view = mount('Caméra');
    const caption = [...view.host.querySelectorAll('span')].find((span) => span.textContent === 'Caméra');
    expect(caption?.closest('button')).not.toBeNull();
    act(() => caption?.click());
    expect(view.pressed).toEqual(['press']);
    view.done();
  });

  test('le nom accessible reste le libellé complet, porté par le bouton qui porte aussi ses données', () => {
    const view = mount('Caméra');
    const button = view.host.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Couper la caméra');
    expect(button?.getAttribute('data-call-control')).toBe('camera');
    expect(view.host.querySelectorAll('button')).toHaveLength(1);
    view.done();
  });

  test('sans légende, le bouton rond garde sa forme et son infobulle', () => {
    const view = mount(undefined);
    const button = view.host.querySelector('button');
    expect(button?.getAttribute('title')).toBe('Couper la caméra');
    expect(button?.className).toContain('rounded-full');
    expect(button?.getAttribute('style')).toContain('48px');
    view.done();
  });
});
