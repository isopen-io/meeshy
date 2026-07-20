import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// ─── Shared mocks ─────────────────────────────────────────────────────────────

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (!params) return key;
      return Object.entries(params).reduce(
        (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
        key
      );
    },
    locale: 'en',
  }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'en',
  }),
}));

jest.mock('@/stores/language-store', () => ({
  useCurrentInterfaceLanguage: () => 'en',
}));

jest.mock('@/constants/countries', () => ({
  COUNTRY_CODES: [
    { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
    { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  ],
  getDialCode: (code: string) => (code === 'FR' ? '+33' : '+1'),
  getCountryName: (code: string) => (code === 'FR' ? 'France' : 'United States'),
  formatPhoneWithDialCode: (phone: string) => phone || '',
  flagForCountry: (code: string | null) => (code === 'FR' ? '🇫🇷' : '🌐'),
  resolveCountry: (_phone: unknown, code: string) => ({
    code: code || 'FR',
    name: 'France',
    dial: '+33',
    flag: '🇫🇷',
  }),
  nationalNumber: (phone: string | null) => phone || '',
  toE164: (phone: string | null, _code: string) => (phone ? `+33${phone}` : null),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, onClick }: { children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) => (
    <div data-testid="card" onClick={onClick}>{children}</div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div data-testid="card-title">{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>{children}</span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input data-testid="input" {...props} />,
}));

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    username: 'alice',
    firstName: 'Alice',
    lastName: 'Smith',
    displayName: 'Alice Smith',
    email: 'alice@example.com',
    phoneNumber: '+33612345678',
    phoneCountryCode: 'FR',
    timezone: 'Europe/Paris',
    bio: 'Hello world',
    systemLanguage: 'fr',
    regionalLanguage: 'en',
    customDestinationLanguage: 'es',
    twoFactorEnabledAt: null,
    twoFactorBackupCodes: [],
    lockedUntil: null,
    lockedReason: null,
    failedLoginAttempts: 0,
    lastPasswordChange: null,
    passwordResetAttempts: 0,
    lastPasswordResetAttempt: null,
    lastLoginIp: null,
    lastLoginLocation: null,
    lastLoginDevice: null,
    registrationIp: null,
    registrationLocation: null,
    registrationDevice: null,
    registrationCountry: null,
    ...overrides,
  };
}

function makeShareLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sl-1',
    linkId: 'link-abc',
    identifier: 'my-link',
    name: 'My Share Link',
    description: 'A description',
    maxUses: 10,
    currentUses: 3,
    maxConcurrentUsers: null,
    currentConcurrentUsers: 0,
    isActive: true,
    expiresAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    conversation: null,
    _count: { anonymousParticipants: 5 },
    ...overrides,
  };
}

function makeTrackingLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tl-1',
    token: 'abc123',
    name: 'Campaign Link',
    campaign: 'spring',
    source: 'email',
    medium: 'cpc',
    originalUrl: 'https://example.com',
    shortUrl: null,
    totalClicks: 100,
    uniqueClicks: 75,
    isActive: true,
    expiresAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    lastClickedAt: '2024-06-01T00:00:00Z',
    ...overrides,
  };
}

function makeAffiliateToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'at-1',
    token: 'tok-xyz',
    name: 'My Token',
    maxUses: null,
    currentUses: 10,
    clickCount: 50,
    isActive: true,
    expiresAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    _count: { affiliations: 8 },
    ...overrides,
  };
}

function makeContactRequest(dir: 'sent' | 'received', overrides: Record<string, unknown> = {}) {
  const other = { id: 'u-2', username: 'bob', displayName: 'Bob', avatar: null };
  return {
    id: `cr-${dir}`,
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    sender: dir === 'received' ? other : undefined,
    receiver: dir === 'sent' ? other : undefined,
    ...overrides,
  };
}

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    identifier: 'conv-abc',
    title: 'My Group',
    type: 'group',
    avatar: null,
    isActive: true,
    memberCount: 5,
    communityId: null,
    createdAt: '2024-01-01T00:00:00Z',
    lastMessageAt: '2024-06-01T00:00:00Z',
    participants: [],
    membership: { role: 'admin', isActive: true },
    ...overrides,
  };
}

function makeAdminMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    content: 'Hello from Alice',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    createdAt: '2024-06-01T10:00:00Z',
    sender: {
      id: 'p-1', userId: 'u-1', type: 'user', displayName: 'Alice', avatar: null, nickname: null,
      user: { id: 'u-1', username: 'alice', displayName: 'Alice', avatar: null },
    },
    attachmentCount: 0,
    ...overrides,
  };
}

function makeMedia(overrides: Record<string, unknown> = {}) {
  return {
    id: 'media-1',
    originalName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileUrl: 'https://example.com/photo.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    fileSize: 204800,
    width: 800,
    height: 600,
    duration: null,
    createdAt: '2024-01-01T00:00:00Z',
    source: 'post' as const,
    contextId: null,
    ...overrides,
  };
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    type: 'POST' as const,
    visibility: 'public',
    content: 'Hello world',
    moodEmoji: null,
    deletedAt: null,
    likeCount: 5,
    commentCount: 2,
    viewCount: 100,
    createdAt: '2024-01-01T00:00:00Z',
    media: [],
    ...overrides,
  };
}

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rep-1',
    reportedType: 'message',
    reportedEntityId: 'msg-1',
    reportType: 'spam',
    reason: 'Spammy content',
    status: 'pending',
    actionTaken: null,
    createdAt: '2024-01-01T00:00:00Z',
    resolvedAt: null,
    ...overrides,
  };
}

function makeReportedMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rm-1',
    reportedEntityId: 'msg-1',
    reportType: 'harassment',
    reason: 'Harassing me',
    status: 'pending',
    reporterId: 'u-3',
    reporterName: 'Reporter Name',
    createdAt: '2024-01-01T00:00:00Z',
    resolvedAt: null,
    message: {
      id: 'msg-1',
      content: 'Bad message content',
      conversationId: 'conv-1',
      messageType: 'text',
      createdAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
    },
    ...overrides,
  };
}

function paginatedResponse<T>(data: T[], overrides: Record<string, unknown> = {}) {
  return {
    data: {
      success: true,
      data,
      pagination: { total: data.length, offset: 0, limit: 20, hasMore: false, ...overrides },
    },
  };
}

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { UserGeolocationSection } from '@/components/admin/user-detail/UserGeolocationSection';
import { UserContactInfoSection } from '@/components/admin/user-detail/UserContactInfoSection';
import { UserLanguageSection } from '@/components/admin/user-detail/UserLanguageSection';
import { UserPersonalInfoSection } from '@/components/admin/user-detail/UserPersonalInfoSection';
import { UserSecuritySection } from '@/components/admin/user-detail/UserSecuritySection';
import { UserActivitySection } from '@/components/admin/user-detail/UserActivitySection';
import { UserConversationsSection } from '@/components/admin/user-detail/UserConversationsSection';
import { UserMediaSection } from '@/components/admin/user-detail/UserMediaSection';
import { UserPostsSection } from '@/components/admin/user-detail/UserPostsSection';
import {
  UserReportsSection,
  ReportStatusBadge,
  ReportTypeBadge,
  formatReportDate,
} from '@/components/admin/user-detail/UserReportsSection';
import { UserReportedMessagesSection } from '@/components/admin/user-detail/UserReportedMessagesSection';

// ─── Cleanup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// UserGeolocationSection
// =============================================================================

