import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { SharedLocation } from '@/lib/api/shared-locations';
import { loadCirclesCatalog, translateCircles } from '@/lib/i18n-circles-catalog';
import type { TalkiePressMode } from '@/lib/talkie/talkie-sender';
import type { HoldSchedule } from '@/lib/talkie/talkie-long-hold';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SharedLocationsMapView, type SharedLocationPerson, type SharedLocationsMapTalkie } from './shared-locations-map-view';

/**
 * **APPUI LONG SUR L'ÉPINGLE D'UN PROCHE OU D'UN SANG ⇒ TALKIE** (#19888, iso `TalkieLongHoldModifier` iOS #19885) —
 * un toucher garde son effet (la personne est choisie, sa fiche s'ouvre) ; seul un appui LONG ouvre la voix, qui part
 * tant que le doigt reste posé, et le relâcher ne choisit personne. Sous Proche, ou sur une carte qui ne tient pas de
 * talkie, l'appui long ne fait rien. Au clavier, Espace maintenu fait la même chose.
 */

const ADA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const VIEW = { center: { latitude: 48.85, longitude: 2.35 }, zoom: 12, width: 400, height: 600 };

const location = (overrides: Partial<SharedLocation> = {}): SharedLocation => ({
  userId: ADA,
  latitude: 48.85,
  longitude: 2.35,
  precision: 'exact',
  radiusMeters: 0,
  updatedAt: '2026-11-08T10:00:00.000Z',
  expiresAt: '2026-11-08T11:30:00.000Z',
  ...overrides,
});

const people = (): SharedLocationPerson => ({ name: 'Ada', initials: 'A', avatar: undefined, presence: undefined });

type Recorder = {
  readonly talkie: SharedLocationsMapTalkie;
  readonly pressed: Array<{ readonly userId: string; readonly mode: TalkiePressMode }>;
  readonly released: { count: number };
  readonly timers: { pending: Array<{ readonly fire: () => void; cancelled: boolean }> };
  readonly fire: () => void;
};

const recorder = (): Recorder => {
  const pressed: Array<{ readonly userId: string; readonly mode: TalkiePressMode }> = [];
  const released = { count: 0 };
  const timers: Recorder['timers'] = { pending: [] };
  const schedule: HoldSchedule = (fire) => {
    const timer = { fire, cancelled: false };
    timers.pending.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };
  return {
    talkie: { press: (userId, mode) => void pressed.push({ userId, mode }), release: () => void (released.count += 1), schedule },
    pressed,
    released,
    timers,
    fire: () => act(() => timers.pending.filter((timer) => !timer.cancelled).forEach((timer) => timer.fire())),
  };
};

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const unmounts: Array<() => void> = [];

const mapOf = ({ talkie, circle, selected }: { readonly talkie?: SharedLocationsMapTalkie; readonly circle?: SharedLocation['circle']; readonly selected: string[] }): HTMLElement => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <SharedLocationsMapView
        language="fr"
        locations={[location(circle === undefined ? {} : { circle })]}
        view={VIEW}
        personOf={people}
        formatTime={() => '11:30'}
        online
        status="ready"
        onRetry={() => undefined}
        onZoom={() => undefined}
        onPan={() => undefined}
        onSelect={(userId) => void selected.push(userId)}
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        {...(talkie === undefined ? {} : { talkie })}
      />,
    ),
  );
  unmounts.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
};

const buttonOf = (container: HTMLElement): HTMLButtonElement => {
  const button = container.querySelector<HTMLButtonElement>(`[data-shared-location-pin="${ADA}"] button`);
  if (button === null) throw new Error('aucune épingle');
  return button;
};

const pointer = (target: HTMLElement, type: 'pointerdown' | 'pointerup' | 'pointercancel'): void =>
  act(() => void target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1 })));
const click = (target: HTMLElement): void => act(() => void target.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const key = (target: HTMLElement, type: 'keydown' | 'keyup'): void => act(() => void target.dispatchEvent(new KeyboardEvent(type, { key: ' ', bubbles: true })));

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCirclesCatalog('fr');
});

afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

