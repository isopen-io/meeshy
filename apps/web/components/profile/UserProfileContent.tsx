/**
 * `UserProfileContent` — le corps du profil, EXTRAIT de `/u/[id]/page.tsx`.
 *
 * RE-PREUVE avant extraction (directive produit du 2026-08-17, « l'auteur
 * d'un message doit être clickable pour afficher son profil en modale ») :
 * `apps/web/app/u/[id]/page.tsx` est un composant `'use client'` de bout en
 * bout — chargement (`usersService.getUserProfile`/`getUserStats`), demandes
 * d'ami, présence temps réel (`useSocketIOMessaging`), actions (démarrer une
 * conversation, ajouter/annuler une demande d'ami). Rien n'y est du rendu
 * serveur : l'extraction en composant PARTAGÉ est donc possible sans
 * duplication — ni la page ni `UserProfileModal` ne réimplémentent cette
 * logique, les DEUX montent CE fichier.
 *
 * Ce que ce fichier NE PORTE PAS (reste chez l'appelant, par design) :
 *   - le chrome de PAGE (bouton retour, `DashboardLayout`, titre de
 *     breadcrumb) — la modale n'en veut pas (elle a sa propre croix Radix) ;
 *   - le titre affiché — l'appelant le compose lui-même à partir de
 *     `onStateChange` (nom d'utilisateur une fois chargé, libellé générique
 *     sinon), parce que la page l'utilise pour SON breadcrumb et la modale
 *     pour SON `DialogTitle` : deux widgets différents, une seule source de
 *     vérité (`user`), jamais deux résolutions de nom divergentes.
 *
 * `layout` ne fait varier QUE la grille Tailwind (deux colonnes ≥ lg pour la
 * page historique, une colonne empilée pour la modale à largeur contrainte)
 * — la logique de chargement/actions ci-dessous est unique, quel que soit
 * l'appelant.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Users, Activity, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

import { usersService, conversationsService, type UserStats } from '@/services';
import { type User } from '@/types';
import { useI18n } from '@/hooks/useI18n';
import { useUser } from '@/stores';
import { useUserStatusTick } from '@/stores/user-store';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import { getUserInitials } from '@/lib/avatar-utils';
import { getUserDisplayName as resolveDisplayName } from '@/utils/user-display-name';
import { formatPresenceLabel, presenceColorClass } from '@/utils/presence-format';
import { authManager } from '@/services/auth-manager.service';
import { ConversationDropdown } from '@/components/contacts/ConversationDropdown';
import { useFriendRequestsV2 } from '@/hooks/v2/use-friend-requests-v2';

export interface UserProfileLoadState {
  readonly loading: boolean;
  readonly user: User | null;
}

export interface UserProfileContentProps {
  /** Segment de route `/u/{userId}` — id MongoDB OU username, le backend tranche (`usersService.getUserProfile`). */
  readonly userId: string;
  /** `page` (par défaut) — grille historique ≥ lg deux colonnes. `modal` — colonne unique empilée. */
  readonly layout?: 'page' | 'modal';
  /**
   * Remonte `{ loading, user }` à CHAQUE changement. C'est le seul canal par
   * lequel l'appelant apprend le nom d'affichage (pour son propre titre) ou
   * l'échec de résolution — jamais une seconde requête, jamais un second nom
   * recalculé côté appelant.
   */
  readonly onStateChange?: (state: UserProfileLoadState) => void;
  /**
   * Appelé juste avant toute navigation déclenchée par une action de ce
   * composant (nouvelle conversation créée, session expirée → `/login`).
   * La modale l'utilise pour se refermer avant que la route change ; la page
   * n'en a pas besoin (elle EST déjà la destination visible).
   */
  readonly onBeforeNavigate?: () => void;
}

type ReceivedUserStatus = {
  readonly isOnline: boolean;
  readonly lastActiveAt?: Date | null;
};

/**
 * `user:status` — la valeur REÇUE gouverne (chantier « Confidentialité de la
 * présence », F12 ; jumeau hors store de `applyStatusUpdate`, user-store). Un
 * statut MASQUÉ arrive `isOnline:false, lastActiveAt:null` : un `null` EFFACE
 * l'ancien instant, sinon la règle 1/3/5 en dériverait encore away/idle
 * pendant 5 min. Rien n'est fabriqué non plus sur `isOnline:true` sans
 * horodatage — `getUserPresenceStatus` rend déjà `online` dans ce cas, et un
 * `new Date()` inventé deviendrait un « Vu il y a N min » faux dès que le
 * drapeau retombe. Le type partagé `User.lastActiveAt: Date` ne modélise pas
 * la présence masquée : forme absente (`undefined`), comme le store.
 */
