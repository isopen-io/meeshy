'use client';

import { memo } from 'react';
import { Ghost } from 'lucide-react';
import type { JoinNoticeMetadata } from '@meeshy/shared/utils/join-notice';
import { useI18n } from '@/hooks/useI18n';

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

  return (
    <div className="flex justify-center px-4 py-1.5" data-testid="join-notice">
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
        {metadata.isAnonymous && (
          <Ghost
            className="h-3 w-3 flex-shrink-0 text-purple-600 dark:text-purple-400"
            aria-hidden="true"
          />
        )}
        <span className="truncate">
          {t('joinNotice.joined', { name: metadata.displayName })}
        </span>
        {metadata.isAnonymous && (
          <span
            data-testid="join-notice-no-account"
            className="flex-shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
          >
            {t('joinNotice.noAccount')}
          </span>
        )}
      </span>
    </div>
  );
});
