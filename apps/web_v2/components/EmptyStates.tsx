'use client';

import { EmptyState, EmptyStateProps } from './EmptyState';

/**
 * Empty state for no conversations
 */
export function NoConversationsEmptyState(props: Omit<EmptyStateProps, 'title' | 'icon'>) {
  return (
    <EmptyState
      icon="💬"
      title="Aucune conversation"
      description="Commencez une nouvelle conversation pour discuter avec d'autres utilisateurs."
      {...props}
    />
  );
}

/**
 * Empty state for no messages
 */
export function NoMessagesEmptyState(props: Omit<EmptyStateProps, 'title' | 'icon'>) {
  return (
    <EmptyState
      icon="📭"
      title="Aucun message"
      description="La conversation est vide. Envoyez un message pour commencer la discussion."
      {...props}
    />
  );
}

/**
 * Empty state for no contacts
 */
export function NoContactsEmptyState(props: Omit<EmptyStateProps, 'title' | 'icon'>) {
  return (
    <EmptyState
      icon="👥"
      title="Aucun contact"
      description="Vous n'avez pas encore de contacts. Connectez-vous avec d'autres utilisateurs."
      {...props}
    />
  );
}

/**
 * Empty state for no notifications
 */
export function NoNotificationsEmptyState(props: Omit<EmptyStateProps, 'title' | 'icon'>) {
  return (
    <EmptyState
      icon="🔔"
      title="Aucune notification"
      description="Vous êtes à jour avec toutes vos notifications."
      {...props}
    />
  );
}

/**
 * Empty state for no search results
 */
export function NoSearchResultsEmptyState(
  props: Omit<EmptyStateProps, 'title' | 'icon'> & { query?: string }
) {
  const { query, ...rest } = props;
  return (
    <EmptyState
      icon="🔍"
      title="Aucun résultat"
      description={query ? `Aucun résultat trouvé pour "${query}". Essayez une autre recherche.` : 'Aucun résultat trouvé.'}
      {...rest}
    />
  );
}

/**
 * Empty state for archived conversations
 */
export function NoArchivedConversationsEmptyState(props: Omit<EmptyStateProps, 'title' | 'icon'>) {
  return (
    <EmptyState
      icon="📦"
      title="Aucune conversation archivée"
      description="Archivez des conversations pour les retrouver plus tard."
      {...props}
    />
  );
}

/**
 * Empty state for loading error
 */
export function ErrorEmptyState(
  props: Omit<EmptyStateProps, 'title' | 'icon'> & { retry?: () => void }
) {
  const { retry, ...rest } = props;
  return (
    <EmptyState
      icon="⚠️"
      title="Une erreur s'est produite"
      description="Nous n'avons pas pu charger les données. Veuillez réessayer."
      action={
        retry
          ? {
              label: 'Réessayer',
              onClick: retry,
              variant: 'primary',
            }
          : undefined
      }
      {...rest}
    />
  );
}
