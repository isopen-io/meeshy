/**
 * `FocalThread` — l'arbre vivant du fil sous le drapeau Focal
 * (`useReadingModesFlag`, WF-110). Point d'entrée du mux minimal dans
 * `ConversationMessages.tsx` (patron WL-101).
 *
 * TOPOLOGIE RE-PROUVÉE (§0, avant d'écrire ce fichier) — `ConversationView.tsx`
 * appelle `<ConversationMessages reverseOrder={true}>`, qui délègue à
 * `MessagesDisplay` (`components/common/messages-display.tsx`) :
 *   - `messages` arrive TOUJOURS en ordre backend `orderBy createdAt DESC`
 *     (récent…ancien) — commentaire en clair, `ConversationMessages.tsx:436-439`.
 *   - `reverseOrder=true` ⇒ `MessagesDisplay` fait `[...].reverse()` : « ancien
 *     en haut » — un DOM en ordre NATUREL, PAS inversé par `scaleY(-1)` comme
 *     iOS (`collectionView.transform`). `FocalThread` reproduit EXACTEMENT
 *     cette même transformation, pour la MÊME raison (mission, point 4 :
 *     « côté web la géométrie N'EST PAS inversée »).
 *   - `MessagesDisplay` est VIRTUALISÉ (`@tanstack/react-virtual`) quand un
 *     `containerRef` est fourni — c'est le cas ici (`ConversationView`
 *     fournit `scrollContainerRef`). `FocalThread`, pour ce premier lot
 *     (WF-110..113), rend la liste NON virtualisée : la virtualisation
 *     complète (mesure dynamique, `overscan`, `translateY` du bloc absolu)
 *     n'est PAS demandée par le plan d'exécution pour cette vague (workshop
 *     §5, lignes WF-110..113 ne citent que rangée/perspective/citation/
 *     médias/capsule/pont) — documenté ici comme écart de périmètre assumé,
 *     pas un oubli. Le rapport WF-113 le reprend.
 *
 * WF-110 (CE commit) : ordonnancement + densité + rangées seules. La
 * perspective/élection/pilule (WF-111) et la capsule date/pont (WF-112)
 * arrivent aux commits suivants, sur ce même fichier.
 */
'use client';

import { useCallback, useMemo } from 'react';
import type { Message } from '@meeshy/shared/types';
import { useI18n } from '@/hooks/use-i18n';
import { getUserLanguagePreferences } from '@/utils/user-language-preferences';
import { FocalRow, type FocalDensity } from './FocalRow';

/**
 * Duck-typée à dessein (mêmes 5 champs que `LentilleRow`/`ConversationView`
 * lisent déjà de `currentUser` pour le Prisme) plutôt qu'un alias `User`
 * précis : le mux (`ConversationMessages.tsx`) porte `SocketIOUser`, tandis
 * que d'autres appelants portent le `User` complet de `@meeshy/shared/types`
 * — les deux satisfont cette forme structurellement, sans cast au point de
 * mux.
 */
export interface FocalThreadCurrentUser {
  readonly id: string;
  readonly systemLanguage?: string;
  readonly regionalLanguage?: string;
  readonly customDestinationLanguage?: string;
  readonly deviceLocale?: string | null;
}

export interface FocalThreadProps {
  readonly messages: readonly Message[];
  readonly currentUser: FocalThreadCurrentUser;
  readonly density?: FocalDensity;
  readonly scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  readonly onNavigateToMessage?: (messageId: string) => void;
}

function isOptimisticMessage(message: Message): boolean {
  return (message as unknown as { _localStatus?: string })._localStatus === 'sending';
}

export function FocalThread({
  messages,
  currentUser,
  density = 'focal',
  onNavigateToMessage,
}: FocalThreadProps) {
  const { t, locale } = useI18n('conversations');

  // Cast ciblé : `getUserLanguagePreferences` est typé contre l'alias `User`
  // de `@/types` (un troisième alias, distinct de `SocketIOUser` ET du
  // `User` de `@meeshy/shared/types`) — les CHAMPS lus (systemLanguage,
  // regionalLanguage, customDestinationLanguage, deviceLocale) sont présents
  // dans `FocalThreadCurrentUser`, le désaccord est purement nominal. MÊME
  // patron que `LentilleRow` (cast local `as { deviceLocale?: string }`).
  const preferredLanguages = useMemo(
    () => getUserLanguagePreferences(currentUser as unknown as Parameters<typeof getUserLanguagePreferences>[0]),
    [
      currentUser?.systemLanguage,
      currentUser?.regionalLanguage,
      currentUser?.customDestinationLanguage,
      currentUser?.deviceLocale,
    ]
  );

  // RE-PREUVE en tête de fichier : `messages` arrive DESC (récent…ancien) —
  // « ancien en haut » exige l'inversion, EXACTEMENT comme `MessagesDisplay`
  // (reverseOrder=true) le fait pour le même prop.
  const ordered = useMemo(() => [...messages].reverse(), [messages]);

  const youLabel = t('focal.row.you');

  const onQuoteJump = useCallback(
    (messageId: string) => onNavigateToMessage?.(messageId),
    [onNavigateToMessage]
  );

  return (
    <div data-testid="focal-thread" data-density={density}>
      {ordered.map((message, index) => {
        const previous = index > 0 ? ordered[index - 1] : null;
        const time = new Date(message.createdAt).toLocaleTimeString(locale, {
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <FocalRow
            key={message.id}
            message={message}
            previousMessage={previous}
            currentUser={currentUser}
            density={density}
            preferredLanguages={preferredLanguages}
            time={time}
            youLabel={youLabel}
            isOptimistic={isOptimisticMessage(message)}
            onQuoteJump={onQuoteJump}
          />
        );
      })}
    </div>
  );
}

export default FocalThread;
