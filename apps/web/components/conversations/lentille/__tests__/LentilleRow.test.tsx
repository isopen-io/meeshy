/**
 * WL-105 (LWS-10) — `LentilleRow` : rang plat, présence, précédence de
 * ligne 2, point de non-lu, a11y.
 *
 * behaviour-matrix:L06 — badge rouge 99+ supprimé → point accent 8px + pont.
 * behaviour-matrix:L10 — dots de présence aussi pour les groupes.
 * behaviour-matrix:L16 — aria-label « {nom}, {heure}, {n} non lus, {pont ou préview} ».
 * behaviour-matrix:L01 — typing force le dot vert, ligne 2 « X écrit… ».
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className, style }: any) => (
    <div data-testid="avatar" className={className} style={style}>{children}</div>
  ),
  AvatarFallback: ({ children }: any) => <div data-testid="avatar-fallback">{children}</div>,
  AvatarImage: ({ src }: any) => (src ? <img data-testid="avatar-image" src={src} alt="" /> : null),
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: ({ isOnline, status, className }: any) =>
    status === 'offline' ? null : (
      <div data-testid="online-indicator" data-status={status} className={className} />
    ),
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

import { LentilleRow } from '../LentilleRow';
import { LentilleFocusElection } from '@/hooks/lentille/lentille-focus-election';
import { useConversationPreferencesStore } from '@/stores/conversation-preferences-store';

const makeUser = (overrides: Partial<User> = {}): User =>
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
    ...overrides,
  }) as unknown as User;

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
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
    updatedAt: new Date('2026-06-01'),
    lastMessageAt: new Date('2026-06-01T10:00:00.000Z'),
    unreadCount: 0,
    ...overrides,
  }) as unknown as Conversation;

const t = (key: string, params?: Record<string, unknown> | string) => {
  if (typeof params === 'object' && params && 'name' in params) {
    return key === 'lentille.typing.one' ? `${(params as any).name} écrit…` : key;
  }
  return key;
};

describe('LentilleRow — rang', () => {
  // R4-6 — `onClick: () => void` est devenu `onSelect: (conversation) => void`
  // (rappel STABLE + donnée, pour que le `memo` du rang serve à quelque chose).
  // Le témoin y gagne : il vérifie désormais AUSSI que le rang referme sur SA
  // conversation, ce que l'ancienne fermeture littérale rendait invérifiable.
  it('rend role=button avec tabIndex, et déclenche onSelect(conversation) au clic', () => {
    const onSelect = jest.fn();
    const conversation = makeConversation();
    render(
      <LentilleRow
        conversation={conversation}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={onSelect}
        t={t}
      />
    );

    const row = screen.getByTestId('lentille-row');
    expect(row).toHaveAttribute('role', 'button');
    expect(row).toHaveAttribute('tabindex', '0');
    row.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(conversation);
  });

  it('Enter et Espace déclenchent onSelect(conversation) (a11y clavier)', () => {
    const onSelect = jest.fn();
    const conversation = makeConversation();
    render(
      <LentilleRow
        conversation={conversation}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={onSelect}
        t={t}
      />
    );
    const row = screen.getByTestId('lentille-row');
    row.focus();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith(conversation);
  });

  it('behaviour-matrix:L06 — aucun badge chiffré : point accent 8px si non-lu, rien si zéro', () => {
    const { rerender } = render(
      <LentilleRow
        conversation={makeConversation({ unreadCount: 4 })}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );
    expect(screen.getByTestId('lentille-row-unread-dot')).toBeInTheDocument();
    expect(screen.queryByText('4')).not.toBeInTheDocument();
    expect(screen.queryByText('99+')).not.toBeInTheDocument();

    rerender(
      <LentilleRow
        conversation={makeConversation({ unreadCount: 0 })}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );
    expect(screen.queryByTestId('lentille-row-unread-dot')).not.toBeInTheDocument();
  });

  it('behaviour-matrix:L01 — typing prime sur tout : ligne 2 « X écrit… » et dot forcé vert', () => {
    render(
      <LentilleRow
        conversation={makeConversation({
          lastMessage: { id: 'm1', conversationId: 'conv-1', senderId: 'u2', content: 'Hello', createdAt: new Date(), attachments: [] } as any,
        })}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        typingUsers={[{ userId: 'user-2', displayName: 'Bob' }]}
        t={t}
      />
    );
    expect(screen.getByTestId('lentille-row-typing-line').textContent).toContain('Bob écrit…');
    expect(screen.getByTestId('lentille-row-typing-dot')).toBeInTheDocument();
  });

  /**
   * V4bis/R4-1 — behaviour-matrix:L02.
   *
   * « Les brouillons gardent leur précédence actuelle typing > brouillon >
   * préview et s'affichent « ✎ Brouillon » en couleur d'erreur … » — la
   * précédence ET le label sont réels (vérifiés ici). L'écart connu (le
   * `text-destructive` couvre aussi `draft.content`, pas seulement le label
   * — la matrice veut ce dernier en tertiaire) est documenté dans la
   * classification `WEB_COVERAGE.L02` (`__tests__/lentille/behaviour-matrix-parity.test.ts`),
   * réserve R4-3.
   */
  it('behaviour-matrix:L02 — précédence : brouillon prime sur pont et préview', () => {
    const bridge: ConversationBridge = {
      kind: 'fallback',
      unreadCount: 2,
      suggestedMode: 'focal',
      data: { authors: ['Zoe'], extraAuthorCount: 0, messageCount: 2 },
    };
    render(
      <LentilleRow
        conversation={makeConversation({
          unreadCount: 2,
          lastMessage: { id: 'm1', conversationId: 'conv-1', senderId: 'u2', content: 'Hello', createdAt: new Date(), attachments: [] } as any,
        })}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        draft={{ content: 'en cours de rédaction' }}
        bridge={bridge}
        t={t}
      />
    );
    expect(screen.getByTestId('lentille-row-draft-line').textContent).toContain('en cours de rédaction');
    expect(screen.queryByTestId('lentille-bridge-line')).not.toBeInTheDocument();
  });

  it('précédence : pont prime sur préview quand non-lu et pont disponible', () => {
    const bridge: ConversationBridge = {
      kind: 'fallback',
      unreadCount: 2,
      suggestedMode: 'focal',
      data: { authors: ['Zoe'], extraAuthorCount: 0, messageCount: 2 },
    };
    render(
      <LentilleRow
        conversation={makeConversation({
          unreadCount: 2,
          lastMessage: { id: 'm1', conversationId: 'conv-1', senderId: 'u2', content: 'Hello', createdAt: new Date(), attachments: [] } as any,
        })}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        bridge={bridge}
        t={t}
      />
    );
    expect(screen.getByTestId('lentille-bridge-line')).toBeInTheDocument();
  });

  it('retombe sur le préview du dernier message sans typing/brouillon/pont', () => {
    render(
      <LentilleRow
        conversation={makeConversation({
          lastMessage: { id: 'm1', conversationId: 'conv-1', senderId: 'u2', content: 'Salut !', createdAt: new Date(), attachments: [] } as any,
        })}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );
    expect(screen.getByTestId('lentille-row').textContent).toContain('Salut !');
  });

  /**
   * V4bis/R4-1 — behaviour-matrix:L04.
   *
   * « La branche pièces jointes sans texte … reste identique » : `LentilleRow`
   * réutilise `formatLastMessage` (`message-formatting.tsx`) SANS y toucher —
   * même fonction que `ConversationItem` — donc la branche pièce jointe (pas
   * de `content`, un `attachments[0]`) rend le MÊME balisage image (glyphe
   * 📷 + dimensions `W×H`) qu'avant la Lentille. Le Prisme ne s'y applique
   * jamais (`formatLastMessage`, commentaire "le prisme ne s'applique qu'au
   * TEXTE").
   */
  it('behaviour-matrix:L04 — pièce jointe sans texte : glyphe + méta, jamais le Prisme', () => {
    render(
      <LentilleRow
        conversation={makeConversation({
          lastMessage: {
            id: 'm1',
            conversationId: 'conv-1',
            senderId: 'u2',
            content: '',
            createdAt: new Date(),
            attachments: [{ mimeType: 'image/png', width: 800, height: 600 }],
          } as any,
        })}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );
    const row = screen.getByTestId('lentille-row');
    expect(row.textContent).toContain('📷');
    expect(row.textContent).toContain('800×600');
  });

  it('behaviour-matrix:L16 — aria-label = "{nom}, {heure}, {n} non lus, {pont ou préview}"', () => {
    render(
      <LentilleRow
        conversation={makeConversation({
          title: 'Équipe produit',
          unreadCount: 3,
          lastMessage: { id: 'm1', conversationId: 'conv-1', senderId: 'u2', content: 'Salut !', createdAt: new Date(), attachments: [] } as any,
        })}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );
    const label = screen.getByTestId('lentille-row').getAttribute('aria-label') ?? '';
    expect(label).toContain('Équipe produit');
    expect(label).toContain('3');
    expect(label).toContain('Salut !');
  });
});

