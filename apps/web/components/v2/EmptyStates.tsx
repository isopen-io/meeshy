'use client';

import { useI18n } from '@/hooks/use-i18n';
import { EmptyState, EmptyStateProps } from './EmptyState';

export function NoConversationsEmptyState(props: Omit<EmptyStateProps, 'title' | 'icon'>) {
  const { t } = useI18n('conversations');
  return (
    <EmptyState
      icon="💬"
      title={t('noConversations')}
      description={t('noConversationsDescription')}
      {...props}
    />
  );
}

export function NoMessagesEmptyState(props: Omit<EmptyStateProps, 'title' | 'icon'>) {
  const { t } = useI18n('conversations');
  return (
    <EmptyState
      icon="📭"
      title={t('noMessages')}
      description={t('noMessagesDescription')}
      {...props}
    />
  );
}

export function NoContactsEmptyState(props: Omit<EmptyStateProps, 'title' | 'icon'>) {
  const { t } = useI18n('conversations');
  return (
    <EmptyState
      icon="👥"
      title={t('noContacts')}
      description={t('noContactsDescription')}
      {...props}
    />
  );
}

export function NoNotificationsEmptyState(props: Omit<EmptyStateProps, 'title' | 'icon'>) {
  const { t } = useI18n('conversations');
  return (
    <EmptyState
      icon="🔔"
      title={t('noNotifications')}
      description={t('noNotificationsDescription')}
      {...props}
    />
  );
}

export function NoSearchResultsEmptyState(
  props: Omit<EmptyStateProps, 'title' | 'icon'> & { query?: string }
) {
  const { query, ...rest } = props;
  const { t } = useI18n('conversations');
  return (
    <EmptyState
      icon="🔍"
      title={t('noSearchResults')}
      description={
        query
          ? t('noSearchResultsWithQuery', { query })
          : t('noSearchResultsDescription')
      }
      {...rest}
    />
  );
}

export function NoArchivedConversationsEmptyState(props: Omit<EmptyStateProps, 'title' | 'icon'>) {
  const { t } = useI18n('conversations');
  return (
    <EmptyState
      icon="📦"
      title={t('noArchivedConversations')}
      description={t('noArchivedConversationsDescription')}
      {...props}
    />
  );
}

export function ErrorEmptyState(
  props: Omit<EmptyStateProps, 'title' | 'icon'> & { retry?: () => void }
) {
  const { retry, ...rest } = props;
  const { t } = useI18n('conversations');
  return (
    <EmptyState
      icon="⚠️"
      title={t('errorTitle')}
      description={t('errorDescription')}
      action={
        retry
          ? { label: t('retry'), onClick: retry, variant: 'primary' }
          : undefined
      }
      {...rest}
    />
  );
}
