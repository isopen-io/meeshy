import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { canEnterAdmin } from '@/lib/admin/sections';
import { adminIdentityQueryOptions, type AdminDeps } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore, type SessionStoreApi } from '@/lib/api/session';

export type AdminAccessOptions = {
  readonly deps?: AdminDeps;
  readonly client?: QueryClient;
  readonly session?: SessionStoreApi;
};

/**
 * **LE BARREAU « ADMINISTRATION » EXISTE-T-IL ?** (#6458) — `true` seulement
 * quand la matrice est SERVIE et porte `canAccessAdmin`, pour une session
 * ouverte.
 *
 * Fail-closed par construction : `useQuery` rend `data: undefined` pendant le
 * vol, sur un refus comme sur une panne (`retry: false`), et `canEnterAdmin`
 * lit `null` comme l'absence du droit. Aucune erreur n'est remontée : le
 * barreau n'est qu'un chemin de DÉCOUVERTE, la garde étant refaite par l'écran
 * `/admin` lui-même — un refus affiché ici apprendrait à un visiteur ordinaire
 * qu'il existe un espace qu'on lui refuse.
 *
 * **La lecture est CELLE de l'écran d'administration** (`adminIdentityQueryOptions`,
 * même clé, même fraîcheur) : une matrice déjà lue par `/admin` ou par les
 * Réglages ouvre le barreau sans requête, et la persistance du cache la rend
 * dès le démarrage suivant. Le client vide ce cache à chaque changement
 * d'identité (`query-client.ts`) : la matrice d'un compte ne survit pas à sa
 * déconnexion.
 *
 * **Aucune lecture sans session, ni sous une construction `fixtures`.** Sans
 * session, un 401 fermerait une session qui n'existe pas ; sous `fixtures`,
 * l'administration n'a volontairement pas de démonstration (`lib/api/admin.ts`)
 * et la requête partirait vers une passerelle absente.
 *
 * Les dépendances sont injectables pour les témoins ; l'application passe par
 * les défauts — le client, l'adaptateur et la session UNIQUES.
 */
export function useAdminAccess(options: AdminAccessOptions = {}): boolean {
  const deps = options.deps ?? apiDeps;
  const authenticated = useStore(options.session ?? sessionStore, (state) => state.session.status === 'authenticated');
  const identity = useQuery(
    { ...adminIdentityQueryOptions(deps), enabled: authenticated && deps.source === 'gateway' },
    options.client ?? appQueryClient,
  );

  return authenticated && canEnterAdmin(identity.data?.permissions ?? null);
}