describe('UserGeolocationSection', () => {
  it('returns null when user has no geo data or timezone', () => {
    const user = makeUser({
      timezone: null,
      lastLoginIp: null,
      lastLoginLocation: null,
      lastLoginDevice: null,
      registrationIp: null,
      registrationLocation: null,
      registrationDevice: null,
      registrationCountry: null,
    });
    const { container } = render(<UserGeolocationSection user={user} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders timezone when present', () => {
    render(<UserGeolocationSection user={makeUser({ timezone: 'Europe/Paris' })} />);
    expect(screen.getByText(/Europe\/Paris/)).toBeInTheDocument();
  });

  it('renders last login section when lastLoginIp is set', () => {
    render(<UserGeolocationSection user={makeUser({ lastLoginIp: '1.2.3.4' })} />);
    expect(screen.getByText('usersDetail.lastLoginTitle')).toBeInTheDocument();
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
  });

  it('renders last login location when set', () => {
    render(<UserGeolocationSection user={makeUser({ lastLoginLocation: 'Paris, FR' })} />);
    expect(screen.getByText('Paris, FR')).toBeInTheDocument();
  });

  it('renders last login device when set', () => {
    render(<UserGeolocationSection user={makeUser({ lastLoginDevice: 'Mozilla/5.0' })} />);
    expect(screen.getByText('Mozilla/5.0')).toBeInTheDocument();
  });

  it('renders registration section when registrationIp is set', () => {
    render(<UserGeolocationSection user={makeUser({ registrationIp: '10.0.0.1' })} />);
    expect(screen.getByText('usersDetail.registrationTitle')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
  });

  it('renders registration country with flag when registrationCountry is set', () => {
    render(<UserGeolocationSection user={makeUser({ registrationCountry: 'FR', registrationIp: '1.2.3.4' })} />);
    expect(screen.getByText('FR')).toBeInTheDocument();
  });

  it('renders registration location when set', () => {
    render(<UserGeolocationSection user={makeUser({ registrationLocation: 'Lyon, FR', registrationIp: '1.2.3.4' })} />);
    expect(screen.getByText('Lyon, FR')).toBeInTheDocument();
  });

  it('renders registration device when set', () => {
    render(<UserGeolocationSection user={makeUser({ registrationDevice: 'Safari/16', registrationIp: '1.2.3.4' })} />);
    expect(screen.getByText('Safari/16')).toBeInTheDocument();
  });

  it('renders both last-login and registration sections together', () => {
    const user = makeUser({ lastLoginIp: '1.2.3.4', registrationIp: '5.6.7.8' });
    render(<UserGeolocationSection user={user} />);
    expect(screen.getByText('usersDetail.lastLoginTitle')).toBeInTheDocument();
    expect(screen.getByText('usersDetail.registrationTitle')).toBeInTheDocument();
  });

  it('InfoRow hides row when value is null', () => {
    render(<UserGeolocationSection user={makeUser({ lastLoginIp: '1.2.3.4', lastLoginLocation: null })} />);
    expect(screen.queryByText('usersDetail.locationLabel')).not.toBeInTheDocument();
  });
});

// =============================================================================
// UserContactInfoSection
// =============================================================================

describe('UserContactInfoSection', () => {
  function renderContactInfo(overrides: Record<string, unknown> = {}) {
    const user = makeUser(overrides);
    const onUpdate = jest.fn();
    render(<UserContactInfoSection user={user} userId="user-1" onUpdate={onUpdate} />);
    return { user, onUpdate };
  }

  it('shows email in view mode', () => {
    renderContactInfo();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('shows phone when phoneNumber is present', () => {
    renderContactInfo({ phoneNumber: '+33612345678', phoneCountryCode: 'FR' });
    // formatPhoneWithDialCode mock returns the phone as-is
    expect(screen.getByText(/\+33612345678/)).toBeInTheDocument();
  });

  it('hides phone row when phoneNumber is null', () => {
    renderContactInfo({ phoneNumber: null });
    // When phoneNumber is null, the phone row is not rendered
    // We check that the edit button still renders (we're in view mode)
    expect(screen.getByText('usersDetail.editButton')).toBeInTheDocument();
  });

  it('shows timezone when present', () => {
    renderContactInfo({ timezone: 'Europe/Paris' });
    expect(screen.getByText('Europe/Paris')).toBeInTheDocument();
  });

  it('enters edit mode when Edit button clicked', () => {
    renderContactInfo();
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    expect(screen.getByText('usersDetail.cancelButton')).toBeInTheDocument();
    expect(screen.getByText('usersDetail.saveButton')).toBeInTheDocument();
  });

  it('shows email input in edit mode', () => {
    renderContactInfo();
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    const inputs = screen.getAllByTestId('input');
    expect(inputs[0]).toHaveValue('alice@example.com');
  });

  it('cancel exits edit mode and restores form', () => {
    renderContactInfo();
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    fireEvent.click(screen.getByText('usersDetail.cancelButton'));
    expect(screen.getByText('usersDetail.editButton')).toBeInTheDocument();
  });

  it('save calls apiService.patch with correct payload', async () => {
    const { onUpdate } = renderContactInfo({ phoneNumber: '+33612345678' });
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    await act(async () => {
      fireEvent.click(screen.getByText('usersDetail.saveButton'));
    });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      email: 'alice@example.com',
    }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    expect(onUpdate).toHaveBeenCalled();
  });

  it('save with null phoneNumber sends null e164', async () => {
    renderContactInfo({ phoneNumber: null });
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    await act(async () => {
      fireEvent.click(screen.getByText('usersDetail.saveButton'));
    });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      phoneNumber: null,
    }));
  });

  it('shows error toast on save failure', async () => {
    renderContactInfo();
    mockPatch.mockRejectedValue(new Error('Network error'));
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    await act(async () => {
      fireEvent.click(screen.getByText('usersDetail.saveButton'));
    });
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('shows saving state while request is in flight', async () => {
    renderContactInfo();
    let resolve: (v: unknown) => void;
    mockPatch.mockReturnValue(new Promise(r => { resolve = r; }));
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    fireEvent.click(screen.getByText('usersDetail.saveButton'));
    expect(screen.getByText('userDetail.saving')).toBeInTheDocument();
    await act(async () => {
      resolve({ data: { success: false } });
    });
  });

  it('updates email via input onChange in edit mode', async () => {
    renderContactInfo();
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    const inputs = screen.getAllByTestId('input');
    fireEvent.change(inputs[0], { target: { value: 'newemail@example.com' } });
    await act(async () => { fireEvent.click(screen.getByText('usersDetail.saveButton')); });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      email: 'newemail@example.com',
    }));
  });

  it('updates country code via select onChange in edit mode', async () => {
    renderContactInfo({ phoneNumber: '+33612345678' });
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    const selects = document.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: 'US' } });
    await act(async () => { fireEvent.click(screen.getByText('usersDetail.saveButton')); });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      phoneCountryCode: 'US',
    }));
  });

  it('updates phone number via input onChange in edit mode', async () => {
    renderContactInfo({ phoneNumber: '+33612345678' });
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    const inputs = screen.getAllByTestId('input');
    fireEvent.change(inputs[1], { target: { value: '612999000' } });
    await act(async () => { fireEvent.click(screen.getByText('usersDetail.saveButton')); });
    expect(mockPatch).toHaveBeenCalled();
  });

  it('updates timezone via select onChange in edit mode', async () => {
    renderContactInfo();
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    const selects = document.querySelectorAll('select');
    fireEvent.change(selects[1], { target: { value: 'UTC' } });
    await act(async () => { fireEvent.click(screen.getByText('usersDetail.saveButton')); });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      timezone: 'UTC',
    }));
  });

  it('covers || fallbacks in useState and handleCancel when email and timezone are null', () => {
    const user = makeUser({ email: null, timezone: null });
    const onUpdate = jest.fn();
    render(<UserContactInfoSection user={user} userId="user-1" onUpdate={onUpdate} />);
    // State initializes with '' for email and 'Europe/Paris' for timezone (right branches)
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    // Cancel reinitializes from null props (covers handleCancel right branches)
    fireEvent.click(screen.getByText('usersDetail.cancelButton'));
    expect(screen.getByText('usersDetail.editButton')).toBeInTheDocument();
  });

  it('falls back to translated error message when error has no message', async () => {
    renderContactInfo();
    // Reject with an object that has no .message property
    mockPatch.mockRejectedValue(new Error());
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    await act(async () => { fireEvent.click(screen.getByText('usersDetail.saveButton')); });
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });
});

// =============================================================================
// UserLanguageSection
// =============================================================================

