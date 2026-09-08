import type { RiverEligibilityReason } from '@meeshy/shared/utils/reading-modes';
import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

/**
 * LE CATALOGUE DU MENU — SEUL domicile des libellés et de l'ordre, miroir de
 * `ReadingModeLensCatalog` (iOS, `Focal/Lens/ReadingModeLensSheet.swift`).
 * Le chip et le menu du fil (`reading-mode-chip.tsx`) lisent d'ici, jamais
 * une seconde résolution.
 */

/** `displayOrder` iOS (`ReadingModeLensSheet.swift:52`) — cinq lignes, jamais l'« Automatique » (rendue à part, hors loi). */
export const MENU_ORDER: readonly ConversationReadingMode[] = ['focal', 'script', 'bubbles', 'summary', 'river'];

export type MenuRow = {
  readonly mode: ConversationReadingMode;
  readonly title: string;
  readonly subtitle: string;
  readonly isCurrent: boolean;
  /** Un mode indisponible reste LISTÉ mais désactivé — jamais retiré (amendement R). */
  readonly isAvailable: boolean;
  /** La VRAIE raison quand `isAvailable` est faux — jamais un placeholder. `null` quand disponible. */
  readonly reason: string | null;
};

const TITLES: Readonly<Record<ConversationReadingMode, string>> = {
  focal: 'Focal',
  script: 'Script',
  summary: 'Résumé',
  river: 'Rivière',
  bubbles: 'Bulles',
};

const DEFAULT_SUBTITLES: Readonly<Record<ConversationReadingMode, string>> = {
  focal: 'Rangée vivante, mise en scène du présent',
  script: 'Rangée plate, densité uniforme',
  summary: "L'essentiel d'abord, la preuve à un tap",
  river: 'Les couloirs de la conversation',
  bubbles: 'Les bulles classiques',
};

/**
 * Le Résumé Vivant EST rendu par la v3.1 depuis #5695
 * (`THREAD_RENDERABLE_MODES` de `decision.ts` le porte) : la ligne passe
 * désormais par la branche GÉNÉRIQUE ci-dessous, comme `focal`/`script` —
 * disponible ssi `availableModes` (borné par l'identité) le porte. La
 * raison d'un invité (« Réservé aux lecteurs connectés », le 403 de
 * `/conversations/:id/analysis`) est nommée là, PROPRE à ce mode — jamais
 * la formule générique « Indisponible » des deux autres.
 */
const SUMMARY_UNAVAILABLE_REASON = 'Réservé aux lecteurs connectés';

/**
 * La Rivière TRIFURQUE sa raison (`RiverEligibilityReasonKind`,
 * `packages/shared/utils/reading-modes.ts:217`) — jamais une formule unique
 * qui promettrait une porte qui n'existe pas à un duo.
 */
function riverReason(reason: RiverEligibilityReason): string {
  if (reason.riverReason === 'neverEligible') return 'Jamais en conversation directe';
  if (reason.current === null) return `S'ouvrira à ${reason.threshold} personnes actives`;
  return `S'ouvrira à ${reason.threshold} personnes actives — ${reason.current} aujourd'hui`;
}

export type MenuRowsInput = {
  /** Le catalogue de RENDU de cet écran (`threadCapabilities(...).availableModes`, `decision.ts`). */
  readonly availableModes: readonly ConversationReadingMode[];
  readonly riverEligibilityReason: RiverEligibilityReason;
  readonly currentMode: ConversationReadingMode;
};

/**
 * Les CINQ lignes du menu, dans l'ordre `MENU_ORDER` — l'« Automatique » est
 * une AFFORDANCE SÉPARÉE (rendue par `reading-mode-chip.tsx`), pas une ligne
 * de ce tableau : elle ne porte aucun `ConversationReadingMode`.
 */
export function menuRows(input: MenuRowsInput): readonly MenuRow[] {
  return MENU_ORDER.map((mode) => {
    const isCurrent = mode === input.currentMode;

    // `bubbles` : choix de RENDU hors loi, toujours sélectionnable drapeau ON
    // (le catalogue n'est présenté que dans ce cas) — miroir
    // `ReadingModeLensSheet.swift:103-105`.
    if (mode === 'bubbles') {
      return {
        mode,
        title: TITLES[mode],
        subtitle: DEFAULT_SUBTITLES[mode],
        isCurrent,
        isAvailable: true,
        reason: null,
      };
    }

    if (mode === 'river') {
      const reason = riverReason(input.riverEligibilityReason);
      return { mode, title: TITLES[mode], subtitle: reason, isCurrent, isAvailable: false, reason };
    }

    // `focal` / `script` / `summary` (#5695) : disponibles ssi le catalogue
    // de rendu les porte — pour `summary`, cela borne à l'IDENTITÉ (un
    // invité ne l'a jamais dans `availableModes`, `decision.ts`).
    const isAvailable = input.availableModes.includes(mode);
    if (isAvailable) {
      return { mode, title: TITLES[mode], subtitle: DEFAULT_SUBTITLES[mode], isCurrent, isAvailable, reason: null };
    }
    const reason = mode === 'summary' ? SUMMARY_UNAVAILABLE_REASON : 'Indisponible';
    return { mode, title: TITLES[mode], subtitle: reason, isCurrent, isAvailable, reason };
  });
}
