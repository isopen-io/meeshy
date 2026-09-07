import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/app.css';

import Coquille from '@/components/coquille';
import { Routeur } from '@/routes/table';

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

/** Le squelette d'attente d'un ecran decoupe — statique, jamais un spinner. */
function Squelette() {
  return (
    <div className="grid gap-2 p-4" aria-busy="true">
      <p className="text-meta" style={{ color: 'var(--color-ios-encre-2)' }}>
        L’écran arrive…
      </p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-[14px]" style={{ backgroundColor: 'var(--color-ios-carte)' }} />
      ))}
    </div>
  );
}

const racine = document.getElementById('racine');
if (!racine) throw new Error('#racine absent du document');

createRoot(racine).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <Routeur enveloppe={(ecran) => <Coquille>{ecran}</Coquille>} squelette={<Squelette />} />
    </QueryClientProvider>
  </StrictMode>,
);
