import { useEffect, useState } from 'react';

import type { DevicePushControl, DevicePushPermission } from './device-permission';

export type DevicePushRow = {
  readonly permission: DevicePushPermission;
  readonly enable: () => void;
  readonly openSettings: () => void;
};

/**
 * LA RANGÉE DE L'APPAREIL, POUR LES RÉGLAGES (#7307). Hors coque, `null` : le
 * navigateur a son propre chemin (#7306). Dans la coque, la permission se
 * relit à chaque retour au premier plan — c'est ainsi qu'un utilisateur revenu
 * de l'écran système voit la rangée disparaître sans recharger.
 */
export function useDevicePushRow(): DevicePushRow | null {
  const [control, setControl] = useState<DevicePushControl | null>(null);
  const [permission, setPermission] = useState<DevicePushPermission | null>(null);

  useEffect(() => {
    if (!__SHELL__) return undefined;
    let alive = true;
    void import('./shell-push-runtime').then(({ shellDevicePushControl }) => {
      if (alive) setControl(shellDevicePushControl());
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (control === null) return undefined;
    const refresh = (): void => {
      if (document.visibilityState === 'visible') void control.refresh().then(setPermission);
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [control]);

  if (control === null || permission === null) return null;
  return {
    permission,
    enable: () => void control.ask().then(setPermission),
    openSettings: () => void control.openSettings(),
  };
}
