/**
 * D-12 soldée (L14, `tasks/lentille-cloture-phase1.md` §3) — l'heure
 * relative du rang doit VIVRE.
 *
 * RE-PREUVE (avant correctif) : `LentilleRow.tsx:508` calcule `time` via
 * `formatConversationDate(conversation.lastMessage.createdAt, { t })` à
 * chaque rendu — la fonction elle-même relit bien `new Date()`
 * (`utils/date-format.ts:100`), donc rien n'y est figé. Ce qui EST figé :
 * `LentilleRow` est `memo()` (comparateur par défaut, `LentilleRow.tsx:332`)
 * et aucune prop ne change avec le temps qui passe — sans minuteur, le rang
 * ne se re-rend JAMAIS de lui-même, et `time` reste donc gelé à la valeur du
 * rendu de montage jusqu'au prochain événement métier (nouveau message,
 * sélection…). iOS a son `TimelineView(.periodic(by: 60))` ; le web n'avait
 * aucun équivalent — c'est l'écart L14 de la matrice, signalé par Q-140.
 *
 * Scénario RED-GREEN : montage à H = 2026-08-16T23:59:30.000Z (message
 * envoyé à l'instant, donc « aujourd'hui », libellé = heure nue "23:59").
 * On avance l'horloge de 61 s ⇒ H+61s = 2026-08-17T00:00:31.000Z : le
 * message est maintenant « hier » (`calendarDayDiff` bascule 0 → 1,
 * `packages/shared/utils/calendar-date.ts`) — le libellé DOIT devenir
 * « Hier 23:59 ». Sur le code d'AVANT ce correctif, le rang ne se re-rend
 * jamais tout seul : le libellé reste gelé sur "23:59", RED. Après
 * correctif (tick mutualisé 60 s, `useLentilleLiveTick`), le rang se
 * re-rend au tick suivant et le libellé change, GREEN.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';

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
  useI18n: () => ({ t: (key: string) => key, isLoading: false }),
}));

import { LentilleRow } from '../LentilleRow';

const makeUser = (): User =>
  ({
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    role: 'USER',
    systemLanguage: 'fr',
    isOnline: true,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }) as unknown as User;

// `t('yesterday', { time })` interpolé, pour distinguer sans ambiguïté le
// libellé « aujourd'hui » (heure nue) du libellé « hier » (préfixé).
const t = (key: string, params?: Record<string, unknown> | string) => {
  if (key === 'yesterday' && typeof params === 'object' && params) {
    return `Hier ${(params as any).time}`;
  }
  return key;
};

const H = new Date('2026-08-16T23:59:30.000Z');

const makeConversation = (): Conversation =>
  ({
    id: 'conv-1',
    type: 'group',
    title: 'Équipe produit',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: H,
    lastMessageAt: H,
    lastMessage: {
      id: 'm1',
      conversationId: 'conv-1',
      senderId: 'user-2',
      content: 'Salut !',
      createdAt: H,
      attachments: [],
    } as any,
    unreadCount: 0,
  }) as unknown as Conversation;

describe('LentilleRow — D-12, l’heure relative vit (tick mutualisé 60s)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(H);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('monté à H "aujourd’hui" (23:59:30 UTC), avancer de 61s fait basculer le libellé sur "Hier" (RED sur le code d’avant, GREEN après)', () => {
    render(
      <LentilleRow
        conversation={makeConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );

    const before = screen.getByTestId('lentille-row-time').textContent;
    expect(before).toBe('23:59');

    act(() => {
      jest.setSystemTime(new Date(H.getTime() + 61_000));
      jest.advanceTimersByTime(61_000);
    });

    const after = screen.getByTestId('lentille-row-time').textContent;
    expect(after).toBe('Hier 23:59');
    expect(after).not.toBe(before);
  });
});
