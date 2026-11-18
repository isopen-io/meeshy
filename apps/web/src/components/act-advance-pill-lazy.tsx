import { lazy, Suspense } from 'react';
import type { ActAdvancePill as Pill } from './act-advance-pill';

type PillProps = { readonly sent: number };
type PillComponent = (props: PillProps) => ReturnType<typeof Pill>;

/**
 * Hors ligne, le chunk ne se charge pas : la pastille est un décor, son absence ne remonte jamais au fil (sans quoi
 * la conversation tombe et l'envoi en échec n'est plus rejoué au retour du réseau).
 */
export function pillOrNothing(
  load: () => Promise<{ readonly ActAdvancePill: PillComponent }>,
): Promise<{ readonly default: PillComponent }> {
  return load().then(
    (m) => ({ default: m.ActAdvancePill }),
    () => ({ default: () => null }),
  );
}

const ActAdvancePill = lazy(() => pillOrNothing(() => import('./act-advance-pill')));

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
