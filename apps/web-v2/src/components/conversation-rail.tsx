import { forwardRef, useMemo } from 'react';

import { Avatar } from '@/components/avatar';
import { RAIL_TILE_COMPACT, RAIL_TILE_GRANDE, RailTile, railCellWidth, railRingWidth } from '@/components/rail-tile';
import type { Conversation } from '@/lib/api/types';
import type { ConversationOverride } from '@/lib/conversation-store';
import { effectiveFlagsOf, effectiveUnreadOf } from '@/lib/conversation-store';
import { accentOf } from '@/lib/accent';
import { titleOf } from '@/lib/view/conversation';

/**
 * **UN RAIL, DEUX GÉOGRAPHIES** (#6103, décision #6070) — le rail qui ouvre
 * la Lentille (`variant: 'grande'`) et la bande qui prend la place du titre
 * une fois ce rail sorti du scrollport (`variant: 'pinned'`, montée par
 * `ListHeader`) sont la MÊME liste : même corpus, même exclusion des
 * conversations archivées (`effectiveFlagsOf`, précédence iOS reprise par
 * `applyFilter`), seule la taille de `RailTile` diffère — exactement le
 * contrat que sa propre doc-comment documente déjà pour la CELLULE.
 *
 * OÙ CE COMPOSANT VIT (la différence avec l'ancienne forme, #6070) : la
 * référence iOS met le grand rail DANS la vue défilante (`StoryTrayView`
 * scrolle avec la liste, `ConversationListView.swift:1659-1671`) et la
 * bande compacte DANS L'EN-TÊTE, jamais superposée au même endroit
 * (`PinnedStoryTrailBand`, `StoryTrayView.swift:656-671`). Ce composant ne
 * sait RIEN de sa géographie — c'est l'appelant qui décide où le monter
 * (`routes/conversations.tsx` pour `grande`, `components/list-header.tsx`
 * pour `pinned`) ; ni scroll, ni observateur de visibilité ici — cette vue
 * reste PURE, la même règle qu'iOS écrit noir sur blanc pour son propre
 * rail (« aucun `@State` de défilement »).
 *
 * LA RÉFÉRENCE TRANSMISE (`ref`) cible le `<ul>` racine — c'est l'élément
 * que `useOutOfView` observe pour savoir quand le rail `grande` est sorti du
 * scrollport (`routes/conversations.tsx`).
 *
 * **`inert` — LE GRAND RAIL NE DOUBLE PAS LA BANDE AU CLAVIER** (#6103,
 * revue-correction). Tant que la bande épinglée le remplace, le grand rail
 * ne quitte pas le DOM — il défile simplement hors du scrollport — et sans
 * garde, ses neuf liens restaient à la fois dans l'ordre de TABULATION et
 * dans l'arbre D'ACCESSIBILITÉ à côté des neuf liens IDENTIQUES de la bande
 * (même `aria-label`, même corpus) : un lecteur d'écran annonçait la liste
 * deux fois, et un `Tab` depuis la bande retombait dans le grand rail hors
 * champ — que le navigateur ramène alors DANS la vue, faisant sauter le
 * défilement et perdre la position de lecture pour rien de plus qu'un
 * `Tab`. Miroir exact d'iOS : `PinnedStoryTrailBand` garde sa copie
 * INATTEIGNABLE tant que la bascule n'est pas faite
 * (`.allowsHitTesting(reveal > 0.6)`) — ici c'est le GRAND rail, pas la
 * bande, qui doit céder, puisque c'est lui qui reste hors champ.
 *
 * `inert` est l'attribut HTML natif : posé sur le `<ul>`, il retire TOUT
 * son sous-arbre de l'ordre de tabulation ET de l'arbre d'accessibilité en
 * un seul geste — jamais un couple `aria-hidden` + `tabindex="-1"` à tenir
 * par lien, qui se serait désynchronisé au premier ajout de tuile. C'est
 * l'appelant (`routes/conversations.tsx`) qui le pose, à la MÊME condition
 * que la bande se montre (`pinned`) — ce composant reste agnostique de la
 * géographie, comme sa propre doc-comment l'exige déjà pour le montage.
 */
export type ConversationRailVariant = 'grande' | 'pinned';

type Overrides = Readonly<Record<string, ConversationOverride>>;

export type ConversationRailProps = {
  readonly conversations: readonly Conversation[];
  readonly viewerId: string;
  readonly overrides: Overrides;
  /** Cache VIDE, requête en vol — jamais « une requête est en cours ». */
  readonly loading: boolean;
};

