import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { agentAdminService } from '@/services/agent-admin.service';
import type { ArchetypeData } from '@/services/agent-admin.service';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: { getArchetypes: jest.fn() },
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string, p?: Record<string, unknown>) => p ? `${key}(${JSON.stringify(p)})` : key }),
}));

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div data-testid="card" className={className}>{children}</div>,
  CardContent: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div data-testid="card-content" className={className}>{children}</div>,
  CardHeader: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div data-testid="card-header" className={className}>{children}</div>,
  CardTitle: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div data-testid="card-title" className={className}>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children?: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

jest.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: { children?: React.ReactNode }) => <div data-testid="collapsible">{children}</div>,
  CollapsibleTrigger: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <button data-testid="collapsible-trigger" className={className}>{children}</button>
  ),
  CollapsibleContent: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="collapsible-content" className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children?: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
  TooltipContent: ({ children }: { children?: React.ReactNode }) => <div data-testid="tooltip-content">{children}</div>,
}));

jest.mock('@/lib/utils', () => ({ cn: (...args: string[]) => args.filter(Boolean).join(' ') }));

jest.mock('lucide-react', () => ({
  ChevronDown: ({ className }: { className?: string }) => <svg data-testid="chevron-down" className={className} />,
}));

import { AgentArchetypesTab } from '@/components/admin/agent/AgentArchetypesTab';

function makeArchetype(overrides: Partial<ArchetypeData> = {}): ArchetypeData {
  return {
    id: 'arch-1',
    name: 'Friendly Helper',
    personaSummary: 'A warm and helpful persona.',
    tone: 'amical',
    vocabularyLevel: 'simple',
    emojiUsage: 'occasionnel',
    typicalLength: 'medium',
    catchphrases: ['Hello!', 'Sure thing!'],
    responseTriggers: ['greeting', 'question'],
    silenceTriggers: ['conflict'],
    ...overrides,
  };
}

describe('AgentArchetypesTab', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows loading skeletons while fetching', () => {
    (agentAdminService.getArchetypes as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<AgentArchetypesTab />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(4);
  });

  it('renders archetypes after successful fetch', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeArchetype()],
    });
    render(<AgentArchetypesTab />);
    await waitFor(() => expect(screen.getByText('Friendly Helper')).toBeInTheDocument());
    expect(screen.getByText('A warm and helpful persona.')).toBeInTheDocument();
  });

  it('shows available count badge', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeArchetype(), makeArchetype({ id: 'arch-2', name: 'Analyst' })],
    });
    render(<AgentArchetypesTab />);
    await waitFor(() => expect(screen.getByText('Analyst')).toBeInTheDocument());
    const countBadge = screen.getByText(/agent\.archetypes\.available/);
    expect(countBadge).toBeInTheDocument();
  });

  it('uses TONE_COLORS for known tone (amical → green class)', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeArchetype({ tone: 'amical' })],
    });
    render(<AgentArchetypesTab />);
    await waitFor(() => screen.getByText('amical'));
    const toneBadge = screen.getByText('amical').closest('[data-testid="badge"]');
    expect(toneBadge?.className).toContain('green');
  });

  it('falls back to gray class for unknown tone', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeArchetype({ tone: 'mysterious' })],
    });
    render(<AgentArchetypesTab />);
    await waitFor(() => screen.getByText('mysterious'));
    const toneBadge = screen.getByText('mysterious').closest('[data-testid="badge"]');
    expect(toneBadge?.className).toContain('gray');
  });

  it('translates known emojiUsage keys (occasionnel)', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeArchetype({ emojiUsage: 'occasionnel' })],
    });
    render(<AgentArchetypesTab />);
    await waitFor(() => screen.getByText('Friendly Helper'));
    expect(screen.getByText('agent.archetypes.emojiUsage.occasionnel')).toBeInTheDocument();
  });

  it('renders raw emojiUsage for unknown key', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeArchetype({ emojiUsage: 'rare' })],
    });
    render(<AgentArchetypesTab />);
    await waitFor(() => screen.getByText('rare'));
  });

  it('renders catchphrases when present', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeArchetype({ catchphrases: ['Bien sûr!'] })],
    });
    render(<AgentArchetypesTab />);
    await waitFor(() => screen.getByText(/Bien sûr/));
  });

  it('skips catchphrases section when empty array', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeArchetype({ catchphrases: [] })],
    });
    render(<AgentArchetypesTab />);
    await waitFor(() => screen.getByText('Friendly Helper'));
    expect(screen.queryByText('agent.archetypes.catchphrases')).not.toBeInTheDocument();
  });

  it('renders responseTriggers in collapsible content', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeArchetype({ responseTriggers: ['greeting'] })],
    });
    render(<AgentArchetypesTab />);
    await waitFor(() => screen.getByText('greeting'));
  });

  it('renders silenceTriggers in collapsible content', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeArchetype({ silenceTriggers: ['conflict'] })],
    });
    render(<AgentArchetypesTab />);
    await waitFor(() => screen.getByText('conflict'));
  });

  it('handles non-array data gracefully (empty array fallback)', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({
      success: true,
      data: null,
    });
    render(<AgentArchetypesTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    expect(screen.queryByTestId('card')).not.toBeInTheDocument();
  });

  it('calls toast.error on service failure', async () => {
    const { toast } = require('sonner');
    (agentAdminService.getArchetypes as jest.Mock).mockRejectedValue(new Error('network'));
    render(<AgentArchetypesTab />);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('handles success=false without crashing', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({ success: false });
    render(<AgentArchetypesTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
  });

  it('falls back to empty array when data is non-array truthy (Array.isArray false branch)', async () => {
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({ success: true, data: {} });
    render(<AgentArchetypesTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    expect(screen.queryByTestId('card')).not.toBeInTheDocument();
  });

  it('handles archetype with undefined catchphrases gracefully', async () => {
    const arch = makeArchetype({ catchphrases: undefined as unknown as string[] });
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({ success: true, data: [arch] });
    render(<AgentArchetypesTab />);
    await waitFor(() => screen.getByText('Friendly Helper'));
    expect(screen.queryByText('agent.archetypes.catchphrases')).not.toBeInTheDocument();
  });

  it('handles archetype with undefined responseTriggers gracefully', async () => {
    const arch = makeArchetype({ responseTriggers: undefined as unknown as string[] });
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({ success: true, data: [arch] });
    render(<AgentArchetypesTab />);
    await waitFor(() => screen.getByText('Friendly Helper'));
    expect(screen.queryByText('greeting')).not.toBeInTheDocument();
  });

  it('handles archetype with undefined silenceTriggers gracefully', async () => {
    const arch = makeArchetype({ silenceTriggers: undefined as unknown as string[] });
    (agentAdminService.getArchetypes as jest.Mock).mockResolvedValue({ success: true, data: [arch] });
    render(<AgentArchetypesTab />);
    await waitFor(() => screen.getByText('Friendly Helper'));
    expect(screen.queryByText('conflict')).not.toBeInTheDocument();
  });
});
