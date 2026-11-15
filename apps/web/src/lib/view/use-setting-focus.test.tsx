import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SETTING_FOCUS_PARAM } from './setting-focus';
import { useSettingFocusFromAddress } from './use-setting-focus';

/**
 * #16339 — L'ÉCRAN DES RÉGLAGES LIT LE RÉGLAGE DEMANDÉ SUR SON ADRESSE : il
 * défile jusqu'à sa rangée, lui donne le focus, l'allume, et oublie la demande
 * (un rechargement ne rallume rien).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: `http://localhost/settings?${SETTING_FOCUS_PARAM}=saveMediaToGallery` });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

function Screen() {
  useSettingFocusFromAddress();
  return (
    <div>
      <div data-row="other">
        <button type="button" role="switch" aria-checked={false} data-setting="showOnlineStatus" />
      </div>
      <div data-row="gallery">
        <button type="button" role="switch" aria-checked={false} data-setting="saveMediaToGallery" />
      </div>
    </div>
  );
}

describe('useSettingFocusFromAddress (#16339)', () => {
  test('la rangée demandée est mise en évidence et reçoit le focus ; les autres non ; l’adresse oublie la demande', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const scrolled: string[] = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: HTMLElement) {
        scrolled.push(this.getAttribute('data-row') ?? '');
      },
    });
    await act(async () => {
      root.render(<Screen />);
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(container.querySelector('[data-row="gallery"]')?.hasAttribute('data-setting-highlight')).toBe(true);
    expect(container.querySelector('[data-row="other"]')?.hasAttribute('data-setting-highlight')).toBe(false);
    expect(scrolled).toEqual(['gallery']);
    expect(document.activeElement?.getAttribute('data-setting')).toBe('saveMediaToGallery');
    expect(new URLSearchParams(window.location.search).get(SETTING_FOCUS_PARAM)).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