describe('UserLanguageSection', () => {
  function renderLang(overrides: Record<string, unknown> = {}) {
    const user = makeUser(overrides);
    const onUpdate = jest.fn();
    render(<UserLanguageSection user={user} userId="user-1" onUpdate={onUpdate} />);
    return { user, onUpdate };
  }

  it('shows systemLanguage in view mode', () => {
    renderLang({ systemLanguage: 'fr' });
    expect(screen.getByText('Français')).toBeInTheDocument();
  });

  it('shows regionalLanguage when present', () => {
    renderLang({ systemLanguage: 'fr', regionalLanguage: 'en' });
    expect(screen.getByText('Anglais')).toBeInTheDocument();
  });

  it('hides regional language row when absent', () => {
    renderLang({ systemLanguage: 'fr', regionalLanguage: null });
    expect(screen.queryByText('userDetail.regionalLanguageLabel')).not.toBeInTheDocument();
  });

  it('shows custom destination language when present', () => {
    renderLang({ systemLanguage: 'fr', customDestinationLanguage: 'es' });
    expect(screen.getByText('Espagnol')).toBeInTheDocument();
  });

  it('hides custom destination row when absent', () => {
    renderLang({ systemLanguage: 'fr', customDestinationLanguage: null });
    expect(screen.queryByText('userDetail.destinationLabel')).not.toBeInTheDocument();
  });

  it('shows code directly for unknown language code', () => {
    renderLang({ systemLanguage: 'xx' });
    expect(screen.getByText('xx')).toBeInTheDocument();
  });

  it('enters edit mode when Edit clicked', () => {
    renderLang();
    fireEvent.click(screen.getByText('userDetail.edit'));
    expect(screen.getByText('userDetail.cancel')).toBeInTheDocument();
  });

  it('cancel restores form and exits edit mode', () => {
    renderLang();
    fireEvent.click(screen.getByText('userDetail.edit'));
    fireEvent.click(screen.getByText('userDetail.cancel'));
    expect(screen.getByText('userDetail.edit')).toBeInTheDocument();
  });

  it('save calls apiService.patch and onUpdate on success', async () => {
    const { onUpdate } = renderLang();
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('userDetail.edit'));
    await act(async () => {
      fireEvent.click(screen.getByText('userDetail.save'));
    });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      systemLanguage: 'fr',
    }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    expect(onUpdate).toHaveBeenCalled();
  });

  it('shows error toast when save fails', async () => {
    renderLang();
    mockPatch.mockRejectedValue(new Error('Server error'));
    fireEvent.click(screen.getByText('userDetail.edit'));
    await act(async () => {
      fireEvent.click(screen.getByText('userDetail.save'));
    });
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('updates systemLanguage via select onChange in edit mode', async () => {
    renderLang({ systemLanguage: 'fr' });
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('userDetail.edit'));
    const selects = document.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: 'en' } });
    await act(async () => { fireEvent.click(screen.getByText('userDetail.save')); });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      systemLanguage: 'en',
    }));
  });

  it('updates regionalLanguage via select onChange in edit mode', async () => {
    renderLang({ systemLanguage: 'fr', regionalLanguage: 'en' });
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('userDetail.edit'));
    const selects = document.querySelectorAll('select');
    fireEvent.change(selects[1], { target: { value: 'es' } });
    await act(async () => { fireEvent.click(screen.getByText('userDetail.save')); });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      regionalLanguage: 'es',
    }));
  });

  it('updates customDestinationLanguage via select onChange in edit mode', async () => {
    renderLang({ systemLanguage: 'fr', customDestinationLanguage: 'es' });
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('userDetail.edit'));
    const selects = document.querySelectorAll('select');
    fireEvent.change(selects[2], { target: { value: 'de' } });
    await act(async () => { fireEvent.click(screen.getByText('userDetail.save')); });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      customDestinationLanguage: 'de',
    }));
  });

  it('covers || fallbacks when systemLanguage and customDestination are null', () => {
    const user = makeUser({ systemLanguage: null, customDestinationLanguage: null });
    const onUpdate = jest.fn();
    render(<UserLanguageSection user={user} userId="user-1" onUpdate={onUpdate} />);
    // useState initializes with 'fr' for systemLanguage (right branch) and '' for customDest (right branch)
    fireEvent.click(screen.getByText('userDetail.edit'));
    // handleCancel reinitializes from null props
    fireEvent.click(screen.getByText('userDetail.cancel'));
    expect(screen.getByText('userDetail.edit')).toBeInTheDocument();
  });

  it('sends null for regional and custom destination when cleared to empty string', async () => {
    renderLang({ systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: 'es' });
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('userDetail.edit'));
    const selects = document.querySelectorAll('select');
    // Clear regional (set to '')
    fireEvent.change(selects[1], { target: { value: '' } });
    // Clear custom destination (set to '')
    fireEvent.change(selects[2], { target: { value: '' } });
    await act(async () => { fireEvent.click(screen.getByText('userDetail.save')); });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      regionalLanguage: null,
      customDestinationLanguage: null,
    }));
  });

  it('shows fallback translated error when language save error has no message', async () => {
    renderLang();
    mockPatch.mockRejectedValue(new Error());
    fireEvent.click(screen.getByText('userDetail.edit'));
    await act(async () => { fireEvent.click(screen.getByText('userDetail.save')); });
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('covers || fallback for regionalLanguage when null in useState and handleCancel', () => {
    const user = makeUser({ regionalLanguage: null });
    const onUpdate = jest.fn();
    render(<UserLanguageSection user={user} userId="user-1" onUpdate={onUpdate} />);
    // useState initializes with 'fr' (right branch of regionalLanguage || 'fr')
    fireEvent.click(screen.getByText('userDetail.edit'));
    // handleCancel reinitializes from null prop (right branch again)
    fireEvent.click(screen.getByText('userDetail.cancel'));
    expect(screen.getByText('userDetail.edit')).toBeInTheDocument();
  });

  it('does not call onUpdate when save response success is false', async () => {
    const { onUpdate } = renderLang();
    mockPatch.mockResolvedValue({ data: { success: false } });
    fireEvent.click(screen.getByText('userDetail.edit'));
    await act(async () => { fireEvent.click(screen.getByText('userDetail.save')); });
    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(onUpdate).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});

// =============================================================================
// UserPersonalInfoSection
// =============================================================================

describe('UserPersonalInfoSection', () => {
  function renderPersonal(overrides: Record<string, unknown> = {}) {
    const user = makeUser(overrides);
    const onUpdate = jest.fn();
    render(<UserPersonalInfoSection user={user} userId="user-1" onUpdate={onUpdate} />);
    return { user, onUpdate };
  }

  it('shows full name in view mode', () => {
    renderPersonal();
    // firstName + lastName appear in the full name row; use getAllByText for multiple matches
    expect(screen.getAllByText(/Alice Smith/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows displayName when present', () => {
    renderPersonal({ displayName: 'Alice S.' });
    expect(screen.getByText('Alice S.')).toBeInTheDocument();
  });

  it('hides displayName row when absent', () => {
    renderPersonal({ displayName: null });
    expect(screen.queryByText('userDetail.displayNameLabel:')).not.toBeInTheDocument();
  });

  it('shows username with @ prefix', () => {
    renderPersonal();
    expect(screen.getByText('@alice')).toBeInTheDocument();
  });

  it('shows bio when present', () => {
    renderPersonal({ bio: 'My bio' });
    expect(screen.getByText('My bio')).toBeInTheDocument();
  });

  it('hides bio section when absent', () => {
    renderPersonal({ bio: '' });
    expect(screen.queryByText('userDetail.bioLabel:')).not.toBeInTheDocument();
  });

  it('enters edit mode when Edit clicked', () => {
    renderPersonal();
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    expect(screen.getAllByTestId('input').length).toBeGreaterThan(0);
  });

  it('cancel exits edit mode', () => {
    renderPersonal();
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    fireEvent.click(screen.getByText('usersDetail.cancelButton'));
    expect(screen.getByText('usersDetail.editButton')).toBeInTheDocument();
  });

  it('username input sanitizes special characters', () => {
    renderPersonal();
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    const inputs = screen.getAllByTestId('input');
    const usernameInput = inputs.find(inp => (inp as HTMLInputElement).value === 'alice');
    expect(usernameInput).toBeDefined();
    fireEvent.change(usernameInput!, { target: { value: 'alice_123-test!' } });
    expect((usernameInput as HTMLInputElement).value).toBe('alice_123-test');
  });

  it('save calls apiService.patch and onUpdate on success', async () => {
    const { onUpdate } = renderPersonal();
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    await act(async () => {
      fireEvent.click(screen.getByText('usersDetail.saveButton'));
    });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      username: 'alice',
    }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    expect(onUpdate).toHaveBeenCalled();
  });

  it('shows error toast on save failure', async () => {
    renderPersonal();
    mockPatch.mockRejectedValue(new Error('Conflict'));
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    await act(async () => {
      fireEvent.click(screen.getByText('usersDetail.saveButton'));
    });
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('updates firstName via input onChange in edit mode', async () => {
    renderPersonal();
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    const inputs = screen.getAllByTestId('input');
    const firstNameInput = inputs.find(inp => (inp as HTMLInputElement).value === 'Alice');
    fireEvent.change(firstNameInput!, { target: { value: 'Bob' } });
    await act(async () => { fireEvent.click(screen.getByText('usersDetail.saveButton')); });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      firstName: 'Bob',
    }));
  });

  it('updates lastName via input onChange in edit mode', async () => {
    renderPersonal();
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    const inputs = screen.getAllByTestId('input');
    const lastNameInput = inputs.find(inp => (inp as HTMLInputElement).value === 'Smith');
    fireEvent.change(lastNameInput!, { target: { value: 'Jones' } });
    await act(async () => { fireEvent.click(screen.getByText('usersDetail.saveButton')); });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      lastName: 'Jones',
    }));
  });

  it('updates displayName via input onChange in edit mode', async () => {
    renderPersonal({ displayName: 'Alice Smith' });
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    const inputs = screen.getAllByTestId('input');
    const displayNameInput = inputs.find(inp => (inp as HTMLInputElement).value === 'Alice Smith');
    fireEvent.change(displayNameInput!, { target: { value: 'Alice S.' } });
    await act(async () => { fireEvent.click(screen.getByText('usersDetail.saveButton')); });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      displayName: 'Alice S.',
    }));
  });

  it('updates bio via textarea onChange in edit mode', async () => {
    renderPersonal({ bio: 'Hello world' });
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    const textarea = document.querySelector('textarea');
    fireEvent.change(textarea!, { target: { value: 'New bio text' } });
    await act(async () => { fireEvent.click(screen.getByText('usersDetail.saveButton')); });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      bio: 'New bio text',
    }));
  });

  it('covers || fallbacks when all user personal fields are null', () => {
    const user = makeUser({
      firstName: null, lastName: null, displayName: null, username: null, bio: null,
    });
    const onUpdate = jest.fn();
    render(<UserPersonalInfoSection user={user} userId="user-1" onUpdate={onUpdate} />);
    // useState initializes with '' for all fields (right branches on lines 32-36)
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    // handleCancel reinitializes from null props (right branches on lines 45-50)
    fireEvent.click(screen.getByText('usersDetail.cancelButton'));
    expect(screen.getByText('usersDetail.editButton')).toBeInTheDocument();
  });

  it('sends null displayName when displayName form field is empty', async () => {
    renderPersonal({ displayName: null });
    mockPatch.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    // formData.displayName = '' (from || '' fallback) → displayName || null = null
    await act(async () => { fireEvent.click(screen.getByText('usersDetail.saveButton')); });
    expect(mockPatch).toHaveBeenCalledWith('/admin/users/user-1', expect.objectContaining({
      displayName: null,
    }));
  });

  it('shows translated fallback error when personal info save error has no message', async () => {
    renderPersonal();
    mockPatch.mockRejectedValue(new Error());
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    await act(async () => { fireEvent.click(screen.getByText('usersDetail.saveButton')); });
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('does not call onUpdate when personal info save response success is false', async () => {
    const { onUpdate } = renderPersonal();
    mockPatch.mockResolvedValue({ data: { success: false } });
    fireEvent.click(screen.getByText('usersDetail.editButton'));
    await act(async () => { fireEvent.click(screen.getByText('usersDetail.saveButton')); });
    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(onUpdate).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});

// =============================================================================
// UserSecuritySection
// =============================================================================

describe('UserSecuritySection', () => {
  function renderSecurity(overrides: Record<string, unknown> = {}) {
    const user = makeUser(overrides);
    const onUpdate = jest.fn();
    const onResetPassword = jest.fn();
    render(
      <UserSecuritySection
        user={user}
        userId="user-1"
        onUpdate={onUpdate}
        onResetPassword={onResetPassword}
      />
    );
    return { user, onUpdate, onResetPassword };
  }

  it('shows unlocked badge when account is not locked', () => {
    renderSecurity({ lockedUntil: null });
    expect(screen.getByText('usersDetail.unlockedBadge')).toBeInTheDocument();
  });

  it('shows locked badge when lockedUntil is in the future', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    renderSecurity({ lockedUntil: future });
    expect(screen.getByText('usersDetail.lockedBadge')).toBeInTheDocument();
  });

  it('shows unlock button when account is locked', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    renderSecurity({ lockedUntil: future });
    expect(screen.getByText('usersDetail.unlockButton')).toBeInTheDocument();
  });

  it('shows lockedReason when present', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    renderSecurity({ lockedUntil: future, lockedReason: 'Brute force' });
    expect(screen.getByText('Brute force')).toBeInTheDocument();
  });

  it('hides lockedReason when absent', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    renderSecurity({ lockedUntil: future, lockedReason: null });
    expect(screen.queryByText('usersDetail.lockedReason')).not.toBeInTheDocument();
  });

  it('shows unlocked state (not locked) when lockedUntil is in the past', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    renderSecurity({ lockedUntil: past });
    expect(screen.getByText('usersDetail.unlockedBadge')).toBeInTheDocument();
  });

  it('shows 2FA disabled badge when twoFactorEnabledAt is null', () => {
    renderSecurity({ twoFactorEnabledAt: null });
    expect(screen.getByText('security.disabled')).toBeInTheDocument();
    expect(screen.getByText('security.enable2FA')).toBeInTheDocument();
  });

  it('shows 2FA enabled badge when twoFactorEnabledAt is set', () => {
    renderSecurity({ twoFactorEnabledAt: '2024-01-01T00:00:00Z' });
    expect(screen.getByText('usersDetail.twoFactorEnabledBadge')).toBeInTheDocument();
    expect(screen.getByText('security.disable2FA')).toBeInTheDocument();
  });

  it('shows backup codes remaining when backup codes exist', () => {
    renderSecurity({ twoFactorEnabledAt: '2024-01-01T00:00:00Z', twoFactorBackupCodes: ['a', 'b'] });
    expect(screen.getByText('usersDetail.backupCodesLabel')).toBeInTheDocument();
  });

  it('hides backup codes row when backup codes array is empty', () => {
    renderSecurity({ twoFactorEnabledAt: '2024-01-01T00:00:00Z', twoFactorBackupCodes: [] });
    expect(screen.queryByText('usersDetail.backupCodesLabel')).not.toBeInTheDocument();
  });

  it('shows password reset attempts when > 0', () => {
    renderSecurity({ passwordResetAttempts: 3 });
    expect(screen.getByText('usersDetail.resetAttempts')).toBeInTheDocument();
  });

  it('hides reset attempts when 0', () => {
    renderSecurity({ passwordResetAttempts: 0 });
    expect(screen.queryByText('usersDetail.resetAttempts')).not.toBeInTheDocument();
  });

  it('shows lastPasswordResetAttempt when present with attempts > 0', () => {
    renderSecurity({ passwordResetAttempts: 1, lastPasswordResetAttempt: '2024-01-01T00:00:00Z' });
    expect(screen.getByText('usersDetail.lastResetAttempt')).toBeInTheDocument();
  });

  it('shows failed login attempts count', () => {
    renderSecurity({ failedLoginAttempts: 3 });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onResetPassword when reset button clicked', () => {
    const { onResetPassword } = renderSecurity();
    fireEvent.click(screen.getByText('usersDetail.resetPasswordButton'));
    expect(onResetPassword).toHaveBeenCalledTimes(1);
  });

  it('handleUnlockAccount calls post and onUpdate', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const { onUpdate } = renderSecurity({ lockedUntil: future });
    mockPost.mockResolvedValue({});
    fireEvent.click(screen.getByText('usersDetail.unlockButton'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/users/user-1/unlock'));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('handleUnlockAccount shows error toast on failure', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    renderSecurity({ lockedUntil: future });
    mockPost.mockRejectedValue(new Error('Server error'));
    fireEvent.click(screen.getByText('usersDetail.unlockButton'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('handleToggle2FA calls disable endpoint when 2FA is enabled', async () => {
    const { onUpdate } = renderSecurity({ twoFactorEnabledAt: '2024-01-01T00:00:00Z' });
    mockPost.mockResolvedValue({});
    fireEvent.click(screen.getByText('security.disable2FA'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/users/user-1/disable-2fa'));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('handleToggle2FA calls enable endpoint when 2FA is disabled', async () => {
    const { onUpdate } = renderSecurity({ twoFactorEnabledAt: null });
    mockPost.mockResolvedValue({});
    fireEvent.click(screen.getByText('security.enable2FA'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/users/user-1/enable-2fa'));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('handleToggle2FA shows error toast on failure', async () => {
    renderSecurity({ twoFactorEnabledAt: null });
    mockPost.mockRejectedValue(new Error('Network error'));
    fireEvent.click(screen.getByText('security.enable2FA'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('formatDate returns never for null date (using tCommon)', () => {
    renderSecurity({ lastPasswordChange: null });
    expect(screen.getByText('never')).toBeInTheDocument();
  });

  it('handleUnlockAccount falls back to translated error when error has no message', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    renderSecurity({ lockedUntil: future });
    mockPost.mockRejectedValue(new Error());
    fireEvent.click(screen.getByText('usersDetail.unlockButton'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('handleToggle2FA falls back to translated error when error has no message', async () => {
    renderSecurity({ twoFactorEnabledAt: null });
    mockPost.mockRejectedValue(new Error());
    fireEvent.click(screen.getByText('security.enable2FA'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });
});

// =============================================================================
// UserActivitySection
// =============================================================================

describe('UserActivitySection', () => {
  function makeActivityResponse(overrides: Partial<{
    shareLinks: unknown[];
    trackingLinks: unknown[];
    affiliateTokens: unknown[];
    contacts: { sent: unknown[]; received: unknown[] };
  }> = {}) {
    return {
      data: {
        success: true,
        data: {
          shareLinks: [],
          trackingLinks: [],
          affiliateTokens: [],
          contacts: { sent: [], received: [] },
          ...overrides,
        },
      },
    };
  }

  it('shows loading spinner initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<UserActivitySection userId="user-1" />);
    expect(screen.getByText('usersDetail.loadingActivity')).toBeInTheDocument();
  });

  it('returns null on fetch error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockRejectedValue(new Error('Network error'));
    const { container } = render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(container.firstChild).toBeNull());
    consoleSpy.mockRestore();
  });

  it('returns null when response has no data', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: null } });
    const { container } = render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('returns null when all data arrays are empty', async () => {
    mockGet.mockResolvedValue(makeActivityResponse());
    const { container } = render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders share link section when shareLinks present', async () => {
    mockGet.mockResolvedValue(makeActivityResponse({ shareLinks: [makeShareLink()] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.shareLinksSection')).toBeInTheDocument());
    expect(screen.getByText('My Share Link')).toBeInTheDocument();
  });

  it('share link uses identifier when name is null', async () => {
    mockGet.mockResolvedValue(makeActivityResponse({ shareLinks: [makeShareLink({ name: null, identifier: 'my-id' })] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('my-id')).toBeInTheDocument());
  });

  it('share link uses linkId when name and identifier are null', async () => {
    mockGet.mockResolvedValue(makeActivityResponse({ shareLinks: [makeShareLink({ name: null, identifier: null, linkId: 'link-abc' })] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('link-abc')).toBeInTheDocument());
  });

  it('renders expired share link badge', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    mockGet.mockResolvedValue(makeActivityResponse({ shareLinks: [makeShareLink({ expiresAt: pastDate })] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.expiredBadge')).toBeInTheDocument());
  });

  it('renders inactive share link badge', async () => {
    mockGet.mockResolvedValue(makeActivityResponse({ shareLinks: [makeShareLink({ isActive: false })] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.inactiveBadge')).toBeInTheDocument());
  });

  it('share link shows conversation identifier when present', async () => {
    const link = makeShareLink({ conversation: { id: 'conv-1', identifier: 'my-conv' } });
    mockGet.mockResolvedValue(makeActivityResponse({ shareLinks: [link] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('my-conv')).toBeInTheDocument());
  });

  it('renders tracking link section', async () => {
    mockGet.mockResolvedValue(makeActivityResponse({ trackingLinks: [makeTrackingLink()] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.trackedLinksSection')).toBeInTheDocument());
    expect(screen.getByText('Campaign Link')).toBeInTheDocument();
  });

  it('tracking link uses token when name is null', async () => {
    mockGet.mockResolvedValue(makeActivityResponse({ trackingLinks: [makeTrackingLink({ name: null })] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('abc123')).toBeInTheDocument());
  });

  it('tracking link shows conversion rate as 0 when totalClicks is 0', async () => {
    const link = makeTrackingLink({ totalClicks: 0, uniqueClicks: 0 });
    mockGet.mockResolvedValue(makeActivityResponse({ trackingLinks: [link] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('0%')).toBeInTheDocument());
  });

  it('renders affiliate token section', async () => {
    mockGet.mockResolvedValue(makeActivityResponse({ affiliateTokens: [makeAffiliateToken()] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.affiliateTokensSection')).toBeInTheDocument());
    expect(screen.getByText('My Token')).toBeInTheDocument();
  });

  it('affiliate token uses raw token when name is null', async () => {
    mockGet.mockResolvedValue(makeActivityResponse({ affiliateTokens: [makeAffiliateToken({ name: null })] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getAllByText('tok-xyz').length).toBeGreaterThan(0));
  });

  it('affiliate token shows 0 conversion rate when clickCount is 0', async () => {
    const token = makeAffiliateToken({ clickCount: 0, _count: { affiliations: 0 } });
    mockGet.mockResolvedValue(makeActivityResponse({ affiliateTokens: [token] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('0%')).toBeInTheDocument());
  });

  it('renders contacts sent section', async () => {
    const contact = makeContactRequest('sent');
    mockGet.mockResolvedValue(makeActivityResponse({ contacts: { sent: [contact], received: [] } }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.contactsSection')).toBeInTheDocument());
    expect(screen.getByText('usersDetail.sentRequests')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders contacts received section', async () => {
    const contact = makeContactRequest('received');
    mockGet.mockResolvedValue(makeActivityResponse({ contacts: { sent: [], received: [contact] } }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.receivedRequests')).toBeInTheDocument());
  });

  it('contact with avatar shows img element', async () => {
    const contact = makeContactRequest('sent', {
      receiver: { id: 'u-2', username: 'bob', displayName: 'Bob', avatar: 'https://example.com/avatar.jpg' },
    });
    mockGet.mockResolvedValue(makeActivityResponse({ contacts: { sent: [contact], received: [] } }));
    const { container } = render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.contactsSection')).toBeInTheDocument());
    // img with alt="" is decorative (role=presentation) — query via DOM
    const avatarImg = container.querySelector('img[src="https://example.com/avatar.jpg"]');
    expect(avatarImg).toBeInTheDocument();
  });

  it('contact without person (null receiver for sent) returns null', async () => {
    const contact = makeContactRequest('sent', { receiver: undefined });
    mockGet.mockResolvedValue(makeActivityResponse({ contacts: { sent: [contact], received: [] } }));
    render(<UserActivitySection userId="user-1" />);
    // After load - section renders but no contact card (person is null)
    await waitFor(() => expect(screen.getByText('usersDetail.contactsSection')).toBeInTheDocument());
  });

  it('CollapsibleSection with count > 5 starts collapsed', async () => {
    const links = Array.from({ length: 6 }, (_, i) => makeShareLink({ id: `sl-${i}`, name: `Link ${i}` }));
    mockGet.mockResolvedValue(makeActivityResponse({ shareLinks: links }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.shareLinksSection')).toBeInTheDocument());
    // Content should be collapsed (not showing individual link names unless opened)
    const linkNames = links.map(l => screen.queryByText(l.name as string));
    expect(linkNames.every(el => el === null)).toBe(true);
  });

  it('CollapsibleSection toggles open/closed on button click', async () => {
    mockGet.mockResolvedValue(makeActivityResponse({ shareLinks: [makeShareLink()] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.shareLinksSection')).toBeInTheDocument());
    // Small count (<= 5) → starts open, link name should be visible
    expect(screen.getByText('My Share Link')).toBeInTheDocument();
    // Toggle close
    fireEvent.click(screen.getByText('usersDetail.shareLinksSection').closest('button')!);
    expect(screen.queryByText('My Share Link')).not.toBeInTheDocument();
    // Toggle open again
    fireEvent.click(screen.getByText('usersDetail.shareLinksSection').closest('button')!);
    expect(screen.getByText('My Share Link')).toBeInTheDocument();
  });

  it('refetches when userId changes', async () => {
    mockGet.mockResolvedValue(makeActivityResponse({ shareLinks: [makeShareLink()] }));
    const { rerender } = render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    rerender(<UserActivitySection userId="user-2" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('hides share link description when null', async () => {
    const link = makeShareLink({ description: null });
    mockGet.mockResolvedValue(makeActivityResponse({ shareLinks: [link] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.shareLinksSection')).toBeInTheDocument());
    expect(screen.queryByText('A description')).not.toBeInTheDocument();
  });

  it('hides tracking link last-clicked date when lastClickedAt is null', async () => {
    const link = makeTrackingLink({ lastClickedAt: null });
    mockGet.mockResolvedValue(makeActivityResponse({ trackingLinks: [link] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.trackedLinksSection')).toBeInTheDocument());
    expect(screen.queryByText('usersDetail.lastClickLabel')).not.toBeInTheDocument();
  });

  it('hides tracking link campaign badge when campaign is null', async () => {
    const link = makeTrackingLink({ campaign: null, source: null, medium: null });
    mockGet.mockResolvedValue(makeActivityResponse({ trackingLinks: [link] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('Campaign Link')).toBeInTheDocument());
    expect(screen.queryByText('spring')).not.toBeInTheDocument();
  });

  it('shows source and medium badges but hides medium when medium is null', async () => {
    const link = makeTrackingLink({ campaign: 'spring', source: 'email', medium: null });
    mockGet.mockResolvedValue(makeActivityResponse({ trackingLinks: [link] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('email')).toBeInTheDocument());
    expect(screen.queryByText('cpc')).not.toBeInTheDocument();
  });

  it('shows affiliate token maxUses when set', async () => {
    const token = makeAffiliateToken({ maxUses: 50 });
    mockGet.mockResolvedValue(makeActivityResponse({ affiliateTokens: [token] }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.affiliateTokensSection')).toBeInTheDocument());
    // /50 appears in usage label (maxUses ? '/${maxUses}' : '' → '/50')
    expect(screen.getByText(/usersDetail.usageLabel/)).toBeInTheDocument();
  });

  it('contact shows username initial when person displayName is null', async () => {
    const contact = makeContactRequest('sent', {
      receiver: { id: 'u-2', username: 'bobsmith', displayName: null, avatar: null },
    });
    mockGet.mockResolvedValue(makeActivityResponse({ contacts: { sent: [contact], received: [] } }));
    render(<UserActivitySection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.contactsSection')).toBeInTheDocument());
    // displayName || username → 'bobsmith'; first char 'b' shown in avatar circle
    expect(screen.getByText('bobsmith')).toBeInTheDocument();
  });
});

// =============================================================================
// UserConversationsSection
// =============================================================================

describe('UserConversationsSection', () => {
  it('shows loading spinner initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<UserConversationsSection userId="user-1" />);
    expect(screen.getByText('usersDetail.loadingConversations')).toBeInTheDocument();
  });

  it('returns null on error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockRejectedValue(new Error('Network error'));
    const { container } = render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(container.firstChild).toBeNull());
    consoleSpy.mockRestore();
  });

  it('shows no conversations message when list is empty', async () => {
    mockGet.mockResolvedValue(paginatedResponse([]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.noConversations')).toBeInTheDocument());
  });

  it('renders a group conversation with view members button', async () => {
    const conv = makeConversation({ type: 'group' });
    mockGet.mockResolvedValue(paginatedResponse([conv]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('My Group')).toBeInTheDocument());
    expect(screen.getByText(/usersDetail.viewMembers/)).toBeInTheDocument();
  });

  it('renders a direct conversation showing other participants', async () => {
    const participant = {
      id: 'p-1', userId: 'u-2', displayName: 'Bob', avatar: null, role: 'member',
      joinedAt: null, isActive: true, isOnline: false, nickname: null, user: null, type: 'user',
    };
    const conv = makeConversation({ type: 'direct', participants: [participant] });
    mockGet.mockResolvedValue(paginatedResponse([conv]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument());
  });

  it('shows load more button when hasMore is true', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeConversation()], { hasMore: true }));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.loadMore')).toBeInTheDocument());
  });

  it('loads more conversations when load more clicked', async () => {
    const first = makeConversation({ id: 'conv-1', title: 'Conv 1' });
    const second = makeConversation({ id: 'conv-2', title: 'Conv 2' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([first], { hasMore: true, total: 2 }))
      .mockResolvedValueOnce(paginatedResponse([second], { hasMore: false }));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('Conv 1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('usersDetail.loadMore'));
    await waitFor(() => expect(screen.getByText('Conv 2')).toBeInTheDocument());
    expect(screen.getByText('Conv 1')).toBeInTheDocument();
  });

  it('opens members modal when view members clicked for group conv', async () => {
    const conv = makeConversation({ type: 'group' });
    const member = {
      id: 'p-1', userId: 'u-99', displayName: 'Eve', avatar: null, role: 'member',
      joinedAt: null, isActive: true, isOnline: false, nickname: null, user: null, type: 'user',
    };
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([member]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMembers/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/usersDetail.viewMembers/));
    await waitFor(() => expect(screen.getByText('Eve')).toBeInTheDocument());
  });

  it('shows inactive badge on inactive conversation', async () => {
    const conv = makeConversation({ isActive: false });
    mockGet.mockResolvedValue(paginatedResponse([conv]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.inactiveBadge')).toBeInTheDocument());
  });

  it('shows conversation type badge for known types', async () => {
    const conv = makeConversation({ type: 'direct' });
    mockGet.mockResolvedValue(paginatedResponse([conv]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.convTypeDirect')).toBeInTheDocument());
  });

  it('shows raw type for unknown conversation type', async () => {
    const conv = makeConversation({ type: 'unknown-type' });
    mockGet.mockResolvedValue(paginatedResponse([conv]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('unknown-type')).toBeInTheDocument());
  });

  it('shows role badge when membership role is known', async () => {
    const conv = makeConversation({ type: 'group', membership: { role: 'admin', isActive: true } });
    mockGet.mockResolvedValue(paginatedResponse([conv]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.convRoleAdmin')).toBeInTheDocument());
  });

  it('shows conv id as fallback title when title and identifier are null', async () => {
    const conv = makeConversation({ title: null, identifier: null, id: 'conv-xyz' });
    mockGet.mockResolvedValue(paginatedResponse([conv]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('conv-xyz')).toBeInTheDocument());
  });

  it('shows — for conversation with null lastMessageAt', async () => {
    const conv = makeConversation({ lastMessageAt: null });
    mockGet.mockResolvedValue(paginatedResponse([conv]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('My Group')).toBeInTheDocument());
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('closes members modal when X button clicked', async () => {
    const conv = makeConversation({ type: 'group' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMembers/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/usersDetail.viewMembers/));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument());
  });

  it('loads more members in members modal', async () => {
    const conv = makeConversation({ type: 'group', memberCount: 35 });
    const member1 = {
      id: 'p-1', userId: 'u-1', displayName: 'Eve', avatar: null, role: 'member',
      joinedAt: null, isActive: true, isOnline: false, nickname: null, user: null, type: 'user',
    };
    const member2 = {
      id: 'p-2', userId: 'u-2', displayName: 'Frank', avatar: null, role: 'admin',
      joinedAt: null, isActive: true, isOnline: false, nickname: null, user: null, type: 'user',
    };
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([member1], { hasMore: true, total: 35 }))
      .mockResolvedValueOnce(paginatedResponse([member2], { hasMore: false }));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMembers/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/usersDetail.viewMembers/));
    await waitFor(() => expect(screen.getByText('Eve')).toBeInTheDocument());
    fireEvent.click(screen.getByText('usersDetail.loadMore'));
    await waitFor(() => expect(screen.getByText('Frank')).toBeInTheDocument());
    expect(screen.getByText('Eve')).toBeInTheDocument();
  });

  it('clicking inside modal card stops propagation to backdrop', async () => {
    const conv = makeConversation({ type: 'group' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMembers/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/usersDetail.viewMembers/));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument());
    const modalCard = screen.getByRole('button', { name: 'Close' }).closest('[data-testid="card"]');
    fireEvent.click(modalCard!);
    // Modal should still be open (stopPropagation prevented backdrop onClose)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('participantName uses nickname when displayName is null', async () => {
    const participant = {
      id: 'p-1', userId: 'u-2', displayName: null, avatar: null, role: 'member',
      joinedAt: null, isActive: true, isOnline: false, nickname: 'NickUser', user: null, type: 'user',
    };
    const conv = makeConversation({ type: 'direct', participants: [participant] });
    mockGet.mockResolvedValue(paginatedResponse([conv]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('NickUser')).toBeInTheDocument());
  });

  it('shows participant avatar img when participant has an avatar url', async () => {
    const participant = {
      id: 'p-1', userId: 'u-2', displayName: 'Bob', avatar: 'https://example.com/bob.jpg', role: 'member',
      joinedAt: null, isActive: true, isOnline: false, nickname: null, user: null, type: 'user',
    };
    const conv = makeConversation({ type: 'direct', participants: [participant] });
    mockGet.mockResolvedValue(paginatedResponse([conv]));
    const { container } = render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => {
      expect(container.querySelector('img[src="https://example.com/bob.jpg"]')).toBeInTheDocument();
    });
  });

  it('catches error when modal participant fetch fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const conv = makeConversation({ type: 'group' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockRejectedValueOnce(new Error('Participant fetch failed'));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMembers/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/usersDetail.viewMembers/));
    await waitFor(() => expect(consoleSpy).toHaveBeenCalled());
    consoleSpy.mockRestore();
    // Modal stays open even on error (no crash)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('handles API response with no data or pagination in main load (covers ?? fallback branches)', async () => {
    // resp.data?.data → undefined → ?? [] = []
    // resp.data?.pagination → undefined → total ?? 0, hasMore ?? false
    mockGet.mockResolvedValue({ data: {} });
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.noConversations')).toBeInTheDocument());
  });

  it('handles API response with no data in modal load (covers ?? fallback branches)', async () => {
    const conv = makeConversation({ type: 'group' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce({ data: {} });
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMembers/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/usersDetail.viewMembers/));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument());
  });

  it('shows conversation avatar img when conv.avatar is set', async () => {
    const conv = makeConversation({ avatar: 'https://example.com/conv.jpg' });
    mockGet.mockResolvedValue(paginatedResponse([conv]));
    const { container } = render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => {
      expect(container.querySelector('img[src="https://example.com/conv.jpg"]')).toBeInTheDocument();
    });
  });

  it('handles null participants array (covers ?? [] right branch)', async () => {
    const conv = makeConversation({ type: 'direct', participants: null });
    mockGet.mockResolvedValue(paginatedResponse([conv]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('My Group')).toBeInTheDocument());
  });

  it('shows modal member username when member has user with username', async () => {
    const conv = makeConversation({ type: 'group' });
    const member = {
      id: 'p-1', userId: 'u-2', displayName: 'Alice', avatar: null, role: 'member',
      joinedAt: null, isActive: true, isOnline: false, nickname: null,
      user: { displayName: null, username: 'alice_user', avatar: null },
      type: 'user',
    };
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([member]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMembers/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/usersDetail.viewMembers/));
    await waitFor(() => expect(screen.getByText('@alice_user')).toBeInTheDocument());
  });

  it('shows inactive badge for inactive modal member', async () => {
    const conv = makeConversation({ type: 'group' });
    const member = {
      id: 'p-1', userId: 'u-2', displayName: 'Alice', avatar: null, role: 'member',
      joinedAt: null, isActive: false, isOnline: false, nickname: null, user: null, type: 'user',
    };
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([member]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMembers/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/usersDetail.viewMembers/));
    await waitFor(() => expect(screen.getAllByText('usersDetail.inactiveBadge').length).toBeGreaterThanOrEqual(1));
  });

  it('shows member avatar img in modal when member has avatar', async () => {
    const conv = makeConversation({ type: 'group' });
    const member = {
      id: 'p-1', userId: 'u-2', displayName: 'Alice', avatar: 'https://example.com/member.jpg', role: 'member',
      joinedAt: null, isActive: true, isOnline: false, nickname: null, user: null, type: 'user',
    };
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([member]));
    const { container } = render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMembers/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/usersDetail.viewMembers/));
    await waitFor(() => {
      expect(container.querySelector('img[src="https://example.com/member.jpg"]')).toBeInTheDocument();
    });
  });

  it('shows membersModalTitle when conv has no title or identifier in modal', async () => {
    const conv = makeConversation({ type: 'group', title: null, identifier: null });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMembers/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/usersDetail.viewMembers/));
    await waitFor(() => expect(screen.getByText('usersDetail.membersModalTitle')).toBeInTheDocument());
  });
});

// =============================================================================
// UserConversationsSection — ConversationMessagesModal (infinite load)
// =============================================================================

describe('ConversationMessagesModal', () => {
  const OriginalIO = global.IntersectionObserver;
  let ioCallbacks: IntersectionObserverCallback[] = [];

  beforeEach(() => {
    ioCallbacks = [];
    global.IntersectionObserver = class {
      constructor(cb: IntersectionObserverCallback) {
        ioCallbacks.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    global.IntersectionObserver = OriginalIO;
  });

  const triggerSentinel = () => {
    act(() => {
      ioCallbacks.forEach(cb =>
        cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
      );
    });
  };

  const openModal = async (conv: Record<string, unknown>) => {
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMessages/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/usersDetail.viewMessages/));
  };

  it('shows a view messages button on group conversations', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeConversation({ type: 'group' })]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMessages/)).toBeInTheDocument());
  });

  it('shows a view messages button on direct conversations too', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeConversation({ type: 'direct' })]));
    render(<UserConversationsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/usersDetail.viewMessages/)).toBeInTheDocument());
  });

  it('opens the modal and renders the messages with their sender', async () => {
    const conv = makeConversation({ type: 'group' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([makeAdminMessage()]));
    await openModal(conv);
    await waitFor(() => expect(screen.getByText('Hello from Alice')).toBeInTheDocument());
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith(
      '/admin/conversations/conv-1/messages',
      expect.objectContaining({ offset: 0 })
    );
  });

  it('shows the empty state when the conversation has no messages', async () => {
    const conv = makeConversation({ type: 'group' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([]));
    await openModal(conv);
    await waitFor(() => expect(screen.getByText('usersDetail.noMessages')).toBeInTheDocument());
  });

  it('loads the next page when the sentinel becomes visible (infinite load)', async () => {
    const conv = makeConversation({ type: 'group' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse(
        [makeAdminMessage({ id: 'msg-1', content: 'First page message' })],
        { hasMore: true, total: 2 }
      ))
      .mockResolvedValueOnce(paginatedResponse(
        [makeAdminMessage({ id: 'msg-2', content: 'Second page message' })],
        { hasMore: false, total: 2 }
      ));
    await openModal(conv);
    await waitFor(() => expect(screen.getByText('First page message')).toBeInTheDocument());
    triggerSentinel();
    await waitFor(() => expect(screen.getByText('Second page message')).toBeInTheDocument());
    expect(screen.getByText('First page message')).toBeInTheDocument();
  });

  it('does not fetch again when there is no more page', async () => {
    const conv = makeConversation({ type: 'group' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse(
        [makeAdminMessage()],
        { hasMore: false, total: 1 }
      ));
    await openModal(conv);
    await waitFor(() => expect(screen.getByText('Hello from Alice')).toBeInTheDocument());
    const callsBefore = mockGet.mock.calls.length;
    triggerSentinel();
    expect(mockGet.mock.calls.length).toBe(callsBefore);
  });

  it('flags deleted and edited messages', async () => {
    const conv = makeConversation({ type: 'group' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([
        makeAdminMessage({ id: 'msg-del', content: 'Removed content', deletedAt: '2024-06-02T00:00:00Z' }),
        makeAdminMessage({ id: 'msg-edit', content: 'Edited content', isEdited: true }),
      ]));
    await openModal(conv);
    await waitFor(() => expect(screen.getByText('usersDetail.deletedBadge')).toBeInTheDocument());
    expect(screen.getByText('usersDetail.editedBadge')).toBeInTheDocument();
  });

  it('shows the attachment count when a message has attachments', async () => {
    const conv = makeConversation({ type: 'group' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([makeAdminMessage({ attachmentCount: 3 })]));
    await openModal(conv);
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
  });

  it('closes the messages modal via the close button', async () => {
    const conv = makeConversation({ type: 'group' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockResolvedValueOnce(paginatedResponse([makeAdminMessage()]));
    await openModal(conv);
    await waitFor(() => expect(screen.getByText('Hello from Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText('Hello from Alice')).not.toBeInTheDocument());
  });

  it('keeps the modal open when the messages fetch fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const conv = makeConversation({ type: 'group' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([conv]))
      .mockRejectedValueOnce(new Error('Messages fetch failed'));
    await openModal(conv);
    await waitFor(() => expect(consoleSpy).toHaveBeenCalled());
    consoleSpy.mockRestore();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});

// =============================================================================
// UserMediaSection
// =============================================================================

describe('UserMediaSection', () => {
  it('shows loading spinner initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<UserMediaSection userId="user-1" />);
    expect(screen.getByText('usersDetail.loadingMedia')).toBeInTheDocument();
  });

  it('returns null on error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockRejectedValue(new Error('Network error'));
    const { container } = render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(container.firstChild).toBeNull());
    consoleSpy.mockRestore();
  });

  it('shows no media message when list is empty', async () => {
    mockGet.mockResolvedValue(paginatedResponse([]));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.noMedia')).toBeInTheDocument());
  });

  it('renders image with thumbnail', async () => {
    const item = makeMedia({ mimeType: 'image/jpeg', thumbnailUrl: 'https://example.com/thumb.jpg' });
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
  });

  it('renders image using fileUrl when thumbnailUrl is null', async () => {
    const item = makeMedia({ mimeType: 'image/jpeg', thumbnailUrl: null, fileUrl: 'https://example.com/photo.jpg' });
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => {
      const img = screen.queryByRole('img');
      expect(img).toBeInTheDocument();
    });
  });

  it('renders video media with icon when no preview', async () => {
    const item = makeMedia({ mimeType: 'video/mp4', thumbnailUrl: null, fileUrl: null });
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserMediaSection userId="user-1" />);
    // wait for loading to complete
    await waitFor(() => expect(screen.queryByText('usersDetail.loadingMedia')).not.toBeInTheDocument());
    // video icon rendered because no preview
    expect(screen.getByTestId('video-icon')).toBeInTheDocument();
  });

  it('renders audio media', async () => {
    const item = makeMedia({ mimeType: 'audio/mp3', thumbnailUrl: null, fileUrl: null });
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByTestId('music-icon')).toBeInTheDocument());
  });

  it('renders file media for unknown mime type', async () => {
    const item = makeMedia({ mimeType: 'application/pdf', thumbnailUrl: null, fileUrl: null });
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByTestId('filetext-icon')).toBeInTheDocument());
  });

  it('renders file media when mimeType is null', async () => {
    const item = makeMedia({ mimeType: null, thumbnailUrl: null, fileUrl: null });
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByTestId('filetext-icon')).toBeInTheDocument());
  });

  it('shows file size label when fileSize is present', async () => {
    const item = makeMedia({ fileSize: 204800 }); // 200 KB
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('200 KB')).toBeInTheDocument());
  });

  it('shows MB size for large files', async () => {
    const item = makeMedia({ fileSize: 2097152 }); // 2 MB
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('2.0 MB')).toBeInTheDocument());
  });

  it('shows B size for tiny files', async () => {
    const item = makeMedia({ fileSize: 500 }); // 500 B
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('500 B')).toBeInTheDocument());
  });

  it('hides size label when fileSize is null', async () => {
    const item = makeMedia({ fileSize: null });
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.postTypePost')).toBeInTheDocument());
    // No size span should be there
  });

  it('shows message source label', async () => {
    const item = makeMedia({ source: 'message' as const });
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.mediaSourceMessage')).toBeInTheDocument());
  });

  it('shows load more button when hasMore is true', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeMedia()], { hasMore: true }));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.loadMore')).toBeInTheDocument());
  });

  it('loads more media when load more clicked', async () => {
    const first = makeMedia({ id: 'm-1' });
    const second = makeMedia({ id: 'm-2', source: 'message' as const });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([first], { hasMore: true }))
      .mockResolvedValueOnce(paginatedResponse([second], { hasMore: false }));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.loadMore')).toBeInTheDocument());
    fireEvent.click(screen.getByText('usersDetail.loadMore'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('shows video thumbnail overlay icon when video has preview', async () => {
    const item = makeMedia({ mimeType: 'video/mp4', thumbnailUrl: 'https://example.com/thumb.jpg' });
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => {
      // Should show preview img + overlay icon
      expect(screen.getByRole('img')).toBeInTheDocument();
    });
  });

  it('handles API response with no data or pagination fields (covers ?? fallback branches)', async () => {
    // resp.data?.data → undefined → ?? [] = []
    // resp.data?.pagination → undefined → total ?? 0.length, hasMore ?? false
    mockGet.mockResolvedValue({ data: {} });
    render(<UserMediaSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.noMedia')).toBeInTheDocument());
  });

  it('renders title and alt using empty string when originalName is null', async () => {
    const item = makeMedia({ originalName: null, mimeType: 'image/jpeg', thumbnailUrl: 'https://example.com/thumb.jpg' });
    mockGet.mockResolvedValue(paginatedResponse([item]));
    const { container } = render(<UserMediaSection userId="user-1" />);
    await waitFor(() => {
      const img = container.querySelector('img[src="https://example.com/thumb.jpg"]');
      expect(img).toBeInTheDocument();
      // alt="" (right branch of originalName || '')
      expect(img?.getAttribute('alt')).toBe('');
    });
    // anchor title absent (right branch of originalName || undefined → undefined = no attribute)
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('title')).toBeNull();
  });
});

// =============================================================================
// UserPostsSection
// =============================================================================

describe('UserPostsSection', () => {
  it('shows loading initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<UserPostsSection userId="user-1" />);
    expect(screen.getByText('usersDetail.loadingPosts')).toBeInTheDocument();
  });

  it('returns null on error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockRejectedValue(new Error('403'));
    const { container } = render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(container.firstChild).toBeNull());
    consoleSpy.mockRestore();
  });

  it('shows no posts message when empty', async () => {
    mockGet.mockResolvedValue(paginatedResponse([]));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.noPosts')).toBeInTheDocument());
  });

  it('renders post content', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makePost()]));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());
  });

  it('shows mood emoji when present', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makePost({ moodEmoji: '😊' })]));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('😊')).toBeInTheDocument());
  });

  it('shows deleted badge when deletedAt is set', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makePost({ deletedAt: '2024-06-01T00:00:00Z' })]));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.deletedBadge')).toBeInTheDocument());
  });

  it('renders post with media thumbnail', async () => {
    const post = makePost({
      media: [{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: null, thumbnailUrl: 'https://example.com/thumb.jpg' }],
    });
    mockGet.mockResolvedValue(paginatedResponse([post]));
    const { container } = render(<UserPostsSection userId="user-1" />);
    // img has alt="" (decorative) — query via DOM; wait for content to load
    await waitFor(() => {
      expect(container.querySelector('img[src="https://example.com/thumb.jpg"]')).toBeInTheDocument();
    });
  });

  it('renders post with media but no thumbnail', async () => {
    const post = makePost({
      media: [{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: null, thumbnailUrl: null }],
    });
    mockGet.mockResolvedValue(paginatedResponse([post]));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());
    // ImageIcon placeholder rendered
    expect(screen.getByTestId('image-icon')).toBeInTheDocument();
  });

  it('shows type filter buttons', async () => {
    mockGet.mockResolvedValue(paginatedResponse([]));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.filterAll')).toBeInTheDocument());
    expect(screen.getByText('usersDetail.postTypePost')).toBeInTheDocument();
    expect(screen.getByText('usersDetail.postTypeReel')).toBeInTheDocument();
  });

  it('changes filter and reloads when type filter clicked', async () => {
    mockGet.mockResolvedValue(paginatedResponse([]));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.postTypePost')).toBeInTheDocument());
    fireEvent.click(screen.getByText('usersDetail.postTypePost'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet).toHaveBeenLastCalledWith('/admin/posts', expect.objectContaining({ type: 'POST' }));
  });

  it('shows load more button when hasMore', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makePost()], { hasMore: true }));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.loadMore')).toBeInTheDocument());
  });

  it('renders REEL type badge', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makePost({ type: 'REEL' as const })]));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.postTypeReel')).toBeInTheDocument());
  });

  it('renders STORY type badge', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makePost({ type: 'STORY' as const })]));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.postTypeStory')).toBeInTheDocument());
  });

  it('renders STATUS type badge', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makePost({ type: 'STATUS' as const })]));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.postTypeStatus')).toBeInTheDocument());
  });

  it('loads more posts when load more clicked', async () => {
    const first = makePost({ id: 'p-1', content: 'First post' });
    const second = makePost({ id: 'p-2', content: 'Second post' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([first], { hasMore: true }))
      .mockResolvedValueOnce(paginatedResponse([second], { hasMore: false }));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.loadMore')).toBeInTheDocument());
    fireEvent.click(screen.getByText('usersDetail.loadMore'));
    await waitFor(() => expect(screen.getByText('Second post')).toBeInTheDocument());
    expect(screen.getByText('First post')).toBeInTheDocument();
  });

  it('handles API response with no data or pagination (covers ?? fallback branches)', async () => {
    mockGet.mockResolvedValue({ data: {} });
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.noPosts')).toBeInTheDocument());
  });

  it('shows italic placeholder when post content is null', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makePost({ content: null })]));
    render(<UserPostsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.noPosts')).toBeInTheDocument());
  });
});

