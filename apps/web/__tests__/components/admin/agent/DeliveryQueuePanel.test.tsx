import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { agentAdminService } from '@/services/agent-admin.service';
import type { DeliveryQueueItem } from '@/services/agent-admin.service';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getDeliveryQueue: jest.fn(),
    deleteDeliveryItem: jest.fn(),
    editDeliveryItem: jest.fn(),
  },
}));

jest.mock('@/hooks/useI18n', () => {
  const t = (key: string) => key;
  return { useI18n: () => ({ t }) };
});

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

jest.mock('@/hooks/admin/use-agent-admin-events', () => ({
  useAgentAdminEvents: jest.fn(),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children?: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size, className }: {
    children?: React.ReactNode; onClick?: () => void; disabled?: boolean;
    variant?: string; size?: string; className?: string;
  }) => (
    <button data-testid="button" data-variant={variant} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

jest.mock('lucide-react', () => ({
  Loader2: ({ className }: { className?: string }) => <svg data-testid="loader2-icon" className={className} />,
  Package: ({ className }: { className?: string }) => <svg data-testid="package-icon" className={className} />,
  RefreshCw: ({ className }: { className?: string }) => <svg data-testid="refreshcw-icon" className={className} />,
  AlertTriangle: ({ className }: { className?: string }) => <svg data-testid="alerttriangle-icon" className={className} />,
}));

// Mock DeliveryQueueItemCard to avoid complex rendering
jest.mock('@/components/admin/agent/DeliveryQueueItemCard', () => ({
  __esModule: true,
  default: ({ item, onDelete, onEdit }: {
    item: DeliveryQueueItem;
    onDelete: (id: string) => Promise<void>;
    onEdit: (id: string, content: string) => Promise<void>;
  }) => (
    <div data-testid="delivery-item" data-id={item.id}>
      <span>{item.id}</span>
      <button data-testid={`delete-${item.id}`} onClick={() => onDelete(item.id)}>delete</button>
      <button data-testid={`edit-${item.id}`} onClick={() => onEdit(item.id, 'new content')}>edit</button>
    </div>
  ),
}));

import DeliveryQueuePanel from '@/components/admin/agent/DeliveryQueuePanel';

const mockGetDeliveryQueue = agentAdminService.getDeliveryQueue as jest.Mock;
const mockDeleteDeliveryItem = agentAdminService.deleteDeliveryItem as jest.Mock;
const mockEditDeliveryItem = agentAdminService.editDeliveryItem as jest.Mock;

function makeItem(id: string): DeliveryQueueItem {
  return {
    id,
    conversationId: 'conv-1',
    scheduledAt: Date.now() + 30000,
    remainingMs: 30000,
    action: {
      type: 'message',
      asUserId: 'user-1',
      content: `Content of ${id}`,
      originalLanguage: 'fr',
      mentionedUsernames: [],
      delaySeconds: 30,
      messageSource: 'agent',
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DeliveryQueuePanel — loading', () => {
  it('shows loading spinner initially', () => {
    mockGetDeliveryQueue.mockReturnValue(new Promise(() => {}));
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    expect(screen.getByTestId('loader2-icon')).toBeInTheDocument();
  });
});

describe('DeliveryQueuePanel — empty state', () => {
  it('shows empty state (Package icon) when items array is empty', async () => {
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: [] });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => expect(screen.getByTestId('package-icon')).toBeInTheDocument());
    expect(screen.queryByTestId('delivery-item')).not.toBeInTheDocument();
  });
});

describe('DeliveryQueuePanel — items render', () => {
  it('renders items after successful fetch', async () => {
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: [makeItem('item-1'), makeItem('item-2')] });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => expect(screen.getAllByTestId('delivery-item')).toHaveLength(2));
    expect(screen.getByText('item-1')).toBeInTheDocument();
    expect(screen.getByText('item-2')).toBeInTheDocument();
  });

  it('shows error state when data is null (guard: success && data must be truthy)', async () => {
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: null });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    // null data → fails success guard → error state shown
    await waitFor(() => expect(screen.getByText('agent.deliveryQueue.loadError')).toBeInTheDocument());
  });
});

describe('DeliveryQueuePanel — error state', () => {
  it('shows error text when service returns success=false', async () => {
    mockGetDeliveryQueue.mockResolvedValue({ success: false, error: 'Oops' });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => expect(screen.getByText('Oops')).toBeInTheDocument());
    expect(screen.getByTestId('alerttriangle-icon')).toBeInTheDocument();
  });

  it('shows serviceUnavailable key when fetch throws', async () => {
    mockGetDeliveryQueue.mockRejectedValue(new Error('network'));
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => expect(screen.getByText('agent.deliveryQueue.serviceUnavailable')).toBeInTheDocument());
  });

  it('shows fallback loadError key when error field is absent', async () => {
    mockGetDeliveryQueue.mockResolvedValue({ success: false });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => expect(screen.getByText('agent.deliveryQueue.loadError')).toBeInTheDocument());
  });

  it('retry button triggers re-fetch', async () => {
    mockGetDeliveryQueue
      .mockResolvedValueOnce({ success: false, error: 'Oops' })
      .mockResolvedValueOnce({ success: true, data: [] });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => expect(screen.getByText('Oops')).toBeInTheDocument());
    const retryBtn = screen.getByText('agent.deliveryQueue.retry');
    fireEvent.click(retryBtn);
    await waitFor(() => expect(screen.getByTestId('package-icon')).toBeInTheDocument());
    expect(mockGetDeliveryQueue).toHaveBeenCalledTimes(2);
  });
});

