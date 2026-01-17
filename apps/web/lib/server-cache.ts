/**
 * Server Cache - Fonctions de fetch cachées avec React.cache()
 *
 * React.cache() permet la déduplication automatique des requêtes dans un même
 * cycle de rendu serveur. Cela évite de faire plusieurs fois la même requête
 * si plusieurs composants Server Component en ont besoin.
 *
 * ✅ Avantages:
 * - Déduplication automatique des requêtes identiques
 * - Cache par requête HTTP (pas cross-request)
 * - Zéro configuration nécessaire
 * - Type-safe avec TypeScript
 *
 * ❌ N'utilisez PAS pour:
 * - Client Components (utilisez SWR/React Query)
 * - Cache cross-request (utilisez un LRU cache)
 * - Data mutation (POST/PUT/DELETE)
 *
 * @see https://nextjs.org/docs/app/building-your-application/data-fetching/caching
 */

import { cache } from 'react';
import { buildApiUrl } from '@/lib/config';

/**
 * Type générique pour les réponses API
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Fetch dashboard data avec déduplication
 *
 * Si plusieurs Server Components appellent cette fonction dans le même render,
 * une seule requête HTTP sera effectuée.
 *
 * @example
 * ```tsx
 * // app/dashboard/page.tsx (Server Component)
 * import { getDashboardData } from '@/lib/server-cache';
 *
 * export default async function DashboardPage() {
 *   const data = await getDashboardData();
 *   return <div>{data.stats.totalUsers}</div>;
 * }
 * ```
 */
export const getDashboardData = cache(async () => {
  const response = await fetch(buildApiUrl('/dashboard'), {
    next: { revalidate: 60 }, // Revalider toutes les 60 secondes
  });

  if (!response.ok) {
    throw new Error('Failed to fetch dashboard data');
  }

  return response.json();
});

/**
 * Fetch user data par ID avec déduplication
 *
 * @param userId - ID de l'utilisateur
 * @returns User data
 *
 * @example
 * ```tsx
 * // app/users/[id]/page.tsx (Server Component)
 * import { getUserById } from '@/lib/server-cache';
 *
 * export default async function UserPage({ params }: { params: { id: string } }) {
 *   const user = await getUserById(params.id);
 *   return <div>{user.username}</div>;
 * }
 * ```
 */
export const getUserById = cache(async (userId: string) => {
  const response = await fetch(buildApiUrl(`/users/${userId}`), {
    next: { revalidate: 300 }, // Cache 5 minutes
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user ${userId}`);
  }

  return response.json();
});

/**
 * Fetch conversation data par ID avec déduplication
 *
 * @param conversationId - ID de la conversation
 * @returns Conversation data
 *
 * @example
 * ```tsx
 * // app/conversations/[id]/page.tsx (Server Component)
 * import { getConversationById } from '@/lib/server-cache';
 *
 * export default async function ConversationPage({ params }: { params: { id: string } }) {
 *   const conversation = await getConversationById(params.id);
 *   return <h1>{conversation.title}</h1>;
 * }
 * ```
 */
export const getConversationById = cache(async (conversationId: string) => {
  const response = await fetch(buildApiUrl(`/conversations/${conversationId}`), {
    next: { revalidate: 30 }, // Cache 30 secondes (data temps réel)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch conversation ${conversationId}`);
  }

  return response.json();
});

/**
 * Fetch messages d'une conversation avec déduplication
 *
 * @param conversationId - ID de la conversation
 * @param options - Options de pagination
 * @returns Messages array
 *
 * @example
 * ```tsx
 * // app/conversations/[id]/messages/page.tsx (Server Component)
 * import { getConversationMessages } from '@/lib/server-cache';
 *
 * export default async function MessagesPage({ params }: { params: { id: string } }) {
 *   const messages = await getConversationMessages(params.id);
 *   return <MessageList messages={messages} />;
 * }
 * ```
 */
export const getConversationMessages = cache(
  async (
    conversationId: string,
    options: { limit?: number; offset?: number } = {}
  ) => {
    const { limit = 50, offset = 0 } = options;
    const url = `${buildApiUrl(`/conversations/${conversationId}/messages`)}?limit=${limit}&offset=${offset}`;

    const response = await fetch(url, {
      next: { revalidate: 10 }, // Cache 10 secondes (data très dynamique)
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch messages for conversation ${conversationId}`);
    }

    return response.json();
  }
);

/**
 * Fetch groups/communities avec déduplication
 *
 * @returns Groups array
 *
 * @example
 * ```tsx
 * // app/groups/page.tsx (Server Component)
 * import { getGroups } from '@/lib/server-cache';
 *
 * export default async function GroupsPage() {
 *   const groups = await getGroups();
 *   return <GroupList groups={groups} />;
 * }
 * ```
 */
export const getGroups = cache(async () => {
  const response = await fetch(buildApiUrl('/groups'), {
    next: { revalidate: 60 }, // Cache 1 minute
  });

  if (!response.ok) {
    throw new Error('Failed to fetch groups');
  }

  return response.json();
});

/**
 * Fetch group par ID avec déduplication
 *
 * @param groupId - ID du groupe
 * @returns Group data
 */
export const getGroupById = cache(async (groupId: string) => {
  const response = await fetch(buildApiUrl(`/groups/${groupId}`), {
    next: { revalidate: 60 }, // Cache 1 minute
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch group ${groupId}`);
  }

  return response.json();
});

/**
 * Fetch user notifications avec déduplication
 *
 * @param userId - ID de l'utilisateur
 * @returns Notifications array
 */
export const getUserNotifications = cache(async (userId: string) => {
  const response = await fetch(buildApiUrl(`/users/${userId}/notifications`), {
    next: { revalidate: 30 }, // Cache 30 secondes (data temps réel)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch notifications for user ${userId}`);
  }

  return response.json();
});

/**
 * Fetch available languages avec déduplication
 *
 * Cette data change rarement, on peut la cacher plus longtemps
 */
export const getAvailableLanguages = cache(async () => {
  const response = await fetch(buildApiUrl('/languages'), {
    next: { revalidate: 3600 }, // Cache 1 heure (data statique)
  });

  if (!response.ok) {
    throw new Error('Failed to fetch languages');
  }

  return response.json();
});

/**
 * Helper pour revalider manuellement les caches
 *
 * Utilisez avec revalidatePath() ou revalidateTag() de Next.js
 *
 * @example
 * ```tsx
 * import { revalidatePath } from 'next/cache';
 *
 * // Dans un Server Action
 * export async function updateDashboard() {
 *   // ... update logic
 *   revalidatePath('/dashboard'); // Invalide le cache de cette page
 * }
 * ```
 */
export const revalidate = {
  dashboard: () => '/dashboard',
  user: (id: string) => `/users/${id}`,
  conversation: (id: string) => `/conversations/${id}`,
  group: (id: string) => `/groups/${id}`,
};
