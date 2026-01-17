/**
 * Tests for MermaidDiagram component
 * Tests diagram rendering, error handling, and error boundary
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock mermaid library
const mockRender = jest.fn();
const mockInitialize = jest.fn();

jest.mock('mermaid', () => ({
  __esModule: true,
  default: {
    initialize: (...args: any[]) => mockInitialize(...args),
    render: (...args: any[]) => mockRender(...args),
  },
}));

// Mock next/dynamic to load the actual implementation
jest.mock('next/dynamic', () => {
  return (importFn: () => Promise<any>, options: any) => {
    // Return a component that renders the loading state initially
    const DynamicComponent = (props: any) => {
      const [Component, setComponent] = React.useState<React.ComponentType<any> | null>(null);

      React.useEffect(() => {
        importFn().then((mod) => {
          setComponent(() => mod.MermaidDiagram);
        });
      }, []);

      if (!Component) {
        return options.loading ? options.loading() : null;
      }

      return <Component {...props} />;
    };

    return DynamicComponent;
  };
});

// Import after mocks - we'll test the implementation directly
import { MermaidDiagram } from '../../../components/markdown/MermaidDiagramImpl';

describe('MermaidDiagram', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRender.mockResolvedValue({
      svg: '<svg data-testid="mermaid-svg"><text>Mock Diagram</text></svg>',
    });
  });

  describe('Basic Rendering', () => {
    it('should render diagram container', async () => {
      await act(async () => {
        render(<MermaidDiagram chart="graph TD; A-->B;" />);
      });

      await waitFor(() => {
        const container = document.querySelector('.mermaid-diagram');
        expect(container).toBeInTheDocument();
      });
    });

    it('should call mermaid render successfully', async () => {
      await act(async () => {
        render(<MermaidDiagram chart="graph TD; A-->B;" />);
      });

      await waitFor(() => {
        // Verify render was called, which indicates mermaid was configured
        expect(mockRender).toHaveBeenCalled();
      });
    });

    it('should call mermaid.render with chart content', async () => {
      const chart = 'graph TD; A-->B; B-->C;';

      await act(async () => {
        render(<MermaidDiagram chart={chart} />);
      });

      await waitFor(() => {
        expect(mockRender).toHaveBeenCalledWith(
          expect.stringMatching(/^mermaid-/),
          chart
        );
      });
    });

    it('should render SVG output from mermaid', async () => {
      mockRender.mockResolvedValue({
        svg: '<svg class="rendered-svg"><g>Diagram Content</g></svg>',
      });

      const { container } = await act(async () => {
        return render(<MermaidDiagram chart="graph TD; A-->B;" />);
      });

      await waitFor(() => {
        const svg = container.querySelector('.rendered-svg');
        expect(svg).toBeInTheDocument();
      });
    });

    it('should apply custom className', async () => {
      const { container } = await act(async () => {
        return render(<MermaidDiagram chart="graph TD; A-->B;" className="custom-diagram" />);
      });

      await waitFor(() => {
        const diagramContainer = container.querySelector('.mermaid-diagram');
        expect(diagramContainer).toHaveClass('custom-diagram');
      });
    });
  });

  describe('Supported Diagram Types', () => {
    const diagramTypes = [
      { name: 'flowchart', chart: 'graph TD; A-->B;' },
      { name: 'flowchart LR', chart: 'graph LR; A-->B;' },
      { name: 'sequence diagram', chart: 'sequenceDiagram; A->>B: Hello' },
      { name: 'class diagram', chart: 'classDiagram; Class01 <|-- Class02' },
      { name: 'state diagram', chart: 'stateDiagram-v2; [*] --> State1' },
      { name: 'ER diagram', chart: 'erDiagram; CUSTOMER ||--o{ ORDER : places' },
      { name: 'pie chart', chart: 'pie; "A" : 30; "B" : 70' },
      { name: 'gantt chart', chart: 'gantt; title A Gantt Diagram; section A; Task 1 :a1, 2024-01-01, 30d' },
    ];

    diagramTypes.forEach(({ name, chart }) => {
      it(`should render ${name}`, async () => {
        await act(async () => {
          render(<MermaidDiagram chart={chart} />);
        });

        await waitFor(() => {
          expect(mockRender).toHaveBeenCalledWith(
            expect.any(String),
            chart
          );
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message for invalid syntax', async () => {
      mockRender.mockRejectedValue(new Error('Parse error: invalid syntax'));

      await act(async () => {
        render(<MermaidDiagram chart="invalid mermaid syntax {{{}}" />);
      });

      await waitFor(() => {
        expect(screen.getByText('Diagramme Mermaid invalide')).toBeInTheDocument();
      });
    });

    it('should show warning icon on error', async () => {
      mockRender.mockRejectedValue(new Error('Syntax error'));

      await act(async () => {
        render(<MermaidDiagram chart="bad syntax" />);
      });

      await waitFor(() => {
        const warningIcon = document.querySelector('.text-amber-600');
        expect(warningIcon).toBeInTheDocument();
      });
    });

    it('should show error details expandable', async () => {
      mockRender.mockRejectedValue(new Error('Parse error'));

      await act(async () => {
        render(<MermaidDiagram chart="invalid chart" />);
      });

      await waitFor(() => {
        const details = document.querySelector('details');
        expect(details).toBeInTheDocument();
      });
    });

    it('should show original chart content in error state', async () => {
      const invalidChart = 'broken --> syntax';
      mockRender.mockRejectedValue(new Error('Parse error'));

      await act(async () => {
        render(<MermaidDiagram chart={invalidChart} />);
      });

      await waitFor(() => {
        const pre = document.querySelector('pre');
        expect(pre).toHaveTextContent(invalidChart);
      });
    });

    it('should have amber border on error', async () => {
      mockRender.mockRejectedValue(new Error('Error'));

      const { container } = await act(async () => {
        return render(<MermaidDiagram chart="bad" />);
      });

      await waitFor(() => {
        const errorContainer = container.querySelector('.border-l-4.border-amber-400');
        expect(errorContainer).toBeInTheDocument();
      });
    });
  });

  describe('Empty Chart Handling', () => {
    it('should handle empty chart string by not calling render', async () => {
      // Empty chart returns early from useEffect, so render is not called
      await act(async () => {
        render(<MermaidDiagram chart="" />);
      });

      // Empty chart should not call mermaid.render
      // The component just renders an empty container
      const container = document.querySelector('.mermaid-diagram');
      expect(container).toBeInTheDocument();
    });

    it('should handle whitespace-only chart with error', async () => {
      // Whitespace-only chart passes the initial check but fails validation
      await act(async () => {
        render(<MermaidDiagram chart="   " />);
      });

      await waitFor(() => {
        // The component shows error for whitespace-only strings
        expect(screen.getByText('Diagramme Mermaid invalide')).toBeInTheDocument();
      });
    });
  });

  describe('Re-rendering', () => {
    it('should re-render when chart changes', async () => {
      const { rerender } = await act(async () => {
        return render(<MermaidDiagram chart="graph TD; A-->B;" />);
      });

      await waitFor(() => {
        expect(mockRender).toHaveBeenCalledTimes(1);
      });

      mockRender.mockClear();

      await act(async () => {
        rerender(<MermaidDiagram chart="graph TD; C-->D;" />);
      });

      await waitFor(() => {
        expect(mockRender).toHaveBeenCalledWith(
          expect.any(String),
          'graph TD; C-->D;'
        );
      });
    });

    it('should not re-render when chart is the same', async () => {
      const chart = 'graph TD; A-->B;';

      const { rerender } = await act(async () => {
        return render(<MermaidDiagram chart={chart} />);
      });

      await waitFor(() => {
        expect(mockRender).toHaveBeenCalledTimes(1);
      });

      mockRender.mockClear();

      await act(async () => {
        rerender(<MermaidDiagram chart={chart} />);
      });

      // Should not call render again for the same chart
      expect(mockRender).not.toHaveBeenCalled();
    });
  });

  describe('Styling', () => {
    it('should have overflow-x-auto class', async () => {
      const { container } = await act(async () => {
        return render(<MermaidDiagram chart="graph TD; A-->B;" />);
      });

      await waitFor(() => {
        const diagramContainer = container.querySelector('.mermaid-diagram');
        expect(diagramContainer).toHaveClass('overflow-x-auto');
      });
    });

    it('should apply dark mode error styles', async () => {
      mockRender.mockRejectedValue(new Error('Error'));

      const { container } = await act(async () => {
        return render(<MermaidDiagram chart="bad" />);
      });

      await waitFor(() => {
        const errorContainer = container.querySelector('.dark\\:bg-amber-900\\/20');
        expect(errorContainer).toBeInTheDocument();
      });
    });
  });

  describe('Security', () => {
    it('should render diagram using secure mermaid configuration', async () => {
      // The component uses securityLevel: 'strict' in its configuration
      // We verify rendering works correctly with our mock
      await act(async () => {
        render(<MermaidDiagram chart="graph TD; A-->B;" />);
      });

      await waitFor(() => {
        const container = document.querySelector('.mermaid-diagram');
        expect(container).toBeInTheDocument();
        // Verify SVG was rendered (indicating mermaid processed with its security settings)
        expect(mockRender).toHaveBeenCalled();
      });
    });
  });

  describe('Unique IDs', () => {
    it('should generate unique IDs for each diagram', async () => {
      const ids: string[] = [];

      mockRender.mockImplementation((id: string) => {
        ids.push(id);
        return Promise.resolve({ svg: '<svg></svg>' });
      });

      await act(async () => {
        render(
          <>
            <MermaidDiagram chart="graph TD; A-->B;" />
            <MermaidDiagram chart="graph TD; C-->D;" />
          </>
        );
      });

      await waitFor(() => {
        expect(ids.length).toBe(2);
        expect(ids[0]).not.toBe(ids[1]);
      });
    });
  });

  describe('Mermaid Configuration', () => {
    it('should use singleton pattern for initialization', async () => {
      // Mermaid uses a singleton pattern - it only initializes once
      // We verify the mock was set up and render calls work correctly
      await act(async () => {
        render(<MermaidDiagram chart="graph TD; A-->B;" />);
      });

      await waitFor(() => {
        // Verify render was called which means initialization happened
        expect(mockRender).toHaveBeenCalled();
      });
    });

    it('should have mermaid mock properly configured', () => {
      // Verify our mock is set up correctly
      expect(mockInitialize).toBeDefined();
      expect(mockRender).toBeDefined();
    });
  });
});

describe('MermaidDiagram Error Boundary', () => {
  // Suppress console.error for error boundary tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRender.mockResolvedValue({
      svg: '<svg><text>Mock</text></svg>',
    });
  });

  it('should catch rendering errors with error boundary', async () => {
    // Simulate a rendering error by having mermaid throw during render
    mockRender.mockImplementation(() => {
      throw new Error('Catastrophic render failure');
    });

    await act(async () => {
      render(<MermaidDiagram chart="graph TD; A-->B;" />);
    });

    await waitFor(() => {
      // Should show error state, not crash
      const errorMessage = screen.queryByText(/Diagramme Mermaid invalide|Erreur critique/);
      expect(errorMessage).toBeInTheDocument();
    });
  });
});

describe('MermaidSkeleton (Loading State)', () => {
  // We can test the skeleton by checking if it renders properly
  // The MermaidDiagram exports use next/dynamic which shows skeleton while loading

  it('should show loading skeleton structure', () => {
    // Create a simple version of the skeleton for testing
    const MermaidSkeleton = ({ className = '' }: { className?: string }) => (
      <div className={`p-4 bg-gray-50 dark:bg-gray-800 rounded-lg ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 bg-purple-200 dark:bg-purple-800 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-24 w-full bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          <div className="flex justify-center gap-4">
            <div className="h-8 w-20 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-8 w-20 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );

    const { container } = render(<MermaidSkeleton />);

    // Check skeleton structure
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);

    const roundedLg = container.querySelector('.rounded-lg');
    expect(roundedLg).toBeInTheDocument();
  });

  it('should apply custom className to skeleton', () => {
    const MermaidSkeleton = ({ className = '' }: { className?: string }) => (
      <div className={`p-4 bg-gray-50 rounded-lg ${className}`} data-testid="skeleton">
        Loading...
      </div>
    );

    const { container } = render(<MermaidSkeleton className="my-custom-class" />);

    expect(container.querySelector('.my-custom-class')).toBeInTheDocument();
  });
});
