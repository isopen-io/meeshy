import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { APPEARANCE_GAMUT } from '@meeshy/shared/utils/appearance-gamut';

import type { Conversation } from '@/lib/api/types';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensRow } from './lens-row';

/** **UN BASCULEMENT DE SCHÉMA RECALCULE L'ACCENT PERSONNEL DE LA LIGNE** (#10663). */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounter = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadRowMenuCatalog('fr');
});
afterEach(() => mounter.unmountAll());
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const conversation = {
  id: 'c-flip',
  type: 'group',
  status: 'active',
  visibility: 'private',
  isActive: true,
  memberCount: 2,
  participants: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  unreadCount: 0,
  title: 'Équipe',
  lastMessageAt: new Date('2026-10-14T09:00:00.000Z'),
  userPreferences: [{ appearance: { v: 1, background: { kind: 'signature' }, accent: 'corail', animate: true } }],
} as unknown as Conversation;

const flip = async (scheme: 'light' | 'dark') => {
  await act(async () => {
    document.documentElement.classList.toggle('light', scheme === 'light');
    document.documentElement.classList.toggle('dark', scheme === 'dark');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
};

describe('accent personnel × basculement clair/sombre', () => {
  test('la ligne déjà montée prend l’accent du nouveau schéma sans autre rendu de son hôte', async () => {
    await flip('dark');
    const host = await mounter.mount(
      <LensRow conversation={conversation} languages={['fr']} viewerId="u-viewer" flags={{ isPinned: false, isMuted: false, isArchived: false }} unreadCount={0} onRowAction={() => {}} />,
    );
    expect(host.innerHTML.toUpperCase()).toContain(APPEARANCE_GAMUT.corail.dark.accent.toUpperCase());
    await flip('light');
    expect(host.innerHTML.toUpperCase()).toContain(APPEARANCE_GAMUT.corail.light.accent.toUpperCase());
    await flip('dark');
  });
});
