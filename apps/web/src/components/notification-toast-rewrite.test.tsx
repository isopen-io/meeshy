import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from 'bun:test';

import { NotificationToastHost } from '@/components/notification-toast';
import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';
import { inAppBannerStore, offerInAppBanner, resetInAppBanner, retractInAppBanner, WITHDRAWN_BANNER_GRACE_MS } from '@/lib/notifications/in-app-banner';
import type { NotificationRecord } from '@/lib/notifications/record';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * **UNE BANNIÈRE RÉÉCRITE RESTE EN PLACE** (#19244). La passerelle annonce une
 * édition par `notification:deleted` puis `notification:new`, même identité. La
 * suppression démontait la bannière et l'arrivée la remontait : l'entrée
 * rejouait, le départ de 7 s repartait, l'heure repassait à maintenant et un
 * vocal en lecture se coupait. La suppression la RETIRE de la vue aussitôt (le
 * contenu peut avoir été supprimé pour tous) mais garde son montage le temps
 * que la réécriture arrive ; seul son texte change alors.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/chats' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadNotificationRowCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const record = (content: string, id = 'n1'): NotificationRecord => ({
  id,
  type: 'new_message',
  title: 'Grace',
  content,
  actor: { id: 'u-grace', username: 'grace', displayName: 'Grace', avatar: null },
  context: { conversationId: 'c1', conversationTitle: 'Grace', conversationType: 'direct' },
  metadata: {},
  state: { isRead: false, createdAt: '2026-09-30T09:59:58.000Z' },
});

const location = { pathname: '/chats' };
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mountHost(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<NotificationToastHost />));
}

const card = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-in-app-banner]');
const body = (): string | null => card()?.querySelector('[data-banner-body]')?.textContent ?? null;

afterEach(() => {
  act(() => {
    root?.unmount();
    resetInAppBanner();
  });
  container?.remove();
  jest.useRealTimers();
});

describe('une bannière réécrite reste en place (#19244)', () => {
  test('la suppression la retire de la vue aussitôt, la réécriture la rend AU MÊME montage avec le texte édité', () => {
    mountHost();
    act(() => offerInAppBanner(record('Rendez-vous à 17h'), location));
    const before = card();
    expect(body()).toBe('Rendez-vous à 17h');

    act(() => retractInAppBanner('n1'));
    expect(inAppBannerStore.getState().current).toBeNull();
    expect(card()?.hidden ?? true).toBe(true);
    expect(card()?.getAttribute('aria-hidden') ?? 'true').toBe('true');

    act(() => offerInAppBanner(record('Rendez-vous à 18h'), location));
    expect(card()).toBe(before);
    expect(card()?.hidden).toBe(false);
    expect(body()).toBe('Rendez-vous à 18h');
  });

  test('son départ de 7 s ne repart pas à la réécriture', () => {
    jest.useFakeTimers();
    mountHost();
    act(() => offerInAppBanner(record('Rendez-vous à 17h'), location));
    act(() => void jest.advanceTimersByTime(5_000));

    act(() => retractInAppBanner('n1'));
    act(() => offerInAppBanner(record('Rendez-vous à 18h'), location));
    act(() => void jest.advanceTimersByTime(2_500));

    expect(inAppBannerStore.getState().current).toBeNull();
    expect(card()).toBeNull();
  });

  test('sans réécriture, la bannière retirée se démonte après le délai de grâce', () => {
    jest.useFakeTimers();
    mountHost();
    act(() => offerInAppBanner(record('Supprimé pour tous'), location));
    act(() => retractInAppBanner('n1'));
    expect(card()).not.toBeNull();

    act(() => void jest.advanceTimersByTime(WITHDRAWN_BANNER_GRACE_MS));

    expect(card()).toBeNull();
  });

  test('une AUTRE notification remplace la bannière retirée par un montage neuf', () => {
    mountHost();
    act(() => offerInAppBanner(record('Rendez-vous à 17h'), location));
    const before = card();
    act(() => retractInAppBanner('n1'));

    act(() => offerInAppBanner(record('Autre chose', 'n2'), location));

    expect(card()).not.toBe(before);
    expect(card()?.getAttribute('data-in-app-banner')).toBe('n2');
  });
});
