import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/app.css';

import Shell from '@/components/shell';
import { sessionStore } from '@/lib/api/session';
import { followSystem } from '@/lib/scheme';
import { Router } from '@/routes/route-table';

/**
 * Defaut 3c (recette 2026-09-07, #5604) : la bascule clair/sombre du systeme
 * ne prenait qu'au relancement — cette fonction existait (`scheme.ts`) mais
 * n'etait jamais appelee. Voir `scheme.test.ts` (T1) pour le comportement,
 * et la recette simulateur R4 pour la preuve qu'elle est bien montee ici.
 */
followSystem();

/**
 * LA SESSION EST TENUE (#5605, § 7.3) — lecture `localStorage` seule, aucun
 * appel réseau : le coût est celui du module lui-même (`session.ts`
 * n'importe jamais `http.ts`), mesuré avec le reste du socle.
 */
sessionStore.getState().restoreSession();

/**
 * LE HARNAIS DE RECETTE — DEV UNIQUEMENT. `import.meta.env.DEV` est un
 * littéral de construction : cette branche entière, `import()` compris, est
 * éliminée du bundle de production (voir `dev-harness.ts`).
 */
if (import.meta.env.DEV) void import('@/lib/api/dev-harness');

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
function Skeleton() {
  return (
    <div className="grid gap-2 p-4" aria-busy="true">
      <p className="text-meta" style={{ color: 'var(--color-ios-ink-2)' }}>
        L’écran arrive…
      </p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-[14px]" style={{ backgroundColor: 'var(--color-ios-card)' }} />
      ))}
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('#root absent du document');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <Router wrap={(screen) => <Shell>{screen}</Shell>} skeleton={<Skeleton />} />
    </QueryClientProvider>
  </StrictMode>,
);