describe('appui long sur l’épingle d’un Proche ou d’un Sang ⇒ talkie (#19888)', () => {
  test('Proche : l’appui long ouvre la voix, le relâcher la ferme et ne choisit personne', () => {
    const talkie = recorder();
    const selected: string[] = [];
    const button = buttonOf(mapOf({ talkie: talkie.talkie, circle: 'CLOSE', selected }));
    pointer(button, 'pointerdown');
    expect(talkie.pressed).toEqual([]);
    talkie.fire();
    expect(talkie.pressed).toEqual([{ userId: ADA, mode: 'talkie' }]);
    pointer(button, 'pointerup');
    click(button);
    expect(talkie.released.count).toBe(1);
    expect(selected).toEqual([]);
  });

  test('Sang : un toucher bref choisit la personne, sans voix', () => {
    const talkie = recorder();
    const selected: string[] = [];
    const button = buttonOf(mapOf({ talkie: talkie.talkie, circle: 'BLOOD', selected }));
    pointer(button, 'pointerdown');
    pointer(button, 'pointerup');
    click(button);
    talkie.fire();
    expect(selected).toEqual([ADA]);
    expect(talkie.pressed).toEqual([]);
    expect(talkie.released.count).toBe(0);
  });

  test('un geste interrompu pendant la voix la ferme', () => {
    const talkie = recorder();
    const button = buttonOf(mapOf({ talkie: talkie.talkie, circle: 'CLOSE', selected: [] }));
    pointer(button, 'pointerdown');
    talkie.fire();
    pointer(button, 'pointercancel');
    expect(talkie.released.count).toBe(1);
  });

  test('l’épingle dit, au lecteur d’écran, qu’on peut maintenir pour parler', () => {
    const talkie = recorder();
    const button = buttonOf(mapOf({ talkie: talkie.talkie, circle: 'CLOSE', selected: [] }));
    expect(button.textContent).toContain(translateCircles('fr', 'talkie.send.hold.a11y', { name: 'Ada' }));
  });

  test('au clavier, Espace maintenu parle, et son relâcher ne choisit personne', () => {
    const talkie = recorder();
    const selected: string[] = [];
    const button = buttonOf(mapOf({ talkie: talkie.talkie, circle: 'BLOOD', selected }));
    key(button, 'keydown');
    talkie.fire();
    expect(talkie.pressed).toEqual([{ userId: ADA, mode: 'talkie' }]);
    key(button, 'keyup');
    click(button);
    expect(talkie.released.count).toBe(1);
    expect(selected).toEqual([]);
  });

  ([['Ami', 'FRIEND'], ['sans cercle servi', undefined]] as const).forEach(([title, circle]) =>
    test(`sous Proche (${title}), l’appui long ne fait rien et rien ne le propose`, () => {
    const talkie = recorder();
    const selected: string[] = [];
    const button = buttonOf(mapOf({ talkie: talkie.talkie, ...(circle === undefined ? {} : { circle }), selected }));
    pointer(button, 'pointerdown');
    talkie.fire();
    pointer(button, 'pointerup');
    click(button);
    expect(talkie.timers.pending).toEqual([]);
    expect(talkie.pressed).toEqual([]);
    expect(selected).toEqual([ADA]);
    expect(button.textContent).not.toContain(translateCircles('fr', 'talkie.send.hold.a11y', { name: 'Ada' }));
    }),
  );

  test('une personne refusée par le serveur ne se propose plus', () => {
    const talkie = recorder();
    const button = buttonOf(mapOf({ talkie: { ...talkie.talkie, offers: () => false }, circle: 'CLOSE', selected: [] }));
    pointer(button, 'pointerdown');
    expect(talkie.timers.pending).toEqual([]);
    expect(button.textContent).not.toContain(translateCircles('fr', 'talkie.send.hold.a11y', { name: 'Ada' }));
  });

  test('une carte sans talkie garde son toucher, d’un Proche comme d’un autre', () => {
    const selected: string[] = [];
    const button = buttonOf(mapOf({ circle: 'CLOSE', selected }));
    pointer(button, 'pointerdown');
    pointer(button, 'pointerup');
    click(button);
    expect(selected).toEqual([ADA]);
  });
});
