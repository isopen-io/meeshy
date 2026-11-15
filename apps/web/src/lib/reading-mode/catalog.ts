import type { RiverEligibilityReason } from '@meeshy/shared/utils/reading-modes';
import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

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

/* LES LIBELLÉS VIVENT AU CATALOGUE D'INTERFACE (`readingMode.*`) — un menu
   écrit ici en français restait français sous une interface anglaise. */
const TITLE_KEYS = {
  focal: 'readingMode.focal.title',
  script: 'readingMode.script.title',
  summary: 'readingMode.summary.title',
  river: 'readingMode.river.title',
  bubbles: 'readingMode.bubbles.title',
} as const satisfies Readonly<Record<ConversationReadingMode, InterfaceCatalogKey>>;

const SUBTITLE_KEYS = {
  focal: 'readingMode.focal.subtitle',
  script: 'readingMode.script.subtitle',
  summary: 'readingMode.summary.subtitle',
  river: 'readingMode.river.subtitle',
  bubbles: 'readingMode.bubbles.subtitle',
} as const satisfies Readonly<Record<ConversationReadingMode, InterfaceCatalogKey>>;

/** Le titre d'un mode dans la langue d'interface — « Focal », « Résumé »… */
export function readingModeTitle(mode: ConversationReadingMode, language: InterfaceLanguage = currentInterfaceLanguage()): string {
  return translate(language, TITLE_KEYS[mode]);
}

/**
 * Le Résumé Vivant EST rendu par la v3.1 depuis #5695
 * (`THREAD_RENDERABLE_MODES` de `decision.ts` le porte) : la ligne passe
 * désormais par la branche GÉNÉRIQUE ci-dessous, comme `focal`/`script` —
 * disponible ssi `availableModes` (borné par l'identité) le porte. La
 * raison d'un invité (« Réservé aux lecteurs connectés », le 403 de
 * `/conversations/:id/analysis`) est nommée là, PROPRE à ce mode — jamais
 * la formule générique « Indisponible » des deux autres
 * (`readingMode.summary.guestOnly`).
 *
 * Éligible par la loi, mais pas encore dans `THREAD_RENDERABLE_MODES` — la
 * SEULE raison propre au web (D-21/#5696 : « listée et motivée tant que sa
 * condition n'est pas levée »), `readingMode.river.soon`. iOS, lui, montrerait
 * ici « S'ouvrira à 5 personnes actives — 5 aujourd'hui » quand
 * `riviere_mode` est OFF sur un groupe éligible
 * (`ReadingModeLensSheet.swift:91-99`) — un libellé FAUX (une porte annoncée
 * fermée alors que la loi l'a ouverte) que la v3.1 ne reproduit pas : elle
 * n'a pas de drapeau (D-20), elle a un mode éligible NON RENDU, et le dit
 * sans mentir. Supprimée par le travail qui ajoute `'river'` à
 * `THREAD_RENDERABLE_MODES`.
 *
 * Le libellé ne nomme AUCUNE plateforme (revue-correction #5696) : le MÊME
 * `dist` est servi par le web, par la coque Android et par la coque iOS
 * (variante B, `capacitor.config.ts`) — « bientôt sur le web » serait faux
 * sur deux des trois cibles que la directive porteur sert « en une fois ».
 *
 * La Rivière a QUATRE formes de raison (`RiverEligibilityReasonKind`,
 * `packages/shared/utils/reading-modes.ts:217`, plus la forme propre au web
 * ci-dessus) — jamais une formule unique qui promettrait une porte qui
 * n'existe pas à un duo, ni une porte annoncée fermée qu'elle a pourtant
 * ouverte.
 */
function riverReason(reason: RiverEligibilityReason, language: InterfaceLanguage): string {
  if (reason.riverReason === 'neverEligible') return translate(language, 'readingMode.river.neverDirect');
  if (reason.riverReason === 'eligible') return translate(language, 'readingMode.river.soon');
  const threshold = String(reason.threshold);
  if (reason.current === null) return translate(language, 'readingMode.river.threshold', { threshold });
  return translate(language, 'readingMode.river.thresholdToday', { threshold, current: String(reason.current) });
}

export type MenuRowsInput = {
  /** Le catalogue de RENDU de cet écran (`threadCapabilities(...).availableModes`, `decision.ts`). */
  readonly availableModes: readonly ConversationReadingMode[];
  readonly riverEligibilityReason: RiverEligibilityReason;
  readonly currentMode: ConversationReadingMode;
  /** La langue d'interface des libellés — la courante par défaut. */
  readonly language?: InterfaceLanguage;
};

/**
 * Les CINQ lignes du menu, dans l'ordre `MENU_ORDER` — l'« Automatique » est
 * une AFFORDANCE SÉPARÉE (rendue par `reading-mode-chip.tsx`), pas une ligne
 * de ce tableau : elle ne porte aucun `ConversationReadingMode`.
 */
export function menuRows(input: MenuRowsInput): readonly MenuRow[] {
  const language = input.language ?? currentInterfaceLanguage();
  const title = (mode: ConversationReadingMode): string => translate(language, TITLE_KEYS[mode]);
  const subtitle = (mode: ConversationReadingMode): string => translate(language, SUBTITLE_KEYS[mode]);
  return MENU_ORDER.map((mode) => {
    const isCurrent = mode === input.currentMode;

    // `bubbles` : choix de RENDU hors loi, toujours sélectionnable drapeau ON
    // (le catalogue n'est présenté que dans ce cas) — miroir
    // `ReadingModeLensSheet.swift:103-105`.
    if (mode === 'bubbles') {
      return {
        mode,
        title: title(mode),
        subtitle: subtitle(mode),
        isCurrent,
        isAvailable: true,
        reason: null,
      };
    }

    if (mode === 'river') {
      // La ligne se dégrise par le catalogue de RENDU seul — exactement
      // comme `focal`/`script`/`summary` ci-dessous : le jour où `'river'`
      // entre dans `THREAD_RENDERABLE_MODES`, aucune autre ligne de ce
      // fichier n'a à bouger.
      const isAvailable = input.availableModes.includes(mode);
      if (isAvailable) {
        return { mode, title: title(mode), subtitle: subtitle(mode), isCurrent, isAvailable, reason: null };
      }
      const reason = riverReason(input.riverEligibilityReason, language);
      return { mode, title: title(mode), subtitle: reason, isCurrent, isAvailable, reason };
    }

    // `focal` / `script` / `summary` (#5695) : disponibles ssi le catalogue
    // de rendu les porte — pour `summary`, cela borne à l'IDENTITÉ (un
    // invité ne l'a jamais dans `availableModes`, `decision.ts`).
    const isAvailable = input.availableModes.includes(mode);
    if (isAvailable) {
      return { mode, title: title(mode), subtitle: subtitle(mode), isCurrent, isAvailable, reason: null };
    }
    const reason = translate(language, mode === 'summary' ? 'readingMode.summary.guestOnly' : 'readingMode.unavailable');
    return { mode, title: title(mode), subtitle: reason, isCurrent, isAvailable, reason };
  });
}
