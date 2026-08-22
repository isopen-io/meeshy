/**
 * Fidélité Lentille — la LIGNE 1 du rang, telle que la maquette normative la
 * cote : `docs/design/2026-08-15-conversation-list-lentille.html`.
 *
 * Trois écarts relevés sur cette ligne (re-preuves du 2026-08-17, avant ce
 * lot), tous trois déjà bâtis côté iOS
 * (`apps/ios/Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift`,
 * `headerLine` / `tagPastilles`) :
 *
 *  1. **Grammaire « Nom · heure ».** §3 de la maquette (figure cotée) :
 *     « nom 15 extrabold · POINT MÉDIAN · heure 12 » ; rendu de la maquette,
 *     `rowHtml` : `<span class="nm">…</span>…<span class="mid">·</span>
 *     <span class="tm">…</span>` dans un `.l1{display:flex;
 *     align-items:baseline}`. Le web posait `justify-between` : l'heure
 *     partait au BORD DROIT du rang, sans point médian — une autre grammaire,
 *     celle du rang historique (`ConversationItem`), pas celle de la Lentille.
 *  2. **Émoji favori après le nom** (`userState.reaction`, maquette §3 « tags
 *     et émoji favori vivent après le nom », rendu `.fav`) : absent du web,
 *     alors que la MÊME donnée est déjà lue par le rang
 *     (`useConversationPreference(…).reaction`, magasin partagé avec le ⋮).
 *  3. **behaviour-matrix:L08, part tags** — « les tags utilisateur deviennent
 *     au plus 3 pastilles de 6 px après le nom ». Réserve REV-4/R4-2 (« L08
 *     tags non implémentés (TOKENS MORTS) », workshop §8 ligne V4) : les
 *     tokens `list.tags.{size,maxCount,emojiSize}` vivaient côté iOS
 *     (`LentilleMetrics.Tags`) et étaient morts côté web. SOLDÉE par ce lot.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <div data-testid="avatar">{children}</div>,
  AvatarFallback: ({ children }: any) => <div>{children}</div>,
  AvatarImage: () => null,
}));

jest.mock('@/components/ui/online-indicator', () => ({ OnlineIndicator: () => null }));

jest.mock('@/stores/user-store', () => ({
  useUserById: jest.fn(() => null),
  useUserStatusTick: jest.fn(),
}));

jest.mock('@/hooks/use-resolved-theme', () => ({ useResolvedTheme: () => 'light' }));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, isLoading: false }),
}));

import { LentilleRow } from '../LentilleRow';
import { LENTILLE_LIST_TAGS_MAX_COUNT } from '../LentilleRow';
import { useConversationPreferencesStore } from '@/stores/conversation-preferences-store';

const t = (key: string) => key;

const makeUser = (): User =>
  ({
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    systemLanguage: 'fr',
    isOnline: true,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }) as unknown as User;

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'conv-1',
    type: 'group',
    title: 'Week-end Ardèche',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
    unreadCount: 0,
    lastMessage: {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: 'user-2',
      content: 'Météo de samedi',
      originalLanguage: 'fr',
      createdAt: new Date('2026-06-01T14:32:00.000Z'),
    },
    ...overrides,
  }) as unknown as Conversation;

function renderRow(conversation = makeConversation()) {
  return render(
    <LentilleRow
      conversation={conversation}
      currentUser={makeUser()}
      isSelected={false}
      onSelect={() => {}}
      t={t}
    />
  );
}

/** `a` précède-t-il `b` dans l'ordre du document ? */
function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

afterEach(() => {
  useConversationPreferencesStore.setState({ preferencesMap: new Map() });
});

