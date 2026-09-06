import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/app.css';

import { arbreDesRoutes } from '@/routes/arbre';

/**
 * CACHE-FIRST, RESEAU-ENSUITE — les « Instant App Principles » du depot,
 * exprimes en configuration plutot qu'en discipline.
 *
 * `staleTime` non nul est ce qui distingue « je reaffiche instantanement ce que
 * j'ai, puis je rafraichis en silence » de « je remets un spinner ». Sur la 3G
 * visee, c'est la difference entre une application et une page web.
 */
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: true,
      // Une reconnexion apres une coupure doit rafraichir : c'est le cas
      // NOMINAL du reseau vise, pas un cas limite.
      refetchOnReconnect: true,
    },
  },
});

const routeur = createRouter({
  routeTree: arbreDesRoutes,
  defaultPreload: 'intent',
  /**
   * Sur un reseau lent, precharger au SURVOL gaspille des octets qu'on paie au
   * mega-octet. `intent` ne precharge qu'a l'intention reelle (pointeur
   * maintenu, focus clavier), et 300 ms de delai coupent les survols de
   * passage.
   */
  defaultPreloadDelay: 300,
  defaultPendingMs: 0,
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof routeur;
  }
}

const racine = document.getElementById('racine');
if (!racine) throw new Error('#racine absent du document');

createRoot(racine).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={routeur} />
    </QueryClientProvider>
  </StrictMode>,
);
