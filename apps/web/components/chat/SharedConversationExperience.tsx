'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { LinkConversationService, type LinkConversationData } from '@/services/link-conversation.service';
import { authManager } from '@/services/auth-manager.service';
import { resolveSharedAccess, type SharedConversationAccess } from '@/lib/conversations/shared-access';
import { useAnonymousSession } from '@/hooks/use-anonymous-session';
import { useI18n } from '@/hooks/useI18n';
import { JoinError } from '@/components/join';
import {
  mapCurrentUserToUser,
  mapParticipantsFromLinkData,
  getAnonymousPermissionHints,
} from '@/utils/participant-mapper';

/**
 * `/chat/:sharedId` — la conversation partagée, DANS la vue courante.
 *
 * Avant : `/chat/:id` échouait dès que l'appelant n'était pas déjà identifié et
 * renvoyait vers `/join/:id`, une page d'accueil séparée. Les deux écrans se
 * relançaient l'un l'autre, au point que trois gardes `sessionStorage`
 * empilées tenaient la boucle de redirection.
 *
 * Maintenant : UN écran, trois rendus, zéro navigation.
 *
 *   membre       → `ConversationLayout` — exactement la vue applicative de
 *                  `/conversations/:id`, responsive téléphone / tablette /
 *                  ordinateur, avec la liste des conversations sur grand écran.
 *   participant  → la surface partagée vivante (socket, composer, permissions
 *                  anonymes).
 *   visiteur     → l'aperçu de lecture + la modale de jonction par-dessus.
 *
 * La modale porte tout le contenu de l'ancienne page `/join` : connexion,
 * création de compte, et le formulaire de compte anonyme avec ses règles
 * `requireNickname` / `requireEmail` / `requireBirthday` / `requireAccount`.
 */
// Les trois surfaces sont EXCLUSIVES : un visiteur ne téléchargera jamais la
// vue applicative complète, et un membre jamais l'aperçu. Sans ce découpage,
// `/chat/:sharedId` embarquait les trois d'un coup — le pire cas pour le rendu
// le plus fréquent (un lien ouvert par quelqu'un qui n'a pas de compte).
const ConversationLayout = dynamic(
  () => import('@/components/conversations/ConversationLayout').then((m) => m.ConversationLayout),
  { ssr: false }
);

const BubbleStreamPage = dynamic(
  () => import('@/components/common/bubble-stream-page').then((m) => m.BubbleStreamPage),
  { ssr: false }
);

const SharedConversationPreviewLazy = dynamic(
  () => import('./SharedConversationPreview').then((m) => m.SharedConversationPreview),
  { ssr: false }
);

const JoinConversationModalLazy = dynamic(
  () => import('./JoinConversationModal').then((m) => m.JoinConversationModal),
  { ssr: false }
);

interface SharedConversationExperienceProps {
  linkId: string;
}

export function SharedConversationExperience({ linkId }: SharedConversationExperienceProps) {
  const { t } = useI18n('chat');

  const [data, setData] = useState<LinkConversationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadFailed, setHasLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [isJoinPromptDismissed, setJoinPromptDismissed] = useState(false);

  const access: SharedConversationAccess | null = useMemo(
    () => (data ? resolveSharedAccess({ data }) : null),
    [data]
  );

  const isParticipant = access?.state === 'participant';
  useAnonymousSession({ enabled: isParticipant, linkId });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setHasLoadFailed(false);

      try {
        const anonymousSession = authManager.getAnonymousSession();
        const payload = await LinkConversationService.getConversationData(linkId, {
          sessionToken: anonymousSession?.token || undefined,
          authToken: authManager.getAuthToken() || undefined,
        });

        if (!cancelled) setData(payload);
      } catch (error) {
        console.error('[SharedConversation] Failed to load link', error);
        if (!cancelled) setHasLoadFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    if (linkId) void load();

    return () => { cancelled = true; };
    // Le corps de cet effet ne lit PAS `t` : le message d'erreur est traduit au
    // rendu. C'est délibéré — `useI18n` renvoie une nouvelle identité de `t` à
    // chaque rendu, donc en dépendre relançait la requête en boucle.
  }, [linkId, reloadToken]);

  // La modale est DÉRIVÉE de l'accès, pas synchronisée par un effet : un effet
  // l'ouvrirait une frame après le premier rendu, et le visiteur verrait
  // l'aperçu nu clignoter avant l'invitation.
  const isJoinModalOpen = access?.state === 'visitor' && !isJoinPromptDismissed;

  const handleJoined = useCallback(() => {
    setJoinPromptDismissed(false);
    setReloadToken((token) => token + 1);
  }, []);

  if (isLoading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"
          role="status"
          aria-label={t('loading')}
        />
      </div>
    );
  }

  if (hasLoadFailed) return <JoinError error={t('errors.invalidLink')} />;

  if (!access || access.state === 'error') {
    const reason = access?.state === 'error' ? access.reason : 'invalid';
    const message =
      reason === 'expired'
        ? t('errors.linkExpired')
        : reason === 'inactive'
          ? t('errors.linkNoLongerActive')
          : t('errors.invalidLink');
    return <JoinError error={message} />;
  }

  // Membre : la vue applicative complète, telle quelle. C'est littéralement
  // « charger le chat associé dans la vue courante ».
  if (access.state === 'member') {
    return <ConversationLayout selectedConversationId={access.conversationId} />;
  }

  if (access.state === 'participant' && data?.currentUser) {
    return (
      <BubbleStreamPage
        user={mapCurrentUserToUser(data.currentUser)}
        conversationId={access.conversationId}
        isAnonymousMode
        linkId={linkId}
        initialParticipants={mapParticipantsFromLinkData(data, true)}
        anonymousPermissionHints={getAnonymousPermissionHints(data.link)}
      />
    );
  }

  const visitorIdentity = access.state === 'visitor' ? access.identity : 'none';

  return (
    <div className="h-[100dvh] w-full overflow-hidden">
      {data && (
        <>
          <SharedConversationPreviewLazy
            data={data}
            onRequestJoin={() => setJoinPromptDismissed(false)}
          />

          <JoinConversationModalLazy
            open={isJoinModalOpen}
            onOpenChange={(next) => setJoinPromptDismissed(!next)}
            linkId={linkId}
            link={data.link}
            conversation={data.conversation}
            identity={visitorIdentity}
            currentUserName={
              data.currentUser?.displayName ||
              [data.currentUser?.firstName, data.currentUser?.lastName].filter(Boolean).join(' ') ||
              data.currentUser?.username
            }
            // Fermer la modale n'a de sens que s'il reste quelque chose à lire
            // derrière : sinon on renverrait le visiteur sur un écran vide.
            canDismiss={data.link.allowViewHistory}
            onJoined={handleJoined}
          />
        </>
      )}
    </div>
  );
}