describe('DeliveryQueuePanel — handleDelete', () => {
  it('removes item from list on successful delete', async () => {
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: [makeItem('item-1'), makeItem('item-2')] });
    mockDeleteDeliveryItem.mockResolvedValue({ success: true });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => expect(screen.getAllByTestId('delivery-item')).toHaveLength(2));
    fireEvent.click(screen.getByTestId('delete-item-1'));
    await waitFor(() => expect(screen.getAllByTestId('delivery-item')).toHaveLength(1));
    expect(screen.queryByText('item-1')).not.toBeInTheDocument();
  });

  it('calls toast.success on successful delete', async () => {
    const { toast } = require('sonner');
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: [makeItem('item-1')] });
    mockDeleteDeliveryItem.mockResolvedValue({ success: true });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('delete-item-1'));
    fireEvent.click(screen.getByTestId('delete-item-1'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('calls toast.error and re-fetches when delete fails', async () => {
    const { toast } = require('sonner');
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: [makeItem('item-1')] });
    mockDeleteDeliveryItem.mockResolvedValue({ success: false, error: 'Already sent' });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('delete-item-1'));
    fireEvent.click(screen.getByTestId('delete-item-1'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(mockGetDeliveryQueue).toHaveBeenCalledTimes(2);
  });

  it('calls toast.error on delete throw', async () => {
    const { toast } = require('sonner');
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: [makeItem('item-1')] });
    mockDeleteDeliveryItem.mockRejectedValue(new Error('network'));
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('delete-item-1'));
    fireEvent.click(screen.getByTestId('delete-item-1'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});

describe('DeliveryQueuePanel — fallback toast key branches', () => {
  it('shows fallback toast key when delete result has no error field', async () => {
    const { toast } = require('sonner');
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: [makeItem('item-1')] });
    mockDeleteDeliveryItem.mockResolvedValue({ success: false });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('delete-item-1'));
    fireEvent.click(screen.getByTestId('delete-item-1'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.queueItemAlreadySent'));
  });

  it('shows fallback toast key when edit result has no error field', async () => {
    const { toast } = require('sonner');
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: [makeItem('item-1')] });
    mockEditDeliveryItem.mockResolvedValue({ success: false });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('edit-item-1'));
    fireEvent.click(screen.getByTestId('edit-item-1'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.queueItemAlreadySent'));
  });

  it('falls back to empty array when data is non-array truthy', async () => {
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: {} });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => expect(screen.getByTestId('package-icon')).toBeInTheDocument());
  });

  it('covers non-matching item in edit map ternary (2 items, 1 updated)', async () => {
    const { toast } = require('sonner');
    const updatedItem = makeItem('item-1');
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: [makeItem('item-1'), makeItem('item-2')] });
    mockEditDeliveryItem.mockResolvedValue({ success: true, data: updatedItem });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => expect(screen.getAllByTestId('delivery-item')).toHaveLength(2));
    fireEvent.click(screen.getByTestId('edit-item-1'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.getAllByTestId('delivery-item')).toHaveLength(2);
  });
});

describe('DeliveryQueuePanel — handleEdit', () => {
  it('updates item in list on successful edit', async () => {
    const updatedItem = { ...makeItem('item-1'), action: { type: 'message' as const, asUserId: 'user-1', content: 'Updated!', originalLanguage: 'fr', mentionedUsernames: [], delaySeconds: 30, messageSource: 'agent' as const } };
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: [makeItem('item-1')] });
    mockEditDeliveryItem.mockResolvedValue({ success: true, data: updatedItem });
    const { toast } = require('sonner');
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('edit-item-1'));
    fireEvent.click(screen.getByTestId('edit-item-1'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('calls toast.error and re-fetches when edit fails', async () => {
    const { toast } = require('sonner');
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: [makeItem('item-1')] });
    mockEditDeliveryItem.mockResolvedValue({ success: false, error: 'Already sent' });
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('edit-item-1'));
    fireEvent.click(screen.getByTestId('edit-item-1'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(mockGetDeliveryQueue).toHaveBeenCalledTimes(2);
  });

  it('calls toast.error on edit throw', async () => {
    const { toast } = require('sonner');
    mockGetDeliveryQueue.mockResolvedValue({ success: true, data: [makeItem('item-1')] });
    mockEditDeliveryItem.mockRejectedValue(new Error('network'));
    render(<DeliveryQueuePanel conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('edit-item-1'));
    fireEvent.click(screen.getByTestId('edit-item-1'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