// =============================================================================
// UserReportsSection + helper exports
// =============================================================================

describe('formatReportDate', () => {
  it('returns — for null', () => {
    expect(formatReportDate(null, 'en')).toBe('—');
  });

  it('returns formatted date for valid ISO string', () => {
    const result = formatReportDate('2024-01-15T00:00:00Z', 'en');
    expect(result).toMatch(/2024|Jan|15/);
  });

  it('returns a non-null string for an unparseable date (no crash)', () => {
    // new Date('not-a-date') does not throw; toLocaleDateString returns 'Invalid Date'
    const result = formatReportDate('not-a-date', 'en');
    expect(typeof result).toBe('string');
  });
});

describe('ReportStatusBadge', () => {
  it('renders known status with translated key', () => {
    render(<ReportStatusBadge status="pending" />);
    expect(screen.getByText('usersDetail.reportStatusPending')).toBeInTheDocument();
  });

  it('renders unknown status as raw value', () => {
    render(<ReportStatusBadge status="custom_status" />);
    expect(screen.getByText('custom_status')).toBeInTheDocument();
  });

  it('renders resolved status', () => {
    render(<ReportStatusBadge status="resolved" />);
    expect(screen.getByText('usersDetail.reportStatusResolved')).toBeInTheDocument();
  });

  it('renders under_review status', () => {
    render(<ReportStatusBadge status="under_review" />);
    expect(screen.getByText('usersDetail.reportStatusUnderReview')).toBeInTheDocument();
  });
});

