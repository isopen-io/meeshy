import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand/react';

import './styles/app.css';

import Shell from '@/components/shell';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { useRoute } from '@/lib/router';
import { followSystem } from '@/lib/scheme';
import { resolveRouteAccess } from '@/lib/session-guard';
import { Router, href, navigate } from '@/routes/route-table';

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
 *
 * `appQueryClient` (#5650, F5/F9) REMPLACE le `new QueryClient` qui vivait
 * ici : c'est l'instance UNIQUE, persistée par `dehydrate`/`hydrate` et
 * purgée par la session — `performRowAction`
 * (`lib/api/conversation-actions.ts`) et tout hook de `lib/api/query.ts`
 * lisent et écrivent le MÊME client que celui fourni au contexte React ;
 * deux instances distinctes rendraient chaque mutation optimiste invisible
 * à la liste (défaut mesuré et corrigé pendant ce lot, `check-list-actions.mjs`).
 */

/**
 * LA GARDE DE SESSION (#5555, E6) — branche `resolveRouteAccess` (pure) sur
 * la route COURANTE et le magasin de session PARTAGÉ. Elle rend le squelette
 * pendant qu'elle redirige plutôt que de laisser passer un flash du contenu
 * privé (D-6) — même si, `apiConfig.source` valant `'fixtures'` tant que le
 * transport réel n'est câblé nulle part (#5493), elle ne mord encore sur
 * AUCUN écran : le jour où un écran passe en source `'gateway'`, la garde
 * est déjà là, pas à ajouter.
 */
function SessionGate({ children }: { children: ReactNode }) {
  const { key } = useRoute();
  const status = useStore(sessionStore, (s) => s.session.status);
  const decision = resolveRouteAccess({ sessionStatus: status, source: apiDeps.source, routeKey: key });

  useEffect(() => {
    if (decision === 'redirect-login') navigate(href('login'), true);
    if (decision === 'redirect-home') navigate(href('list'), true);
  }, [decision]);

  return decision === 'allow' ? children : <Skeleton />;
}

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
    <QueryClientProvider client={appQueryClient}>
      <Router wrap={(screen) => <Shell><SessionGate>{screen}</SessionGate></Shell>} skeleton={<Skeleton />} />
    </QueryClientProvider>
  </StrictMode>,
);

/**
 * LE TEMPS RÉEL S'AMORCE APRÈS LA PREMIÈRE PEINTURE (#5793) — `import()`,
 * motif `dev-harness.ts` ci-dessus, mais SANS garde `DEV` : le fil et la
 * liste reçoivent `message:new`/`typing:*` en PRODUCTION comme en
 * développement. Placé APRÈS `createRoot(...).render(...)` : le rendu
 * initial est déjà planifié quand `socket.io-client` (chargé par ce module,
 * `lib/net/socket-io-factory.ts`) commence seulement à se télécharger —
 * c'est ce qui le tient hors de `first_paint` (`budgets.json`,
 * `scripts/measure-weight.mjs`).
 */
void import('@/lib/api/realtime');
