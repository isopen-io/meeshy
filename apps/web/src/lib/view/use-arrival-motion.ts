import { useEffect, useMemo, useRef } from 'react';

import type { Message } from '@/lib/api/types';
import { usePrefersReducedMotion } from '@/lib/lottie/use-reduced-motion';

import { ARRIVAL_MOTION_MS, animatedArrival, type ArrivalEntry } from './arrival-motion';

/**
 * L'ARRIVÉE ANIMÉE DU FIL (#11223) — l'état autour de la règle pure
 * (`arrival-motion.ts`) : le rendu précédent, et l'arrivée en cours.
 *
 * Rend l'`id` de la SEULE rangée à animer, ou `null`.
 *
 * ## L'IDENTITÉ D'UN MESSAGE EST SON `clientMessageId` QUAND IL EN A UN
 *
 * Mon envoi naît sous l'id local (`clientMessageId`, `local-message.ts`) puis
 * prend l'id serveur à l'accusé — même message, autre `id`. Compté par `id`, la
 * confirmation serait un message NEUF et rejouerait son arrivée. La clé de la
 * règle est donc `clientMessageId ?? id` ; l'`id` rendu, lui, est celui de la
 * rangée À L'INSTANT de l'arrivée : la rangée confirmée (nouvelle clé React,
 * donc remontée) ne le porte pas, et ne se réanime pas.
 *
 * ## L'ARRIVÉE SURVIT AUX RENDUS QUI SUIVENT, LE TEMPS DE SON ANIMATION
 *
 * Une traduction, un accusé de lecture, une réaction : chacun refait la liste
 * sans rien y ajouter, souvent dans les centaines de millisecondes qui suivent
 * l'arrivée. Retirer la classe à ce rendu couperait l'animation net. L'arrivée
 * est donc TENUE `ARRIVAL_MOTION_MS`, dans une référence — jamais dans un état,
 * qui coûterait un rendu de plus de toute la liste à chaque message.
 */

const EMPTY: ReadonlySet<string> = new Set();

const arrivalKeyOf = (message: Message): string =>
  'clientMessageId' in message && typeof message.clientMessageId === 'string' ? message.clientMessageId : message.id;

const entryOf = (message: Message): ArrivalEntry => ({
  key: arrivalKeyOf(message),
  createdAt: new Date(message.createdAt).getTime(),
});

type Held = { readonly id: string; readonly until: number };

export function useArrivalMotion(messages: readonly Message[]): string | null {
  const reduceMotion = usePrefersReducedMotion();
  const previous = useRef<ReadonlySet<string>>(EMPTY);
  const held = useRef<Held | null>(null);
  const entries = useMemo(() => messages.map(entryOf), [messages]);

  const fresh = useMemo(() => {
    const key = animatedArrival({ previous: previous.current, next: entries, now: Date.now(), reduceMotion });
    return key === null ? null : (messages.at(-1)?.id ?? null);
  }, [entries, messages, reduceMotion]);

  useEffect(() => {
    previous.current = new Set(entries.map((entry) => entry.key));
    if (fresh !== null) held.current = { id: fresh, until: Date.now() + ARRIVAL_MOTION_MS };
  }, [entries, fresh]);

  if (fresh !== null) return fresh;
  if (reduceMotion || held.current === null || Date.now() >= held.current.until) return null;
  return held.current.id;
}
