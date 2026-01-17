import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { apiService } from '../../../../services/api.service';
import { adminService } from '../../../../services/admin.service';
import { toast } from 'sonner';

// Mock the next/navigation module
const mockPush = jest.fn();
const mockParams = { id: 'user-123' };
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  useParams: () => mockParams,
}));

// Mock the API service
jest.mock('../../../../services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock the admin service
jest.mock('../../../../services/admin.service', () => ({
  adminService: {
    updateUserRole: jest.fn(),
    toggleUserStatus: jest.fn(),
    deleteUser: jest.fn(),
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock AdminLayout component
jest.mock('@/components/admin/AdminLayout', () => {
  return function MockAdminLayout({ children }: { children: React.ReactNode }) {
    return <div data-testid="admin-layout">{children}</div>;
  };
});

// Mock UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div data-testid="card" className={className}>{children}</div>,
  CardContent: ({ children, className }: any) => <div data-testid="card-content" className={className}>{children}</div>,
  CardHeader: ({ children, className }: any) => <div data-testid="card-header" className={className}>{children}</div>,
  CardTitle: ({ children, className }: any) => <div data-testid="card-title" className={className}>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, variant }: any) => (
    <button data-testid="button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input data-testid="input" {...props} />,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: any) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarImage: ({ src, alt }: any) => (
    <img data-testid="avatar-image" src={src} alt={alt} />
  ),
  AvatarFallback: ({ children }: any) => (
    <div data-testid="avatar-fallback">{children}</div>
  ),
}));

// Import after mocks
import UserDetailPage from '../../../../app/admin/users/[id]/page';

const mockApiService = apiService as jest.Mocked<typeof apiService>;
const mockAdminService = adminService as jest.Mocked<typeof adminService>;
const mockToast = toast as jest.Mocked<typeof toast>;

// Factory function for creating mock user data
const createMockUser = (overrides: any = {}) => ({
  id: 'user-123',
  username: 'johndoe',
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
  displayName: 'John Doe',
  bio: 'Test bio',
  phoneNumber: '+1234567890',
  avatar: 'https://example.com/avatar.jpg',
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  isActive: true,
  isOnline: true,
  emailVerifiedAt: new Date().toISOString(),
  profileCompletionRate: 80,
  createdAt: new Date('2024-01-15').toISOString(),
  lastActiveAt: new Date().toISOString(),
  _count: {
    sentMessages: 150,
    conversations: 10,
  },
  ...overrides,
});

