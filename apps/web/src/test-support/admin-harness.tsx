import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll } from 'bun:test';
import type { ReactElement } from 'react';

import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { navigate } from '@/lib/router';

import { createActMounter } from './act-mount';
import type { AdminIdentityFixture } from './admin-assertions';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from './happy-dom-environment';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/**
 * **L'ENVIRONNEMENT COMMUN DES TÉMOINS DU KIT D'ADMINISTRATION** (#8876) — un
 * appel en tête de fichier pose ce que chaque témoin de composant recopierait :
 * le DOM (avec une URL réelle, sans quoi `pushState` ne change rien), l'environnement
 * `act`, les catalogues, le client de requêtes vidé entre deux témoins.
 *
 * `mount` enveloppe l'élément dans le fournisseur de requêtes et, si une
 * identité est passée, la pose dans le cache sous la clé de la matrice (fraîche
 * 5 min : aucune requête ne part) ; sans identité, la matrice reste en vol.
 */
export function setupAdminKitTests(options: { readonly languages?: readonly AdminLanguage[] } = {}) {
  const mounter = createActMounter();

  beforeAll(async () => {
    ensureHappyDomRegistered({ url: 'http://localhost/' });
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    await Promise.all((options.languages ?? ['fr']).map((language) => loadAdminInterfaceCatalog(language)));
    await loadInterfaceCatalog('fr');
  });

  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    /* Le planificateur de React peut encore tenir des effets passifs du
       dernier montage (une réponse réseau tardive) : les laisser s'exécuter
       TANT QUE `window` existe. Sans cette vidange, ils tombaient après la
       libération de happy-dom (« window.event » sur undefined), une erreur
       « entre deux tests » qui rougit la suite au hasard de l'ordonnancement. */
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await releaseHappyDomIfRegistered();
  });

  afterEach(() => {
    mounter.unmountAll();
    appQueryClient.clear();
    navigate('/', true);
  });

  const mount = (element: ReactElement, identity?: AdminIdentityFixture): Promise<HTMLDivElement> => {
    if (identity !== undefined) appQueryClient.setQueryData(ADMIN_PERMISSIONS_QUERY_KEY, identity);
    else if (appQueryClient.getQueryState(ADMIN_PERMISSIONS_QUERY_KEY) === undefined) {
      /* Sans identité fournie, la matrice reste « en vol » : la lecture réelle ne PART pas
         (un `fetch` vers une passerelle absente finirait après le démontage), et le lecteur
         est traité comme inconnu — fermé, ce que le kit doit faire. */
      void appQueryClient.prefetchQuery({ queryKey: ADMIN_PERMISSIONS_QUERY_KEY, queryFn: () => new Promise(() => undefined) });
    }
    return mounter.mount(<QueryClientProvider client={appQueryClient}>{element}</QueryClientProvider>);
  };

  return { mounter, mount };
}
