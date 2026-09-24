import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { VIEWER_ID } from '@/lib/api/fixtures-base';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ForwardSheet } from './forward-sheet';

/**
 * LA FEUILLE DE DESTINATAIRES (#5866) — CACHE-FIRST, principe non négociable
 * du dépôt : « jamais de spinner quand le cache a des conversations ».
 *
 * Le témoin le mesure sur le PREMIER rendu, AVANT tout tour de boucle
 * (`mount` sans `settle` suffirait à peindre un squelette si la feuille en
 * posait un) : c'est la seule fenêtre où un spinner peut apparaître.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const seedCache = (): void => {
  appQueryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: [
          {
            id: 'c-cible',
            type: 'group',
            title: 'Équipe déploiement',
            participants: [],
            status: 'active',
            visibility: 'private',
            isActive: true,
            createdAt: new Date('2026-09-01T09:00:00.000Z'),
            updatedAt: new Date('2026-09-01T09:00:00.000Z'),
          },
        ],
        pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
};

const mount = async (onPick: (id: string) => void = () => {}) =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <ForwardSheet viewerId={VIEWER_ID} onPick={onPick} onClose={() => {}} />
    </QueryClientProvider>,
  );

describe('ForwardSheet — cache-first, et un choix qui a un effet', () => {
  test('le cache CHAUD se peint sans aucun squelette', async () => {
    seedCache();
    const host = await mount();
    expect(host.querySelector('[data-forward-loading]')).toBe(null);
    expect(host.querySelector('[data-forward-target="c-cible"]')).not.toBe(null);
    expect(host.textContent).toContain('Équipe déploiement');
  });

  test('choisir une conversation REMET son identifiant (loi 4)', async () => {
    seedCache();
    const picked: string[] = [];
    const host = await mount((id) => picked.push(id));
    await mounter.click(host.querySelector('[data-forward-target="c-cible"]'));
    expect(picked).toEqual(['c-cible']);
  });

  test('la feuille NOMME son geste dans la langue d’interface', async () => {
    seedCache();
    const host = await mount();
    expect(host.textContent).toContain('Transférer à…');
  });
});
