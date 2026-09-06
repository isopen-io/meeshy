import { Outlet, createRootRoute, createRoute } from '@tanstack/react-router';
import { lazy } from 'react';

/**
 * L'ARBRE DES ROUTES, ecrit a la main plutot que genere par fichiers.
 *
 * Raison mesurable : le decoupage par route est ce qui borne la PREMIERE
 * peinture. Ecrit ici, il se lit d'un coup d'oeil et chaque `lazy` est un
 * arbitrage visible ; genere, il se subit. La liste est la porte d'entree —
 * elle reste dans le socle ; le fil, les reglages et le reste arrivent a la
 * demande.
 */

const Coquille = lazy(() => import('@/components/coquille'));
const EcranListe = lazy(() => import('@/routes/liste'));
const EcranFil = lazy(() => import('@/routes/fil'));

const racine = createRootRoute({
  component: () => (
    <Coquille>
      <Outlet />
    </Coquille>
  ),
});

const liste = createRoute({
  getParentRoute: () => racine,
  path: '/',
  component: EcranListe,
});

const fil = createRoute({
  getParentRoute: () => racine,
  path: '/c/$conversation',
  component: EcranFil,
});

export const arbreDesRoutes = racine.addChildren([liste, fil]);
