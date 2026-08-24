'use client';

import { useEffect } from 'react';
import { FileText, Film, Smile, Sparkles } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { ComposerFormat } from '@meeshy/shared/utils/composer-contract';

/**
 * L'éventail des formats — la **loi 4** de la doctrine des planches, peinte.
 *
 * « Rien à l'écran sans raison » : un format que la porte n'offre pas n'est pas
 * grisé, il **n'existe pas dans le DOM**. Une pastille désactivée promettrait
 * une affordance que la composition courante ne porte pas, et une infobulle
 * d'excuse est une régression, pas une politesse. Corollaire : quand
 * l'éventail n'a qu'une entrée, il n'y a rien à choisir, donc **rien à peindre**.
 *
 * ### Ce composant se monte TOUJOURS, il ne peint pas toujours
 *
 * Le repli — la sélection qui a quitté l'éventail rebascule sur le premier
 * format offert — vit ici, et il doit tenir précisément dans le cas où plus
 * rien n'est peint : une composition qui dé-qualifie fait tomber l'éventail de
 * `['post','story','reel']` à `['post','story']`, voire à une seule entrée.
 * **Monter ce composant conditionnellement (`offered.length > 1 && <Fan/>`)
 * désarmerait le repli au moment exact où il sert.** Il se monte, il décide, et
 * il rend `null` quand il n'y a rien à montrer.
 *
 * Ce qu'il tient, et rien de plus : la sélection qu'il gouverne ne reste jamais
 * hors de l'éventail qu'on lui donne. Il ne dit rien de ce que l'appelant
 * publiera — c'est l'appelant qui tient sa charge utile.
 *
 * ### L'asymétrie est délibérée
 *
 * Sortir de l'éventail rebascule. **Y rentrer ne rebascule pas** : quand la
 * composition re-qualifie, RÉEL réapparaît dans l'éventail mais la sélection
 * reste où l'auteur l'a laissée. Revenir à RÉEL est un geste, pas un effet de
 * bord — le contraire annulerait un choix explicite chaque fois qu'un média
 * change.
 *
 * ### Où vit cette politique, et pourquoi pas ailleurs
 *
 * Elle est ICI et non dans `packages/shared` : la **loi 1** interdit de
 * descendre des affordances dans le contrat partagé, qui ne porte que la table
 * des portes. Ce composant ne rejoue aucune règle de cette table — il reçoit
 * `offered` déjà résolu (`webComposerOpening`, `lib/composer-door.ts`) et se
 * contente de le peindre dans l'ordre reçu. Le plan du lot 6 nomme un jumeau
 * iOS (`ComposerFormatFan.swift`) ; ce fichier ne l'a pas lu et n'affirme rien
 * de son état.
 */

const FORMAT_ICON: Record<ComposerFormat, typeof Film> = {
  post: FileText,
  story: Sparkles,
  reel: Film,
  status: Smile,
};

/**
 * Le repli, nu. Le premier format offert est la cible : pour les portes de la
 * table partagée c'est aussi leur format initial, donc un repli y ramène à
 * l'ouverture de la porte plutôt qu'à un format arbitraire.
 *
 * Un éventail vide ne fabrique rien — il n'a aucune cible à proposer, et
 * inventer un format serait pire que de laisser la sélection en place.
 */
export function resolveFanFormat(
  offered: ReadonlyArray<ComposerFormat>,
  selected: ComposerFormat,
): ComposerFormat {
  if (offered.includes(selected)) return selected;
  return offered[0] ?? selected;
}

export type ComposerFormatFanProps = {
  readonly offered: ReadonlyArray<ComposerFormat>;
  readonly selected: ComposerFormat;
  readonly onSelect: (format: ComposerFormat) => void;
};

export function ComposerFormatFan({ offered, selected, onSelect }: ComposerFormatFanProps) {
  const { t } = useI18n('common');
  const effective = resolveFanFormat(offered, selected);

  useEffect(() => {
    if (effective !== selected) onSelect(effective);
  }, [effective, selected, onSelect]);

  if (offered.length <= 1) return null;

  return (
    <div
      role="radiogroup"
      aria-label={t('composer.format.groupLabel')}
      data-testid="composer-format-fan"
      className="flex items-center gap-0.5 rounded-lg border border-[var(--gp-border)] p-0.5"
    >
      {offered.map((format) => {
        const Icon = FORMAT_ICON[format];
        const isSelected = format === effective;

        return (
          <button
            key={format}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(format)}
            data-testid={`composer-format-${format}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
              isSelected
                ? 'bg-[var(--gp-terracotta)] text-white'
                : 'text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)]',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t(`composer.format.${format}`)}
          </button>
        );
      })}
    </div>
  );
}
