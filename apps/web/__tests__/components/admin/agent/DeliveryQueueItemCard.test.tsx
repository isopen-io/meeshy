import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { DeliveryQueueItem } from '@/services/agent-admin.service';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/admin/agent/UserDisplay', () => ({
  UserDisplay: ({ userId, size, showUsername, className }: {
    userId: string; size?: string; showUsername?: boolean; className?: string;
  }) => <span data-testid="user-display" data-size={size} className={className}>{userId}</span>,
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

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, className, maxLength, autoFocus }: {
    value?: string; onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
    className?: string; maxLength?: number; autoFocus?: boolean;
  }) => (
    <textarea data-testid="textarea" value={value} onChange={onChange} className={className} maxLength={maxLength} />
  ),
}));

jest.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children?: React.ReactNode }) => <div data-testid="alert-dialog">{children}</div>,
  AlertDialogTrigger: ({ children, asChild }: { children?: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="alert-dialog-trigger">{children}</div>
  ),
  AlertDialogContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children?: React.ReactNode }) => <div data-testid="alert-dialog-title">{children}</div>,
  AlertDialogDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children?: React.ReactNode }) => (
    <button data-testid="alert-dialog-cancel">{children}</button>
  ),
  AlertDialogAction: ({ children, onClick, className }: {
    children?: React.ReactNode; onClick?: () => void; className?: string;
  }) => (
    <button data-testid="alert-dialog-action" onClick={onClick} className={className}>{children}</button>
  ),
}));

jest.mock('lucide-react', () => ({
  Clock: ({ className }: { className?: string }) => <svg data-testid="clock-icon" className={className} />,
  Pencil: () => <svg data-testid="pencil-icon" />,
  Trash2: () => <svg data-testid="trash2-icon" />,
  Loader2: ({ className }: { className?: string }) => <svg data-testid="loader2-icon" className={className} />,
  MessageSquare: () => <svg data-testid="messagesquare-icon" />,
  SmilePlus: () => <svg data-testid="smileplus-icon" />,
  Check: () => <svg data-testid="check-icon" />,
  X: () => <svg data-testid="x-icon" />,
}));

import DeliveryQueueItemCard from '@/components/admin/agent/DeliveryQueueItemCard';

function makeMessageItem(overrides: Partial<DeliveryQueueItem> = {}): DeliveryQueueItem {
  return {
    id: 'item-1',
    conversationId: 'conv-1',
    scheduledAt: Date.now() + 60000,
    remainingMs: 60000,
    action: {
      type: 'message',
      asUserId: 'user-1',
      content: 'Hello, everyone!',
      originalLanguage: 'fr',
      mentionedUsernames: [],
      delaySeconds: 60,
      messageSource: 'agent',
    },
    ...overrides,
  };
}

function makeReactionItem(overrides: Partial<DeliveryQueueItem> = {}): DeliveryQueueItem {
  return {
    id: 'item-2',
    conversationId: 'conv-1',
    scheduledAt: Date.now() + 30000,
    remainingMs: 30000,
    action: {
      type: 'reaction',
      asUserId: 'user-1',
      targetMessageId: 'msg-abc123456789',
      emoji: '👍',
      delaySeconds: 30,
    },
    ...overrides,
  };
}

describe('DeliveryQueueItemCard — formatCountdown', () => {
  it('shows 0s when scheduledAt is in the past', () => {
    const item = makeMessageItem({ scheduledAt: Date.now() - 5000 });
    render(<DeliveryQueueItemCard item={item} onDelete={jest.fn()} onEdit={jest.fn()} />);
    // Delivering state: shows sending badge instead of countdown
    expect(screen.getByText('agent.deliveryQueue.sending')).toBeInTheDocument();
  });

  it('shows Xs format for seconds-only countdown', () => {
    const item = makeMessageItem({ scheduledAt: Date.now() + 45000 });
    render(<DeliveryQueueItemCard item={item} onDelete={jest.fn()} onEdit={jest.fn()} />);
    expect(screen.getByText('45s')).toBeInTheDocument();
  });

  it('shows Xm YYs format for minute countdown', () => {
    const item = makeMessageItem({ scheduledAt: Date.now() + 75000 });
    render(<DeliveryQueueItemCard item={item} onDelete={jest.fn()} onEdit={jest.fn()} />);
    expect(screen.getByText('1m 15s')).toBeInTheDocument();
  });
});

