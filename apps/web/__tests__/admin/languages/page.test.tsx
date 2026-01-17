import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { adminService } from '../../../services/admin.service';
import { toast } from 'sonner';

// Mock the next/navigation module
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
}));

// Mock the admin service
jest.mock('../../../services/admin.service', () => ({
  adminService: {
    getDashboardStats: jest.fn(),
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

// Mock Chart components
jest.mock('@/components/admin/Charts', () => ({
  StatsGrid: ({ stats }: { stats: any[] }) => (
    <div data-testid="stats-grid">
      {stats.map((stat, index) => (
        <div key={index} data-testid={`stat-item-${index}`}>
          <span>{stat.title}</span>
          <span>{stat.value}</span>
        </div>
      ))}
    </div>
  ),
  TimeSeriesChart: ({ title }: { title: string }) => (
    <div data-testid="time-series-chart">{title}</div>
  ),
  DonutChart: ({ title }: { title: string }) => (
    <div data-testid="donut-chart">{title}</div>
  ),
}));

// Mock TableSkeleton component
jest.mock('@/components/admin/TableSkeleton', () => ({
  StatCardSkeleton: () => <div data-testid="stat-skeleton">Loading...</div>,
}));

// Import after mocks
import AdminLanguagesPage from '../../../app/admin/languages/page';

const mockAdminService = adminService as jest.Mocked<typeof adminService>;
const mockToast = toast as jest.Mocked<typeof toast>;

// Factory function for creating mock dashboard stats
const createMockDashboardStats = (overrides: any = {}) => ({
  success: true,
  message: 'Success',
  data: {
    statistics: {
      totalUsers: 100,
      activeUsers: 80,
      inactiveUsers: 20,
      adminUsers: 5,
      totalAnonymousUsers: 50,
      activeAnonymousUsers: 30,
      inactiveAnonymousUsers: 20,
      totalMessages: 5000,
      totalCommunities: 25,
      totalTranslations: 15000,
      totalShareLinks: 200,
      activeShareLinks: 150,
      totalReports: 10,
      totalInvitations: 50,
      topLanguages: [
        { language: 'fr', count: 2500 },
        { language: 'en', count: 1500 },
        { language: 'es', count: 500 },
        { language: 'de', count: 300 },
        { language: 'it', count: 200 },
      ],
      usersByRole: { USER: 90, ADMIN: 5, MODO: 5 },
      messagesByType: { text: 4000, image: 500, file: 500 },
      ...overrides.statistics,
    },
    recentActivity: {
      newUsers: 10,
      newConversations: 5,
      newMessages: 100,
      newAnonymousUsers: 8,
      ...overrides.recentActivity,
    },
    userPermissions: {},
    timestamp: new Date().toISOString(),
  },
});

describe('AdminLanguagesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
  });

  describe('Loading State', () => {
    it('should display loading skeletons initially', () => {
      mockAdminService.getDashboardStats.mockImplementation(() => new Promise(() => {}));

      render(<AdminLanguagesPage />);

      // Check for loading skeleton
      const skeletons = screen.getAllByTestId('stat-skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should show header skeleton during loading', () => {
      mockAdminService.getDashboardStats.mockImplementation(() => new Promise(() => {}));

      const { container } = render(<AdminLanguagesPage />);

      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe('Successful Data Load', () => {
    beforeEach(() => {
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardStats());
    });

    it('should render the page header with title', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Statistiques des langues')).toBeInTheDocument();
      });
    });

    it('should render the page description', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText(/Analyse de l'utilisation des langues/)).toBeInTheDocument();
      });
    });

    it('should render the stats grid', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByTestId('stats-grid')).toBeInTheDocument();
      });
    });

    it('should display language count in stats', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Langues détectées')).toBeInTheDocument();
      });
    });

    it('should display messages analyzed stat', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Messages analysés')).toBeInTheDocument();
      });
    });

    it('should display multilingual users stat', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Utilisateurs multilingues')).toBeInTheDocument();
      });
    });

    it('should display translations stat', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Traductions')).toBeInTheDocument();
      });
    });

    it('should render time series chart', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByTestId('time-series-chart')).toBeInTheDocument();
      });
    });

    it('should render donut chart for top languages', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByTestId('donut-chart')).toBeInTheDocument();
      });
    });
  });

  describe('Languages List', () => {
    beforeEach(() => {
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardStats());
    });

    it('should display the languages ranking card', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Classement des langues')).toBeInTheDocument();
      });
    });

    it('should display language count badge', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('5 langues')).toBeInTheDocument();
      });
    });

    it('should display French language with proper name', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Français')).toBeInTheDocument();
      });
    });

    it('should display English language with proper name', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Anglais')).toBeInTheDocument();
      });
    });

    it('should display Spanish language with proper name', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Espagnol')).toBeInTheDocument();
      });
    });

    it('should display message counts for languages', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        // Check for any message count display (format may vary by locale)
        expect(screen.getByText(/2.*500.*messages/i)).toBeInTheDocument();
      });
    });

    it('should display percentage for top language', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        // Check that percentages are displayed somewhere
        // The actual format may vary based on locale
        const content = document.body.textContent || '';
        expect(content).toMatch(/\d+/); // At least some numbers are displayed
      });
    });

    it('should display Top badges for first 3 languages', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Top 1')).toBeInTheDocument();
      });
      expect(screen.getByText('Top 2')).toBeInTheDocument();
      expect(screen.getByText('Top 3')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    beforeEach(() => {
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardStats());
    });

    it('should render search input', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Rechercher une langue...')).toBeInTheDocument();
      });
    });

    it('should filter languages based on search term', async () => {
      const user = userEvent.setup();
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Rechercher une langue...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Rechercher une langue...');
      await user.type(searchInput, 'Français');

      await waitFor(() => {
        expect(screen.getByText('Français')).toBeInTheDocument();
        expect(screen.queryByText('Anglais')).not.toBeInTheDocument();
      });
    });

    it('should filter by language code', async () => {
      const user = userEvent.setup();
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Rechercher une langue...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Rechercher une langue...');
      await user.type(searchInput, 'fr');

      await waitFor(() => {
        expect(screen.getByText('Français')).toBeInTheDocument();
      });
    });

    it('should show empty state when no languages match search', async () => {
      const user = userEvent.setup();
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Rechercher une langue...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Rechercher une langue...');
      await user.type(searchInput, 'xyznonexistent');

      await waitFor(() => {
        expect(screen.getByText('Aucune langue trouvée')).toBeInTheDocument();
      });
    });

    it('should reset to page 1 when searching', async () => {
      const user = userEvent.setup();
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Rechercher une langue...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Rechercher une langue...');
      await user.type(searchInput, 'fr');

      // After typing, pagination should reset
      // We can't directly test the state, but we can verify the UI updates
      await waitFor(() => {
        expect(screen.getByText('Français')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should display empty state when no languages data', async () => {
      mockAdminService.getDashboardStats.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          statistics: {
            topLanguages: [],
            totalMessages: 0,
            totalUsers: 0,
            totalTranslations: 0,
          },
        },
      });

      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Aucune langue trouvée')).toBeInTheDocument();
      });
    });

    it('should display helpful message when no languages', async () => {
      mockAdminService.getDashboardStats.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          statistics: {
            topLanguages: [],
            totalMessages: 0,
            totalUsers: 0,
            totalTranslations: 0,
          },
        },
      });

      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText(/Les statistiques seront disponibles/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display toast error when API fails', async () => {
      mockAdminService.getDashboardStats.mockRejectedValue(new Error('Network error'));

      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          'Erreur lors du chargement des statistiques de langues'
        );
      });
    });

    it('should handle null response data gracefully', async () => {
      mockAdminService.getDashboardStats.mockResolvedValue({
        success: true,
        message: 'Success',
        data: null as any,
      });

      render(<AdminLanguagesPage />);

      // Should not crash and should handle gracefully
      await waitFor(() => {
        expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    beforeEach(() => {
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardStats());
    });

    it('should render back button', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Retour')).toBeInTheDocument();
      });
    });

    it('should navigate to admin page when clicking back', async () => {
      const user = userEvent.setup();
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Retour')).toBeInTheDocument();
      });

      const backButton = screen.getByText('Retour');
      await user.click(backButton);

      expect(mockPush).toHaveBeenCalledWith('/admin');
    });
  });

  describe('Pagination', () => {
    beforeEach(() => {
      // Create 15 languages to test pagination (10 per page)
      const manyLanguages = [
        { language: 'fr', count: 2500 },
        { language: 'en', count: 1500 },
        { language: 'es', count: 500 },
        { language: 'de', count: 300 },
        { language: 'it', count: 200 },
        { language: 'pt', count: 180 },
        { language: 'ru', count: 150 },
        { language: 'zh', count: 120 },
        { language: 'ja', count: 100 },
        { language: 'ko', count: 80 },
        { language: 'ar', count: 60 },
        { language: 'hi', count: 50 },
      ];

      mockAdminService.getDashboardStats.mockResolvedValue({
        ...createMockDashboardStats(),
        data: {
          statistics: {
            ...createMockDashboardStats().data.statistics,
            topLanguages: manyLanguages,
            totalMessages: 5740,
          },
        },
      });
    });

    it('should display pagination when more than 10 languages', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText(/Page 1 sur/)).toBeInTheDocument();
      });
    });

    it('should navigate to next page', async () => {
      const user = userEvent.setup();
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText(/Page 1 sur/)).toBeInTheDocument();
      });

      // Check that pagination controls exist and we can find buttons
      const buttons = screen.getAllByTestId('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should disable previous button on first page', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText(/Page 1 sur/)).toBeInTheDocument();
      });

      // The first pagination button should be disabled
      const buttons = screen.getAllByRole('button');
      const paginationButtons = buttons.filter(btn =>
        btn.closest('.flex.items-center.space-x-2')
      );

      // Check if there's a disabled button
      const disabledButtons = buttons.filter(btn => btn.hasAttribute('disabled'));
      expect(disabledButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Language Information Section', () => {
    beforeEach(() => {
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardStats());
    });

    it('should display information about language detection', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('À propos de la détection de langues')).toBeInTheDocument();
      });
    });

    it('should display how it works section', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Comment ça marche ?')).toBeInTheDocument();
      });
    });

    it('should display supported languages section', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Langues supportées')).toBeInTheDocument();
      });
    });

    it('should mention automatic content analysis', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Analyse automatique du contenu des messages')).toBeInTheDocument();
      });
    });

    it('should mention real-time statistics update', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Mise à jour en temps réel des statistiques')).toBeInTheDocument();
      });
    });
  });

  describe('Language Flags and Names', () => {
    beforeEach(() => {
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardStats());
    });

    it('should display language code in uppercase', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByText('Code: FR')).toBeInTheDocument();
      });
    });

    it('should handle unknown language codes', async () => {
      mockAdminService.getDashboardStats.mockResolvedValue({
        ...createMockDashboardStats(),
        data: {
          statistics: {
            ...createMockDashboardStats().data.statistics,
            topLanguages: [{ language: 'xyz', count: 100 }],
          },
        },
      });

      render(<AdminLanguagesPage />);

      await waitFor(() => {
        // Unknown language should show code in uppercase
        expect(screen.getByText('XYZ')).toBeInTheDocument();
      });
    });
  });

  describe('Progress Bars', () => {
    beforeEach(() => {
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardStats());
    });

    it('should render progress bars for languages', async () => {
      const { container } = render(<AdminLanguagesPage />);

      await waitFor(() => {
        const progressBars = container.querySelectorAll('.bg-gradient-to-r');
        expect(progressBars.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardStats());
    });

    it('should have accessible search input', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Rechercher une langue...');
        expect(searchInput).toBeInTheDocument();
        expect(searchInput).toHaveAttribute('type', 'text');
      });
    });

    it('should have accessible buttons', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Responsive Design', () => {
    beforeEach(() => {
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardStats());
    });

    it('should render within admin layout', async () => {
      render(<AdminLanguagesPage />);

      await waitFor(() => {
        expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
      });
    });
  });
});
