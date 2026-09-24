/**
 * IMPORT SCOPÉ (#5695) — `summary.css` porte les jetons et la règle
 * `.glyph-forward` du Résumé Vivant, HORS de la feuille globale (voir son
 * doc-comment). Ce fichier étant le SEUL import statique de
 * `src/components/summary/**` depuis `thread.tsx`, c'est le point d'entrée
 * qui garantit la feuille présente dès que le CHUNK DU FIL est chargé —
 * avant même que `SummaryHost` (lazy) ne monte le reste.
 */
import '@/styles/summary.css';

/**
 * LE SQUELETTE DU RÉSUMÉ VIVANT (#5695) — trois barres, miroir
 * `LivingSummaryView.swift:151-164`. STATIQUE, monté dans le CHUNK DU FIL
 * (jamais chargé à la demande à part) : c'est le `fallback` de la
 * `Suspense` qui attend `summary-host.tsx`, donc il doit exister AVANT que
 * le module à la demande arrive — un squelette lui-même différé serait un
 * écran blanc le temps du téléchargement.
 */
export function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-4 px-0.5 pt-5 pb-4" role="status" aria-label="Chargement du résumé">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block h-4"
          style={{
            borderRadius: 'var(--radius-summary-skeleton)',
            backgroundColor: 'var(--color-summary-skeleton-fill)',
            width: i === 2 ? '60%' : '100%',
          }}
        />
      ))}
    </div>
  );
}

export default SummarySkeleton;
