import { appelNatif, type CoqueNative } from '@/lib/native-shell';

import type { WidgetSnapshot } from './snapshot';

/**
 * **LE CANAL PAGE → WIDGETS DE LA COQUE ANDROID** (#10626).
 *
 * Les widgets ne chargent pas un second SDK : la page, déjà connectée et déjà
 * en cache, leur PUBLIE un instantané JSON (`MeeshyWidgetsPlugin.java` le
 * range dans un `SharedPreferences` dédié et redessine). Ce module en règle le
 * débit et l'identité :
 *
 *  - un changement attend `debounceMs` (seul le dernier état part) ;
 *  - un instantané identique au dernier envoyé ne repart jamais — l'empreinte
 *    est le JSON lui-même, comparé tel qu'il partirait ;
 *  - `flush()` (passage en arrière-plan) envoie sur-le-champ ce qui attendait ;
 *  - une déconnexion ou un changement de compte VIDE les widgets IMMÉDIATEMENT,
 *    avant toute publication du compte suivant (dimension sécurité — miroir de
 *    `WidgetDataManager.wipeAll`, appgroup-01).
 */
export const WIDGETS_BRIDGE = 'MeeshyWidgets';
export const WIDGET_DEBOUNCE_MS = 1_500;

export type WidgetBridge = {
  readonly publish: (json: string) => Promise<unknown>;
  readonly clear: () => Promise<unknown>;
  readonly drainMarkRead: () => Promise<readonly string[]>;
};

export type WidgetTimers = {
  readonly set: (run: () => void, ms: number) => number;
  readonly clear: (id: number) => void;
};

const idsOf = (result: unknown): readonly string[] => {
  const ids = (result as { readonly ids?: unknown } | null)?.ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id !== '') : [];
};

export function widgetBridgeOf(coque: CoqueNative | undefined): WidgetBridge | null {
  const appel = appelNatif(coque, WIDGETS_BRIDGE);
  if (appel === null) return null;
  return {
    publish: (json) => appel('publish', { json }),
    clear: () => appel('clear', {}),
    drainMarkRead: () => appel('drainMarkRead', {}).then(idsOf),
  };
}

export type WidgetChannel = {
  /** `identity` null = personne de connecté ; `snapshot` absent = cache pas encore servi. */
  readonly offer: (identity: string | null, snapshot: WidgetSnapshot | undefined) => void;
  readonly flush: () => void;
  /** Vide la file « marquer lu » des widgets ; rend le nombre d'actions rejouées. */
  readonly drainMarkRead: (markRead: (conversationId: string) => void) => Promise<number>;
};

const CLEARED = Symbol('cleared');
const NOBODY = Symbol('nobody');

const silently = (promise: Promise<unknown>): void => {
  promise.catch(() => undefined);
};

export function createWidgetChannel(params: {
  readonly bridge: WidgetBridge;
  readonly timers: WidgetTimers;
  readonly debounceMs?: number;
}): WidgetChannel {
  const { bridge, timers } = params;
  const debounceMs = params.debounceMs ?? WIDGET_DEBOUNCE_MS;
  let identity: string | typeof NOBODY | undefined;
  let sent: string | typeof CLEARED | undefined;
  let waiting: string | undefined;
  let timer: number | undefined;

  const cancel = (): void => {
    if (timer !== undefined) timers.clear(timer);
    timer = undefined;
    waiting = undefined;
  };

  const send = (): void => {
    const json = waiting;
    cancel();
    if (json === undefined || json === sent) return;
    sent = json;
    silently(bridge.publish(json));
  };

  const wipe = (): void => {
    cancel();
    if (sent === CLEARED) return;
    sent = CLEARED;
    silently(bridge.clear());
  };

  return {
    offer: (who, snapshot) => {
      const next = who ?? NOBODY;
      if (next !== identity) {
        if (identity !== undefined || next === NOBODY) wipe();
        identity = next;
      }
      if (who === null || snapshot === undefined) return;
      const json = JSON.stringify(snapshot);
      if (json === sent) {
        cancel();
        return;
      }
      waiting = json;
      if (timer !== undefined) timers.clear(timer);
      timer = timers.set(send, debounceMs);
    },
    flush: send,
    drainMarkRead: async (markRead) => {
      if (identity === undefined || identity === NOBODY) return 0;
      const ids = await bridge.drainMarkRead().catch(() => []);
      ids.forEach(markRead);
      return ids.length;
    },
  };
}
