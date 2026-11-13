import { useEffect, useState, type CSSProperties } from 'react';

import { useMediaFlag } from '@/lib/use-media-flag';

import { callActions } from './call-actions';
import type { CallLayerEvent, CallPanelKind, CallPanels } from './call-screen-layer';

/**
 * **LE JOURNAL EN COLONNE SUR GRAND ÉCRAN** (#16942, vues W1 et W2 de
 * `docs/product/appels-vue-finale.md`) — sur une fenêtre large, le journal ne
 * recouvre plus l'image : il se pose en colonne de verre sur le bord de fin,
 * et la scène se recentre dans la place qui reste.
 *
 * Le seuil se lit dans la PLACE disponible — la largeur de la fenêtre —,
 * jamais dans l'agent utilisateur : une tablette en paysage l'atteint, un
 * ordinateur dans une fenêtre étroite non. La colonne et ses deux gouttières
 * reprennent la planche (356 px, 12 px de chaque côté) ; la scène garde au
 * moins 720 px, la largeur sous laquelle la vue mobile reste la meilleure
 * (un iPad en paysage, 1024 px, garde le journal dans la pilule).
 */

export const JOURNAL_COLUMN_WIDTH = 356;

export const JOURNAL_COLUMN_GUTTER = 12;

/** Ce que la colonne retire à la scène : elle, et une gouttière de chaque côté. */
export const JOURNAL_COLUMN_RESERVE = JOURNAL_COLUMN_WIDTH + 2 * JOURNAL_COLUMN_GUTTER;

/**
 * L'HÔTE DE LA COLONNE (W1.2, W1.18, W1.20) — ce que l'écran pose sur la case qui entre et repart par le
 * bord de fin (`HeldSwap`, forme `end`) : le verre prononcé, la géométrie, et `data-call-chrome-keep`, qui
 * lui fait retenir le toucher (titre, marge, état vide) au lieu de ranger l'en-tête et la pilule comme un
 * toucher sur l'image (`use-call-chrome.ts`). Le conteneur a déjà retiré la zone sûre (`pt-safe`, `pb-safe` de la
 * racine) : la colonne ne la compte pas une seconde fois — 60 px sous le haut du conteneur, 24 px (le `pb-6` de
 * la pilule) au-dessus de son bas.
 */
export const journalColumnHost = (): { readonly className: string; readonly style: CSSProperties } => ({
  className: 'glass-call-prominent absolute z-30 flex flex-col rounded-[28px] p-2 text-on-media',
  style: { insetInlineEnd: JOURNAL_COLUMN_GUTTER, top: '3.75rem', bottom: '1.5rem', width: JOURNAL_COLUMN_WIDTH },
});

const STAGE_MIN_WIDTH = 720;

export const JOURNAL_COLUMN_MIN_VIEWPORT = JOURNAL_COLUMN_RESERVE + STAGE_MIN_WIDTH;

export function journalDocks(viewportWidth: number): boolean {
  return viewportWidth >= JOURNAL_COLUMN_MIN_VIEWPORT;
}

const QUERY = `(min-width: ${JOURNAL_COLUMN_MIN_VIEWPORT}px)`;

/** La fenêtre a-t-elle la place d'une colonne ? Suivi à chaque redimensionnement ; imposé par les témoins. */
export function useJournalDocks(forced: boolean | undefined): boolean {
  const measured = useMediaFlag(QUERY);
  return forced ?? measured;
}

export type JournalColumn = {
  readonly shown: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
};

type JournalColumnParams = {
  /** La fenêtre a la place d'une colonne. */
  readonly docks: boolean;
  /** Le journal est offert, et aucun mode n'a libéré l'écran. */
  readonly available: boolean;
  /** Le panneau ouvert dans la pilule. */
  readonly panel: CallPanelKind | null;
  readonly send: (event: CallLayerEvent) => void;
};

/**
 * La colonne vit À CÔTÉ de la couche de la pilule, pas dedans : le menu se
 * rouvre sans la fermer. Une fenêtre qui rétrécit, colonne ouverte, rend le
 * journal à la pilule ; une fenêtre qui s'élargit, journal ouvert dans la
 * pilule, le pose en colonne — jamais les deux à la fois.
 */
export function useJournalColumn({ docks, available, panel, send }: JournalColumnParams): JournalColumn {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    if (docks || !docked) return;
    setDocked(false);
    send({ type: 'open-panel', panel: 'journal' });
  }, [docks]);
  useEffect(() => {
    if (!docks || panel !== 'journal') return;
    setDocked(true);
    send({ type: 'close' });
  }, [docks, panel]);
  return { shown: docks && docked && available, toggle: () => setDocked((open) => !open), close: () => setDocked(false) };
}

type JournalDockParams = {
  /** Imposé par les témoins ; sinon la fenêtre décide. */
  readonly wide: boolean | undefined;
  readonly available: boolean;
  readonly panel: CallPanelKind | null;
  readonly send: (event: CallLayerEvent) => void;
};

export type JournalDock = {
  readonly docks: boolean;
  readonly column: JournalColumn;
  readonly panels: CallPanels;
  /** Ce que la colonne retire à la scène, à la bande du bas et au milieu — jamais à l'en-tête. */
  readonly reserve: Readonly<Record<`data-${string}`, string>>;
  readonly reserveEnd: { readonly paddingInlineEnd?: number };
  /** La largeur rendue à la colonne : la scène en duo s'y prolonge en flou (W1). */
  readonly bleedEnd: number;
};

/** Le câblage de la colonne du journal dans l'écran d'appel : la place, la colonne, les panneaux de la pilule et la réserve. */
export function useJournalDock({ wide, available, panel, send }: JournalDockParams): JournalDock {
  const docks = useJournalDocks(wide);
  const column = useJournalColumn({ docks, available, panel, send });
  return {
    docks,
    column,
    panels: {
      open: panel ?? (column.shown ? 'journal' : null),
      toggle: (next) => (next === 'journal' && docks ? column.toggle() : send({ type: 'open-panel', panel: next })),
      enter: (mode) => send({ type: 'enter-mode', mode }),
    },
    reserve: column.shown ? { 'data-call-journal-reserve': '' } : {},
    reserveEnd: column.shown ? { paddingInlineEnd: JOURNAL_COLUMN_RESERVE } : {},
    bleedEnd: column.shown ? JOURNAL_COLUMN_RESERVE : 0,
  };
}

/** Échap replie d'abord le panneau, puis la colonne du journal ; rien d'ouvert, il réduit l'appel. */
export function useEscapeFolds({ live, panelOpen, column, send }: { readonly live: boolean; readonly panelOpen: boolean; readonly column: JournalColumn; readonly send: (event: CallLayerEvent) => void }): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !live) return;
      if (panelOpen) send({ type: 'close' });
      else if (column.shown) column.close();
      else callActions.minimize();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, panelOpen, column.shown]);
}
