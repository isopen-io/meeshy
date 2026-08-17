'use client';

import { memo } from 'react';
import { AlignLeft, Layers, MessageSquare, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { READING_MODES, type ReadingMode } from '@/lib/conversations/reading-mode';

/**
 * La Lentille — le sélecteur de mode de lecture.
 *
 * Verdict du volume 3 : « La Lentille n'affiche plus que 2 à 3 choix + l'appel :
 * c'est apprenable par cœur en une journée. » Trois entrées ici — Focal,
 * Script, Bulles — et rien d'autre. L'appel vit déjà dans la barre d'outils du
 * header (la Scène est une couche, pas une lentille).
 *
 * Le bouton `Aa` du volume 4 est rendu à côté : la bascule de densité en un
 * geste, réversible, sans ouvrir le menu.
 */
const MODE_ICONS: Record<ReadingMode, typeof Layers> = {
  focal: Layers,
  script: AlignLeft,
  bubble: MessageSquare,
};

interface LensSwitcherProps {
  mode: ReadingMode;
  onModeChange: (mode: ReadingMode) => void;
  onToggleDensity: () => void;
  /**
   * Surcharge de traduction. Par défaut le composant lit lui-même le namespace
   * `conversations` : il est monté dans plusieurs surfaces (vue applicative,
   * aperçu partagé) dont les fonctions `t` n'ont pas la même signature, et
   * exiger la bonne à chaque appelant ne servait qu'à propager un cast.
   */
  t?: (key: string, fallback?: string) => string;
  className?: string;
}

export const LensSwitcher = memo(function LensSwitcher({
  mode,
  onModeChange,
  onToggleDensity,
  t: translateOverride,
  className,
}: LensSwitcherProps) {
  const { t: translateNamespace } = useI18n('conversations');
  const t = translateOverride ?? translateNamespace;
  const ActiveIcon = MODE_ICONS[mode];

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('lens.label', 'Lentille')}
            title={t('lens.label', 'Lentille')}
          >
            <ActiveIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t('lens.label', 'Lentille')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {READING_MODES.map((candidate) => {
            const Icon = MODE_ICONS[candidate];
            return (
              <DropdownMenuItem
                key={candidate}
                onSelect={() => onModeChange(candidate)}
                aria-current={candidate === mode ? 'true' : undefined}
                className={cn(candidate === mode && 'font-semibold')}
              >
                <Icon className="mr-2 h-4 w-4" />
                <span className="flex flex-col">
                  <span>{t(`lens.modes.${candidate}.name`, candidate)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(`lens.modes.${candidate}.hint`, '')}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onToggleDensity}
        aria-label={t('lens.density', 'Densité de lecture')}
        title={t('lens.density', 'Densité de lecture')}
      >
        <Type className="h-4 w-4" />
      </Button>
    </div>
  );
});
