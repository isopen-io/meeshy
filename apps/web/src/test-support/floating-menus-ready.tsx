import { act, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { LazyFloatingMenus, loadFloatingMenus } from '@/components/floating-menus-lazy';

/**
 * LES DISQUES FLOTTANTS, RÉSOLUS AVANT LE PREMIER MONTAGE DU CADRE (#10117).
 *
 * Le cadre côte à côte pose les disques dans la colonne de la liste par un
 * `lazy` (`floating-menus-lazy.ts`). Son premier chargement — le chunk et son
 * catalogue — prend plus longtemps qu'un témoin synchrone : sa résolution
 * tombait APRÈS la fin du fichier, et React rendait sur un `window` déjà
 * retiré. Monté une fois ici, sous `act`, le `lazy` est résolu : chaque cadre
 * monté ensuite rend ses disques sans suspendre.
 *
 * À appeler dans un `beforeAll`, après l'enregistrement de happy-dom.
 */
export async function floatingMenusReady(): Promise<void> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <Suspense fallback={null}>
        <LazyFloatingMenus routeKey="list" contained />
      </Suspense>,
    );
    await loadFloatingMenus();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  act(() => root.unmount());
  host.remove();
}
