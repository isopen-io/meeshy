import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';

import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import { appQueryClient } from '@/lib/api/query-client';
import { Router, navigate } from '@/routes/route-table';

import type { AdminIdentityFixture } from './admin-assertions';
import type { createActMounter } from './act-mount';

/**
 * **MONTER UNE ADRESSE D'ADMINISTRATION, PAR LE ROUTEUR** (#8876) — pour les
 * témoins qui mesurent ce que seul le routeur sait : dans quel ESPACE on se
 * trouve (`/adm` ou `/admin`, D-76), quelle section le menu surligne, où mène
 * un lien d'entité.
 *

 * **Le DOM doit être enregistré avec une URL réelle** (`ensureHappyDomRegistered({ url: 'http://localhost/' })`) : sur `about:blank`, `pushState` d'une adresse relative ne change rien et le routeur rend « cette adresse n'existe pas ».
 *
 * La matrice du lecteur est posée dans le cache (`staleTime` 5 min : aucune
 * requête ne part), l'adresse est poussée AVANT le rendu, et l'écran — découpé
 * (`lazy`) — est attendu par son ancre, jamais par une durée au jugé.
 */
type Mounter = ReturnType<typeof createActMounter>;

const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

export async function mountAdminAt(mounter: Mounter, url: string, identity: AdminIdentityFixture, ready: string): Promise<HTMLDivElement> {
  appQueryClient.setQueryData(ADMIN_PERMISSIONS_QUERY_KEY, identity);
  navigate(url, true);
  const host = await mounter.mount(
    <Router wrap={(children) => <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>} skeleton={<div data-route-pending />} />,
  );
  for (let attempt = 0; attempt < 60 && host.querySelector(ready) === null; attempt += 1) await tick();
  if (host.querySelector(ready) === null) throw new Error(`écran ${ready} jamais monté sur ${url}`);
  await tick();
  return host;
}

/** À appeler après chaque témoin : l'adresse et le cache ne doivent pas fuir d'un témoin à l'autre. */
export function resetAdminRouter(): void {
  appQueryClient.clear();
  navigate('/', true);
}
