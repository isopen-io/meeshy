/**
 * `ReadingModeMenu` — WL-106 (LWS-11).
 *
 * Le menu de mode : Auto / Focal / Script / Résumé / Rivière. UNE préférence,
 * partagée par les trois chemins d'entrée du contrat (encoche de la focus
 * card, ⋮, aperçu) — ce composant est le POINT UNIQUE de rendu de la liste
 * et d'écriture ; chaque chemin ne fait que le MONTER avec un `trigger`
 * différent (`LentillePeek.tsx` en monte deux : le déclencheur ⋮ au survol
 * et le peek clic-droit/appui-long). L'encoche de focus card n'existe pas
 * sur le web — WL-102..104 n'ont livré aucune focus card (re-prouvé :
 * `apps/web/components/conversations/lentille/` ne contient ni
 * `FocusCard.tsx` ni dossier `Mode/` ; `useLentillePerspective` ne fait
 * qu'écrire opacity/transform, aucune élection). Le troisième chemin est
 * donc absent CÔTÉ WEB tant que ce travail n'est pas fait — documenté,
 * jamais simulé.
 *
 * RIVIÈRE TOUJOURS PRÉSENTE (contrat LWS-11) : rendue même quand
 * `capabilities.availableModes` ne la contient pas (drapeau `riviere_mode`
 * éteint ou conversation inéligible) — grisée avec sa raison RÉELLE, jamais
 * un texte générique. La raison suit la TRIFURCATION amendée (S1,
 * `packages/shared/utils/reading-modes.ts`, `RiverEligibilityReasonKind`) :
 *   - `neverEligible`   → « jamais en conversation directe »
 *   - `belowThreshold` + `current: null`   → seuil SEUL (compte inconnu
 *     côté client V4 — G-123 non livré, JAMAIS un `0` fabriqué)
 *   - `belowThreshold` + `current: number` → formule à deux nombres
 *   - `eligible` → pas de raison, l'entrée est sélectionnable
 *
 * Les autres entrées (Focal/Script/Résumé) sont filtrées par
 * `capabilities.availableModes` — jamais montrées sélectionnables si la loi
 * ne les rendrait pas (même invariant que `resolveOrchestratorDecision`,
 * qui clampe plutôt que de suggérer un mode hors catalogue).
 *
 * Écriture : `onSelect` — le CALLER (le point de montage, `LentillePeek.tsx`
 * ici) branche `useReadingModePreferenceActions().setReadingMode`
 * (`apps/web/stores/reading-mode-preference-store.ts`, WL-106 — optimiste
 * versionnée, rollback sur échec, jumeau comportemental de
 * `conversation-preferences-store.ts`, jamais édité — voir la docstring de
 * ce store pour la tension de contrat documentée). Ce composant ne connaît
 * PAS le store : il reste pur/testable, comme `LentilleRow` reçoit `t` en
 * prop plutôt que d'appeler `useI18n` lui-même.
 *
 * @see tasks/lentille-implementation-contract.md LWS-11, §3.1
 */
'use client';

import type { ReadingModePreference } from '@meeshy/shared/types/reading-modes';
import type { ReadingModeCapabilities } from '@meeshy/shared/utils/reading-modes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { preferenceLabel } from './lentille-mode-labels';
import type { LentilleRowTranslate } from './LentilleRow';

export interface ReadingModeMenuProps {
  /** L'élément qui ouvre le menu — hover ⋮, peek invisible, etc. Un seul menu, plusieurs déclencheurs. */
  readonly trigger: React.ReactNode;
  readonly currentPreference: ReadingModePreference;
  readonly capabilities: ReadingModeCapabilities;
  readonly onSelect: (preference: ReadingModePreference) => void;
  readonly t: LentilleRowTranslate;
  /** Contrôlé — `LentillePeek` pilote l'ouverture depuis le peek (clic droit / appui long) sans passer par le trigger. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly align?: 'start' | 'end' | 'center';
  readonly 'data-testid'?: string;
}

/**
 * WL-108 : les LIBELLÉS ne sont plus épelés ici mais résolus par
 * `preferenceLabel` (`lentille-mode-labels.ts`) — source UNIQUE partagée
 * avec l'encoche de la focus card, comme `LentilleModeLabels.swift` l'est
 * pour les trois surfaces iOS. Mêmes clés qu'avant, au caractère près :
 * seule leur ADRESSE change, pour qu'« AUTO · Focal » sur la carte et
 * « Focal » dans ce menu ne puissent plus diverger.
 */
type MenuEntry = {
  readonly preference: Exclude<ReadingModePreference, 'auto'>;
  readonly mode: 'focal' | 'script' | 'summary' | 'river';
};

/** Ordre du contrat : Auto (traité à part, toujours sélectionnable) puis Focal/Script/Résumé/Rivière. */
const CATALOG_ENTRIES: readonly MenuEntry[] = [
  { preference: 'focal', mode: 'focal' },
  { preference: 'script', mode: 'script' },
  { preference: 'resume', mode: 'summary' },
];

const RIVER_ENTRY: MenuEntry = { preference: 'riviere', mode: 'river' };

/** Libellé de la raison Rivière grisée — trifurcation S1, jamais une formule unique. */
function riverReasonLabel(capabilities: ReadingModeCapabilities, t: LentilleRowTranslate): string | null {
  const { riverEligibilityReason } = capabilities;
  switch (riverEligibilityReason.riverReason) {
    case 'neverEligible':
      return t('lentille.modes.river.never');
    case 'belowThreshold':
      return riverEligibilityReason.current === null
        ? t('lentille.modes.river.thresholdOnly', { threshold: riverEligibilityReason.threshold })
        : t('lentille.modes.river.reason', {
            threshold: riverEligibilityReason.threshold,
            current: riverEligibilityReason.current,
          });
    case 'eligible':
      return null;
    default:
      return null;
  }
}

export function ReadingModeMenu({
  trigger,
  currentPreference,
  capabilities,
  onSelect,
  t,
  open,
  onOpenChange,
  align = 'end',
  'data-testid': dataTestId,
}: ReadingModeMenuProps) {
  const isRiverSelectable = capabilities.availableModes.includes('river');
  const riverReason = riverReasonLabel(capabilities, t);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56" data-testid={dataTestId}>
        <DropdownMenuLabel>{t('lentille.modes.title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={currentPreference}
          onValueChange={(value) => onSelect(value as ReadingModePreference)}
        >
          <DropdownMenuRadioItem value="auto" data-testid="reading-mode-item-auto">
            {preferenceLabel('auto', t)}
          </DropdownMenuRadioItem>

          {CATALOG_ENTRIES.filter((entry) => capabilities.availableModes.includes(entry.mode)).map((entry) => (
            <DropdownMenuRadioItem
              key={entry.preference}
              value={entry.preference}
              data-testid={`reading-mode-item-${entry.preference}`}
            >
              {preferenceLabel(entry.preference, t)}
            </DropdownMenuRadioItem>
          ))}

          <DropdownMenuRadioItem
            value={RIVER_ENTRY.preference}
            disabled={!isRiverSelectable}
            data-testid="reading-mode-item-riviere"
          >
            <div className="flex flex-col">
              <span>{preferenceLabel(RIVER_ENTRY.preference, t)}</span>
              {riverReason && (
                <span
                  className="text-xs text-muted-foreground"
                  data-testid="reading-mode-river-reason"
                >
                  {riverReason}
                </span>
              )}
            </div>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ReadingModeMenu;
