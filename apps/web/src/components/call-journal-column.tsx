import type { ReactNode } from 'react';

/**
 * **LA COLONNE DE VERRE DU JOURNAL** (#16942, vues W1 et W2) — sur grand écran,
 * le journal (`call-journal-panel.tsx`, le même composant que dans la pilule)
 * se pose sur le bord de fin, sous l'en-tête, en verre prononcé : ce qu'on y
 * LIT garde son contraste quelle que soit l'image. Elle ne recouvre rien : la
 * scène, les sous-titres et la pilule lui laissent sa place
 * (`data-call-journal-reserve`).
 *
 * Elle vit dans le chunk du journal (`call-journal-panel.tsx`, `CallJournalInColumn`),
 * pas dans celui de l'écran d'appel (`budgets.json` › `call_overlay`) : elle ne sert
 * que sur grand écran, et seulement journal ouvert. Sa géométrie lui est REMISE par
 * l'écran (`call-journal-dock.ts`), qui la partage avec la réserve de la scène : ce
 * chunk n'importe rien de statique du sien (`call_overlay.dynamic_only`).
 */
export type JournalColumnGeometry = { readonly width: number; readonly gutter: number };

export function CallJournalColumn({ children, width, gutter }: JournalColumnGeometry & { readonly children: ReactNode }) {
  return (
    <aside
      className="glass-call-prominent absolute z-30 flex flex-col rounded-[28px] p-2 text-on-media"
      style={{ insetInlineEnd: gutter, top: 'calc(env(safe-area-inset-top, 0px) + 60px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)', width }}
      data-call-journal-column=""
    >
      {children}
    </aside>
  );
}
