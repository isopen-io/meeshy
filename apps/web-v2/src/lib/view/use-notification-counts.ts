import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { notificationCountsQueryOptions } from '@/lib/api/notifications';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';

/**
 * **LE COMPTE DE LA CLOCHE** (#6288, #6219) — le SEUL lecteur de
 * `GET /notifications/counts` : le bouton flottant de droite et l'en-tête de
 * la cloche lisent la MÊME entrée de cache, que les gestes optimistes et
 * `notification:counts` écrivent. Deux lectures parallèles auraient pu dire
 * deux nombres sur le même écran.
 *
 * Module À PART de `use-notifications.ts`, et c'est une question de poids : le
 * bouton flottant vit dans son propre chunk, préchargé sur chaque écran à
 * menus (`shell.tsx`). Il n'a pas à emporter les gestes, le cache des listes
 * ni les fixtures de la cloche pour afficher un nombre.
 *
 * Le client est passé EXPLICITEMENT (`appQueryClient`) : les menus se rendent
 * aussi hors de tout `QueryClientProvider` (leurs témoins), et le client
 * partagé est de toute façon l'unique instance de l'application.
 *
 * Sans session sur la passerelle, aucune requête : il n'y a pas de cloche à
 * compter, et un 401 fermerait une session qui n'existe pas.
 */
export function useNotificationCounts() {
  const authenticated = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  return useQuery(
    {
      ...notificationCountsQueryOptions(apiDeps),
      enabled: apiDeps.source === 'fixtures' || authenticated,
      staleTime: 30_000,
    },
    appQueryClient,
  );
}