describe('LentilleRow — la date a quitté la ligne 1 (retour produit 2026-08-22)', () => {
  // « Juste mettre l'auteur : message, et puis en bas sur une nouvelle ligne à
  // droite mettre la date. » La grammaire « Nom · heure » de la maquette §3 est
  // SUPERSÉDÉE : le point médian disparaît avec elle, et l'heure descend d'une
  // ligne. Parité iOS : `LentilleConversationRow.dateLine`.
  it('ne rend plus de point médian sur la ligne du nom', () => {
    renderRow();

    expect(screen.queryByTestId('lentille-row-time-separator')).not.toBeInTheDocument();
  });

  it('rend l’heure SOUS la ligne 2, poussée au bord droit', () => {
    renderRow();

    const line1 = screen.getByTestId('lentille-row-line1');
    const line2 = screen.getByTestId('lentille-row-line2');
    const dateLine = screen.getByTestId('lentille-row-date-line');
    const time = screen.getByTestId('lentille-row-time');

    expect(precedes(line1, dateLine)).toBe(true);
    expect(precedes(line2, dateLine)).toBe(true);
    expect(dateLine).toContainElement(time);
    expect(dateLine.className).toContain('justify-end');
  });

  it('sans dernier message : ni heure ni ligne de date (jamais une ligne vide)', () => {
    renderRow(makeConversation({ lastMessage: undefined }));

    expect(screen.queryByTestId('lentille-row-time')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lentille-row-date-line')).not.toBeInTheDocument();
  });
});

describe('LentilleRow — émoji favori après le nom (maquette §3 `.fav`)', () => {
  it('rend `userState.reaction` après le nom, à la taille du token emojiSize', () => {
    useConversationPreferencesStore.setState({
      preferencesMap: new Map([
        ['conv-1', { isPinned: false, isMuted: false, isArchived: false, reaction: '🔥', tags: [] } as any],
      ]),
    });
    renderRow();

    const favorite = screen.getByTestId('lentille-row-favorite');
    expect(favorite).toHaveTextContent('🔥');
    expect(favorite).toHaveStyle({ fontSize: 'var(--lentille-list-tags-emoji-size)' });
    expect(precedes(screen.getByTestId('lentille-row-name'), favorite)).toBe(true);
  });

  it('aucune réaction ⇒ aucun émoji (jamais une pastille vide)', () => {
    renderRow();
    expect(screen.queryByTestId('lentille-row-favorite')).not.toBeInTheDocument();
  });
});

describe('LentilleRow — pastilles de tags (behaviour-matrix:L08, réserve R4-2)', () => {
  it('rend au plus `maxCount` pastilles à la cote du token, après le nom', () => {
    useConversationPreferencesStore.setState({
      preferencesMap: new Map([
        [
          'conv-1',
          {
            isPinned: false,
            isMuted: false,
            isArchived: false,
            tags: ['travail', 'perso', 'urgent', 'archive', 'idées'],
          } as any,
        ],
      ]),
    });
    renderRow();

    const dots = screen.getAllByTestId('lentille-row-tag-dot');
    expect(dots).toHaveLength(LENTILLE_LIST_TAGS_MAX_COUNT);
    for (const dot of dots) {
      expect(dot).toHaveStyle({
        width: 'var(--lentille-list-tags-size)',
        height: 'var(--lentille-list-tags-size)',
      });
    }
    expect(precedes(screen.getByTestId('lentille-row-name'), dots[0])).toBe(true);
  });

  it('deux tags ⇒ deux pastilles (le plafond ne fabrique jamais de pastille)', () => {
    useConversationPreferencesStore.setState({
      preferencesMap: new Map([
        ['conv-1', { isPinned: false, isMuted: false, isArchived: false, tags: ['travail', 'perso'] } as any],
      ]),
    });
    renderRow();
    expect(screen.getAllByTestId('lentille-row-tag-dot')).toHaveLength(2);
  });

  it('deux tags DIFFÉRENTS ⇒ deux teintes différentes, par le MÊME hachage que le rang historique', () => {
    useConversationPreferencesStore.setState({
      preferencesMap: new Map([
        ['conv-1', { isPinned: false, isMuted: false, isArchived: false, tags: ['travail', 'perso'] } as any],
      ]),
    });
    renderRow();

    const [first, second] = screen.getAllByTestId('lentille-row-tag-dot');
    expect(first.className).not.toBe(second.className);
  });

  it('aucun tag ⇒ aucune pastille, aucun conteneur', () => {
    renderRow();
    expect(screen.queryByTestId('lentille-row-tag-dot')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lentille-row-tag-dots')).not.toBeInTheDocument();
  });
});