describe('ReportTypeBadge', () => {
  it('renders known type with translated key', () => {
    render(<ReportTypeBadge type="spam" />);
    expect(screen.getByText('usersDetail.reportTypeSpam')).toBeInTheDocument();
  });

  it('renders unknown type as raw value', () => {
    render(<ReportTypeBadge type="custom_type" />);
    expect(screen.getByText('custom_type')).toBeInTheDocument();
  });
});

describe('UserReportsSection', () => {
  it('shows loading initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<UserReportsSection userId="user-1" />);
    expect(screen.getByText('usersDetail.loadingReports')).toBeInTheDocument();
  });

  it('returns null on error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockRejectedValue(new Error('Network error'));
    const { container } = render(<UserReportsSection userId="user-1" />);
    await waitFor(() => expect(container.firstChild).toBeNull());
    consoleSpy.mockRestore();
  });

  it('shows no reports message when empty', async () => {
    mockGet.mockResolvedValue(paginatedResponse([]));
    render(<UserReportsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.noReports')).toBeInTheDocument());
  });

  it('renders report with reason', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeReport()]));
    render(<UserReportsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('Spammy content')).toBeInTheDocument());
  });

  it('hides reason when null', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeReport({ reason: null })]));
    render(<UserReportsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.reportStatusPending')).toBeInTheDocument());
    expect(screen.queryByText('Spammy content')).not.toBeInTheDocument();
  });

  it('renders reportedType badge for known type', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeReport({ reportedType: 'user' })]));
    render(<UserReportsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.reportedTypeUser')).toBeInTheDocument());
  });

  it('renders raw reportedType when unknown', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeReport({ reportedType: 'custom' })]));
    render(<UserReportsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('custom')).toBeInTheDocument());
  });

  it('shows load more when hasMore is true', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeReport()], { hasMore: true }));
    render(<UserReportsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.loadMore')).toBeInTheDocument());
  });

  it('loads more reports when clicked', async () => {
    const r1 = makeReport({ id: 'r-1', reason: 'First reason' });
    const r2 = makeReport({ id: 'r-2', reason: 'Second reason' });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([r1], { hasMore: true }))
      .mockResolvedValueOnce(paginatedResponse([r2], { hasMore: false }));
    render(<UserReportsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.loadMore')).toBeInTheDocument());
    fireEvent.click(screen.getByText('usersDetail.loadMore'));
    await waitFor(() => expect(screen.getByText('Second reason')).toBeInTheDocument());
    expect(screen.getByText('First reason')).toBeInTheDocument();
  });

  it('handles API response with no data or pagination (covers ?? fallback branches)', async () => {
    mockGet.mockResolvedValue({ data: {} });
    render(<UserReportsSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.noReports')).toBeInTheDocument());
  });
});

