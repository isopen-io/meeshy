/**
 * `LentilleSkeletonRow` — squelette (WL-103, LWS-10).
 *
 * Géométrie EXACTE du rang réel (mêmes tokens que `LentilleRow` : hauteur
 * `78` — trois lignes depuis 2026-08-22 —, padding `10/16`, avatar `44`) — pas une approximation Tailwind
 * générique. Affiché UNIQUEMENT sur cache vide (décision du point de
 * montage, pas de ce composant) : ce fichier ne sait pas quand se montrer,
 * il ne fait que rendre un rang plausible quand on le lui demande.
 *
 * `aria-hidden="true"` sur chaque rang individuel — même geste que le
 * squelette historique (`ConversationList.tsx`, `renderContent`) : c'est le
 * conteneur (`role="status" aria-busy="true"`) qui porte la sémantique
 * accessible, pas chaque rang décoratif.
 */
'use client';

export function LentilleSkeletonRow() {
  return (
    <div
      aria-hidden="true"
      data-testid="lentille-skeleton-row"
      className="flex items-center gap-3 animate-pulse"
      style={{
        height: 'var(--lentille-list-row-height)',
        padding: 'var(--lentille-list-row-padding-vertical) var(--lentille-list-row-padding-horizontal)',
        marginLeft: 'var(--lentille-list-row-margin-horizontal)',
        marginRight: 'var(--lentille-list-row-margin-horizontal)',
      }}
    >
      <div
        className="rounded-full bg-muted shrink-0"
        style={{ width: 'var(--lentille-list-avatar-size)', height: 'var(--lentille-list-avatar-size)' }}
      />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3.5 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted/60 rounded w-1/2" />
        {/* Troisième ligne — la date, à droite (2026-08-22) : la barre de fin
            de rang a quitté le bord droit du rang pour rejoindre la place
            qu'occupe la date dans le rang réel. */}
        <div className="flex justify-end">
          <div className="h-3 bg-muted/40 rounded w-8" />
        </div>
      </div>
    </div>
  );
}

export default LentilleSkeletonRow;
