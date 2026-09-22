import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { Bubble } from './bubble';
import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * « LA COCHE OUVRE LA FICHE » (#7352, V4) — extrait de `bubble.test.tsx`,
 * déjà à 1046 lignes pour un budget de 1000-1200 (CLAUDE.md racine, § Code
 * Style) : y ajouter était interdit avant extraction, même patron que
 * `bubble-location.test.tsx`.
 *
 * `Check` (`message-blocks.tsx`) porte désormais un `onOpen?: () => void` —
 * `Bubble` le câble via son propre `onOpenDetail?: (messageId: string) =>
 * void`, réutilisant `messageMenu.setDetailFor` côté hôte (`thread.tsx`,
 * `use-message-menu.ts:61,285-286`) plutôt qu'une seconde machine d'état.
 *
 * SEUL `Bubble` (mode `bubbles`) reçoit ce câblage — PAS `FocalRow`
 * (modes `focal`/`script`, le DÉFAUT, D-7) : sa ligne méta est
 * `aria-hidden` INCONDITIONNEL depuis la revue #5935
 * (`focal-row.tsx:893-914`), et y poser un `<button>` focalisable sous cet
 * `aria-hidden` est l'anti-motif WCAG que cette même revue a fermé.
 * Décision consignée dans `V4.md` (§ 1) — dans `focal`/`script`, la fiche
 * reste atteignable par le chemin déjà mûr (appui long → « Plus… »,
 * 2 gestes).
 */

const BASE_MESSAGE: Message = {
  id: 'm-witness',
  conversationId: 'c-witness',
  senderId: 'u-viewer',
  content: 'Bonjour, comment vas-tu ?',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  maxViewOnceCount: 1,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 2,
  readCount: 2,
  recipientCount: 2,
  reactionCount: 0,
  isEncrypted: false,
  createdAt: new Date('2026-09-22T09:00:00.000Z'),
  updatedAt: new Date('2026-09-22T09:00:00.000Z'),
  timestamp: new Date('2026-09-22T09:00:00.000Z'),
  translations: [],
  sender: {
    id: 'p-viewer',
    conversationId: 'c-witness',
    userId: 'u-viewer',
    displayName: 'Moi',
    type: 'user',
    role: 'member',
    language: 'fr',
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
    },
    isActive: true,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    isOnline: false,
  },
};

const placeOf = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

describe('Bubble — la coche ouvre la fiche (#7352, V4)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let container: HTMLDivElement;
  let root: Root;
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mount = (onOpenDetail?: (messageId: string) => void): HTMLDivElement => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <Bubble
          place={placeOf(BASE_MESSAGE)}
          languages={['fr', 'en']}
          isGrouped
          viewerId="u-viewer"
          onJumpToMessage={() => {}}
          {...(onOpenDetail === undefined ? {} : { onOpenDetail })}
        />,
      );
    });
    return container;
  };

  test('taper la coche d’un message MIEN, `onOpenDetail` fourni ⇒ appelé avec `message.id`', () => {
    const seen: string[] = [];
    const el = mount((messageId) => seen.push(messageId));
    const button = el.querySelector('button[aria-label="Voir les détails du message"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    act(() => {
      button.click();
    });
    expect(seen).toEqual(['m-witness']);
  });

  test('SANS `onOpenDetail`, la coche reste un glyphe INERTE — aucun bouton (comportement inchangé)', () => {
    const el = mount();
    expect(el.querySelector('button[aria-label="Voir les détails du message"]')).toBeNull();
    expect(el.querySelector('svg[role="img"]')).not.toBeNull();
  });
});
