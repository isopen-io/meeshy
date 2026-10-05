import { useEffect, useMemo, useState } from 'react';

import type { PhoneCodeDeps } from '@/components/phone-code-form';
import { loadMyPhonePresence, requestPhoneCode, verifyPhoneCode } from '@/lib/api/activation';
import { apiDeps } from '@/lib/api/deps';

/**
 * **« AJOUTEZ VOTRE NUMÉRO » DANS « DÉCOUVRIR »** (#8843) — la décision, et
 * ce qui l'alimente. Le numéro est MESURÉ (`loadMyPhonePresence`) ; tant qu'on
 * ne sait pas, rien n'est proposé. « Plus tard » est retenu dans CE
 * navigateur : une préférence de lecteur, pas un état de compte.
 */
export type PhonePresence = 'unknown' | 'present' | 'absent';

export function phonePromptVisible(params: { readonly presence: PhonePresence; readonly dismissed: boolean }): boolean {
  return params.presence === 'absent' && !params.dismissed;
}

const DISMISSED_KEY = 'meeshy.phone-prompt.later';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    /* Stockage refusé : « Plus tard » vaut pour cette visite. */
  }
}

export function usePhoneAddPrompt(enabled: boolean): {
  readonly visible: boolean;
  readonly deps: PhoneCodeDeps;
  readonly dismiss: () => void;
  readonly verified: () => void;
} {
  const [presence, setPresence] = useState<PhonePresence>('unknown');
  const [dismissed, setDismissed] = useState(readDismissed);
  const [justVerified, setJustVerified] = useState(false);

  useEffect(() => {
    if (!enabled || dismissed) return undefined;
    let live = true;
    void loadMyPhonePresence(apiDeps).then((result) => {
      if (live && result.ok) setPresence(result.data ? 'present' : 'absent');
    });
    return () => {
      live = false;
    };
  }, [enabled, dismissed]);

  const deps = useMemo<PhoneCodeDeps>(
    () => ({
      requestPhoneCode: (phone) => requestPhoneCode(apiDeps, phone),
      verifyPhoneCode: (code) => verifyPhoneCode(apiDeps, code),
    }),
    [],
  );

  return {
    visible: justVerified || phonePromptVisible({ presence, dismissed }),
    deps,
    dismiss: () => {
      writeDismissed();
      setDismissed(true);
    },
    verified: () => setJustVerified(true),
  };
}
