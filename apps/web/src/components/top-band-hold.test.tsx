import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { httpTransport } from '@/lib/api/client';
import type { Attachment } from '@/lib/api/types';
import { appQueryClient } from '@/lib/api/query-client';
import { gamePrefs } from '@/lib/game/preferences';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { audioCarryStore, carryAudio, dropCarriedAudio } from '@/lib/view/audio-carry';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { TopBand } from './top-band';

/**
 * LE BANDEAU NE SE VIDE JAMAIS (#9494) — quand un audio arrive, le chunk du
 * mini-lecteur se charge : la bannière du joueur RESTE à sa place (dans la
 * pile, pas en sortie) jusqu'à ce que le mini-lecteur soit prêt, puis elle
 * sort. Un fichier à part : le chunk ne se charge qu'une fois par processus, et
 * ce témoin doit être le premier à le demander.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadGameCatalog('fr');
  const cached = await loadEngagementProgress({ source: 'fixtures', transport: httpTransport });
  if (!cached.ok) throw new Error('progression de démonstration attendue');
  appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, cached.data);
});
afterEach(() => {
  unmountAll();
  dropCarriedAudio();
  gamePrefs.set({ hidden: false });
});
afterAll(async () => {
  appQueryClient.removeQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const voice = { ...attachmentDefaults, id: 'a-voice', messageId: 'm-voice', mimeType: 'audio/wav', fileUrl: 'https://cdn.meeshy.me/original.wav', duration: 8_000 } as Attachment;

describe('un audio arrive pendant que le mini-lecteur se charge', () => {
  test('la bannière reste dans la pile (pas en sortie) tant que le mini-lecteur n’est pas prêt, puis elle sort', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn />);
    for (let attempt = 0; attempt < 20 && host.querySelector('[data-player-banner]') === null; attempt += 1) await settle();
    expect(host.querySelector('[data-player-banner]')).not.toBeNull();

    act(() => carryAudio({ attachment: voice, trackUrl: 'https://cdn.meeshy.me/fr.wav', trackLanguage: 'fr', positionMs: 0, rate: 1, title: 'Kwame' }));
    expect(audioCarryStore.getState().carried).not.toBeNull();
    expect(host.querySelector('[data-player-slot]')?.getAttribute('data-player-slot')).toBe('shown');

    for (let attempt = 0; attempt < 40 && host.querySelector('[data-player-slot]') !== null; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }
    expect(host.querySelector('[data-player-slot]')).toBeNull();
    expect(host.querySelector('[data-top-bars]')?.getAttribute('data-top-band')).toBe('audio');
  });
});
