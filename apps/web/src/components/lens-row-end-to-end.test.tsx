import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ConversationFlags } from '@/lib/api/preferences';
import type { Conversation } from '@/lib/api/types';
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensRow, type LensRowProps } from './lens-row';

/**
 * **DEUX TÊTE-À-TÊTE AVEC LA MÊME PERSONNE, DISTINGUÉS PAR LE CADENAS**
 * (#12966) — le chiffré de bout en bout porte un cadenas après le nom, que le
 * lecteur d'écran entend ; celui que le serveur lit n'en porte pas, quel que
 * soit son dernier message.
 */
const PLAIN: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };
const LANGUAGES: readonly string[] = ['fr'];
const noop = () => {};
const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

const direct = (id: string, encryptionMode: string | null): Conversation =>
  ({
    id,
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    encryptionMode,
    participants: [
      {
        id: `p-${id}`,
        conversationId: id,
        userId: 'u-amina',
        displayName: 'Amina',
        type: 'user',
        role: 'member',
        language: 'fr',
        isActive: true,
        isOnline: false,
        joinedAt: new Date('2026-01-01'),
        user: { id: 'u-amina', username: 'amina' },
      },
    ],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    title: null,
    lastMessageAt: new Date('2026-10-14T09:00:00.000Z'),
  }) as unknown as Conversation;

const props = (conversation: Conversation): LensRowProps => ({ conversation, languages: LANGUAGES, viewerId: 'u-viewer', flags: PLAIN, unreadCount: 0, onRowAction: noop });
const row = (conversation: Conversation): string => renderToStaticMarkup(<LensRow {...props(conversation)} />);

beforeAll(async () => {
  await loadRowMenuCatalog('fr');
});

describe('le cadenas du tête-à-tête chiffré de bout en bout (#12966)', () => {
  test('servi e2ee : un cadenas nommé après le nom', () => {
    const html = row(direct('c-sealed', 'e2ee'));
    expect(html).toContain('data-end-to-end');
    expect(html).toContain('Chiffrée de bout en bout');
  });

  test('vu e2ee par ce compte puis servi sans mode : le cadenas reste', async () => {
    ensureHappyDomRegistered({ url: 'http://localhost/' });
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    endToEndRegimeLedger.getState().learnEndToEnd('c-seen');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<LensRow {...props(direct('c-seen', null))} />);
    });
    expect(container.querySelector('[data-end-to-end]')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
    endToEndRegimeLedger.getState().reset();
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  for (const mode of [null, 'server', 'hybrid']) test(`le tête-à-tête que le serveur lit (${String(mode)}) n’en porte pas`, () => {
    expect(row(direct('c-readable', mode))).not.toContain('data-end-to-end');
  });
});
