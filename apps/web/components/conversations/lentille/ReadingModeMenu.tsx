/**
 * `ReadingModeMenu` — WL-106 (LWS-11).
 *
 * Le menu de mode : Auto / Focal / Script / Résumé / Rivière. UNE préférence,
 * partagée par les trois chemins d'entrée du contrat (encoche de la focus
 * card, ⋮, aperçu) — ce composant est le POINT UNIQUE de rendu de la liste
 * et d'écriture ; chaque chemin ne fait que le MONTER avec un `trigger`
 * différent. `LentillePeek.tsx` monte les TROIS depuis WL-108, sur UNE
 * SEULE instance de ce composant : le déclencheur ⋮ au survol, le peek
 * clic-droit/appui-long, et l'encoche de `LentilleFocusCard` sur le rang
 * élu. (Historique, pour qui lit un `git blame` : jusqu'à WL-108 le web
 * n'avait ni focus card ni élection — le troisième chemin était documenté
 * comme absent plutôt que simulé. Il ne l'est plus.)
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
  /**
   * REV-4/B3 — section d'entrées rendue APRÈS le catalogue de modes, telle
   * quelle. Un seul menu porte donc les deux : le catalogue de modes (que ce
   * composant possède) et les actions du rang (qu'il ne connaît pas — c'est
   * `ConversationActionMenuItems`, le composant du rang historique, que
   * `LentillePeek` lui passe). C'est l'union exacte que le contrat décrit
   * côté iOS, prise par l'autre bout : là-bas le menu d'actions gagne le
   * sous-menu « Mode de lecture », ici le menu de mode gagne les actions.
   *
   * Ce composant reste le POINT UNIQUE de rendu du catalogue et n'acquiert
   * aucune connaissance des actions : il rend un `ReactNode` opaque.
   */
  readonly actionsSection?: React.ReactNode;
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

/**
 * Libellé de la raison Rivière grisée — trifurcation S1, jamais une formule
 * unique. PUR par rapport à la SÉLECTIONNABILITÉ (miroir exact de
 * `LentilleModeLabels.riverReason`, iOS) : ce formateur ne sait rien du
 * drapeau `riviere_mode` ni de `capabilities.availableModes` — seule
 * `riverEligibilityReason` (numérique) le pilote. C'est l'APPELANT (R-135)
 * qui décide de l'AFFICHER ou non, selon que l'entrée reste effectivement
 * désactivée — jamais ce formateur, qui décidait à tort seul (via un
 * `case 'eligible': return null`) avant R-135 : une conversation
 * numériquement éligible mais dont le drapeau est encore ÉTEINT restait
 * grisée SANS aucune raison affichée, un item désactivé muet.
 */
function riverReasonLabel(capabilities: ReadingModeCapabilities, t: LentilleRowTranslate): string | null {
  const { riverEligibilityReason } = capabilities;
  if (riverEligibilityReason.riverReason === 'neverEligible') {
    return t('lentille.modes.river.never');
  }
  // `belowThreshold` ET `eligible` partagent la MÊME branche numérique —
  // `eligible` y arrive seulement quand l'appelant choisit quand même
  // d'afficher une raison (entrée encore désactivée par le drapeau, pas par
  // l'éligibilité) : le texte reste honnête, il cite les seuils réels.
  return riverEligibilityReason.current === null
    ? t('lentille.modes.river.thresholdOnly', { threshold: riverEligibilityReason.threshold })
    : t('lentille.modes.river.reason', {
        threshold: riverEligibilityReason.threshold,
        current: riverEligibilityReason.current,
      });
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
  actionsSection,
}: ReadingModeMenuProps) {
  const isRiverSelectable = capabilities.availableModes.includes('river');
  // R-135 — la raison ne survit QUE tant que l'entrée reste désactivée. Une
  // Rivière sélectionnable ne doit plus porter de texte « s'ouvrira à… » à
  // côté de son propre nom (même garde que côté iOS, `LentilleModeMenu.swift`
  // : `disabledReason: (isRiviere && isDisabled) ? … : nil`).
  const riverReason = isRiverSelectable ? null : riverReasonLabel(capabilities, t);

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

        {actionsSection && (
          <>
            <DropdownMenuSeparator />
            {actionsSection}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ReadingModeMenu;
