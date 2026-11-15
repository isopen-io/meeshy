import { useState } from 'react';

import type { LensSectionFold } from '@/components/lens-sticker';
import { foldedSectionUnread } from '@/lib/lens/folded-unread';
import { isSectionFolded, readFoldedSections, toggledFold, writeFoldedSections } from '@/lib/lens/section-folds';
import type { LensSection } from '@/lib/lens/sections';

/**
 * LE PLIAGE DES SECTIONS, CÂBLÉ (#10103) — ce que la liste passe à chaque
 * `LensSection`. Les deux mémoires de `section-folds.ts` : l'APPAREIL pour
 * Épingles et les sections par date (relu une fois, au montage), le SERVEUR
 * pour une catégorie (`onCategoryToggle` → `setCategoryExpanded`, optimiste).
 *
 * `undefined` pendant une recherche : l'en-tête redevient un titre, puisque
 * rien n'y est replié — un bouton sans effet mentirait (charte, § contrôle =
 * effet).
 *
 * `animate` ne vaut que pour la section qu'un GESTE vient de déplier : la
 * première peinture et les rendus suivants (pagination, temps réel) ne
 * rejouent jamais l'animation.
 */
export function useSectionFolds(params: {
  readonly searching: boolean;
  readonly onCategoryToggle: (categoryId: string, isExpanded: boolean) => void;
}): { readonly foldOf: (section: LensSection, unreadCounts: readonly number[]) => LensSectionFold | undefined } {
  const { searching, onCategoryToggle } = params;
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => readFoldedSections());
  const [unfolding, setUnfolding] = useState<string | null>(null);

  const toggle = (section: LensSection, wasFolded: boolean): void => {
    setUnfolding(wasFolded ? section.id : null);
    if (section.category !== undefined) {
      onCategoryToggle(section.category.id, wasFolded);
      return;
    }
    const next = toggledFold(folded, section.id);
    setFolded(next);
    writeFoldedSections(next);
  };

  const foldOf = (section: LensSection, unreadCounts: readonly number[]): LensSectionFold | undefined => {
    if (searching) return undefined;
    const isFolded = isSectionFolded({ section, folded, searching });
    return {
      folded: isFolded,
      unread: foldedSectionUnread({ unreadCounts, folded: isFolded }),
      onToggle: () => toggle(section, isFolded),
      animate: !isFolded && unfolding === section.id,
    };
  };

  return { foldOf };
}
