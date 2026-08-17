/**
 * `FocalMetaRow` — la ligne méta de la rangée plate. Parité de données du
 * 2026-08-17.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE RAMÈNE À L'ÉCRAN
 * ═══════════════════════════════════════════════════════════════════════════
 * Tout ce que la vue Bulles montrait autour du texte et que le fil plat
 * TAISAIT : le témoin de traduction (« écrit en X, affiché en Y »), les
 * réactions posées, les coches de livraison/lecture, et — pour une rangée de
 * SUITE de groupe, qui n'a pas d'en-tête d'identité — l'heure du message.
 *
 * Elle suit le patron du `FocalMetaRow` iOS
 * (`apps/ios/Meeshy/Features/Main/Focal/Row/FocalMetaRow.swift`) : « heure en
 * base » pour les rangées de suite, coches de livraison à droite, indicateur
 * « modifié » discret. Ce sont les mêmes DONNÉES, arrangées de la même façon.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RÉUTILISATION, PAS COPIE
 * ═══════════════════════════════════════════════════════════════════════════
 * - Réactions      → `MessageReactions` (`components/common/message-reactions`),
 *                    le MÊME composant que `MessageContent`/
 *                    `MessageAttachmentsSection` montent sous la bulle. Il
 *                    possède son propre abonnement (React Query) : la peau
 *                    Focal n'ouvre AUCUNE requête elle-même (garde WF-113,
 *                    `focal-no-usequery-in-skin.test.ts`) — elle monte le
 *                    composant du tronc, qui, lui, a toujours eu ce droit.
 * - Livraison/lecture → `DeliveryIndicator` (`bubble-message/`), y compris sa
 *                    règle de réciprocité `showReadReceipts`, appliquée
 *                    telle quelle. Aucune seconde règle d'accusés ici.
 * - Traduction     → la langue servie vient de `resolveFocalMessageDisplay`,
 *                    c'est-à-dire de l'UNIQUE appel au Prisme fait par la
 *                    rangée. Aucune seconde loi de langue (contrainte WF-110).
 * - Transféré / modifié → aucun composant web extractible n'existe : la vue
 *                    Bulles écrit « transféré » INLINE dans `MessageContent`
 *                    (même icône `CornerUpRight`, même clé i18n
 *                    `bubble.forwarded`), et n'affiche « modifié » NULLE PART
 *                    sur le web (seul iOS le montre, F10). Ces deux badges
 *                    sont donc écrits ici, à un seul endroit, avec les mêmes
 *                    icônes et la même clé — c'est un manque nommé, pas une
 *                    copie déguisée.
 *
 * Garde R15 : aucune cote littérale — les tailles viennent des tokens
 * `--lentille-thread-*` et des utilitaires Tailwind déjà employés par la peau.
 */
'use client';

import { CornerUpRight, Pencil } from 'lucide-react';
import { getLanguageInfo } from '@meeshy/shared/utils/languages';
import { cn } from '@/lib/utils';
import { MessageReactions } from '@/components/common/message-reactions';
import { DeliveryIndicator } from '@/components/common/bubble-message/DeliveryIndicator';

export interface FocalMetaRowProps {
  readonly messageId: string;
  readonly conversationId: string;
  readonly currentUserId?: string;
  readonly currentAnonymousUserId?: string;
  readonly isAnonymous?: boolean;
  readonly isOwnMessage: boolean;
  /**
   * Les accusés ✓/✓✓ vivent dans l'IDENTITÉ (maquette `.fident .chk`, spec §5
   * « déplacés dans l'identité des messages Toi »). Ils ne redescendent ici
   * que pour une rangée de SUITE de groupe, qui n'a pas d'en-tête — sinon la
   * donnée disparaîtrait de ces rangées-là (précédent iOS : `FocalMetaRow`
   * porte `deliveryStatus` pour exactement ce cas).
   */
  readonly showsDeliveryIndicator: boolean;
  /** Réactions posées — `reactionSummary` non vide OU `reactionCount > 0`. */
  readonly hasReactions: boolean;
  readonly isForwarded: boolean;
  readonly isEdited: boolean;
  /** Langue d'origine du message (`Message.originalLanguage`). */
  readonly originalLanguage: string | undefined;
  /** Langue RÉELLEMENT affichée, lue de l'unique résolution Prisme de la rangée. */
  readonly displayedLanguage: string | undefined;
  /**
   * Heure du message, affichée ICI seulement quand l'en-tête d'identité est
   * absent (rangée de suite de groupe) — sinon l'heure y est déjà, et la
   * répéter serait du bruit. Précédent iOS : `FocalMetaRow` n'existe que pour
   * `!isFirstInGroup`.
   */
  readonly time?: string;
  readonly forwardedLabel: string;
  readonly editedLabel: string;
  readonly translatedLabel: string;
}

export function FocalMetaRow({
  messageId,
  conversationId,
  currentUserId,
  currentAnonymousUserId,
  isAnonymous = false,
  isOwnMessage,
  showsDeliveryIndicator,
  hasReactions,
  isForwarded,
  isEdited,
  originalLanguage,
  displayedLanguage,
  time,
  forwardedLabel,
  editedLabel,
  translatedLabel,
}: FocalMetaRowProps) {
  const isTranslated =
    !!originalLanguage && !!displayedLanguage && originalLanguage !== displayedLanguage;

  // Rien à dire ⇒ rien à rendre : la ligne méta ne doit pas ouvrir un blanc
  // sur les messages ordinaires (le fil plat est une densité, pas une carte).
  if (!isTranslated && !hasReactions && !isForwarded && !isEdited && !showsDeliveryIndicator && !time) {
    return null;
  }

  return (
    <div
      data-testid="focal-meta-row"
      className={cn(
        'mt-0.5 flex flex-wrap items-center gap-2 text-muted-foreground'
      )}
      style={{ fontSize: 'var(--lentille-thread-time-size)' }}
    >
      {isForwarded && (
        <span data-testid="focal-forwarded" className="inline-flex items-center gap-1">
          <CornerUpRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span>{forwardedLabel}</span>
        </span>
      )}

      {isEdited && (
        <span data-testid="focal-edited" className="inline-flex items-center gap-1">
          <Pencil className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span>{editedLabel}</span>
        </span>
      )}

      {isTranslated && (
        <span
          data-testid="focal-translated"
          className="inline-flex items-center gap-1"
          title={translatedLabel}
        >
          <span aria-hidden="true">🌐</span>
          <span>{getLanguageInfo(originalLanguage)?.flag ?? originalLanguage}</span>
          <span aria-hidden="true">→</span>
          <span>{getLanguageInfo(displayedLanguage)?.flag ?? displayedLanguage}</span>
        </span>
      )}

      {hasReactions && (
        <span data-testid="focal-reactions" className="inline-flex">
          <MessageReactions
            messageId={messageId}
            conversationId={conversationId}
            currentUserId={currentUserId ?? ''}
            currentAnonymousUserId={currentAnonymousUserId}
            isAnonymous={isAnonymous}
            showAddButton={false}
          />
        </span>
      )}

      {time && (
        <time data-testid="focal-meta-time" className="ml-auto">
          {time}
        </time>
      )}

      {showsDeliveryIndicator && (
        <span data-testid="focal-delivery" className={cn('inline-flex', time ? '' : 'ml-auto')}>
          <DeliveryIndicator
            isOwnMessage={isOwnMessage}
            messageId={messageId}
            conversationId={conversationId}
          />
        </span>
      )}
    </div>
  );
}

export default FocalMetaRow;
