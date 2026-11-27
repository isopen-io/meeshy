import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { SharedLocation } from '@/lib/api/shared-locations';
import { receiveBatteryState } from '@/lib/battery/battery-live';
import { loadBatteryCatalog } from '@/lib/i18n-battery-catalog';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { loadInactivityCatalog } from '@/lib/i18n-inactivity-catalog';
import { loadPhoneCallCatalog } from '@/lib/i18n-phone-call-catalog';
import { loadPhoneReachabilityCatalog } from '@/lib/i18n-phone-reachability-catalog';
import { receiveInactivityState } from '@/lib/inactivity/inactivity-live';
import { listeningStore } from '@/lib/now-playing/listening-live';
import { receivePhoneCallState } from '@/lib/phone-call/phone-call-live';
import { receivePhoneReachabilityState } from '@/lib/phone-reachability/phone-reachability-live';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SharedLocationsMapView, type SharedLocationPerson } from './shared-locations-map-view';

/**
 * **CHAQUE ÉPINGLE DIT CE QUE VIT LA PERSONNE** (#19888, iso `PeerLiveOverlays` sur la carte iOS #19885) — ce
 * qu'elle écoute, sa batterie, son téléphone injoignable, « En appel » et l'alerte d'inactivité, posés sur son
 * épingle TELS QUE LE SERVEUR LES A SERVIS à ce lecteur, et entendus par le lecteur d'écran dans le nom de
 * l'épingle. Rien n'est servi : l'épingle reste celle d'avant. La vie d'une personne ne passe jamais sur
 * l'épingle d'une autre.
 */

const ADA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const VIEW = { center: { latitude: 48.85, longitude: 2.35 }, zoom: 12, width: 400, height: 600 };

const location = (userId: string, overrides: Partial<SharedLocation> = {}): SharedLocation => ({
  userId,
  latitude: 48.85,
  longitude: 2.35,
  precision: 'exact',
  radiusMeters: 0,
  updatedAt: '2026-11-08T10:00:00.000Z',
  expiresAt: '2026-11-08T11:30:00.000Z',
  ...overrides,
});

const people = (id: string): SharedLocationPerson => ({
  name: id === ADA ? 'Ada' : 'Bob',
  initials: id === ADA ? 'A' : 'B',
  avatar: undefined,
  presence: undefined,
});

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const freshClient = (): QueryClient => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const mapOf = ({ client, locations = [location(ADA)] }: { readonly client: QueryClient; readonly locations?: readonly SharedLocation[] }): HTMLElement => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <SharedLocationsMapView
        language="fr"
        locations={locations}
        view={VIEW}
        personOf={people}
        formatTime={() => '11:30'}
        online
        status="ready"
        onRetry={() => undefined}
        onZoom={() => undefined}
        onPan={() => undefined}
        onSelect={() => undefined}
        client={client}
      />,
    ),
  );
  unmounts.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
};

const unmounts: Array<() => void> = [];

const pinOf = (container: HTMLElement, userId: string): HTMLElement => {
  const pin = container.querySelector<HTMLElement>(`[data-shared-location-pin="${userId}"]`);
  if (pin === null) throw new Error(`aucune épingle pour ${userId}`);
  return pin;
};

const labelOf = (pin: HTMLElement): string => pin.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '';

const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();
const minutesAhead = (minutes: number): string => new Date(Date.now() + minutes * 60_000).toISOString();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadCirclesCatalog('fr'), loadBatteryCatalog('fr'), loadPhoneCallCatalog('fr'), loadInactivityCatalog('fr'), loadPhoneReachabilityCatalog('fr')]);
});

afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
  listeningStore.getState().clear(ADA);
  listeningStore.getState().clear(BOB);
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