describe('DeliveryQueueItemCard — message type', () => {
  it('renders message content', () => {
    render(<DeliveryQueueItemCard item={makeMessageItem()} onDelete={jest.fn()} onEdit={jest.fn()} />);
    expect(screen.getByText('Hello, everyone!')).toBeInTheDocument();
  });

  it('shows MessageSquare badge for message type', () => {
    render(<DeliveryQueueItemCard item={makeMessageItem()} onDelete={jest.fn()} onEdit={jest.fn()} />);
    expect(screen.getByTestId('messagesquare-icon')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
  });

  it('shows edit button for message type', () => {
    render(<DeliveryQueueItemCard item={makeMessageItem()} onDelete={jest.fn()} onEdit={jest.fn()} />);
    expect(screen.getByText('agent.deliveryQueue.edit')).toBeInTheDocument();
  });
});

describe('DeliveryQueueItemCard — reaction type', () => {
  it('renders emoji for reaction type', () => {
    render(<DeliveryQueueItemCard item={makeReactionItem()} onDelete={jest.fn()} onEdit={jest.fn()} />);
    expect(screen.getByText('👍')).toBeInTheDocument();
    expect(screen.getByTestId('smileplus-icon')).toBeInTheDocument();
  });

  it('does not show edit button for reaction type', () => {
    render(<DeliveryQueueItemCard item={makeReactionItem()} onDelete={jest.fn()} onEdit={jest.fn()} />);
    expect(screen.queryByText('agent.deliveryQueue.edit')).not.toBeInTheDocument();
  });

  it('shows target message id prefix', () => {
    render(<DeliveryQueueItemCard item={makeReactionItem()} onDelete={jest.fn()} onEdit={jest.fn()} />);
    // targetMessageId 'msg-abc123456789'.slice(0, 12) => 'msg-abc12345'
    expect(screen.getByText(/msg-abc12345/)).toBeInTheDocument();
  });
});

describe('DeliveryQueueItemCard — delivering state', () => {
  it('shows sending badge when scheduledAt is in the past', () => {
    const item = makeMessageItem({ scheduledAt: Date.now() - 5000 });
    render(<DeliveryQueueItemCard item={item} onDelete={jest.fn()} onEdit={jest.fn()} />);
    expect(screen.getByText('agent.deliveryQueue.sending')).toBeInTheDocument();
  });

  it('disables edit button when delivering', () => {
    const item = makeMessageItem({ scheduledAt: Date.now() - 5000 });
    render(<DeliveryQueueItemCard item={item} onDelete={jest.fn()} onEdit={jest.fn()} />);
    const editButton = screen.getByText('agent.deliveryQueue.edit').closest('button');
    expect(editButton).toBeDisabled();
  });
});

describe('DeliveryQueueItemCard — edit mode', () => {
  it('enters edit mode when edit button clicked', () => {
    render(<DeliveryQueueItemCard item={makeMessageItem()} onDelete={jest.fn()} onEdit={jest.fn()} />);
    fireEvent.click(screen.getByText('agent.deliveryQueue.edit'));
    expect(screen.getByTestId('textarea')).toBeInTheDocument();
    expect(screen.getByText('agent.deliveryQueue.save')).toBeInTheDocument();
    expect(screen.getByText('agent.deliveryQueue.cancel')).toBeInTheDocument();
  });

  it('pre-fills textarea with current message content', () => {
    render(<DeliveryQueueItemCard item={makeMessageItem()} onDelete={jest.fn()} onEdit={jest.fn()} />);
    fireEvent.click(screen.getByText('agent.deliveryQueue.edit'));
    expect(screen.getByTestId('textarea')).toHaveValue('Hello, everyone!');
  });

  it('hides the message paragraph in edit mode (only shows textarea)', () => {
    render(<DeliveryQueueItemCard item={makeMessageItem()} onDelete={jest.fn()} onEdit={jest.fn()} />);
    // Before editing: paragraph visible, textarea absent
    expect(screen.getByText('Hello, everyone!')).toBeInTheDocument();
    expect(screen.queryByTestId('textarea')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('agent.deliveryQueue.edit'));
    // After editing: textarea present, actions row hidden
    expect(screen.getByTestId('textarea')).toBeInTheDocument();
    expect(screen.queryByText('agent.deliveryQueue.edit')).not.toBeInTheDocument();
  });

  it('cancels edit mode when cancel clicked', () => {
    render(<DeliveryQueueItemCard item={makeMessageItem()} onDelete={jest.fn()} onEdit={jest.fn()} />);
    fireEvent.click(screen.getByText('agent.deliveryQueue.edit'));
    fireEvent.click(screen.getByText('agent.deliveryQueue.cancel'));
    expect(screen.queryByTestId('textarea')).not.toBeInTheDocument();
    expect(screen.getByText('Hello, everyone!')).toBeInTheDocument();
  });

  it('calls onEdit with trimmed content when save clicked', async () => {
    const onEdit = jest.fn().mockResolvedValue(undefined);
    render(<DeliveryQueueItemCard item={makeMessageItem()} onDelete={jest.fn()} onEdit={onEdit} />);
    fireEvent.click(screen.getByText('agent.deliveryQueue.edit'));
    fireEvent.change(screen.getByTestId('textarea'), { target: { value: '  Updated message  ' } });
    fireEvent.click(screen.getByText('agent.deliveryQueue.save'));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith('item-1', 'Updated message'));
  });

  it('save button disabled when textarea is empty/whitespace', () => {
    render(<DeliveryQueueItemCard item={makeMessageItem()} onDelete={jest.fn()} onEdit={jest.fn()} />);
    fireEvent.click(screen.getByText('agent.deliveryQueue.edit'));
    fireEvent.change(screen.getByTestId('textarea'), { target: { value: '   ' } });
    const saveBtn = screen.getByText('agent.deliveryQueue.save').closest('button');
    expect(saveBtn).toBeDisabled();
  });

  it('exits edit mode after successful save', async () => {
    const onEdit = jest.fn().mockResolvedValue(undefined);
    render(<DeliveryQueueItemCard item={makeMessageItem()} onDelete={jest.fn()} onEdit={onEdit} />);
    fireEvent.click(screen.getByText('agent.deliveryQueue.edit'));
    fireEvent.click(screen.getByText('agent.deliveryQueue.save'));
    await waitFor(() => expect(screen.queryByTestId('textarea')).not.toBeInTheDocument());
  });
});

describe('DeliveryQueueItemCard — countdown interval', () => {
  it('clears interval and shows sending badge when countdown reaches zero', () => {
    jest.useFakeTimers();
    const scheduledAt = Date.now() + 500;
    const item = makeMessageItem({ scheduledAt });
    render(<DeliveryQueueItemCard item={item} onDelete={jest.fn()} onEdit={jest.fn()} />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText('agent.deliveryQueue.sending')).toBeInTheDocument();
    jest.useRealTimers();
  });
});

describe('DeliveryQueueItemCard — delete', () => {
  it('calls onDelete when AlertDialogAction is clicked', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    render(<DeliveryQueueItemCard item={makeMessageItem()} onDelete={onDelete} onEdit={jest.fn()} />);
    fireEvent.click(screen.getByTestId('alert-dialog-action'));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('item-1'));
  });

  it('renders AlertDialog structure with delete action', () => {
    render(<DeliveryQueueItemCard item={makeMessageItem()} onDelete={jest.fn()} onEdit={jest.fn()} />);
    expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
    // Multiple elements show 'delete' key (trigger button + confirm action button)
    expect(screen.getAllByText('agent.deliveryQueue.delete').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('alert-dialog-action')).toBeInTheDocument();
  });
});
