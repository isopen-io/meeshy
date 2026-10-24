import { useMemo, useRef } from 'react';

import type { Message } from '@/lib/api/types';
import { usePrefersReducedMotion } from '@/lib/lottie/use-reduced-motion';

import { ARRIVAL_MOTION_MS, animatedArrival, type ArrivalEntry } from './arrival-motion';

/**
 * L'ARRIVÉE ANIMÉE DU FIL (#11223) — l'état autour de la règle pure
 * (`arrival-motion.ts`) : le rendu précédent, et l'arrivée en cours.
 *
 * Rend la CLÉ (`threadRowKeyOf`) de la SEULE rangée à animer, ou `null`.
 *
 * ## L'IDENTITÉ D'UNE RANGÉE EST SON `clientMessageId` QUAND ELLE EN A UN
 *
 * Mon envoi naît sous l'id local (`clientMessageId`, `local-message.ts`) puis
 * prend l'id serveur à l'accusé — même message, autre `id`. Compté par `id`, la
 * confirmation serait un message NEUF et rejouerait son arrivée ; clé de
 * rangée React par `id`, l'accusé REMONTAIT la rangée en plein vol et coupait
 * son entrée net. `threadRowKeyOf` est donc la clé de la règle, de la rangée
 * React ET du virtualiseur (`routes/thread.tsx`) : l'accusé met à jour la
 * MÊME rangée, qui finit son entrée.
 *
 * ## L'ARRIVÉE EST TENUE LE TEMPS DE SON ANIMATION, JAMAIS AU-DELÀ
 *
 * Une traduction, un accusé de lecture, une réaction : chacun refait la liste
 * sans rien y ajouter, souvent dans les centaines de millisecondes qui suivent
 * l'arrivée. Retirer la classe à ce rendu couperait l'animation net : elle est
 * TENUE `ARRIVAL_MOTION_MS`. Mais la tenue est une ÉCHÉANCE, relue à chaque
 * rendu — jamais une valeur mémorisée qu'on rendrait tant que la liste ne
 * change pas : une rangée REMONTÉE après l'échéance (le virtualiseur qui la
 * démonte puis la remonte, un aller-retour par le Résumé) rejouerait sinon
 * l'entrée d'un message arrivé depuis longtemps.
 *
 * La règle ne se calcule qu'au rendu où la liste CHANGE, et tout vit dans une
 * référence — jamais dans un état, qui coûterait un rendu de plus de toute la
 * liste à chaque message.
 */

const EMPTY: ReadonlySet<string> = new Set();

export const threadRowKeyOf = (message: Message): string =>
  'clientMessageId' in message && typeof message.clientMessageId === 'string' ? message.clientMessageId : message.id;

const entryOf = (message: Message): ArrivalEntry => ({
  key: threadRowKeyOf(message),
  createdAt: new Date(message.createdAt).getTime(),
});

type Held = { readonly key: string; readonly until: number };

type Memory = {
  readonly entries: readonly ArrivalEntry[] | null;
  readonly keys: ReadonlySet<string>;
  readonly held: Held | null;
};

const INITIAL: Memory = { entries: null, keys: EMPTY, held: null };

function remembered(memory: Memory, entries: readonly ArrivalEntry[], now: number, reduceMotion: boolean): Memory {
  const key = animatedArrival({ previous: memory.keys, next: entries, now, reduceMotion });
  return {
    entries,
    keys: new Set(entries.map((entry) => entry.key)),
    held: key === null ? memory.held : { key, until: now + ARRIVAL_MOTION_MS },
  };
}

export function useArrivalMotion(messages: readonly Message[]): string | null {
  const reduceMotion = usePrefersReducedMotion();
  const entries = useMemo(() => messages.map(entryOf), [messages]);
  const memory = useRef<Memory>(INITIAL);
  const now = Date.now();
  if (memory.current.entries !== entries) memory.current = remembered(memory.current, entries, now, reduceMotion);
  const { held } = memory.current;
  return reduceMotion || held === null || now >= held.until ? null : held.key;
}