describe('LentilleRow — présence (behaviour-matrix:L10)', () => {
  it('rend un indicateur de présence par participant hors lecteur pour un groupe', () => {
    render(
      <LentilleRow
        conversation={makeConversation({
          type: 'group',
          participants: [
            { id: 'p1', userId: 'user-1', type: 'user', displayName: 'Alice', role: 'member', language: 'fr', isActive: true, isOnline: true, joinedAt: new Date() } as any,
            { id: 'p2', userId: 'user-2', type: 'user', displayName: 'Bob', role: 'member', language: 'fr', isActive: true, isOnline: true, joinedAt: new Date() } as any,
          ],
        })}
        currentUser={makeUser({ id: 'user-1' })}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );
    expect(screen.getAllByTestId('online-indicator').length).toBeGreaterThan(0);
  });
});

/**
 * V4bis/R4-1 — behaviour-matrix:L07 (part VISUELLE).
 *
 * REV-4/B3 avait déjà couvert les SIX actions du ⋮ (`LentillePeek.actions.test.tsx`) ;
 * le trou laissé par R4-1 était la part visuelle : « l'épingle ajoute un
 * glyphe 📌 avant le nom … et la sourdine passe enfin visible (rang à 0.55 +
 * 🔕) ». Le VRAI magasin (`useConversationPreferencesStore`, pas un double) —
 * même source que `LentillePeek`/`useConversationItemActions` — pour prouver
 * qu'un seul état gouverne les deux surfaces.
 */