describe('l’épingle d’une personne porte ce qu’elle vit, tel que servi (#19888)', () => {
  test('rien de servi : l’épingle reste celle d’avant, sans vie ni phrase de plus', () => {
    const pin = pinOf(mapOf({ client: freshClient() }), ADA);
    expect(labelOf(pin)).toBe('Ada · position exacte · jusqu’à 11:30');
    expect(pin.querySelector('[data-listening-band]')).toBeNull();
    expect(pin.querySelector('[data-avatar-battery]')).toBeNull();
    expect(pin.querySelector('[data-pin-life]')).toBeNull();
  });

  test('ce qu’elle écoute défile sur son épingle, au détail servi, et s’entend dans son nom', () => {
    listeningStore.getState().receive({ userId: ADA, category: 'music', title: 'Clair de lune', source: 'Spotify', updatedAt: new Date().toISOString(), expiresAt: minutesAhead(1) });
    const pin = pinOf(mapOf({ client: freshClient() }), ADA);
    expect(pin.querySelector('[data-listening-band]')?.textContent).toContain('Clair de lune · Spotify');
    expect(labelOf(pin)).toContain('Clair de lune · Spotify');
  });

  test('sa batterie basse se voit sur l’avatar et s’entend', () => {
    const client = freshClient();
    receiveBatteryState(client, { userId: ADA, phase: 'low', level: 12, charging: false, lowPower: false, measuredAt: new Date().toISOString() }, Date.now());
    const pin = pinOf(mapOf({ client }), ADA);
    expect(pin.querySelector('[data-avatar-battery]')).not.toBeNull();
    expect(labelOf(pin)).toContain('batterie à 12 %');
  });

  test('son téléphone injoignable prime sur la batterie, comme sur l’avatar de l’en-tête', () => {
    const client = freshClient();
    receiveBatteryState(client, { userId: ADA, phase: 'low', level: 12, charging: false, lowPower: false, measuredAt: new Date().toISOString() }, Date.now());
    receivePhoneReachabilityState(client, { userId: ADA, unreachableSince: minutesAgo(30), cause: 'unknown' }, Date.now());
    const pin = pinOf(mapOf({ client }), ADA);
    expect(pin.querySelector('[data-avatar-phone-unreachable]')).not.toBeNull();
    expect(pin.querySelector('[data-avatar-battery]')).toBeNull();
    expect(labelOf(pin)).not.toContain('batterie');
  });

  test('« En appel » se pose sur l’épingle et se dit depuis quand, jamais avec qui', () => {
    const client = freshClient();
    receivePhoneCallState(client, { userId: ADA, since: minutesAgo(12), expiresAt: minutesAhead(60) }, Date.now());
    const pin = pinOf(mapOf({ client }), ADA);
    expect(pin.querySelector('[data-pin-life="call"]')).not.toBeNull();
    expect(labelOf(pin)).toContain('12 min');
  });

  test('l’alerte d’inactivité se pose sur l’épingle et se dit', () => {
    const client = freshClient();
    receiveInactivityState(client, { userId: ADA, inactiveSince: minutesAgo(600), alertedAt: minutesAgo(5) }, Date.now());
    const pin = pinOf(mapOf({ client }), ADA);
    expect(pin.querySelector('[data-pin-life="inactivity"]')).not.toBeNull();
    expect(labelOf(pin)).toMatch(/activité/i);
  });

  test('la vie d’une personne ne passe jamais sur l’épingle d’une autre', () => {
    const client = freshClient();
    receivePhoneCallState(client, { userId: ADA, since: minutesAgo(12), expiresAt: minutesAhead(60) }, Date.now());
    listeningStore.getState().receive({ userId: ADA, category: 'music', updatedAt: new Date().toISOString(), expiresAt: minutesAhead(1) });
    const map = mapOf({ client, locations: [location(ADA), location(BOB, { latitude: 48.9, longitude: 2.4 })] });
    const bob = pinOf(map, BOB);
    expect(bob.querySelector('[data-pin-life]')).toBeNull();
    expect(bob.querySelector('[data-listening-band]')).toBeNull();
    expect(labelOf(bob)).toBe('Bob · position exacte · jusqu’à 11:30');
  });
});

describe('la liste dit la même chose que l’épingle (#20658)', () => {
  const rowOf = (container: HTMLElement, userId: string): string => container.querySelector(`[data-shared-location-row="${userId}"]`)?.textContent ?? '';

  test('la ligne d’une personne dit ce qu’elle vit, comme le nom de son épingle', () => {
    const client = freshClient();
    receivePhoneCallState(client, { userId: ADA, since: minutesAgo(12), expiresAt: minutesAhead(60) }, Date.now());
    listeningStore.getState().receive({ userId: ADA, category: 'music', title: 'Clair de lune', updatedAt: new Date().toISOString(), expiresAt: minutesAhead(1) });
    const map = mapOf({ client });
    expect(rowOf(map, ADA)).toBe(labelOf(pinOf(map, ADA)));
    expect(rowOf(map, ADA)).toContain('Clair de lune');
  });

  test('une personne hors de l’emprise garde sa vie dans la liste, et une autre n’en reçoit rien', () => {
    const client = freshClient();
    receivePhoneCallState(client, { userId: ADA, since: minutesAgo(12), expiresAt: minutesAhead(60) }, Date.now());
    const map = mapOf({ client, locations: [location(ADA, { latitude: -33.9, longitude: 151.2 }), location(BOB, { latitude: 48.9, longitude: 2.4 })] });
    expect(rowOf(map, ADA)).toContain('12 min');
    expect(rowOf(map, BOB)).toBe('Bob · position exacte · jusqu’à 11:30');
  });
});
