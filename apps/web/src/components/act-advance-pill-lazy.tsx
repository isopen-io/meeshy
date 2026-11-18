import { lazy, Suspense } from 'react';

const ActAdvancePill = lazy(() => import('./act-advance-pill').then((m) => ({ default: m.ActAdvancePill })));

/**
 * L'acte qui avance (#17367), monté par le fil : la pastille vit dans son propre chunk, chargé au PREMIER envoi — ouvrir
 * une conversation ne la paie pas (`budgets.json` § thread). Avant tout envoi, rien n'est monté.
 */
export function ActAdvanceOnSend({ sent }: { readonly sent: number }) {
  if (sent <= 0) return null;
  return (
    <Suspense fallback={null}>
      <ActAdvancePill sent={sent} />
    </Suspense>
  );
}
