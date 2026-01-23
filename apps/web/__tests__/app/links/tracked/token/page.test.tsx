/**
 * Tests for Tracking Link Details Page (app/links/tracked/[token]/page.tsx)
 *
 * Covers:
 * - Initial render states (loading, error, success)
 * - Statistics display
 * - Error handling (auth, unauthorized, not found)
 * - User interactions (copy link, back navigation)
 * - Charts and data visualization
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// === MOCKS ===

// Mock Next.js router
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/links/tracked/test-token-123',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ token: 'test-token-123' }),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(`{${k}}`, v),
          key
        );
      }
      return key;
    },
  }),
}));

// Mock use-i18n (aliased)
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(`{${k}}`, v),
          key
        );
      }
      return key;
    },
  }),
}));

// Mock tracking links service
let mockStats: any = null;
let mockError: Error | null = null;

jest.mock('@/services/tracking-links', () => ({
  getTrackingLinkStats: jest.fn(() => {
    if (mockError) {
      return Promise.reject(mockError);
    }
    return Promise.resolve(mockStats);
  }),
}));

// Mock clipboard utility
let mockClipboardSuccess = true;
jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn(() =>
    Promise.resolve({
      success: mockClipboardSuccess,
      message: mockClipboardSuccess ? 'Copied!' : 'Failed to copy',
    })
  ),
}));

// Mock DashboardLayout
jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children, title, className }: { children: React.ReactNode; title?: string; className?: string }) => (
    <div data-testid="dashboard-layout" data-title={title} className={className}>
      {children}
    </div>
  ),
}));

// Mock Footer
jest.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}));

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, className, size, ...props }: any) => (
    <button onClick={onClick} className={className} data-variant={variant} data-size={size} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div className={className} data-testid="card">{children}</div>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardHeader: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardTitle: ({ children, className }: any) => <h3 className={className}>{children}</h3>,
  CardDescription: ({ children, className }: any) => <p className={className}>{children}</p>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => (
    <span className={className}>{children}</span>
  ),
}));

// Mock Recharts
jest.mock('recharts', () => ({
  ComposedChart: ({ children, data }: any) => (
    <div data-testid="composed-chart" data-points={data?.length}>{children}</div>
  ),
  Bar: ({ dataKey }: any) => <div data-testid="chart-bar" data-key={dataKey} />,
  Line: ({ dataKey, type }: any) => <div data-testid="chart-line" data-key={dataKey} data-type={type} />,
  XAxis: ({ dataKey }: any) => <div data-testid="x-axis" data-key={dataKey} />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
}));

// Import the component after mocks
import TrackingLinkDetailsPage from '@/app/links/tracked/[token]/page';
import { getTrackingLinkStats } from '@/services/tracking-links';
import { copyToClipboard } from '@/lib/clipboard';

describe('TrackingLinkDetailsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
    mockError = null;
    mockClipboardSuccess = true;
    mockStats = {
      trackingLink: {
        id: 'link-123',
        token: 'test-token-123',
        shortUrl: 'https://meeshy.io/t/abc123',
        originalUrl: 'https://example.com/long-url',
        totalClicks: 100,
        uniqueClicks: 75,
        isActive: true,
        createdAt: '2024-01-15T10:00:00Z',
        lastClickedAt: '2024-01-20T15:30:00Z',
      },
      clicksByDate: {
        '2024-01-15': 10,
        '2024-01-16': 15,
        '2024-01-17': 20,
        '2024-01-18': 25,
        '2024-01-19': 18,
        '2024-01-20': 12,
      },
      clicksByCountry: {
        'United States': 40,
        'France': 25,
        'Germany': 15,
        'Canada': 12,
        'United Kingdom': 8,
      },
      clicksByDevice: {
        'mobile': 55,
        'desktop': 40,
        'tablet': 5,
      },
      clicksByBrowser: {
        'Chrome': 45,
        'Safari': 30,
        'Firefox': 15,
        'Edge': 10,
      },
      topReferrers: [
        { referrer: 'google.com', count: 30 },
        { referrer: 'twitter.com', count: 25 },
        { referrer: 'direct', count: 20 },
        { referrer: 'facebook.com', count: 15 },
        { referrer: 'linkedin.com', count: 10 },
      ],
    };
  });

  describe('Loading State', () => {
    it('should render loading spinner initially', async () => {
      (getTrackingLinkStats as jest.Mock).mockImplementation(
        () => new Promise(() => {})
      );

      const { container } = render(<TrackingLinkDetailsPage />);

      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Error States', () => {
    it('should display not found error when link does not exist', async () => {
      mockError = new Error('404 non trouve');

      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.linkNotFound')).toBeInTheDocument();
      });
    });

    it('should display auth required error and redirect when not authenticated', async () => {
      mockError = new Error('401 Non authentifie');

      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });

      // Should set timeout for redirect
      await waitFor(
        () => {
          expect(mockPush).toHaveBeenCalledWith('/login?redirect=/links/tracked/test-token-123');
        },
        { timeout: 2000 }
      );
    });

    it('should display unauthorized error when user is not the link owner', async () => {
      mockError = new Error('403 Acces non autorise');

      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
    });

    it('should display generic error for unknown errors', async () => {
      mockError = new Error('Unknown server error');

      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
    });

    it('should provide back to links button on error', async () => {
      mockError = new Error('404 non trouve');

      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.backToLinks')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('tracking.details.backToLinks'));

      expect(mockPush).toHaveBeenCalledWith('/links#tracked');
    });
  });

  describe('Success State - Link Information', () => {
    it('should display link short URL', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('https://meeshy.io/t/abc123')).toBeInTheDocument();
      });
    });

    it('should display link token', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getAllByText('test-token-123').length).toBeGreaterThan(0);
      });
    });

    it('should display original URL as clickable link', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        const originalLink = screen.getByRole('link', { name: /example\.com/i });
        expect(originalLink).toHaveAttribute('href', 'https://example.com/long-url');
        expect(originalLink).toHaveAttribute('target', '_blank');
        expect(originalLink).toHaveAttribute('rel', 'noopener noreferrer');
      });
    });

    it('should display active status badge when link is active', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('status.active')).toBeInTheDocument();
      });
    });

    it('should display inactive status badge when link is inactive', async () => {
      mockStats.trackingLink.isActive = false;

      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('status.inactive')).toBeInTheDocument();
      });
    });
  });

  describe('Success State - Statistics', () => {
    it('should display total clicks', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.stats.totalClicks')).toBeInTheDocument();
        expect(screen.getByText('100')).toBeInTheDocument();
      });
    });

    it('should display unique clicks', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.stats.uniqueClicks')).toBeInTheDocument();
        expect(screen.getByText('75')).toBeInTheDocument();
      });
    });

    it('should calculate and display conversion rate', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.stats.conversionRate')).toBeInTheDocument();
        // 75/100 = 75%
        expect(screen.getByText('75%')).toBeInTheDocument();
      });
    });

    it('should display 0% conversion rate when no clicks', async () => {
      mockStats.trackingLink.totalClicks = 0;
      mockStats.trackingLink.uniqueClicks = 0;

      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('0%')).toBeInTheDocument();
      });
    });

    it('should display last click date', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.stats.lastClick')).toBeInTheDocument();
      });
    });

    it('should display "never" when no clicks have been made', async () => {
      mockStats.trackingLink.lastClickedAt = null;

      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.stats.never')).toBeInTheDocument();
      });
    });
  });

  describe('Success State - Data Visualizations', () => {
    it('should display clicks by country section', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.clicksByCountry')).toBeInTheDocument();
        expect(screen.getByText('United States')).toBeInTheDocument();
        expect(screen.getByText('France')).toBeInTheDocument();
      });
    });

    it('should display clicks by device section', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.clicksByDevice')).toBeInTheDocument();
        expect(screen.getByText('mobile')).toBeInTheDocument();
        expect(screen.getByText('desktop')).toBeInTheDocument();
      });
    });

    it('should display top referrers section', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.topReferrers')).toBeInTheDocument();
        expect(screen.getByText('google.com')).toBeInTheDocument();
        expect(screen.getByText('twitter.com')).toBeInTheDocument();
      });
    });

    it('should display clicks by browser section', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.clicksByBrowser')).toBeInTheDocument();
        expect(screen.getByText('Chrome')).toBeInTheDocument();
        expect(screen.getByText('Safari')).toBeInTheDocument();
      });
    });

    it('should display clicks by date chart', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.clicksByDate')).toBeInTheDocument();
        expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
      });
    });

    it('should not display sections when data is empty', async () => {
      mockStats.clicksByCountry = {};
      mockStats.clicksByDevice = {};
      mockStats.clicksByBrowser = {};
      mockStats.topReferrers = [];
      mockStats.clicksByDate = {};

      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.queryByText('tracking.details.clicksByCountry')).not.toBeInTheDocument();
        expect(screen.queryByText('tracking.details.clicksByDevice')).not.toBeInTheDocument();
        expect(screen.queryByText('tracking.details.clicksByBrowser')).not.toBeInTheDocument();
        expect(screen.queryByText('tracking.details.topReferrers')).not.toBeInTheDocument();
        expect(screen.queryByText('tracking.details.clicksByDate')).not.toBeInTheDocument();
      });
    });
  });

  describe('User Interactions', () => {
    it('should copy link to clipboard when copy button is clicked', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.copy')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('tracking.details.copy'));

      await waitFor(() => {
        expect(copyToClipboard).toHaveBeenCalledWith('https://meeshy.io/t/abc123');
        expect(mockToastSuccess).toHaveBeenCalledWith('tracking.success.copied');
      });
    });

    it('should show error toast when copy fails', async () => {
      mockClipboardSuccess = false;

      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.copy')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('tracking.details.copy'));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Failed to copy');
      });
    });

    it('should navigate back to links when back button is clicked', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.backToLinks')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('tracking.details.backToLinks'));

      expect(mockPush).toHaveBeenCalledWith('/links#tracked');
    });
  });

  describe('Link Information Section', () => {
    it('should display link creation date', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.createdOn')).toBeInTheDocument();
      });
    });

    it('should display token in info section', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.token')).toBeInTheDocument();
      });
    });

    it('should display short URL in info section', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.shortUrl')).toBeInTheDocument();
      });
    });

    it('should display original URL in info section', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('tracking.details.originalUrl')).toBeInTheDocument();
      });
    });
  });

  describe('Data Transformation', () => {
    it('should correctly transform API data to component format', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        // Verify that getTrackingLinkStats was called with the token
        expect(getTrackingLinkStats).toHaveBeenCalledWith('test-token-123');
      });
    });

    it('should handle missing data gracefully', async () => {
      mockStats = {
        trackingLink: {
          id: 'link-123',
          token: 'test-token-123',
          shortUrl: 'https://meeshy.io/t/abc123',
          originalUrl: 'https://example.com/long-url',
          totalClicks: 0,
          uniqueClicks: 0,
          isActive: true,
          createdAt: '2024-01-15T10:00:00Z',
          lastClickedAt: null,
        },
        clicksByDate: {},
        clicksByCountry: {},
        clicksByDevice: {},
        clicksByBrowser: {},
        topReferrers: [],
      };

      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('0')).toBeInTheDocument(); // totalClicks
      });
    });

    it('should handle null API response', async () => {
      mockStats = null;
      mockError = new Error('No data returned from API');

      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
    });
  });

  describe('Footer', () => {
    it('should render footer component', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('footer')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        const h1 = screen.getByRole('heading', { level: 1 });
        expect(h1).toBeInTheDocument();
      });
    });

    it('should have accessible links with proper attributes', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        const externalLinks = screen.getAllByRole('link').filter(
          (link) => link.getAttribute('target') === '_blank'
        );

        externalLinks.forEach((link) => {
          expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        });
      });
    });
  });

  describe('Progress Bars', () => {
    it('should render progress bars with correct widths for country data', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        // The progress bars should be rendered based on the percentage
        expect(screen.getByText('40')).toBeInTheDocument(); // United States clicks
        expect(screen.getByText('25')).toBeInTheDocument(); // France clicks
      });
    });

    it('should render progress bars for device data', async () => {
      render(<TrackingLinkDetailsPage />);

      await waitFor(() => {
        expect(screen.getByText('55')).toBeInTheDocument(); // mobile clicks
        expect(screen.getByText('40')).toBeInTheDocument(); // desktop clicks
      });
    });
  });
});
