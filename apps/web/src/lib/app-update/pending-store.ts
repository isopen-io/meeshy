import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand/react';

import { SW_UPDATE_AVAILABLE_EVENT } from './event';
import type { RegistrationLike } from './service-worker';

/**
 * LA VERSION QUI ATTEND — un magasin, pas un état de composant (#6936).
 *
 * Le legacy garde ce fait dans le `useState` de sa bannière, abonnée à
 * `sw-update-available` dans un effet : une annonce qui part AVANT que la
 * bannière ne soit montée est perdue, et c'est précisément le cas de la
 * détection au chargement (`registration.waiting`, servie dans la même
 * microtâche que l'inscription). Ici, le magasin écoute dès le socle et la
 * bannière n'est montée que par sa réponse — elle ne peut rien manquer.
 *
 * `import type` pour `RegistrationLike` : ce module vit dans le SOCLE (la
 * coquille lit son portillon), le contrôleur de mise à jour dans un chunk à la
 * demande. Un import de VALEUR les recollerait, et ferait payer le contrôleur
 * à la première peinture.
 */
export type AppUpdateState = {
  /** La version en attente, telle que l'annonce l'a remise. `null` : rien à proposer. */
  readonly pending: RegistrationLike | null;
  /** « Attendre » — la bannière se referme, la version reste en attente. */
  readonly dismissed: boolean;
  /** Le clic est parti : purge, activation, rechargement. */
  readonly applying: boolean;
  announce(registration: RegistrationLike): void;
  dismiss(): void;
  markApplying(): void;
};

export const appUpdateStore = createStore<AppUpdateState>((set) => ({
  pending: null,
  dismissed: false,
  applying: false,
  announce: (registration) => set({ pending: registration, dismissed: false }),
  dismiss: () => set({ dismissed: true }),
  markApplying: () => set({ applying: true }),
}));

type AnnouncementHost = {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
};

function registrationOf(event: Event): RegistrationLike | null {
  const detail: unknown = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== 'object' || detail === null) return null;
  const candidate = (detail as { readonly registration?: unknown }).registration;
  if (typeof candidate !== 'object' || candidate === null) return null;
  return candidate as RegistrationLike;
}

/**
 * Branche le magasin sur l'événement du legacy. Rendu : la fonction qui
 * débranche — pour les témoins, et pour qu'un abonnement ne soit jamais
 * supposé éternel.
 */
export function listenForAppUpdates(host: AnnouncementHost): () => void {
  const listener = (event: Event): void => {
    const registration = registrationOf(event);
    if (registration === null) return;
    appUpdateStore.getState().announce(registration);
  };
  host.addEventListener(SW_UPDATE_AVAILABLE_EVENT, listener);
  return () => host.removeEventListener(SW_UPDATE_AVAILABLE_EVENT, listener);
}

if (typeof window !== 'undefined') listenForAppUpdates(window);

/**
 * LE PORTILLON DE LA BANNIÈRE — bon marché, même discipline que
 * `useSyncPillArmed` (`lib/view/sync-pill-gate.ts`) : il répond à une seule
 * question — *y a-t-il une version à proposer ?* —, et c'est son OUI qui va
 * chercher la bannière, ses libellés et le contrôleur.
 */
export function useAppUpdateAnnounced(): boolean {
  return useStore(appUpdateStore, (state) => state.pending !== null && !state.dismissed);
}
