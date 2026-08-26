'use client';

import { useEffect, useState } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

export interface UnifiedConnectionStatus {
  isOnline: boolean;
  isSocketConnected: boolean;
  hasSocket: boolean;
  isReady: boolean;
}

type ConnectionInputs = {
  navigatorOnline: boolean;
  isSocketConnected: boolean;
  hasSocket: boolean;
};

type SocketDiagnostics = Pick<ConnectionInputs, 'isSocketConnected' | 'hasSocket'>;

/**
 * Un socket authentifié et vivant PROUVE la connectivité. `navigator.onLine`
 * n'est qu'un indice du navigateur — faux négatifs connus (VPN, interface
 * virtuelle, événement `online` jamais reçu) — qui ne compte que tant que le
 * socket est à terre. Mesuré en prod le 2026-08-26 : un onglet dont deux
 * sockets étaient authentifiés depuis 40 min affichait « Vous êtes hors
 * ligne » et une puce rouge sur la seule foi de `navigator.onLine`.
 */
function deriveStatus({ navigatorOnline, isSocketConnected, hasSocket }: ConnectionInputs): UnifiedConnectionStatus {
  const isOnline = navigatorOnline || isSocketConnected;
  return { isOnline, isSocketConnected, hasSocket, isReady: isOnline && isSocketConnected };
}

function sameStatus(a: UnifiedConnectionStatus, b: UnifiedConnectionStatus): boolean {
  return (
    a.isOnline === b.isOnline &&
    a.isSocketConnected === b.isSocketConnected &&
    a.hasSocket === b.hasSocket &&
    a.isReady === b.isReady
  );
}

function getNavigatorOnline(): boolean {
  /* istanbul ignore next -- SSR false-arm unreachable: navigator is always defined in browser/jsdom */
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function getSocketDiagnostics(): SocketDiagnostics {
  /* istanbul ignore next -- SSR false-arm unreachable: window is always defined in browser/jsdom */
  if (typeof window === 'undefined') return { isSocketConnected: false, hasSocket: false };
  const diag = meeshySocketIOService.getConnectionDiagnostics();
  return { isSocketConnected: !!diag.isConnected, hasSocket: !!diag.hasSocket };
}

function getInitialStatus(): UnifiedConnectionStatus {
  return deriveStatus({ navigatorOnline: getNavigatorOnline(), ...getSocketDiagnostics() });
}

/**
 * Source unique de vérité pour l'état de connexion, en mode event-driven
 * (pas de polling) : l'état du Socket.IO, complété par la connectivité
 * physique du navigateur quand le socket est à terre.
 *
 * Les événements `online`/`offline` RESYNCHRONISENT le drapeau socket depuis
 * les diagnostics au lieu de le forcer : un socket qui a survécu à un blip
 * réseau ne doit pas rester annoncé déconnecté, et un socket qui meurt sur
 * un `offline` réel le dit lui-même via `onStatusChange`.
 */
export function useConnectionStatus(): UnifiedConnectionStatus {
  const [status, setStatus] = useState<UnifiedConnectionStatus>(getInitialStatus);

  useEffect(() => {
    /* istanbul ignore next -- SSR false-arm unreachable: window is always defined in browser/jsdom */
    if (typeof window === 'undefined') return;

    const apply = (next: Partial<ConnectionInputs>) => {
      setStatus((prev) => {
        const merged = deriveStatus({
          navigatorOnline: next.navigatorOnline ?? getNavigatorOnline(),
          isSocketConnected: next.isSocketConnected ?? prev.isSocketConnected,
          hasSocket: next.hasSocket ?? prev.hasSocket,
        });
        return sameStatus(prev, merged) ? prev : merged;
      });
    };

    const resyncFromBrowser = () => {
      apply({ navigatorOnline: getNavigatorOnline(), ...getSocketDiagnostics() });
    };

    window.addEventListener('online', resyncFromBrowser);
    window.addEventListener('offline', resyncFromBrowser);

    const unsubSocket = meeshySocketIOService.onStatusChange((diag) => {
      apply({ isSocketConnected: !!diag.isConnected, hasSocket: !!diag.hasSocket });
    });

    // Resynchronisation initiale (au cas où un événement aurait été manqué
    // entre le calcul de l'état initial et la pose des listeners).
    resyncFromBrowser();

    return () => {
      window.removeEventListener('online', resyncFromBrowser);
      window.removeEventListener('offline', resyncFromBrowser);
      unsubSocket();
    };
  }, []);

  return status;
}

/** Sucre syntaxique : `true` si l'application est joignable (socket vivant ou réseau navigateur actif). */
export function useIsOnline(): boolean {
  return useConnectionStatus().isOnline;
}
