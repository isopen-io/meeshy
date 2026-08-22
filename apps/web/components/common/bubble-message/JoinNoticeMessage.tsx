'use client';

import { memo } from 'react';
import { Ghost } from 'lucide-react';
import type { JoinNoticeMetadata } from '@meeshy/shared/utils/join-notice';
import { useI18n } from '@/hooks/useI18n';
import { useOpenParticipantProfile } from '@/components/conversations/participant-profile-context';

interface JoinNoticeMessageProps {
  readonly metadata: JoinNoticeMetadata;
}

/**
 * « X a rejoint la conversation » — une NOTICE centrée, pas une bulle.
 *
 * Sans ce rendu, l'avis s'afficherait comme une prise de parole signée par
 * l'arrivant : avatar, heure, réponse, réactions. Le fil raconterait que le
 * premier mot de chaque nouveau venu est l'annonce de sa propre arrivée. Une
 * notice n'a donc ni auteur affiché, ni horodatage, ni affordance.
 *
 * Le texte vient du CATALOGUE, jamais du `content` stocké : celui-ci est un
 * repli français, et le Prisme Linguistique veut que chaque lecteur voie sa
 * langue. Tout le sens vit dans `metadata` — même contrat que
 * `CallSystemMessage`.
 *
 * Le fantôme et la mention « sans compte » vont ENSEMBLE : un glyphe seul ne se
 * lit pas (ni par un lecteur d'écran, ni par quelqu'un qui ne connaît pas la
 * convention), et c'est précisément l'information la plus utile quand la porte
 * est un lien public.
 */
export const JoinNoticeMessage = memo(function JoinNoticeMessage({
  metadata,
}: JoinNoticeMessageProps) {
  const { t } = useI18n('bubbleStream');

  // Le nom DONNÉ prime, le pseudo `ano_…` descend en @handle — chacun à sa
  // place. Sans nom donné, le pseudo reste le nom principal et le handle
  // disparaît : « ano_bob » suivi de « @ano_bob » ne dirait rien de plus.
  const primaryName = metadata.givenName || metadata.displayName;
  const handle =
    metadata.username && metadata.username !== primaryName ? `@${metadata.username}` : null;

  // La notice nomme quelqu'un et porte son `participantId` : c'est le moment
  // exact où l'on veut savoir qui vient d'entrer, et sous quelles conditions.
  // C'était pourtant le seul endroit du fil où ce nom ne menait nulle part.
  //
  // La pastille ENTIÈRE porte le clic, et non le seul `@handle` : celui-ci n'est
  // rendu que lorsqu'il diffère du nom affiché, donc la moitié des arrivants
  // n'en ont aucun — l'affordance aurait disparu sans raison lisible. La cible
  // reste petite et centrée, loin des gestes de défilement.
  //
  // Hors conversation (aperçus, tests), le contexte est absent : la notice
  // redevient un texte, plutôt qu'un bouton qui n'ouvre rien.
  const openParticipantProfile = useOpenParticipantProfile();
  const canOpen = Boolean(openParticipantProfile && metadata.participantId);

  const pill = (
    <>
      {metadata.isAnonymous && (
        <Ghost
          className="h-3 w-3 flex-shrink-0 text-purple-600 dark:text-purple-400"
          aria-hidden="true"
        />
      )}
      <span className="truncate">
        {t('joinNotice.joined', { name: primaryName })}
      </span>
      {handle && (
        <span
          data-testid="join-notice-handle"
          className="flex-shrink-0 truncate text-[10px] text-gray-400 dark:text-gray-500"
        >
          {handle}
        </span>
      )}
      {metadata.isAnonymous && (
        <span
          data-testid="join-notice-no-account"
          className="flex-shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
        >
          {t('joinNotice.noAccount')}
        </span>
      )}
    </>
  );

  const pillClassName =
    'inline-flex max-w-full items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 dark:bg-gray-800/60 dark:text-gray-300';

  if (canOpen) {
    return (
      <div className="flex justify-center px-4 py-1.5" data-testid="join-notice">
        <button
          type="button"
          data-testid="join-notice-open-profile"
          onClick={() => openParticipantProfile?.(metadata.participantId)}
          className={`${pillClassName} transition-colors hover:bg-gray-200 dark:hover:bg-gray-700/60`}
        >
          {pill}
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-center px-4 py-1.5" data-testid="join-notice">
      <span className={pillClassName}>{pill}</span>
    </div>
  );
});
