/**
 * REV-5/B1 — le témoin qui manquait : PAYLOAD WIRE RÉEL (forme exacte de
 * `GET /conversations`, cf. `services/gateway/src/__tests__/routes/
 * conversations.bridge.test.ts` et `packages/shared/types/
 * api-schemas.ts:1307-1344`) jusqu'AU RANG RENDU (`LentilleRow` affiche la
 * ligne de pont, `data-testid="lentille-bridge-line"`).
 *
 * Attrape les trois maillons cassés du verdict REV-5 EN SÉRIE, dans l'ordre
 * où le payload les traverse :
 *
 *   1. `transformConversationData` (`transformers.service.ts`) — RÉEL, pas
 *      mocké : c'est lui qu'on accuse de jeter `bridge`/`lastReadAt`.
 *   2. Le type `Conversation` web (`packages/shared/types/conversation.ts`)
 *      et le `resolveRowBridge` de `LentilleConversationListMount.tsx` —
 *      RÉELS eux aussi (ni la fonction interne ni `LentilleRow` ne sont
 *      mockés ici, à la différence de `LentilleConversationListMount.
 *      test.tsx` qui isole l'orchestration). `useLentilleBridges` est
 *      mocké à une Map VIDE : si le rang affiche quand même le pont, c'est
 *      que `conversation.bridge` — le fil serveur — a gagné, jamais le
 *      substitut local.
 *   3. Pas exercé ICI (transport socket, pas REST) — voir le describe
 *      dédié dans `use-socket-cache-sync.test.ts` (« le pont ✦ voyage sur
 *      `conversation:unread-updated` »).
 *
 * RED sur le code d'avant ce lot (maillon 1 : le transformeur ne copie ni
 * `bridge` ni `lastReadAt`) → GREEN une fois les trois correctifs en place.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { SocketIOUser as User } from '@meeshy/shared/types';

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className, style }: any) => (
    <div data-testid="avatar" className={className} style={style}>{children}</div>
  ),
  AvatarFallback: ({ children }: any) => <div data-testid="avatar-fallback">{children}</div>,
  AvatarImage: ({ src }: any) => (src ? <img data-testid="avatar-image" src={src} alt="" /> : null),
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: () => null,
}));

jest.mock('@/stores/user-store', () => ({
  useUserById: jest.fn(() => null),
  useUserStatusTick: jest.fn(),
}));

jest.mock('@/hooks/use-resolved-theme', () => ({
  useResolvedTheme: () => 'light',
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'lentille.bridge.authorsOne') return String((params as any)?.name ?? '');
      if (key === 'lentille.bridge.messagesOne') return `${(params as any)?.count} message`;
      return key;
    },
    isLoading: false,
  }),
}));

jest.mock('@/hooks/lentille/use-lentille-list-typing', () => ({
  useLentilleListTyping: () => new Map(),
}));

// Map VIDE, délibérément : si le rang affiche le pont quand même, c'est que
// `conversation.bridge` (le fil) a gagné sur ce repli local — jamais
// l'inverse.
jest.mock('@/hooks/lentille/use-lentille-bridges', () => ({
  useLentilleBridges: () => new Map(),
}));

jest.mock('@/stores/conversation-ui-store', () => ({
  useConversationUIStore: (selector: any) => selector({ draftMessages: {} }),
}));

import { LentilleConversationListMount } from '@/components/conversations/lentille/LentilleConversationListMount';
import { transformersService } from '@/services/conversations/transformers.service';

const makeUser = (): User =>
  ({ id: 'user-1', username: 'moi', displayName: 'Moi', email: 'moi@a.com', role: 'USER' } as unknown as User);

const t = (key: string) => key;

describe('REV-5/B1 — le pont ✦ du payload wire au rang liste', () => {
  it('un payload REST réel (bridge + lastReadAt) atteint la ligne de pont rendue par LentilleRow', () => {
    const nowISO = new Date().toISOString();

    // Forme EXACTE de `GET /conversations` — mêmes champs que
    // `conversations.bridge.test.ts` (gateway) sur `bridge`/`lastReadAt`,
    // mêmes noms que `api-schemas.ts:1307-1344`.
    const wireConversation = {
      id: 'conv-wire-1',
      identifier: 'conv-wire-1',
      type: 'group',
      title: 'Équipe produit',
      isActive: true,
      isArchived: false,
      memberCount: 2,
      _count: { participants: 2 },
      lastMessageAt: nowISO,
      createdAt: nowISO,
      updatedAt: nowISO,
      participants: [
        {
          id: 'participant-me',
          userId: 'user-1',
          user: { id: 'user-1', username: 'moi', displayName: 'Moi', isOnline: true },
        },
        {
          id: 'participant-alice',
          userId: 'user-2',
          user: { id: 'user-2', username: 'alice', displayName: 'Alice', isOnline: true },
        },
      ],
      lastMessage: {
        id: 'm1',
        conversationId: 'conv-wire-1',
        senderId: 'user-2',
        content: 'Cette préview ne doit JAMAIS apparaître : le pont prime',
        createdAt: nowISO,
        attachments: [],
      },
      unreadCount: 1,
      userPreferences: [],
      // Le pont ✦ — ABSENT tant que `unreadCount === 0`, jamais `null`
      // (contrat gelé §3.2, re-prouvé par `conversations.bridge.test.ts`).
      bridge: {
        kind: 'fallback',
        unreadCount: 1,
        suggestedMode: 'focal',
        data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 1 },
      },
      // Horloge du curseur de lecture — voyage À CÔTÉ du pont.
      lastReadAt: '2026-08-09T12:00:00.000Z',
    };

    // Maillon 1 : le VRAI transformeur, pas un objet construit à la main.
    const conversation = transformersService.transformConversationData(wireConversation);

    // Preuve directe que le maillon 1 est refermé : le transformeur copie
    // bien `bridge`/`lastReadAt`, jamais implicite dans le rendu ci-dessous.
    expect(conversation.bridge).toEqual(wireConversation.bridge);
    expect(conversation.lastReadAt).toEqual(new Date(wireConversation.lastReadAt));

    // Maillon 2 : `LentilleConversationListMount` RÉEL (son `resolveRowBridge`
    // interne, non exporté, tourne tel quel) et `LentilleRow` RÉEL (pas
    // mocké) — le rang qui rend effectivement la ligne de pont.
    render(
      <LentilleConversationListMount
        currentUserId="user-1"
        currentUser={makeUser()}
        conversations={[conversation]}
        selectedConversationId={null}
        onSelectConversation={() => {}}
        preferencesMap={new Map()}
        categories={[]}
        isLoading={false}
        t={t}
      />
    );

    // LE RANG : la ligne de pont, avec la phrase composée depuis le
    // `bridge.data` qui a survécu au transport (auteur + décompte).
    const bridgeLine = screen.getByTestId('lentille-bridge-line');
    expect(bridgeLine).toBeInTheDocument();
    expect(bridgeLine.textContent).toContain('Alice');
    expect(bridgeLine.textContent).toContain('1 message');

    // La préview du dernier message — ce que le pont REMPLACE — ne doit
    // JAMAIS apparaître pendant qu'un pont non-lu est affiché (précédence
    // LWS-10 : typing > brouillon > pont > préview).
    expect(screen.queryByText(/ne doit JAMAIS apparaître/)).not.toBeInTheDocument();
  });
});
