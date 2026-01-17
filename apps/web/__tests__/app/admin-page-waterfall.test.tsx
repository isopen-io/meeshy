/**
 * Test d'optimisation: Élimination du waterfall dans apps/web/app/admin/page.tsx
 *
 * Ce test vérifie que les fetches parallèles fonctionnent correctement et que
 * la gestion d'erreur est robuste.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import AdminDashboard from '@/app/admin/page';
import { authManager } from '@/services/auth-manager.service';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';

// Mocks
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(),
    clearAllSessions: jest.fn(),
    getCurrentUser: jest.fn(),
  },
}));

jest.mock('@/services/admin.service', () => ({
  adminService: {
    getDashboardStats: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock('@/components/admin/AdminLayout', () => {
  return function AdminLayout({ children }: { children: React.ReactNode }) {
    return <div data-testid="admin-layout">{children}</div>;
  };
});

jest.mock('@/utils/user-adapter', () => ({
  getDefaultPermissions: jest.fn(() => ({
    canAccessAdmin: true,
    canManageUsers: true,
  })),
}));

// Mock fetch global
global.fetch = jest.fn();

describe('AdminDashboard - Waterfall Elimination', () => {
  const mockRouter = {
    push: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  describe('Optimisation: Fetches Parallèles', () => {
    it('devrait charger user et stats en parallèle avec Promise.all', async () => {
      // Arrange
      const mockToken = 'test-token';
      const mockUserData = {
        success: true,
        data: {
          user: {
            id: 1,
            username: 'admin',
            displayName: 'Admin User',
            role: 'ADMIN',
            permissions: {
              canAccessAdmin: true,
            },
          },
        },
      };

      const mockStatsData = {
        data: {
          success: true,
          data: {
            statistics: {
              totalUsers: 100,
              activeUsers: 50,
              totalMessages: 1000,
            },
            recentActivity: {
              newUsers: 10,
              newMessages: 50,
            },
            timestamp: new Date().toISOString(),
          },
        },
      };

      (authManager.getAuthToken as jest.Mock).mockReturnValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUserData,
      });
      (adminService.getDashboardStats as jest.Mock).mockResolvedValue(mockStatsData);

      // Capture le timing
      const startTime = Date.now();
      let userFetchTime = 0;
      let statsFetchTime = 0;

      (global.fetch as jest.Mock).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        userFetchTime = Date.now() - startTime;
        return {
          ok: true,
          json: async () => mockUserData,
        };
      });

      (adminService.getDashboardStats as jest.Mock).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        statsFetchTime = Date.now() - startTime;
        return mockStatsData;
      });

      // Act
      render(<AdminDashboard />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/Bienvenue, Admin User/i)).toBeInTheDocument();
      });

      // Vérifier que les fetches ont été appelés
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(adminService.getDashboardStats).toHaveBeenCalledTimes(1);

      // Vérifier la parallélisation: les deux fetches devraient se terminer presque en même temps
      // Si séquentiel: total ≈ 200ms, si parallèle: total ≈ 100ms
      const timeDiff = Math.abs(userFetchTime - statsFetchTime);
      expect(timeDiff).toBeLessThan(50); // Marge de 50ms pour la parallélisation
    });

    it('devrait gérer gracieusement l\'échec du fetch stats sans bloquer l\'accès', async () => {
      // Arrange
      const mockToken = 'test-token';
      const mockUserData = {
        success: true,
        data: {
          user: {
            id: 1,
            username: 'admin',
            role: 'ADMIN',
            permissions: {
              canAccessAdmin: true,
            },
          },
        },
      };

      (authManager.getAuthToken as jest.Mock).mockReturnValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUserData,
      });

      // Simuler une erreur sur le fetch stats
      (adminService.getDashboardStats as jest.Mock).mockRejectedValue(
        new Error('Stats service unavailable')
      );

      // Act
      render(<AdminDashboard />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/Bienvenue, admin/i)).toBeInTheDocument();
      });

      // L'accès devrait être permis malgré l'échec des stats
      expect(mockRouter.push).not.toHaveBeenCalled();

      // Un message d'erreur devrait être affiché
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('statistiques')
      );
    });

    it('devrait rediriger vers login si le fetch user échoue', async () => {
      // Arrange
      const mockToken = 'invalid-token';

      (authManager.getAuthToken as jest.Mock).mockReturnValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
      });

      // Act
      render(<AdminDashboard />);

      // Assert
      await waitFor(() => {
        expect(authManager.clearAllSessions).toHaveBeenCalled();
        expect(mockRouter.push).toHaveBeenCalledWith('/login');
      });
    });

    it('devrait rediriger vers dashboard si l\'utilisateur n\'a pas les permissions admin', async () => {
      // Arrange
      const mockToken = 'test-token';
      const mockUserData = {
        success: true,
        data: {
          user: {
            id: 1,
            username: 'user',
            role: 'USER',
            permissions: {
              canAccessAdmin: false, // Pas de permissions admin
            },
          },
        },
      };

      (authManager.getAuthToken as jest.Mock).mockReturnValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUserData,
      });

      // Act
      render(<AdminDashboard />);

      // Assert
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Accès non autorisé')
        );
      });
    });
  });

  describe('Résilience et Gestion d\'Erreur', () => {
    it('devrait afficher un loader pendant le chargement', () => {
      // Arrange
      (authManager.getAuthToken as jest.Mock).mockReturnValue('test-token');
      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Promise qui ne se résout jamais
      );

      // Act
      render(<AdminDashboard />);

      // Assert
      expect(screen.getByText(/Chargement des données d'administration/i)).toBeInTheDocument();
    });

    it('devrait gérer le cas où le token est absent', async () => {
      // Arrange
      (authManager.getAuthToken as jest.Mock).mockReturnValue(null);

      // Act
      render(<AdminDashboard />);

      // Assert
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('Affichage des Données', () => {
    it('devrait afficher les statistiques correctement', async () => {
      // Arrange
      const mockToken = 'test-token';
      const mockUserData = {
        success: true,
        data: {
          user: {
            id: 1,
            username: 'admin',
            displayName: 'Admin User',
            role: 'ADMIN',
            permissions: {
              canAccessAdmin: true,
            },
          },
        },
      };

      const mockStatsData = {
        data: {
          success: true,
          data: {
            statistics: {
              totalUsers: 150,
              activeUsers: 75,
              totalMessages: 2500,
              totalCommunities: 20,
              totalTranslations: 5000,
            },
            recentActivity: {
              newUsers: 15,
              newMessages: 100,
            },
            timestamp: new Date().toISOString(),
          },
        },
      };

      (authManager.getAuthToken as jest.Mock).mockReturnValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUserData,
      });
      (adminService.getDashboardStats as jest.Mock).mockResolvedValue(mockStatsData);

      // Act
      render(<AdminDashboard />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('150')).toBeInTheDocument(); // totalUsers
        expect(screen.getByText('75 actifs')).toBeInTheDocument(); // activeUsers
        expect(screen.getByText('2500')).toBeInTheDocument(); // totalMessages
      });
    });
  });
});
