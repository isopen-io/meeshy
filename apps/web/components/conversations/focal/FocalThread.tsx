/**
 * `FocalThread` — l'arbre vivant du fil sous le drapeau Focal
 * (`useReadingModesFlag`, WF-110/111/112). Point d'entrée du mux minimal dans
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
 * PROFIL EN MODALE — directive produit du 2026-08-17. L'état d'ouverture
 * (« quel username la modale montre-t-elle ? ») vit ICI, UNE SEULE fois pour
 * tout le fil — jamais une `UserProfileModal` montée par `FocalRow` (patron
 * déjà établi par `LentillePeek`/`ReadingModeMenu` côté liste : un menu
 * unique, pas un par rangée). `onOpenProfile` descend, STABLE
 * (`useCallback`, aucune dépendance), jusqu'à `FocalIdentityHeader` via
 * `FocalRow` — la fermeture littérale y romprait le `memo` de `FocalRow`.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Message } from '@meeshy/shared/types';
import { useI18n } from '@/hooks/use-i18n';
import { useAuth } from '@/hooks/use-auth';
import { getUserLanguagePreferences } from '@/utils/user-language-preferences';
import { useScrollActivity } from '@/hooks/lentille/use-scroll-activity';
import { useFocalPerspective } from '@/hooks/lentille/use-focal-perspective';
import { FocalRow, type FocalDensity } from './FocalRow';
import { FocalDateCapsule } from './FocalDateCapsule';
import { FocalTimePill } from './FocalTimePill';
import { formatDayTimePillLabel, formatFocalDateCapsuleLabel, isNewCalendarDay } from './focal-row-utils';
import { UserProfileModal } from '@/components/profile/UserProfileModal';

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
  /**
   * Parité de données 2026-08-17 — l'identité de conversation et du lecteur,
   * portée jusqu'aux composants du tronc que la rangée monte désormais
   * (réactions, accusés, pièces jointes, rappel d'appel). `ConversationMessages`
   * les tient déjà et les passe VERBATIM à `MessagesDisplay` sur le chemin
   * historique : la branche Focal reçoit exactement les mêmes, ni plus ni
   * moins — sans quoi un lecteur anonyme perdait ses réactions et la
   * suppression de pièce jointe n'avait pas de jeton.
   */
  readonly conversationId?: string;
  readonly conversationType?: React.ComponentProps<typeof FocalRow>['conversationType'];
  readonly isAnonymous?: boolean;
  readonly currentAnonymousUserId?: string;
  readonly onImageClick?: (attachmentId: string) => void;
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
  conversationId,
  conversationType,
  isAnonymous,
  currentAnonymousUserId,
  onImageClick,
}: FocalThreadProps) {
  const { t, locale } = useI18n('conversations');
  // Jeton porté jusqu'à `MessageAttachments` (suppression de pièce jointe) —
  // MÊME lecture que la vue Bulles (`BubbleMessageNormalView`,
  // `bubble-message/FocalRow`) : un magasin d'auth, jamais une requête (la
  // garde WF-113 « aucun useQuery dans la peau Focal » reste vraie).
  const { token } = useAuth();

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
      (currentUser as { deviceLocale?: string | null } | undefined)?.deviceLocale,
    ]
  );

  // RE-PREUVE en tête de fichier : `messages` arrive DESC (récent…ancien) —
  // « ancien en haut » exige l'inversion, EXACTEMENT comme `MessagesDisplay`
  // (reverseOrder=true) le fait pour le même prop.
  const ordered = useMemo(() => [...messages].reverse(), [messages]);

  const { visible: pillVisible, notifyScrolled } = useScrollActivity();
  // REV-4/B1 — forme 2 de `PerspectiveContainer` : ce `RefObject` est peuplé
  // par React lui-même (`ConversationView` rend `<div ref={scrollContainerRef}>`,
  // attaché en phase de commit, donc AVANT tout effet passif de ce
  // sous-arbre), jamais par un effet de l'appelant. C'est le seul cas où un
  // `RefObject` reste admis — et le témoin
  // `FocalThread.perspective-lifecycle.test.tsx` le vérifie sur une SEULE
  // passe d'effets, sans `StrictMode`.
  const { registerRow, focusedId, setAlphaCeiling } = useFocalPerspective({
    container: scrollContainerRef,
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

  // Directive produit 2026-08-17 — un seul état d'ouverture pour tout le
  // fil (voir docstring de fichier). `null` ⇒ modale fermée ; le username
  // survit à la fermeture (pas de flash de contenu vide pendant l'animation
  // de sortie de Radix) puisque `UserProfileModal` ne monte son contenu que
  // `open && userId`.
  const [profileModalUsername, setProfileModalUsername] = useState<string | null>(null);
  const handleOpenProfile = useCallback((username: string) => {
    setProfileModalUsername(username);
  }, []);
  const handleProfileModalOpenChange = useCallback((open: boolean) => {
    if (!open) setProfileModalUsername(null);
  }, []);

  return (
    <div data-testid="focal-thread" data-density={density}>
      <FocalTimePill label={pillLabel} visible={pillVisible} />

      {ordered.map((message, index) => {
        const previous = index > 0 ? ordered[index - 1] : null;
        const showsDateCapsule = isNewCalendarDay(
          new Date(message.createdAt),
          previous ? new Date(previous.createdAt) : null
        );
        const time = new Date(message.createdAt).toLocaleTimeString(locale, {
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <div key={message.id}>
            {showsDateCapsule && (
              <FocalDateCapsule label={formatFocalDateCapsuleLabel(new Date(message.createdAt), locale)} />
            )}
            <FocalRow
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
              conversationId={conversationId}
              conversationType={conversationType}
              isAnonymous={isAnonymous}
              currentAnonymousUserId={currentAnonymousUserId}
              token={token || undefined}
              onImageClick={onImageClick}
              onOpenProfile={handleOpenProfile}
            />
          </div>
        );
      })}

      <UserProfileModal
        open={profileModalUsername !== null}
        onOpenChange={handleProfileModalOpenChange}
        userId={profileModalUsername}
      />
    </div>
  );
}

export default FocalThread;
