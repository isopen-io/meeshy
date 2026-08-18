/**
 * `useLentilleLiveTick` — D-12 soldée (L14, `tasks/lentille-cloture-phase1.md`
 * §3).
 *
 * RE-PREUVE (protocole RE-PROUVER, avant correctif) : `LentilleRow.tsx:508`
 * calcule `time` via `formatConversationDate(conversation.lastMessage
 * .createdAt, { t })` à CHAQUE rendu — `formatConversationDate` relit bien
 * `new Date()` en interne (`utils/date-format.ts:100`), le calcul lui-même
 * n'est donc pas figé. Ce qui l'est : rien ne redemande jamais ce rendu.
 * `LentilleRow` est `memo()` (`LentilleRow.tsx:332`, comparateur par défaut,
 * `LentilleRow.memo.test.tsx`) et aucune prop ne change avec le temps qui
 * passe — une liste laissée ouverte affiche donc une heure périmée jusqu'au
 * prochain événement métier (nouveau message, sélection, typing…). iOS a
 * son `TimelineView(.periodic(by: 60))` (cité par D-12) ; le web n'avait
 * aucun équivalent.
 *
 * PATRON MUTUALISÉ — même geste que R6-6 côté gateway (`b31ed71e`, « core.ts
 * et ConversationBridgeService mutualisent la lecture des curseurs » : un
 * point de calcul PARTAGÉ transmis aux consommateurs plutôt qu'un par
 * consommateur) et même famille que le tick de statut déjà en production
 * (`stores/user-store.ts` → `_lastStatusUpdate` / `hooks/
 * use-user-status-realtime.ts` → `setInterval(triggerStatusTick, …)`) :
 * UN SEUL `setInterval` de 60s au niveau du MODULE, jamais un minuteur par
 * rang. Chaque rang monté s'abonne via un compteur de référence ; le premier
 * abonné démarre l'intervalle, le dernier qui se démonte l'arrête — pas de
 * fuite en navigation (liste démontée ⇒ zéro rang abonné ⇒ intervalle
 * coupé, prouvé par `use-lentille-live-tick.test.ts`).
 *
 * Le hook ne calcule PAS l'heure : il force seulement un re-rendu périodique
 * du composant appelant (chaque `LentilleRow` qui affiche une heure). C'est
 * le rendu lui-même qui relit l'horloge via `formatConversationDate`. Les
 * peaux ne posent pas de timer — c'est ce hook, côté hook, qui le fait pour
 * elles ; `LentilleRow.tsx` ne contient aucun `setInterval`.
 */
'use client';

import { useEffect, useState } from 'react';

const LENTILLE_LIVE_TICK_INTERVAL_MS = 60_000;

let subscriberCount = 0;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function notifyAllListeners(): void {
  listeners.forEach((listener) => listener());
}

function ensureIntervalStarted(): void {
  if (intervalHandle !== null) return;
  intervalHandle = setInterval(notifyAllListeners, LENTILLE_LIVE_TICK_INTERVAL_MS);
}

function stopIntervalIfNoSubscribers(): void {
  if (subscriberCount > 0) return;
  if (intervalHandle === null) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
}

/**
 * Échappatoire de test UNIQUEMENT : expose l'état interne du singleton
 * (compteur d'abonnés, intervalle actif) pour le témoin de fuite — jamais
 * consommé par du code de production.
 */
export function __lentilleLiveTickDebugState(): {
  subscriberCount: number;
  intervalActive: boolean;
} {
  return { subscriberCount, intervalActive: intervalHandle !== null };
}

/**
 * S'abonne au tick partagé de 60s. La valeur retournée (un compteur qui
 * s'incrémente) n'est PAS destinée à être affichée — elle sert seulement à
 * changer d'identité à chaque tick pour forcer le re-rendu de l'appelant.
 * C'est un `useState` interne au composant : il déclenche le re-rendu même
 * sous `memo()`, puisque `memo` ne bloque que les re-rendus provoqués par
 * le PARENT (props inchangées), jamais l'état propre du composant.
 */
export function useLentilleLiveTick(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    subscriberCount += 1;
    ensureIntervalStarted();

    const listener = () => setTick((current) => current + 1);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
      subscriberCount -= 1;
      stopIntervalIfNoSubscribers();
    };
  }, []);

  return tick;
}
