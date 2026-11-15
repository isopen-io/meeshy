import { useEffect, useState } from 'react';

import { emailGate, type EmailGateReason } from '@/lib/activation/email-gate';
import { loadMyActivation, requestPhoneCode, verifyPhoneCode, type Activation, type MyActivation } from '@/lib/api/activation';
import { auth } from '@/lib/api/auth';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { MY_PROFILE_QUERY_KEY } from '@/lib/api/profile';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { ActivationInviteDialog, type ActivationInviteDeps } from './activation-invite-dialog';

/**
 * **L'HÔTE DE LA GARDE DE L'E-MAIL** (#8365) — chargé À LA DEMANDE par la
 * coquille quand une action attend une adresse prouvée
 * (`lib/activation/email-gate.ts`). Il relit l'adresse EN CLAIR (`GET me`,
 * jamais persistée), puis ouvre la modal de #8239 dans sa forme « garde » :
 * la raison dite, le code envoyé sans geste, l'adresse seule demandée.
 *
 * Il tranche la demande : `true` au code validé (l'action retenue repart),
 * `false` à la fermeture ou sur un état illisible (le refus d'origine se dit).
 * Une adresse prouvée entre-temps — sur un autre appareil — tranche `true`
 * sans rien montrer.
 */

const defaultDialogDeps: ActivationInviteDeps = {
  resendVerification: (email) => auth.resendVerification(email),
  verifyEmail: auth.verifyEmail,
  requestPhoneCode: (phone) => requestPhoneCode(apiDeps, phone),
  verifyPhoneCode: (code) => verifyPhoneCode(apiDeps, code),
};

const provesEmail = (activation: Activation): boolean => !activation.missing.includes('email');

/** Le code validé ou l'adresse déjà prouvée : la session l'apprend, le profil
 * se relit, et la demande repart. */
export function settleEmailGate(verified: boolean): void {
  if (verified) {
    sessionStore.getState().noteEmailProven();
    void appQueryClient.invalidateQueries({ queryKey: MY_PROFILE_QUERY_KEY });
  }
  emailGate.settle(verified);
}

type Shown = { readonly activation: Activation; readonly email: string };

export function EmailGateHost({
  reason,
  onSettle = settleEmailGate,
  load = () => loadMyActivation(apiDeps),
  dialogDeps = defaultDialogDeps,
  language = currentInterfaceLanguage(),
  now = Date.now,
}: {
  readonly reason: EmailGateReason;
  readonly onSettle?: (verified: boolean) => void;
  readonly load?: () => Promise<ApiResult<MyActivation>>;
  readonly dialogDeps?: ActivationInviteDeps;
  readonly language?: InterfaceLanguage;
  readonly now?: () => number;
}) {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    let alive = true;
    void load().then((result) => {
      if (!alive) return;
      if (!result.ok || result.data.email === null) {
        onSettle(false);
        return;
      }
      const activation = result.data.activation ?? { phase: 'quiet', deadline: null, missing: ['email'] };
      if (provesEmail(activation)) {
        onSettle(true);
        return;
      }
      setShown({ activation, email: result.data.email });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (shown === null) return null;

  return (
    <ActivationInviteDialog
      activation={shown.activation}
      email={shown.email}
      now={now()}
      language={language}
      deps={dialogDeps}
      reason={reason}
      onActivationChange={(next) => {
        if (provesEmail(next)) onSettle(true);
      }}
      onClose={() => onSettle(false)}
    />
  );
}
