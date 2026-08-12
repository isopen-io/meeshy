/**
 * Iter 70w — a11y clavier (WCAG 2.1.1 / 4.1.2) du cluster « sidebar de détails
 * de conversation ». Avant : plusieurs affordances « cliquer pour éditer »
 * étaient souris-only (`<div onClick>` ou `<Avatar onClick>` sans `role`,
 * `tabIndex`, `onKeyDown`, ni focus visible) — aucun chemin clavier vers
 * l'édition du nom personnalisé, de la réaction ou de l'image de conversation.
 * Après :
 *  - `DetailsHeader` : l'avatar éditable est un `<button>` natif nommé, focusable
 *    et activable au clavier ;
 *  - `CustomizationManager` : les deux cartes (nom personnalisé, réaction) sont
 *    `role="button"` focusables et activables Enter/Espace ;
 *  - `DescriptionSection` : le bouton d'édition masqué devient visible au focus
 *    clavier (`focus-visible:opacity-100`).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DetailsHeader } from '@/components/conversations/details-sidebar/DetailsHeader';
import { DescriptionSection } from '@/components/conversations/details-sidebar/DescriptionSection';
import { CustomizationManager } from '@/components/conversations/details-sidebar/CustomizationManager';
import type { Conversation, User } from '@meeshy/shared/types';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        'conversationDetails.changeImage': 'Change image',
        'conversationDetails.editCustomName': 'Edit custom name',
        'conversationDetails.editReaction': 'Edit reaction',
        'conversationDetails.editName': 'Edit name',
        'conversationDetails.editDescription': 'Edit description',
        'conversationDetails.clickToEdit': 'Click to edit',
        'conversationDetails.customNamePlaceholder': 'Enter a custom name...',
        'conversationDetails.reactionPlaceholder': '😀',
      };
      return translations[key] ?? fallback ?? key;
    },
  }),
}));

const getPreferences = jest.fn();
const upsertPreferences = jest.fn();
jest.mock('@/services/user-preferences.service', () => ({
  userPreferencesService: {
    getPreferences: (...args: unknown[]) => getPreferences(...args),
    upsertPreferences: (...args: unknown[]) => upsertPreferences(...args),
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const buildUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u1',
    username: 'alice',
    firstName: 'Alice',
    lastName: 'A',
    email: 'a@b.c',
    role: 'USER',
    isOnline: true,
    type: 'user',
    ...overrides,
  } as unknown as User);

const buildConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c1',
    type: 'group',
    name: 'Team',
    ...overrides,
  } as unknown as Conversation);

const buildHeaderProps = (overrides = {}) => ({
  conversation: buildConversation(),
  currentUser: buildUser(),
  canModifyImage: true,
  displayName: 'Team Chat',
  avatarUrl: undefined,
  isEditingName: false,
  conversationName: 'Team Chat',
  isLoading: false,
  onEditNameChange: jest.fn(),
  onSaveName: jest.fn(),
  onCancelNameEdit: jest.fn(),
  onStartNameEdit: jest.fn(),
  onOpenImageUpload: jest.fn(),
  ...overrides,
});

describe('DetailsHeader — keyboard a11y (editable avatar)', () => {
  it('renders the editable avatar as a focusable named button', () => {
    render(<DetailsHeader {...buildHeaderProps()} />);
    const btn = screen.getByRole('button', { name: 'Change image' });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('opens the image uploader on click', () => {
    const onOpenImageUpload = jest.fn();
    render(<DetailsHeader {...buildHeaderProps({ onOpenImageUpload })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change image' }));
    expect(onOpenImageUpload).toHaveBeenCalledTimes(1);
  });

  it('does not render the editable avatar button when image cannot be modified', () => {
    render(<DetailsHeader {...buildHeaderProps({ canModifyImage: false })} />);
    expect(screen.queryByRole('button', { name: 'Change image' })).toBeNull();
  });
});

describe('CustomizationManager — keyboard a11y (click-to-edit cards)', () => {
  beforeEach(() => {
    getPreferences.mockReset();
    upsertPreferences.mockReset();
    getPreferences.mockResolvedValue({ customName: '', reaction: '' });
  });

  it('exposes the custom-name card as a focusable button and opens edit on Enter', async () => {
    render(<CustomizationManager conversationId="c1" currentUser={buildUser()} />);
    const card = await screen.findByRole('button', { name: 'Edit custom name' });
    expect(card).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(
      await screen.findByPlaceholderText('Enter a custom name...')
    ).toBeInTheDocument();
  });

  it('opens reaction edit on Space key', async () => {
    render(<CustomizationManager conversationId="c1" currentUser={buildUser()} />);
    const card = await screen.findByRole('button', { name: 'Edit reaction' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(
      await screen.findByPlaceholderText('😀')
    ).toBeInTheDocument();
  });

  it('preserves mouse click to open edit', async () => {
    render(<CustomizationManager conversationId="c1" currentUser={buildUser()} />);
    const card = await screen.findByRole('button', { name: 'Edit custom name' });
    fireEvent.click(card);
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Enter a custom name...')).toBeInTheDocument()
    );
  });
});

const buildDescProps = (overrides = {}) => ({
  description: 'A team description',
  isEditing: false,
  editValue: '',
  isLoading: false,
  isAdmin: true,
  onEditChange: jest.fn(),
  onSave: jest.fn(),
  onStartEdit: jest.fn(),
  onCancelEdit: jest.fn(),
  ...overrides,
});

describe('DescriptionSection — keyboard a11y (edit button visible on focus)', () => {
  it('exposes an edit button that becomes visible on keyboard focus', () => {
    render(<DescriptionSection {...buildDescProps()} />);
    const btn = screen.getByRole('button', { name: 'Edit description' });
    expect(btn.className).toContain('focus-visible:opacity-100');
  });

  it('starts editing when the edit button is activated', () => {
    const onStartEdit = jest.fn();
    render(<DescriptionSection {...buildDescProps({ onStartEdit })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    expect(onStartEdit).toHaveBeenCalledTimes(1);
  });
});
