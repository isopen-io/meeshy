/**
 * `FocalThread` — l'arbre vivant du fil sous le drapeau Focal
 * (`useReadingModesFlag`, WF-110/111). Point d'entrée du mux minimal dans
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
 * WF-111 (CE commit) : perspective `.thread` (`useFocalPerspective`),
 * élection, pilule jour·heure (`useScrollActivity`, partagée avec la liste)
 * s'ajoutent à l'ordonnancement/densité de WF-110. La capsule date/pont
 * (WF-112) arrive au commit suivant, sur ce même fichier.
 */
'use client';

import { useCallback, useEffect, useMemo } from 'react';
import type { Message } from '@meeshy/shared/types';
import { useI18n } from '@/hooks/use-i18n';
import { getUserLanguagePreferences } from '@/utils/user-language-preferences';
import { useScrollActivity } from '@/hooks/lentille/use-scroll-activity';
import { useFocalPerspective } from '@/hooks/lentille/use-focal-perspective';
import { FocalRow, type FocalDensity } from './FocalRow';
import { FocalTimePill } from './FocalTimePill';
import { formatDayTimePillLabel } from './focal-row-utils';

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
  scrollContainerRef,
  onNavigateToMessage,
}: FocalThreadProps) {
  const { t, locale } = useI18n('conversations');

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

  const { visible: pillVisible, notifyScrolled } = useScrollActivity();
  const { registerRow, focusedId, setAlphaCeiling } = useFocalPerspective({
    containerRef: scrollContainerRef,
    enabled: density === 'focal',
    isSettled: !pillVisible,
  });

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => notifyScrolled();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef, notifyScrolled]);

  const youLabel = t('focal.row.you');

  // Libellé de la pilule : le jour·heure du dernier message visible (le plus
  // récent chargé) — approximation honnête en l'absence d'un signal de
  // "rang le plus proche du haut du viewport" dédié (hors périmètre de ce
  // lot, la pilule liste (WL-103) a le même genre de simplification pour
  // son premier jet).
  const pillLabel = useMemo(() => {
    const last = ordered[ordered.length - 1];
    if (!last) return '';
    return formatDayTimePillLabel(new Date(last.createdAt), locale);
  }, [ordered, locale]);

  const onQuoteJump = useCallback(
    (messageId: string) => onNavigateToMessage?.(messageId),
    [onNavigateToMessage]
  );

  return (
    <div data-testid="focal-thread" data-density={density}>
      <FocalTimePill label={pillLabel} visible={pillVisible} />

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
            isFocused={density === 'focal' && focusedId === message.id}
            registerRow={registerRow}
            setAlphaCeiling={setAlphaCeiling}
            onQuoteJump={onQuoteJump}
          />
        );
      })}
    </div>
  );
}

export default FocalThread;
