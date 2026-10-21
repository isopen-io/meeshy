import { useEffect, useState } from 'react';

import type { DeviceTranslationConsent } from './consent';

/**
 * Le consentement se lit par `import()` : le fil (`use-device-translation.ts`) et
 * les réglages le tiennent tous deux, et un module statique commun ferait de
 * leurs deux chunks de route un même chunk partagé — son adresse grossirait le
 * point d'entrée (budget de la première peinture). `load` n'existe que pour les
 * témoins.
 */
const loadConsent = async (): Promise<DeviceTranslationConsent> => (await import('./consent')).deviceTranslationConsent();

/**
 * Ce que l'écran des réglages reçoit : un réglage LOCAL, comme la galerie de la
 * coque — le consentement et le modèle vivent sur l'appareil, aucune passerelle
 * n'est consultée. `ready` est faux tant que l'accord n'est pas lu : la bascule
 * est posée mais inerte, plutôt que de s'annoncer dans un état qu'on ne connaît
 * pas.
 */
export type DeviceTranslationSetting = {
  readonly ready: boolean;
  readonly enabled: boolean;
  readonly onToggle: (enabled: boolean) => void;
};

/**
 * **LA BASCULE « TRADUIRE SUR CET APPAREIL »** (#9898) — pose et retire le
 * consentement au téléchargement du modèle. `null` tant qu'il n'est pas lu : la
 * bascule est posée mais inerte (`ready: false`). L'état suit le geste aussitôt
 * (optimiste), puis se reprend à ce que l'appareil tient VRAIMENT — un stockage
 * qui refuse d'écrire (navigation privée) ramène la bascule à éteinte plutôt que
 * de la laisser mentir. Le fil relit l'accord à chaque fenêtre : le choix est
 * entendu au fil suivant, sans recharger la page.
 */
export function useDeviceTranslationSetting(load: () => Promise<DeviceTranslationConsent> = loadConsent): DeviceTranslationSetting {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void load()
      .then((consent) => {
        if (!cancelled) setGranted(consent.granted());
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [load]);

  return {
    ready: granted !== null,
    enabled: granted === true,
    onToggle: (next) => {
      setGranted(next);
      void load()
        .then((consent) => {
          if (next) consent.grant();
          else consent.revoke();
          setGranted(consent.granted());
        })
        .catch(() => setGranted(!next));
    },
  };
}