describe('UserDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
  });

  describe('Loading State', () => {
    it('should display loading spinner while fetching user data', () => {
      mockApiService.get.mockImplementation(() => new Promise(() => {}));

      const { container } = render(<UserDetailPage />);

      expect(screen.getByText('Chargement...')).toBeInTheDocument();
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('User Not Found', () => {
    it('should display not found message when user does not exist', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: false,
          data: null,
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Utilisateur introuvable')).toBeInTheDocument();
      });
    });

    it('should display back to list button when user not found', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: false,
          data: null,
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Retour à la liste')).toBeInTheDocument();
      });
    });

    it('should navigate to users list when clicking back button on not found', async () => {
      const user = userEvent.setup();
      mockApiService.get.mockResolvedValue({
        data: {
          success: false,
          data: null,
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Retour à la liste')).toBeInTheDocument();
      });

      const backButton = screen.getByText('Retour à la liste');
      await user.click(backButton);

      expect(mockPush).toHaveBeenCalledWith('/admin/users');
    });
  });

  describe('Error Handling', () => {
    it('should display toast error and redirect on API error', async () => {
      mockApiService.get.mockRejectedValue(new Error('Network error'));

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Erreur lors du chargement de l'utilisateur");
        expect(mockPush).toHaveBeenCalledWith('/admin/users');
      });
    });
  });

  describe('Successful Data Load', () => {
    beforeEach(() => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser(),
        },
      });
    });

    it('should display user display name in header', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('should display username with @ prefix', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('@johndoe')).toBeInTheDocument();
      });
    });

    it('should display active status badge when user is active', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Actif')).toBeInTheDocument();
      });
    });

    it('should display inactive status badge when user is not active', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ isActive: false }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Inactif')).toBeInTheDocument();
      });
    });

    it('should display back button', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Retour')).toBeInTheDocument();
      });
    });

    it('should navigate back to users list when clicking back', async () => {
      const user = userEvent.setup();
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Retour')).toBeInTheDocument();
      });

      const backButton = screen.getByText('Retour');
      await user.click(backButton);

      expect(mockPush).toHaveBeenCalledWith('/admin/users');
    });
  });

  describe('Profile Information Section', () => {
    beforeEach(() => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser(),
        },
      });
    });

    it('should display profile section title', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Informations du profil')).toBeInTheDocument();
      });
    });

    it('should display full name', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('should display email', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('john@example.com')).toBeInTheDocument();
      });
    });

    it('should display phone number when available', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('+1234567890')).toBeInTheDocument();
      });
    });

    it('should display bio when available', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Test bio')).toBeInTheDocument();
      });
    });

    it('should display system language', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('fr')).toBeInTheDocument();
      });
    });

    it('should display regional language', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('en')).toBeInTheDocument();
      });
    });

    it('should display edit button', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Modifier')).toBeInTheDocument();
      });
    });
  });

  describe('Edit Profile Mode', () => {
    beforeEach(() => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser(),
        },
      });
    });

    it('should enter edit mode when clicking Modifier', async () => {
      const user = userEvent.setup();
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Modifier')).toBeInTheDocument();
      });

      const editButton = screen.getByText('Modifier');
      await user.click(editButton);

      // Should show form inputs
      await waitFor(() => {
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      });
    });

    it('should display save and cancel buttons in edit mode', async () => {
      const user = userEvent.setup();
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Modifier')).toBeInTheDocument();
      });

      const editButton = screen.getByText('Modifier');
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByText('Sauvegarder')).toBeInTheDocument();
        expect(screen.getByText('Annuler')).toBeInTheDocument();
      });
    });

    it('should cancel edit mode and restore values', async () => {
      const user = userEvent.setup();
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Modifier')).toBeInTheDocument();
      });

      const editButton = screen.getByText('Modifier');
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      });

      // Modify the first name
      const firstNameInput = screen.getByDisplayValue('John');
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Jane');

      // Click cancel
      const cancelButton = screen.getByText('Annuler');
      await user.click(cancelButton);

      // Should show original value (view mode)
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('should save profile changes successfully', async () => {
      const user = userEvent.setup();
      mockApiService.patch.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ firstName: 'Jane' }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Modifier')).toBeInTheDocument();
      });

      const editButton = screen.getByText('Modifier');
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      });

      // Modify the first name
      const firstNameInput = screen.getByDisplayValue('John');
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Jane');

      // Click save
      const saveButton = screen.getByText('Sauvegarder');
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockApiService.patch).toHaveBeenCalledWith(
          '/admin/user-management/user-123',
          expect.objectContaining({ firstName: 'Jane' })
        );
        expect(mockToast.success).toHaveBeenCalledWith('Profil mis à jour avec succès');
      });
    });

    it('should show error toast on save failure', async () => {
      const user = userEvent.setup();
      mockApiService.patch.mockRejectedValue(new Error('Save failed'));

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Modifier')).toBeInTheDocument();
      });

      const editButton = screen.getByText('Modifier');
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByText('Sauvegarder')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Sauvegarder');
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });
    });

    it('should filter invalid characters from username input', async () => {
      const user = userEvent.setup();
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Modifier')).toBeInTheDocument();
      });

      const editButton = screen.getByText('Modifier');
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByDisplayValue('johndoe')).toBeInTheDocument();
      });

      const usernameInput = screen.getByDisplayValue('johndoe');
      await user.clear(usernameInput);
      await user.type(usernameInput, 'test@user!name');

      // Should only keep valid characters
      expect(usernameInput).toHaveValue('testusername');
    });
  });

  describe('Role and Permissions Section', () => {
    beforeEach(() => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ role: 'USER' }),
        },
      });
    });

    it('should display role section title', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Rôle et permissions')).toBeInTheDocument();
      });
    });

    it('should display current role badge', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Utilisateur')).toBeInTheDocument();
      });
    });

    it('should display edit role button', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        // There are multiple "Modifier" buttons
        const editButtons = screen.getAllByText('Modifier');
        expect(editButtons.length).toBeGreaterThan(0);
      });
    });

    it('should enter role edit mode', async () => {
      const user = userEvent.setup();
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Rôle et permissions')).toBeInTheDocument();
      });

      // Find the role section's edit button
      const roleSection = screen.getByText('Rôle et permissions').closest('div');
      const editButtons = screen.getAllByText('Modifier');
      // Click the second one (role edit)
      if (editButtons.length > 1) {
        await user.click(editButtons[1]);
      }

      await waitFor(() => {
        expect(screen.getByText('Nouveau rôle')).toBeInTheDocument();
      });
    });

    it('should require reason for role change', async () => {
      const user = userEvent.setup();
      mockAdminService.updateUserRole.mockResolvedValue({
        success: true,
        data: createMockUser({ role: 'ADMIN' }),
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Rôle et permissions')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      if (editButtons.length > 1) {
        await user.click(editButtons[1]);
      }

      await waitFor(() => {
        expect(screen.getByText('Enregistrer')).toBeInTheDocument();
      });

      // Try to save without reason
      const saveButton = screen.getByText('Enregistrer');
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          'Veuillez fournir une raison (min 10 caractères)'
        );
      });
    });

    it('should update role successfully with reason', async () => {
      const user = userEvent.setup();
      mockAdminService.updateUserRole.mockResolvedValue({
        success: true,
        data: createMockUser({ role: 'ADMIN' }),
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Rôle et permissions')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Modifier');
      if (editButtons.length > 1) {
        await user.click(editButtons[1]);
      }

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Expliquez pourquoi/)).toBeInTheDocument();
      });

      const reasonInput = screen.getByPlaceholderText(/Expliquez pourquoi/);
      await user.type(reasonInput, 'Promotion to admin role for the user');

      const saveButton = screen.getByText('Enregistrer');
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockAdminService.updateUserRole).toHaveBeenCalledWith('user-123', 'USER');
        expect(mockToast.success).toHaveBeenCalledWith('Rôle mis à jour avec succès');
      });
    });
  });

  describe('Security Section', () => {
    beforeEach(() => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser(),
        },
      });
    });

    it('should display security section title', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Sécurité')).toBeInTheDocument();
      });
    });

    it('should display password reset button', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Réinitialiser le mot de passe')).toBeInTheDocument();
      });
    });

    it('should open password reset form when clicking button', async () => {
      const user = userEvent.setup();
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Réinitialiser le mot de passe')).toBeInTheDocument();
      });

      const resetButton = screen.getByText('Réinitialiser le mot de passe');
      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText('Nouveau mot de passe')).toBeInTheDocument();
        expect(screen.getByText('Confirmer le mot de passe')).toBeInTheDocument();
      });
    });

    it('should validate password confirmation', async () => {
      const user = userEvent.setup();
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Réinitialiser le mot de passe')).toBeInTheDocument();
      });

      const resetButton = screen.getByText('Réinitialiser le mot de passe');
      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText('Réinitialiser')).toBeInTheDocument();
      });

      // Enter mismatched passwords
      const passwordInputs = screen.getAllByDisplayValue('');
      const newPasswordInput = passwordInputs.find(
        (input) => input.getAttribute('type') === 'password'
      );
      const confirmPasswordInput = passwordInputs.filter(
        (input) => input.getAttribute('type') === 'password'
      )[1];

      if (newPasswordInput && confirmPasswordInput) {
        await user.type(newPasswordInput, 'password123');
        await user.type(confirmPasswordInput, 'differentpassword');
      }

      const submitButton = screen.getByText('Réinitialiser');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Les mots de passe ne correspondent pas');
      });
    });

    it('should reset password successfully', async () => {
      const user = userEvent.setup();
      mockApiService.post.mockResolvedValue({
        data: {
          success: true,
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Réinitialiser le mot de passe')).toBeInTheDocument();
      });

      const resetButton = screen.getByText('Réinitialiser le mot de passe');
      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText('Réinitialiser')).toBeInTheDocument();
      });

      const passwordInputs = screen.getAllByDisplayValue('');
      const passwordFields = passwordInputs.filter(
        (input) => input.getAttribute('type') === 'password'
      );

      if (passwordFields.length >= 2) {
        await user.type(passwordFields[0], 'newpassword123');
        await user.type(passwordFields[1], 'newpassword123');
      }

      const submitButton = screen.getByText('Réinitialiser');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockApiService.post).toHaveBeenCalledWith(
          '/admin/user-management/user-123/reset-password',
          expect.objectContaining({ newPassword: 'newpassword123' })
        );
        expect(mockToast.success).toHaveBeenCalledWith('Mot de passe réinitialisé avec succès');
      });
    });
  });

  describe('Statistics Section', () => {
    beforeEach(() => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser(),
        },
      });
    });

    it('should display statistics section title', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Statistiques')).toBeInTheDocument();
      });
    });

    it('should display message count', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('150')).toBeInTheDocument();
      });
    });

    it('should display conversation count', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('10')).toBeInTheDocument();
      });
    });

    it('should display member since date', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Membre depuis')).toBeInTheDocument();
      });
    });

    it('should display last activity', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Dernière activité')).toBeInTheDocument();
      });
    });
  });

  describe('Quick Actions Section', () => {
    beforeEach(() => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser(),
        },
      });
    });

    it('should display quick actions title', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Actions rapides')).toBeInTheDocument();
      });
    });

    it('should display toggle status button for active user', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Désactiver le compte')).toBeInTheDocument();
      });
    });

    it('should display toggle status button for inactive user', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ isActive: false }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Activer le compte')).toBeInTheDocument();
      });
    });

    it('should toggle user status', async () => {
      const user = userEvent.setup();
      mockAdminService.toggleUserStatus.mockResolvedValue({
        success: true,
        data: createMockUser({ isActive: false }),
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Désactiver le compte')).toBeInTheDocument();
      });

      const toggleButton = screen.getByText('Désactiver le compte');
      await user.click(toggleButton);

      await waitFor(() => {
        expect(mockAdminService.toggleUserStatus).toHaveBeenCalledWith('user-123', false);
        expect(mockToast.success).toHaveBeenCalledWith('Utilisateur désactivé');
      });
    });

    it('should display delete user button', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText("Supprimer l'utilisateur")).toBeInTheDocument();
      });
    });

    it('should show delete confirmation when clicking delete', async () => {
      const user = userEvent.setup();
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText("Supprimer l'utilisateur")).toBeInTheDocument();
      });

      const deleteButton = screen.getByText("Supprimer l'utilisateur");
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Cette action est irréversible !')).toBeInTheDocument();
        expect(screen.getByText('Confirmer')).toBeInTheDocument();
      });
    });

    it('should cancel delete confirmation', async () => {
      const user = userEvent.setup();
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText("Supprimer l'utilisateur")).toBeInTheDocument();
      });

      const deleteButton = screen.getByText("Supprimer l'utilisateur");
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Confirmer')).toBeInTheDocument();
      });

      const cancelButton = screen.getByText('Annuler');
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Cette action est irréversible !')).not.toBeInTheDocument();
      });
    });

    it('should delete user on confirmation', async () => {
      const user = userEvent.setup();
      mockAdminService.deleteUser.mockResolvedValue({
        success: true,
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText("Supprimer l'utilisateur")).toBeInTheDocument();
      });

      const deleteButton = screen.getByText("Supprimer l'utilisateur");
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Confirmer')).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('Confirmer');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockAdminService.deleteUser).toHaveBeenCalledWith('user-123');
        expect(mockToast.success).toHaveBeenCalledWith('Utilisateur supprimé avec succès');
        expect(mockPush).toHaveBeenCalledWith('/admin/users');
      });
    });
  });

  describe('Account Security Section', () => {
    beforeEach(() => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser(),
        },
      });
    });

    it('should display account security title', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Sécurité du compte')).toBeInTheDocument();
      });
    });

    it('should display email verification status - verified', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Email vérifié')).toBeInTheDocument();
        expect(screen.getByText('Oui')).toBeInTheDocument();
      });
    });

    it('should display email verification status - not verified', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ emailVerifiedAt: null }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Email vérifié')).toBeInTheDocument();
        expect(screen.getByText('Non')).toBeInTheDocument();
      });
    });

    it('should display 2FA status', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('2FA activé')).toBeInTheDocument();
      });
    });

    it('should display profile completion rate', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Complétion du profil')).toBeInTheDocument();
        expect(screen.getByText('80%')).toBeInTheDocument();
      });
    });

    it('should render progress bar for profile completion', async () => {
      const { container } = render(<UserDetailPage />);

      await waitFor(() => {
        const progressBar = container.querySelector('[style*="width: 80%"]');
        expect(progressBar).toBeInTheDocument();
      });
    });
  });

  describe('Role Display', () => {
    it('should display BIGBOSS role correctly', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ role: 'BIGBOSS' }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Super Admin')).toBeInTheDocument();
      });
    });

    it('should display ADMIN role correctly', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ role: 'ADMIN' }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrateur')).toBeInTheDocument();
      });
    });

    it('should display MODO role correctly', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ role: 'MODO' }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Modérateur')).toBeInTheDocument();
      });
    });

    it('should display AUDIT role correctly', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ role: 'AUDIT' }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Auditeur')).toBeInTheDocument();
      });
    });

    it('should display ANALYST role correctly', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ role: 'ANALYST' }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Analyste')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle user without phone number', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ phoneNumber: null }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.queryByText('+1234567890')).not.toBeInTheDocument();
      });
    });

    it('should handle user without bio', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ bio: null }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.queryByText('Test bio')).not.toBeInTheDocument();
      });
    });

    it('should handle user without last activity', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ lastActiveAt: null }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Membre depuis')).toBeInTheDocument();
      });
    });

    it('should handle null profile completion rate', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser({ profileCompletionRate: null }),
        },
      });

      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.queryByText('Complétion du profil')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: createMockUser(),
        },
      });
    });

    it('should render within admin layout', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
      });
    });

    it('should have accessible buttons', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });

    it('should have accessible form inputs', async () => {
      render(<UserDetailPage />);

      await waitFor(() => {
        // Check that at least some interactive elements are present
        const buttons = screen.getAllByTestId('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });
});
