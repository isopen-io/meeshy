import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/stores/language-store', () => ({
  useCurrentInterfaceLanguage: () => 'en',
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/services/api.service', () => ({
  apiService: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children?: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>{children}</span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder }: { value?: string; onChange?: React.ChangeEventHandler<HTMLTextAreaElement>; placeholder?: string }) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} />
  ),
}));

import { UserBanSection } from '@/components/admin/user-detail/UserBanSection';
import { apiService } from '@/services/api.service';

const mockGet = apiService.get as jest.Mock;
const mockPost = apiService.post as jest.Mock;

const BAN = {
  id: 'ban1',
  reason: 'Harcèlement répété',
  expiresAt: null,
  createdAt: '2026-09-01T00:00:00Z',
  liftedAt: null,
  liftReason: null,
  active: true,
};

describe('UserBanSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("affiche l'historique des bans, lit la liste sous data.data (double enveloppe)", async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [BAN] } });

    render(<UserBanSection userId="user123" onUpdate={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('Harcèlement répété')).toBeInTheDocument());
    expect(screen.getByTestId('badge')).toHaveTextContent('ban.statusActive');
  });

  it("affiche l'état vide quand aucun ban n'existe", async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [] } });

    render(<UserBanSection userId="user123" onUpdate={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('ban.noBans')).toBeInTheDocument());
  });

  it('bannit avec le motif saisi et rafraîchit la liste + le compte', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: [] } });
    mockPost.mockResolvedValue({ data: { success: true, data: BAN } });
    mockGet.mockResolvedValueOnce({ data: { success: true, data: [BAN] } });
    const onUpdate = jest.fn();

    render(<UserBanSection userId="user123" onUpdate={onUpdate} />);
    await waitFor(() => expect(screen.getByText('ban.noBans')).toBeInTheDocument());

    fireEvent.click(screen.getByText('ban.banButton'));
    fireEvent.change(screen.getByPlaceholderText('ban.reasonPlaceholder'), { target: { value: 'Spam répété' } });
    fireEvent.click(screen.getByText('ban.confirmButton'));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/users/user123/ban', { reason: 'Spam répété', expiresAt: null })
    );
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  });

  it('refuse un motif trop court sans appeler le POST', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [] } });

    render(<UserBanSection userId="user123" onUpdate={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('ban.noBans')).toBeInTheDocument());

    fireEvent.click(screen.getByText('ban.banButton'));
    fireEvent.change(screen.getByPlaceholderText('ban.reasonPlaceholder'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('ban.confirmButton'));

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('lève un ban en vigueur et rafraîchit', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: [BAN] } });
    mockPost.mockResolvedValue({ data: { success: true, data: { ...BAN, liftedAt: '2026-09-02T00:00:00Z' } } });
    mockGet.mockResolvedValueOnce({ data: { success: true, data: [{ ...BAN, liftedAt: '2026-09-02T00:00:00Z', active: false }] } });
    const onUpdate = jest.fn();

    render(<UserBanSection userId="user123" onUpdate={onUpdate} />);
    await waitFor(() => expect(screen.getByText('ban.liftButton')).toBeInTheDocument());

    fireEvent.click(screen.getByText('ban.liftButton'));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/users/user123/bans/ban1/lift', {})
    );
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  });
});
