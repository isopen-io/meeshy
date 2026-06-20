import { render, fireEvent } from '@testing-library/react';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { NotificationTypeEnum } from '@/types/notification';
import type { Notification } from '@/types/notification';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, animate, exit, transition, layout, ...rest }: any) => (
      <div {...rest}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: any) => children,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

const t = (key: string): string => key;
const formatTimeAgo = (): string => '5 min';

const makeNotif = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'notif_1',
  userId: 'user_recipient',
  type: NotificationTypeEnum.NEW_MESSAGE,
  priority: 'normal',
  content: 'Bonjour',
  actor: { id: 'a', username: 'bob', displayName: 'Bob', avatar: null },
  context: { conversationId: 'conv_1' },
  metadata: {},
  state: { isRead: false, readAt: null, createdAt: new Date() },
  delivery: { emailSent: false, pushSent: false },
  ...overrides,
});

describe('NotificationItem', () => {
  it('rend un lien vers la cible résolue', () => {
    const { container } = render(
      <NotificationItem
        notification={makeNotif({ context: { conversationId: 'conv_1' } })}
        onMarkAsRead={jest.fn()}
        onDelete={jest.fn()}
        onClick={jest.fn()}
        formatTimeAgo={formatTimeAgo}
        t={t}
      />
    );
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/conversations/conv_1');
  });

  it('affiche le rail d\'accent quand non-lu', () => {
    const { container } = render(
      <NotificationItem
        notification={makeNotif({ state: { isRead: false, readAt: null, createdAt: new Date() } })}
        onMarkAsRead={jest.fn()}
        onDelete={jest.fn()}
        onClick={jest.fn()}
        formatTimeAgo={formatTimeAgo}
        t={t}
      />
    );
    const row = container.querySelector('.notification-item') as HTMLElement;
    expect(row.className).toContain('border-blue-600');
  });

  it('pas de rail (transparent) quand lu', () => {
    const { container } = render(
      <NotificationItem
        notification={makeNotif({ state: { isRead: true, readAt: new Date(), createdAt: new Date() } })}
        onMarkAsRead={jest.fn()}
        onDelete={jest.fn()}
        onClick={jest.fn()}
        formatTimeAgo={formatTimeAgo}
        t={t}
      />
    );
    const row = container.querySelector('.notification-item') as HTMLElement;
    expect(row.className).toContain('border-transparent');
    expect(row.className).not.toContain('border-blue-600');
  });

  it('déclenche onMarkAsRead au clic sur ✓ (non-lu)', () => {
    const onMarkAsRead = jest.fn();
    const { getByLabelText } = render(
      <NotificationItem
        notification={makeNotif()}
        onMarkAsRead={onMarkAsRead}
        onDelete={jest.fn()}
        onClick={jest.fn()}
        formatTimeAgo={formatTimeAgo}
        t={t}
      />
    );
    fireEvent.click(getByLabelText('actions.markAsRead'));
    expect(onMarkAsRead).toHaveBeenCalledWith('notif_1');
  });

  it('déclenche onDelete au clic sur 🗑', () => {
    const onDelete = jest.fn();
    const { getByLabelText } = render(
      <NotificationItem
        notification={makeNotif()}
        onMarkAsRead={jest.fn()}
        onDelete={onDelete}
        onClick={jest.fn()}
        formatTimeAgo={formatTimeAgo}
        t={t}
      />
    );
    fireEvent.click(getByLabelText('actions.delete'));
    expect(onDelete).toHaveBeenCalledWith('notif_1');
  });

  it('masque le bouton ✓ pour une notification déjà lue', () => {
    const { queryByLabelText } = render(
      <NotificationItem
        notification={makeNotif({ state: { isRead: true, readAt: new Date(), createdAt: new Date() } })}
        onMarkAsRead={jest.fn()}
        onDelete={jest.fn()}
        onClick={jest.fn()}
        formatTimeAgo={formatTimeAgo}
        t={t}
      />
    );
    expect(queryByLabelText('actions.markAsRead')).toBeNull();
    expect(queryByLabelText('actions.delete')).not.toBeNull();
  });
});