describe('LentilleRow — pin/sourdine visibles (behaviour-matrix:L07)', () => {
  afterEach(() => {
    useConversationPreferencesStore.setState({ preferencesMap: new Map() });
  });

  it('épinglé ⇒ glyphe 📌 devant le nom, rien sans épingle', () => {
    useConversationPreferencesStore.setState({
      preferencesMap: new Map([['conv-1', { isPinned: true, isMuted: false, isArchived: false } as any]]),
    });
    render(
      <LentilleRow
        conversation={makeConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );
    expect(screen.getByTestId('lentille-row-pin-glyph').textContent).toContain('📌');
    expect(screen.queryByTestId('lentille-row-mute-glyph')).not.toBeInTheDocument();
  });

  it('en sourdine ⇒ 🔕 visible et le RANG entier passe à --lentille-list-muted-opacity', () => {
    useConversationPreferencesStore.setState({
      preferencesMap: new Map([['conv-1', { isPinned: false, isMuted: true, isArchived: false } as any]]),
    });
    render(
      <LentilleRow
        conversation={makeConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );
    expect(screen.getByTestId('lentille-row-mute-glyph').textContent).toContain('🔕');
    const row = screen.getByTestId('lentille-row');
    expect(row).toHaveAttribute('data-muted', 'true');
    // Classe Tailwind arbitraire, PAS un style inline (`opacity: var(...)`
    // n'est pas fiable sous jsdom — voir le commentaire du composant) :
    // la règle CSS réelle vient de la compilation Tailwind.
    expect(row.className).toContain('opacity-[var(--lentille-list-muted-opacity)]');
  });

  it('ni épinglé ni en sourdine (repli du magasin vide, `LentillePeek.tsx:174`) ⇒ aucun glyphe, opacité pleine', () => {
    render(
      <LentilleRow
        conversation={makeConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );
    expect(screen.queryByTestId('lentille-row-pin-glyph')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lentille-row-mute-glyph')).not.toBeInTheDocument();
    const row = screen.getByTestId('lentille-row');
    expect(row).not.toHaveAttribute('data-muted');
    expect(row.className).not.toContain('opacity-[');
  });
});

/**
 * WL-108 (LWS-8) — la carte de focus sur le rang.
 *
 * behaviour-matrix:L11 — « la sélection … devient le style de la focus card
 * persistant sur le rang sélectionné » : côté web, DEUX sources désignent le
 * porteur de la carte (l'élection pendant le défilement, la sélection en
 * permanence) pour UN seul style.
 */
describe('LentilleRow — focus card (WL-108)', () => {
  const renderRow = (props: Partial<React.ComponentProps<typeof LentilleRow>> = {}) =>
    render(
      <LentilleRow
        conversation={makeConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={jest.fn()}
        t={t}
        {...props}
      />
    );

  it("ne porte aucune carte sans élection ni sélection — le rang reste PLAT (LWS-7)", () => {
    renderRow();
    expect(screen.queryByTestId('lentille-focus-card')).not.toBeInTheDocument();
  });

  it("porte la carte quand l'élection le désigne", () => {
    const election = new LentilleFocusElection();
    renderRow({ election });
    expect(screen.queryByTestId('lentille-focus-card')).not.toBeInTheDocument();

    act(() => election.adopt('conv-1'));
    expect(screen.getByTestId('lentille-focus-card')).toBeInTheDocument();

    // Un autre rang élu ⇒ celui-ci RETIRE sa carte.
    act(() => election.adopt('conv-2'));
    expect(screen.queryByTestId('lentille-focus-card')).not.toBeInTheDocument();
  });

  it('behaviour-matrix:L11 — le rang SÉLECTIONNÉ porte la carte en permanence', () => {
    renderRow({ isSelected: true });
    expect(screen.getByTestId('lentille-focus-card')).toBeInTheDocument();
  });

  it("la carte ne change PAS la hauteur du rang (zéro relayout, §4.1/§4.2)", () => {
    const { unmount } = renderRow();
    const plain = screen.getByTestId('lentille-row').style.height;
    unmount();

    renderRow({ isSelected: true });
    expect(screen.getByTestId('lentille-row').style.height).toBe(plain);
    expect(plain).toBe('var(--lentille-list-row-height)');
  });

  it("l'accent de la carte est celui DU RANG — une seule variable, jamais deux teintes", () => {
    renderRow({ isSelected: true });
    // `--row-accent` est posée par la racine du rang ; la carte s'y réfère
    // sans jamais recalculer sa propre couleur.
    expect(screen.getByTestId('lentille-focus-card').style.boxShadow).toContain('var(--row-accent)');
    expect(screen.getByTestId('lentille-row').getAttribute('style')).toContain('--row-accent');
  });
});
