import { useState } from 'react';

import { Glyph } from '@/components/glyph';
import { RailTitleSlot } from '@/components/rail-title-slot';
import { ShareLinkSheet } from '@/components/share-link-sheet';
import type { StoryRailProps } from '@/components/story-rail';
import { apiConfig } from '@/lib/api/config';
import { apiDeps } from '@/lib/api/deps';
import type { Conversation } from '@/lib/api/types';
import { webOriginOf } from '@/lib/links/web-origin';
import { Link } from '@/routes/route-table';

/**
 * **L'EN-TÊTE DE LA LENTILLE — LA BANDE ÉPINGLÉE PREND LA PLACE DU TITRE**
 * (#6103, décision #6070).
 *
 * Miroir de `PinnedStoryTrailBand` (`StoryTrayView.swift:656-671`) : « it
 * cross-fades in as the full-size `StoryTrayView` scrolls up under the
 * header […] It used to render as a second row BELOW a title that stayed on
 * screen for nothing. » — exactement le défaut que cet en-tête remplace : avant
 * lui, le rail compactait SUR PLACE et laissait une réserve de hauteur vide
 * entre l'en-tête et les filtres une fois défilé (mesuré,
 * `render/list-scrolled.*.png` avant correction).
 *
 * **LA FENTE DU TITRE VIT DANS `RailTitleSlot`** depuis que le Flux la partage
 * (#6277) : la bascule titre ↔ bande, la hauteur de la fente et la reprise du
 * focus par la tuile jumelle y sont écrites UNE fois, avec leurs raisons. Cet
 * en-tête ne porte plus que ce qui est propre à la liste.
 *
 * LES DEUX BOUTONS D'EN-TÊTE (#5652, bloc D, réaccordés à la fusion #6080) —
 * miroir des deux cercles `AdaptiveGlassContainer`
 * (`ConversationListView+Overlays.swift:1056-1087`) : « Créer un lien de
 * partage » (a besoin du corpus complet pour en filtrer les conversations
 * ÉLIGIBLES, `canCreateShareLink`) et « Nouvelle conversation » (une route,
 * aucun corpus requis). Reçus en props plutôt que dérivés de `railProps` — ce
 * ne sont PLUS les mêmes objets depuis que le rail porte des STORIES (écart 7
 * de `targets/lentille.md`). À la cote `size-11` (44 px, charte dimension 5 —
 * l'original iOS est à 40, un écart de la cible que la charte du dépôt ne
 * recopie pas).
 */
export function ListHeader({
  pinned,
  railProps,
  conversations,
  viewerId,
}: {
  readonly pinned: boolean;
  readonly railProps: StoryRailProps;
  readonly conversations: readonly Conversation[];
  readonly viewerId: string;
}) {
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
      <RailTitleSlot title="Meeshy Chats" pinned={pinned} railProps={railProps} />
      <button
        type="button"
        onClick={() => setShareSheetOpen(true)}
        aria-label="Créer un lien de partage"
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <span
          className="grid size-8 place-items-center rounded-chip"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 14%, transparent)' }}
        >
          <Glyph name="linkSimple" size={16} />
        </span>
      </button>
      <Link
        to="conversationsNew"
        aria-label="Nouvelle conversation"
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <span
          className="grid size-8 place-items-center rounded-chip"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 14%, transparent)' }}
        >
          <Glyph name="plus" size={16} />
        </span>
      </Link>
      {/*
        L'ENTRÉE DU TABLEAU DE BORD « PROGRESSION » (#5547, déplacée ici
        depuis `routes/conversations.tsx` — #6103). Sur iOS elle vit dans le
        profil et les réglages (#5698) ; la v3.1 n'a pas encore de `/me`
        (inventaire de parité, V4.0.0) — l'en-tête de la liste est donc sa
        porte jusque-là.
      */}
      <Link
        to="progression"
        aria-label="Progression — badges, niveau et série"
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <span
          className="grid size-8 place-items-center rounded-chip"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 14%, transparent)' }}
        >
          <Glyph name="trophy" size={16} />
        </span>
      </Link>

      {/* Le retour d'un geste INVISIBLE (copie de lien) — annoncé au lecteur
          d'écran, motif `QuickActions`. */}
      <p role="status" aria-live="polite" className="sr-only">
        {feedback ?? ''}
      </p>

      {shareSheetOpen ? (
        <ShareLinkSheet
          conversations={conversations}
          viewerId={viewerId}
          deps={apiDeps}
          origin={webOriginOf(apiConfig.base, window.location.origin)}
          onClose={() => setShareSheetOpen(false)}
          onFeedback={setFeedback}
        />
      ) : null}
    </header>
  );
}
