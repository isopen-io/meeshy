import { creeLeRouteur } from '@/lib/routeur';

/**
 * LA TABLE DES ROUTES — le seul endroit du depot qui connait les adresses.
 *
 * Elle est ecrite a la main plutot que generee par fichiers : le decoupage par
 * route est ce qui borne la premiere peinture, et ecrit ici chaque `import()`
 * est un arbitrage VISIBLE. Genere, il se subit.
 */
export const ROUTES = {
  liste: { motif: '/', ecran: () => import('@/routes/liste') },
  fil: { motif: '/c/$conversation', ecran: () => import('@/routes/fil') },
} as const;

function Introuvable() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid gap-3">
        <p className="text-ecran font-bold">Cette adresse n’existe pas.</p>
        <a
          href="/"
          className="grid place-items-center rounded-pastille px-5 text-corps font-semibold text-white"
          style={{ backgroundColor: 'var(--color-marque)', minHeight: 44 }}
        >
          Revenir aux conversations
        </a>
      </div>
    </div>
  );
}

export const { Routeur, Lien, adresse, navigue } = creeLeRouteur(ROUTES, Introuvable);
