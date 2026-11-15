import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { presenceStore } from '@/lib/api/presence-store';
import type { Participant } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { FaceRampEntry } from '@/lib/summary/types';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FaceRamp } from './face-ramp';

/**
 * LA PASTILLE D'UN VISAGE DE LA RAMPE EST VIVANTE (#11412) — l'assemblage la
 * figeait au montage du résumé : un pair qui partait restait vert, un pair qui
 * arrivait restait sans point. Le visage lit la carte vivante par son
 * identifiant, la charge REST sinon.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  const mounted = root;
  if (mounted !== null) act(() => mounted.unmount());
  container?.remove();
  root = null;
  container = null;
  act(() => presenceStore.getState().clear());
});

const entry = (participant: Participant | undefined): FaceRampEntry => ({
  id: 'u-amina',
  displayName: 'Amina',
  avatarUrl: null,
  colorHex: '#31B6BA',
  participant,
  awaitingCount: 1,
  needScore: 5,
  evidenceMessageIds: ['m1'],
});

const amina = (partial: Partial<Participant>): Participant =>
  ({
    id: 'p-amina',
    conversationId: 'c1',
    userId: 'u-amina',
    type: 'user',
    role: 'member',
    displayName: 'Amina',
    language: 'fr',
    isActive: true,
    joinedAt: new Date('2026-01-01'),
    ...partial,
  }) as Participant;

function monte(face: FaceRampEntry): void {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const mounted = createRoot(host);
  container = host;
  root = mounted;
  act(() => mounted.render(<FaceRamp entries={[face]} onTap={() => {}} />));
}

const pastille = (): string | null =>
  container?.querySelector('[data-face] [data-presence]')?.getAttribute('data-presence') ?? null;

describe('FaceRamp — la présence du visage (#11412)', () => {
  test('sans charge REST, la carte vivante allume le visage par son identifiant', () => {
    act(() => presenceStore.getState().put('u-amina', { isOnline: true, lastActiveAt: new Date().toISOString() }));

    monte(entry(undefined));

    expect(pastille()).toBe('online');
  });

  test('un user:status reçu après le montage repeint le visage', () => {
    monte(entry(amina({ isOnline: true, lastActiveAt: new Date() })));
    expect(pastille()).toBe('online');

    act(() =>
      presenceStore.getState().put('u-amina', { isOnline: false, lastActiveAt: new Date(Date.now() - 20 * 60_000).toISOString() }),
    );

    expect(pastille()).toBeNull();
  });
});
