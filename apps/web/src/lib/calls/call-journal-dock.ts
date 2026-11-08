import { useEffect, useState } from 'react';

import { useMediaFlag } from '@/lib/use-media-flag';

import type { CallLayerEvent, CallPanelKind } from './call-screen-layer';

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
