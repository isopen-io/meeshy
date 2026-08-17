import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JoinConversationModal } from '../JoinConversationModal';
import type { LinkConversationData } from '@/services/link-conversation.service';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key, isLoading: false }),
}));

jest.mock('@/components/auth/login-form', () => ({
  LoginForm: () => <div data-testid="login-form" />,
}));

jest.mock('@/components/auth/register-form', () => ({
  RegisterForm: ({ linkId }: { linkId?: string }) => (
    <div data-testid="register-form" data-link-id={linkId} />
  ),
}));

jest.mock('@/components/join', () => ({
  AnonymousForm: ({ requireEmail, requireBirthday, requireNickname }: Record<string, unknown>) => (
    <div
      data-testid="anonymous-form"
      data-require-email={String(requireEmail)}
      data-require-birthday={String(requireBirthday)}
      data-require-nickname={String(requireNickname)}
    />
  ),
}));

const mockJoinAnonymously = jest.fn();
const mockJoinAsAuthenticated = jest.fn();

jest.mock('@/hooks/use-conversation-join', () => ({
  useConversationJoin: () => ({
    isJoining: false,
    joinAnonymously: (...args: unknown[]) => mockJoinAnonymously(...args),
    joinAsAuthenticated: (...args: unknown[]) => mockJoinAsAuthenticated(...args),
  }),
}));

jest.mock('@/hooks/use-link-validation', () => ({
  useUsernameValidation: () => 'idle',
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ isAnonymous: false, joinAnonymously: jest.fn() }),
}));

const LINK: LinkConversationData['link'] = {
  id: '507f1f77bcf86cd799439099',
  linkId: 'mshy_abc_123',
  name: 'Ardèche',
  description: '',
  allowViewHistory: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: true,
  requireAccount: false,
  requireEmail: false,
  requireNickname: true,
  requireBirthday: false,
  expiresAt: null,
  isActive: true,
};

const CONVERSATION: LinkConversationData['conversation'] = {
  id: '507f1f77bcf86cd799439022',
  title: 'Week-end Ardèche',
  description: '',
  type: 'group',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
};

function setup(overrides: Partial<React.ComponentProps<typeof JoinConversationModal>> = {}) {
  const onOpenChange = jest.fn();
  const onJoined = jest.fn();

  render(
    <JoinConversationModal
      open
      onOpenChange={onOpenChange}
      linkId="mshy_abc_123"
      link={LINK}
      conversation={CONVERSATION}
      identity="none"
      canDismiss
      onJoined={onJoined}
      {...overrides}
    />
  );

  return { onOpenChange, onJoined };
}

describe('JoinConversationModal — les trois portes d’entrée', () => {
  it('names the conversation being joined', () => {
    setup();

    expect(screen.getByRole('dialog')).toHaveTextContent('Week-end Ardèche');
  });

  it('offers anonymous, sign-in and sign-up', () => {
    setup();

    expect(screen.getByRole('button', { name: /Rejoindre en anonyme|joinAnonymously/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signIn/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signUp/ })).toBeInTheDocument();
  });

  // Le contenu de création de compte anonyme est ce qui devait survivre à la
  // disparition de la page /join — avec ses règles `require*`.
  it('opens the anonymous account form with the link requirements', async () => {
    setup({ link: { ...LINK, requireEmail: true, requireBirthday: true } });

    await userEvent.click(screen.getByRole('button', { name: /joinAnonymously/ }));

    const form = screen.getByTestId('anonymous-form');
    expect(form).toHaveAttribute('data-require-email', 'true');
    expect(form).toHaveAttribute('data-require-birthday', 'true');
    expect(form).toHaveAttribute('data-require-nickname', 'true');
  });

  it('opens the sign-in form in place, without leaving the conversation', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: /signIn/ }));

    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  // L'inscription doit connaître le lien : le compte créé rejoint directement.
  it('hands the share link to the sign-up form so registering joins in one step', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: /signUp/ }));

    expect(screen.getByTestId('register-form')).toHaveAttribute('data-link-id', 'mshy_abc_123');
  });

  it('lets the visitor step back to the choice screen', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: /signIn/ }));
    await userEvent.click(screen.getByRole('button', { name: /back|Retour/ }));

    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signIn/ })).toBeInTheDocument();
  });
});

describe('JoinConversationModal — le lien exige un compte', () => {
  it('hides the anonymous door entirely', () => {
    setup({ link: { ...LINK, requireAccount: true } });

    expect(screen.queryByRole('button', { name: /joinAnonymously/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signUp/ })).toBeInTheDocument();
  });
});

describe('JoinConversationModal — un compte déjà connecté', () => {
  it('skips the doors and offers a single join button', () => {
    setup({ identity: 'registered', currentUserName: 'Bob Jones' });

    expect(screen.getByRole('dialog')).toHaveTextContent('Bob Jones');
    expect(screen.queryByRole('button', { name: /signIn/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /joinButton/ })).toBeInTheDocument();
  });

  it('joins under that identity', async () => {
    const { onJoined } = setup({ identity: 'registered', currentUserName: 'Bob Jones' });

    await userEvent.click(screen.getByRole('button', { name: /joinButton/ }));

    expect(mockJoinAsAuthenticated).toHaveBeenCalled();
    expect(onJoined).toHaveBeenCalled();
  });
});

describe('JoinConversationModal — fermeture', () => {
  it('can be dismissed when there is something to read behind it', () => {
    setup({ canDismiss: true });

    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  // Sans historique consultable, fermer la modale laisserait le visiteur sur un
  // écran vide : la porte reste fermée.
  it('cannot be dismissed when the conversation history is private', () => {
    setup({ canDismiss: false });

    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });
});
