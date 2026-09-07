import { createRouter } from '@/lib/router';

/**
 * LA TABLE DES ROUTES — le seul endroit du depot qui connait les adresses.
 *
 * Elle est ecrite a la main plutot que generee par fichiers : le decoupage par
 * route est ce qui borne la premiere peinture, et ecrit ici chaque `import()`
 * est un arbitrage VISIBLE. Genere, il se subit.
 */
export const ROUTES = {
  list: { pattern: '/', screen: () => import('@/routes/conversations') },
  thread: { pattern: '/c/$conversation', screen: () => import('@/routes/thread') },
} as const;

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid gap-3">
        <p className="text-screen font-bold">Cette href n’existe pas.</p>
        <a
          href="/"
          className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
          style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
        >
          Revenir aux conversations
        </a>
      </div>
    </div>
  );
}

export const { Router, Link, href, navigate } = createRouter(ROUTES, NotFound);
