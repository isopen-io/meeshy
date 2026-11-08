import type { ReactNode } from 'react';

import { JOURNAL_COLUMN_GUTTER, JOURNAL_COLUMN_WIDTH } from '@/lib/calls/call-journal-dock';

/**
 * **LA COLONNE DE VERRE DU JOURNAL** (#16942, vues W1 et W2) — sur grand écran,
 * le journal (`call-journal-panel.tsx`, le même composant que dans la pilule)
 * se pose sur le bord de fin, sous l'en-tête, en verre prononcé : ce qu'on y
 * LIT garde son contraste quelle que soit l'image. Elle ne recouvre rien : la
 * scène, les sous-titres et la pilule lui laissent sa place
 * (`data-call-journal-reserve`).
 */
export function CallJournalColumn({ children }: { readonly children: ReactNode }) {
  return (
    <aside
      className="glass-call-prominent absolute z-30 flex flex-col rounded-[28px] p-2 text-on-media"
      style={{ insetInlineEnd: JOURNAL_COLUMN_GUTTER, top: 'calc(env(safe-area-inset-top, 0px) + 60px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)', width: JOURNAL_COLUMN_WIDTH }}
      data-call-journal-column=""
    >
      {children}
    </aside>
  );
}