/**
 * LA HAUTEUR RÉSERVÉE DU RAIL (#5650, reprise #6103) — la même tuile
 * fantôme qu'avant, mais qui n'a plus besoin d'un second rail superposé
 * pour tenir sa promesse : le rail `grande` ne change plus JAMAIS de taille
 * lui-même (seule la bande `pinned`, ailleurs dans le DOM, compacte) — un
 * simple échange squelette ↔ contenu RÉEL, à la MÊME taille, suffit
 * désormais à garder `#contenu` immobile pendant la résolution.
 *
 * SES COTES DÉRIVENT DE `RAIL_TILE_GRANDE`, jamais recopiées (revue #6103) —
 * cette tuile n'a de valeur que si elle mesure EXACTEMENT ce que la vraie
 * mesurera : un `88` et un `72` écrits à la main en faisaient une jumelle qui
 * cesserait silencieusement de réserver la bonne hauteur au premier
 * changement de cote. Les mêmes formules que `RailTile` — largeur de cellule
 * et épaisseur d'anneau — sont donc partagées par `railCellWidth` /
 * `railRingWidth`.
 */
function RailPlaceholderTile() {
  return (
    <li
      aria-hidden="true"
      className="flex shrink-0 flex-col items-center gap-1.5"
      style={{ width: `${railCellWidth(RAIL_TILE_GRANDE)}px`, visibility: 'hidden' }}
    >
      <span className="grid place-items-center rounded-chip" style={{ padding: `${railRingWidth(RAIL_TILE_GRANDE)}px` }}>
        <Avatar initials="" color="var(--color-ios-card)" size={RAIL_TILE_GRANDE} />
      </span>
      <span className="w-full truncate text-center text-check">&nbsp;</span>
    </li>
  );
}

export const ConversationRail = forwardRef<
  HTMLUListElement,
  ConversationRailProps & {
    readonly variant: ConversationRailVariant;
    /** Voir le doc-comment du module. Absent/`false` par défaut — seul le
     * grand rail, et seulement pendant que la bande le remplace, le pose. */
    readonly inert?: boolean;
  }
>(function ConversationRail({ variant, conversations, viewerId, overrides, loading, inert = false }, ref) {
  const size = variant === 'grande' ? RAIL_TILE_GRANDE : RAIL_TILE_COMPACT;

  /** Même précédence iOS que `applyFilter` : l'archivé sort du rail comme
   * de la liste — un seul site le décide, quelle que soit la géographie. */
  const visible = useMemo(
    () => conversations.filter((c) => !effectiveFlagsOf(c, overrides).isArchived),
    [conversations, overrides],
  );

  /** LE RAIL NE SE PEINT PAS QUAND IL N'A RIEN À MONTRER (#5650) — ni région
   * étiquetée vide pour un lecteur d'écran, ni bande blanche au-dessus de
   * l'état vide. Pendant le CHARGEMENT du rail `grande`, en revanche, la
   * tuile fantôme tient la géométrie ; `pinned` ne matérialise jamais rien
   * au repos (miroir `StoryTrayView.swift:739-747`, « au repos, aucun
   * anneau n'est matérialisé »), et il n'existe de toute façon qu'une fois
   * le grand rail déjà résolu — il n'a donc jamais à porter ce squelette. */
  const nothingToShow = variant === 'pinned' ? visible.length === 0 : !loading && visible.length === 0;
  if (nothingToShow) return null;

  return (
    <ul
      ref={ref}
      data-rail={variant}
      inert={inert}
      /* Une région INERTE n'a rien à annoncer — et c'est elle qui portait le
         doublon (revue #6103) : la bande et le grand rail ne peuvent plus
         exposer le MÊME libellé au même moment. */
      aria-label={inert ? undefined : 'Accès rapide aux conversations'}
      className={
        variant === 'grande'
          ? 'flex gap-3 overflow-x-auto px-4 py-2'
          : 'flex h-full items-center gap-3 overflow-x-auto'
      }
      style={{ scrollbarWidth: 'none' }}
    >
      {loading && visible.length === 0 && variant === 'grande' ? <RailPlaceholderTile /> : null}
      {visible.map((c) => (
        <RailTile
          key={c.id}
          conversationId={c.id}
          title={titleOf(c, viewerId)}
          accent={accentOf(c)}
          unread={effectiveUnreadOf(c, overrides)}
          size={size}
        />
      ))}
    </ul>
  );
});
