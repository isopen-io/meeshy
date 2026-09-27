import { useEffect, useState } from 'react';

import { loadMyActivation, requestPhoneCode, verifyPhoneCode, type Activation, type MyActivation } from '@/lib/api/activation';
import { auth } from '@/lib/api/auth';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { MY_PROFILE_QUERY_KEY } from '@/lib/api/profile';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { inviteDue, rememberInviteShown, wasInviteShownToday } from '@/lib/activation/invite';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

import { ActivationInviteDialog, type ActivationInviteDeps } from './activation-invite-dialog';

/**
 * **L'HÔTE DE L'INVITATION** (#8239) — chargé À LA DEMANDE par la coquille
 * quand une session est ouverte et que l'invitation n'a pas encore été
 * montrée aujourd'hui sur cet appareil (`useActivationInviteArmed`). Il relit
 * l'état servi UNE fois (`GET me.root`), n'ouvre la modal qu'en phase
 * `invite`, et retient le jour dès qu'elle s'ouvre.
 *
 * Une preuve rendue dans la modal fait relire le profil (son adresse ou son
 * numéro y passent « vérifiés ») ; l'état d'activation, lui, ne vit qu'ici.
 */

const defaultDialogDeps: ActivationInviteDeps = {
  resendVerification: (email) => auth.resendVerification(email),
  verifyEmail: auth.verifyEmail,
  requestPhoneCode: (phone) => requestPhoneCode(apiDeps, phone),
  verifyPhoneCode: (code) => verifyPhoneCode(apiDeps, code),
};

type Shown = { readonly activation: Activation; readonly email: string | null };

export function ActivationInviteHost({
  load = () => loadMyActivation(apiDeps),
  storage = safeLocalStorage(),
  now = Date.now,
  language = currentInterfaceLanguage(),
  dialogDeps = defaultDialogDeps,
}: {
  readonly load?: () => Promise<ApiResult<MyActivation>>;
  readonly storage?: SafeStorage;
  readonly now?: () => number;
  readonly language?: InterfaceLanguage;
  readonly dialogDeps?: ActivationInviteDeps;
}) {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (wasInviteShownToday(storage, now())) return undefined;
    let alive = true;
    void load().then((result) => {
      if (!alive || !result.ok || !inviteDue(result.data.activation)) return;
      rememberInviteShown(storage, now());
      setShown({ activation: result.data.activation, email: result.data.email });
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
      onActivationChange={(next) => {
        if (!next.missing.includes('email')) sessionStore.getState().noteEmailProven();
        void appQueryClient.invalidateQueries({ queryKey: MY_PROFILE_QUERY_KEY });
      }}
      onClose={() => setShown(null)}
    />
  );
}
