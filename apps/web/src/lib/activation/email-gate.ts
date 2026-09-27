import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * **LA DEMANDE DE VALIDATION DE L'E-MAIL** (#8365) — ce qu'une action refusée
 * (ou retenue d'avance) attend : que le lecteur valide son adresse. Une
 * promesse, tranchée par la vue de validation (`email-gate-host.tsx`) : `true`
 * au code validé — l'action repart —, `false` quand le lecteur ferme la vue.
 *
 * Module SANS DOM ni libellé : le transport (`email-gated-transport.ts`) le
 * lit au socle, la coquille s'y ATTACHE comme présentateur. Sans présentateur,
 * personne ne tranchera : la demande est refusée sur-le-champ plutôt que
 * suspendue pour toujours. Deux demandes simultanées partagent UNE vue.
 */

/** Pourquoi on demande — la phrase de la vue le dit. */
export type EmailGateReason = 'publish' | 'invite' | 'link';

export type EmailGateState = { readonly pending: { readonly reason: EmailGateReason } | null };

export type EmailGate = {
  readonly store: StoreApi<EmailGateState>;
  ask(reason: EmailGateReason): Promise<boolean>;
  settle(verified: boolean): void;
  attach(): () => void;
};

export function createEmailGate(): EmailGate {
  const store = createStore<EmailGateState>(() => ({ pending: null }));
  let presenters = 0;
  let waiting: ((verified: boolean) => void)[] = [];

  function settle(verified: boolean): void {
    const answered = waiting;
    waiting = [];
    store.setState({ pending: null });
    answered.forEach((resolve) => resolve(verified));
  }

  return {
    store,
    settle,
    ask: (reason) => {
      if (presenters === 0) return Promise.resolve(false);
      if (store.getState().pending === null) store.setState({ pending: { reason } });
      return new Promise<boolean>((resolve) => {
        waiting = [...waiting, resolve];
      });
    },
    attach: () => {
      presenters += 1;
      let attached = true;
      return () => {
        if (!attached) return;
        attached = false;
        presenters -= 1;
        if (presenters === 0) settle(false);
      };
    },
  };
}

/** L'UNIQUE demande que l'application partage — le transport la pose, la
 * coquille la présente. */
export const emailGate = createEmailGate();
