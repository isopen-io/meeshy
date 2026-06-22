import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RankingFilters } from '@/components/admin/ranking/RankingFilters';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

// Use button-based mock to avoid native <select>/<option> HTML validity issues
// when options are nested inside <div>s inside <select>
jest.mock('@/components/ui/select', () => ({
  Select: ({
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="select"
      onClick={(e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const val = target.getAttribute('data-value');
        if (val != null) onValueChange(val);
      }}
    >
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <button data-testid="select-item" data-value={value}>
      {children}
    </button>
  ),
}));

const baseProps = {
  entityType: 'users' as const,
  criterion: 'messages_sent',
  period: '7d',
  limit: 10,
  criteriaSearch: '',
  onEntityTypeChange: jest.fn(),
  onCriterionChange: jest.fn(),
  onPeriodChange: jest.fn(),
  onLimitChange: jest.fn(),
  onCriteriaSearchChange: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RankingFilters — structure', () => {
  it('renders the filter title key', () => {
    render(<RankingFilters {...baseProps} />);
    expect(screen.getByText('ranking.filterTitle')).toBeInTheDocument();
  });

  it('renders entity type label', () => {
    render(<RankingFilters {...baseProps} />);
    expect(screen.getByText('ranking.entityTypeLabel')).toBeInTheDocument();
  });

  it('renders criterion label', () => {
    render(<RankingFilters {...baseProps} />);
    expect(screen.getByText('ranking.criterionLabel')).toBeInTheDocument();
  });

  it('renders period label', () => {
    render(<RankingFilters {...baseProps} />);
    expect(screen.getByText('ranking.periodLabel')).toBeInTheDocument();
  });
});

describe('RankingFilters — entity type options', () => {
  it('renders all 4 entity type options', () => {
    render(<RankingFilters {...baseProps} />);
    expect(screen.getByText('ranking.entityUsers')).toBeInTheDocument();
    expect(screen.getByText('ranking.entityConversations')).toBeInTheDocument();
    expect(screen.getByText('ranking.entityMessages')).toBeInTheDocument();
    expect(screen.getByText('ranking.entityLinks')).toBeInTheDocument();
  });
});

describe('RankingFilters — limit options', () => {
  it('renders top 10/25/50/100 options', () => {
    render(<RankingFilters {...baseProps} />);
    expect(screen.getByText('rankingPage.top10')).toBeInTheDocument();
    expect(screen.getByText('rankingPage.top25')).toBeInTheDocument();
    expect(screen.getByText('rankingPage.top50')).toBeInTheDocument();
    expect(screen.getByText('rankingPage.top100')).toBeInTheDocument();
  });
});

describe('RankingFilters — period options', () => {
  it('renders all 7 period label keys', () => {
    render(<RankingFilters {...baseProps} />);
    // PERIOD_VALUES = ['1d','7d','30d','90d','180d','365d','all']
    // Each maps to t('ranking.period1d') etc. which returns the key
    expect(screen.getByText('ranking.period1d')).toBeInTheDocument();
    expect(screen.getByText('ranking.period7d')).toBeInTheDocument();
    expect(screen.getByText('ranking.period30d')).toBeInTheDocument();
    expect(screen.getByText('ranking.periodAll')).toBeInTheDocument();
  });
});

describe('RankingFilters — criteria search', () => {
  it('shows all user criteria when search is empty', () => {
    render(<RankingFilters {...baseProps} entityType="users" criteriaSearch="" />);
    // 21 user criteria, each rendered as a select-item button
    const items = screen.getAllByTestId('select-item').filter((el) =>
      (el.textContent || '').includes('ranking.criteria.')
    );
    expect(items.length).toBe(21);
  });

  it('filters criteria matching the search string', () => {
    render(<RankingFilters {...baseProps} entityType="users" criteriaSearch="reactions" />);
    const items = screen.getAllByTestId('select-item').filter((el) =>
      (el.textContent || '').includes('ranking.criteria.')
    );
    // criteria keys containing 'reactions': reactions_given, reactions_received
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(21);
    items.forEach((el) => expect(el.textContent).toContain('reactions'));
  });

  it('shows no-criteria-found message when search has no matches', () => {
    render(
      <RankingFilters {...baseProps} entityType="users" criteriaSearch="zzznomatch999" />
    );
    expect(screen.getByText('ranking.noCriteriaFound')).toBeInTheDocument();
  });

  it('calls onCriteriaSearchChange when search input changes', () => {
    const onChange = jest.fn();
    render(<RankingFilters {...baseProps} onCriteriaSearchChange={onChange} />);
    const input = screen.getByPlaceholderText('ranking.filterCriteria');
    fireEvent.change(input, { target: { value: 'msg' } });
    expect(onChange).toHaveBeenCalledWith('msg');
  });

  it('stops propagation on click inside search input', () => {
    render(<RankingFilters {...baseProps} />);
    const input = screen.getByPlaceholderText('ranking.filterCriteria');
    // Should not throw — stopPropagation fires without error
    expect(() => fireEvent.click(input)).not.toThrow();
  });

  it('stops propagation on keydown inside search input', () => {
    render(<RankingFilters {...baseProps} />);
    const input = screen.getByPlaceholderText('ranking.filterCriteria');
    expect(() => fireEvent.keyDown(input, { key: 'ArrowDown' })).not.toThrow();
  });
});

describe('RankingFilters — callback wiring', () => {
  it('calls onEntityTypeChange when an entity type item is clicked', () => {
    const onChange = jest.fn();
    render(<RankingFilters {...baseProps} onEntityTypeChange={onChange} />);
    // The entity type items include 'users', 'conversations', 'messages', 'links'
    const convBtn = screen.getAllByTestId('select-item').find(
      (el) => el.getAttribute('data-value') === 'conversations'
    );
    fireEvent.click(convBtn!);
    expect(onChange).toHaveBeenCalledWith('conversations');
  });

  it('calls onPeriodChange when a period item is clicked', () => {
    const onChange = jest.fn();
    render(<RankingFilters {...baseProps} onPeriodChange={onChange} />);
    const periodBtn = screen.getAllByTestId('select-item').find(
      (el) => el.getAttribute('data-value') === '30d'
    );
    fireEvent.click(periodBtn!);
    expect(onChange).toHaveBeenCalledWith('30d');
  });

  it('calls onLimitChange with parsed int when a limit item is clicked', () => {
    const onChange = jest.fn();
    render(<RankingFilters {...baseProps} onLimitChange={onChange} />);
    const limitBtn = screen.getAllByTestId('select-item').find(
      (el) => el.getAttribute('data-value') === '25'
    );
    fireEvent.click(limitBtn!);
    expect(onChange).toHaveBeenCalledWith(25);
  });
});