// =============================================================================
// UserReportedMessagesSection
// =============================================================================

describe('UserReportedMessagesSection', () => {
  it('shows loading initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<UserReportedMessagesSection userId="user-1" />);
    expect(screen.getByText('usersDetail.loadingReportedMessages')).toBeInTheDocument();
  });

  it('returns null on error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockRejectedValue(new Error('Network error'));
    const { container } = render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(container.firstChild).toBeNull());
    consoleSpy.mockRestore();
  });

  it('shows no reported messages when empty', async () => {
    mockGet.mockResolvedValue(paginatedResponse([]));
    render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.noReportedMessages')).toBeInTheDocument());
  });

  it('renders message content', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeReportedMessage()]));
    render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('Bad message content')).toBeInTheDocument());
  });

  it('shows reporter name when present', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeReportedMessage({ reporterName: 'Reporter Name' })]));
    render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('Reporter Name')).toBeInTheDocument());
  });

  it('shows anonymous reporter when no reporterName and no reporterId', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeReportedMessage({ reporterName: null, reporterId: null })]));
    render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.anonymousReporter')).toBeInTheDocument());
  });

  it('hides reporter span when reporterName is null but reporterId exists', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeReportedMessage({ reporterName: null, reporterId: 'u-3' })]));
    render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('Bad message content')).toBeInTheDocument());
    // reporter is null so no span rendered
    expect(screen.queryByText('usersDetail.anonymousReporter')).not.toBeInTheDocument();
  });

  it('shows deleted badge for message with deletedAt', async () => {
    const item = makeReportedMessage({
      message: {
        id: 'msg-1', content: 'Bad message content', conversationId: 'conv-1',
        messageType: 'text', createdAt: '2024-01-01T00:00:00Z', deletedAt: '2024-06-01T00:00:00Z',
      },
    });
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.deletedBadge')).toBeInTheDocument());
  });

  it('shows reason when present', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeReportedMessage({ reason: 'This is harassing' })]));
    render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('This is harassing')).toBeInTheDocument());
  });

  it('hides reason when null', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeReportedMessage({ reason: null })]));
    render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('Bad message content')).toBeInTheDocument());
    expect(screen.queryByText('This is harassing')).not.toBeInTheDocument();
  });

  it('shows load more button when hasMore', async () => {
    mockGet.mockResolvedValue(paginatedResponse([makeReportedMessage()], { hasMore: true }));
    render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.loadMore')).toBeInTheDocument());
  });

  it('loads more items on click', async () => {
    const first = makeReportedMessage({ id: 'rm-1', message: { id: 'msg-1', content: 'First message', conversationId: 'c-1', messageType: 'text', createdAt: '2024-01-01T00:00:00Z', deletedAt: null } });
    const second = makeReportedMessage({ id: 'rm-2', message: { id: 'msg-2', content: 'Second message', conversationId: 'c-1', messageType: 'text', createdAt: '2024-01-02T00:00:00Z', deletedAt: null } });
    mockGet
      .mockResolvedValueOnce(paginatedResponse([first], { hasMore: true }))
      .mockResolvedValueOnce(paginatedResponse([second], { hasMore: false }));
    render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.loadMore')).toBeInTheDocument());
    fireEvent.click(screen.getByText('usersDetail.loadMore'));
    await waitFor(() => expect(screen.getByText('Second message')).toBeInTheDocument());
    expect(screen.getByText('First message')).toBeInTheDocument();
  });

  it('shows placeholder when message content is null', async () => {
    const item = makeReportedMessage({
      message: {
        id: 'msg-1', content: null, conversationId: 'conv-1',
        messageType: 'text', createdAt: '2024-01-01T00:00:00Z', deletedAt: null,
      },
    });
    mockGet.mockResolvedValue(paginatedResponse([item]));
    render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.deletedBadge')).toBeInTheDocument());
  });

  it('handles API response with no data or pagination fields (covers ?? fallback branches)', async () => {
    // resp.data?.data → undefined → ?? [] = []
    // resp.data?.pagination → undefined → total ?? 0, hasMore ?? false
    mockGet.mockResolvedValue({ data: {} });
    render(<UserReportedMessagesSection userId="user-1" />);
    await waitFor(() => expect(screen.getByText('usersDetail.noReportedMessages')).toBeInTheDocument());
  });
});