const withReceivedStatus = (prevUser: User, received: ReceivedUserStatus): User =>
  ({ ...prevUser, isOnline: received.isOnline, lastActiveAt: received.lastActiveAt ?? undefined }) as User;

export function UserProfileContent({
  userId,
  layout = 'page',
  onStateChange,
  onBeforeNavigate,
}: UserProfileContentProps) {
  const router = useRouter();
  const { t } = useI18n('profile');
  const { t: tContacts, locale } = useI18n('contacts');
  // Re-render sur tick de présence : fait vieillir le libellé relatif
  // (« Vu il y a 5 min » → « 6 min ») et sa couleur sans recharger le profil.
  useUserStatusTick();

  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUser = useUser();

  // Les demandes d'ami passaient par un `fetch` local vers `/friend-requests`
  // — une adresse qui n'existe pas : seules `/friend-requests/received` et
  // `/friend-requests/sent` sont servies. Le `if (response.ok)` avalait le 404,
  // si bien que `friendRequests` restait DÉFINITIVEMENT vide : le bouton
  // « Ajouter en ami » ne savait jamais qu'une demande était déjà en cours et
  // s'affichait comme si de rien n'était (#4189).
  //
  // `useFriendRequestsV2` interroge les deux vraies routes, tient les deux sens
  // dans `allRequests`, applique des mises à jour optimistes et se réinvalide
  // sur les événements Socket.IO. Réécrire ici une quatrième version de ce
  // chargement était précisément ce qui a laissé le défaut passer.
  const {
    allRequests: friendRequests,
    getPendingRequestWithUser,
    sendRequest,
    cancelRequest,
  } = useFriendRequestsV2({ currentUserId: currentUser?.id });

  useEffect(() => {
    onStateChange?.({ loading, user });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const { } = useSocketIOMessaging({
    onUserStatus: (statusUserId: string, username: string, isOnline: boolean, lastActiveAt?: Date | null) => {
      if (statusUserId === userId || statusUserId === user?.id) {
        setUser(prevUser => (prevUser ? withReceivedStatus(prevUser, { isOnline, lastActiveAt }) : null));
      }
    }
  });

  const loadUserProfile = useCallback(async () => {
    try {
      const response = await usersService.getUserProfile(userId);
      setUser(response.data ?? null);
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error(t('userNotFound'));
    }
  }, [userId, t]);

  const loadUserStats = useCallback(async () => {
    try {
      const response = await usersService.getUserStats(userId);
      setStats(response.data ?? null);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          loadUserProfile(),
          loadUserStats(),
        ]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [userId, loadUserProfile, loadUserStats]);

  const navigate = useCallback((path: string) => {
    onBeforeNavigate?.();
    router.push(path);
  }, [onBeforeNavigate, router]);

  const getUserDisplayName = (userData: User): string => {
    return resolveDisplayName(userData, userData.username || 'User');
  };

  const getUserUsername = (userData: User): string => {
    return userData.username || userData.displayName || userData.firstName || 'user';
  };

  const handleStartConversation = async () => {
    if (!user || !currentUser) {
      console.warn('[UserProfileContent] Missing user data:', { user: !!user, currentUser: !!currentUser });
      return;
    }

    if (user.id === currentUser.id) {
      toast.error(t('errors.cannotMessageYourself'));
      return;
    }

    if (!user.id || user.id.trim().length === 0) {
      toast.error(t('errors.invalidUser'));
      return;
    }

    try {
      const conversationName = `${getUserUsername(currentUser)} & ${getUserUsername(user)}`;

      const response = await conversationsService.createConversation({
        type: 'direct',
        title: conversationName,
        participantIds: [user.id],
      });

      navigate(`/conversations/${response.id}`);
      toast.success(t('success.conversationCreated'));
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast.error(t('errors.conversationCreationFailed'));
    }
  };

  // Les deux gestes passent par les mutations du hook : elles appliquent une
  // mise à jour OPTIMISTE, la défont si le réseau refuse, et réinvalident les
  // deux listes. La session expirée reste gérée ici parce qu'elle est une
  // décision de NAVIGATION, qui n'appartient pas au hook de données.
  const handleSendFriendRequest = async () => {
    if (!user) return;

    if (!authManager.getAuthToken()) {
      toast.error(t('errors.sessionExpired'));
      navigate('/login');
      return;
    }

    try {
      await sendRequest(user.id);
      toast.success(t('success.friendRequestSent'));
    } catch (error) {
      console.error('Error sending friend request:', error);
      toast.error(t('errors.sendFriendRequestFailed'));
    }
  };

  const handleCancelFriendRequest = async (requestId: string) => {
    if (!authManager.getAuthToken()) {
      toast.error(t('errors.sessionExpired'));
      navigate('/login');
      return;
    }

    try {
      await cancelRequest(requestId);
      toast.success(t('success.friendRequestCancelled'));
    } catch (error) {
      console.error('Error cancelling friend request:', error);
      toast.error(t('errors.cancelFriendRequestFailed'));
    }
  };

  const isMyProfile = currentUser?.id === user?.id;

  const gridClassName =
    layout === 'modal' ? 'flex flex-col gap-6' : 'grid grid-cols-1 lg:grid-cols-3 gap-6';
  const profileWrapperClassName = layout === 'modal' ? '' : 'lg:col-span-2';

  if (loading) {
    return (
      <div className={gridClassName} data-testid="user-profile-content-loading" role="status" aria-busy="true" aria-label={t('loading')}>
        <div className={profileWrapperClassName}>
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        </div>
        <div>
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Card data-testid="user-profile-content-not-found">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('userNotFound')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-center max-w-sm">
            {t('userNotFoundDescription')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={gridClassName} data-testid="user-profile-content-loaded">
      <div className={profileWrapperClassName}>
        <Card>
          <CardHeader>
            <CardTitle>{t('userProfile')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start space-x-6">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback className="text-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                    {getUserInitials(user)}
                  </AvatarFallback>
                </Avatar>
                {(user.isOnline as boolean | null) != null && (
                  <OnlineIndicator
                    isOnline={getUserStatus(user) === 'online'}
                    status={getUserStatus(user)}
                    size="lg"
                    className="absolute bottom-1 right-1"
                  />
                )}
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="user-profile-display-name">
                    {getUserDisplayName(user)}
                  </h2>
                  {user.username && (
                    <p className="text-gray-600 dark:text-gray-400">
                      @{user.username}
                      {(user.lastActiveAt as Date | string | null) != null && (
                        <>
                          {' · '}
                          <span className={presenceColorClass(user.lastActiveAt, user.isOnline as boolean | null)}>
                            {formatPresenceLabel({
                              lastActiveAt: user.lastActiveAt,
                              isOnline: user.isOnline as boolean | null,
                              t: tContacts,
                              locale,
                            })}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                {user.createdAt && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('memberSince')} {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                )}

                {!isMyProfile && (
                  <div className={cn('flex flex-col gap-3', layout === 'page' && 'sm:flex-row')}>
                    {(() => {
                      const pendingRequest = getPendingRequestWithUser(user.id);
                      if (pendingRequest) {
                        return (
                          <Button
                            onClick={() => handleCancelFriendRequest(pendingRequest.id)}
                            variant="outline"
                            className={cn('w-full', layout === 'page' && 'sm:w-auto', 'border-2 border-orange-500 text-orange-600 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-400 dark:hover:bg-orange-950/30')}
                          >
                            <X className="h-4 w-4 mr-2" />
                            {t('cancelFriendRequest')}
                          </Button>
                        );
                      }
                      return (
                        <Button
                          onClick={handleSendFriendRequest}
                          className={cn('w-full', layout === 'page' && 'sm:w-auto', 'bg-purple-600 hover:bg-purple-700')}
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          {t('addFriend')}
                        </Button>
                      );
                    })()}
                    <ConversationDropdown
                      userId={user.id}
                      onCreateNew={handleStartConversation}
                      variant="outline"
                      className={cn('w-full', layout === 'page' && 'sm:w-auto')}
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {stats && (
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5" />
                <span>{t('userStats')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {stats.messagesSent || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {t('messagesSent')}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {stats.messagesReceived || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {t('messagesReceived')}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">
                    {stats.conversationsCount || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {t('conversations')}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">
                    {stats.groupsCount || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {t('groups')}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default UserProfileContent;
