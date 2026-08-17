'use client';

import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Pied de pagination de la liste de conversations — EXTRACTION VERBATIM de
 * `ConversationList.renderContent` (REV-4/B2).
 *
 * Il portait le bouton « Charger plus » ET la cible de la sentinelle
 * d'`IntersectionObserver`. Vivant dans `renderContent`, il disparaissait en
 * bloc dès que le drapeau Lentille montait sa propre sous-arborescence : la
 * liste devenait non paginable, sans que rien ne le signale.
 *
 * Ce fichier ne change RIEN au marquage — classes, ordre, `aria-hidden`,
 * libellés sont ceux d'avant, au caractère près : le chemin drapeau OFF doit
 * rester bit-à-bit identique (R20/R8, snapshot
 * `ConversationList.lentille-mux.test.tsx.snap`). C'est pour la même raison
 * qu'il ne porte AUCUN `data-testid` : la sentinelle se prouve par le
 * ref-setter qu'elle reçoit, pas par un attribut ajouté au chemin historique.
 *
 * L'OBSERVATEUR, lui, reste chez `ConversationList` (`useLoadMoreSentinel`) —
 * un seul, pour les deux chemins de rendu ; ce composant n'en connaît que le
 * ref-setter.
 */
export interface ConversationListLoadMoreProps {
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly onLoadMore?: () => void;
  readonly t: (key: string) => string;
  /** Ref-setter de l'observateur unique du parent (`useLoadMoreSentinel`). */
  readonly sentinelRef?: (element: HTMLDivElement | null) => void;
}

export const ConversationListLoadMore = memo(function ConversationListLoadMore({
  hasMore,
  isLoadingMore,
  onLoadMore,
  t,
  sentinelRef,
}: ConversationListLoadMoreProps) {
  return (
    <>
      {/* Bouton "Charger plus" visible */}
      {hasMore && onLoadMore && (
        <div className="flex flex-col items-center gap-2 py-4 px-4">
          <Button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            variant="outline"
            className="w-full max-w-xs"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('loadingMore')}
              </>
            ) : (
              t('loadMore')
            )}
          </Button>
        </div>
      )}

      {/* Trigger pour le chargement automatique infini (optionnel) */}
      {hasMore && !isLoadingMore && (
        <div
          ref={sentinelRef}
          className="h-4 w-full"
          aria-hidden="true"
        />
      )}
    </>
  );
});
