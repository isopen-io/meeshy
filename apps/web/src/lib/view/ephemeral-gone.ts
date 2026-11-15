import { useEffect, useMemo, useState } from 'react';

import type { Message } from '@/lib/api/types';

import { DESTRUCTION_MS, destructionPhaseOf } from './ephemeral-destruction';
import { peekEphemeralDeadline, type EphemeralMessageFields } from './ephemeral-reception';
import { deadlineThroughQuotes, lookupOf } from './quote-cascade';

/**
 * **UN ÉPHÉMÈRE PARTI QUITTE LE FIL** (#8900) — directive porteur 2026-09-30 :
 * « les messages qui doivent disparaître doivent vraiment disparaître ».
 *
 * La phase `gone` (`destructionPhaseOf`) vidait la PEAU d'une rangée échue,
 * mais la rangée restait dans la liste placée : un `<div>` focalisable, un
 * `aria-label`, une hauteur comptée par le virtualiseur. Ce module rend la
 * même loi pour une LISTE — il ne la réécrit pas : l'échéance est celle de
 * `peekEphemeralDeadline` (la règle partagée, lue sans poser de réception),
 * la phase celle de `destructionPhaseOf`. Une rangée qui BRÛLE reste (l'effet
 * se voit) ; une rangée PARTIE sort, et le fil, le Résumé et le cache persisté
 * (`lib/api/ephemeral-cache.ts`) la retirent par cette seule fonction.
 *
 * #10433 — une RÉPONSE part avec ce qu'elle cite (`quote-cascade.ts`) : le fil
 * et le cache lisent l'échéance d'une rangée À TRAVERS ses citations, si bien
 * que la mort locale d'un éphémère emporte ses réponses sans attendre le
 * `message:expired` de la passerelle.
 */

export function isEphemeralGone(input: {
  readonly message: EphemeralMessageFields;
  readonly isMine: boolean;
  readonly now: number;
  readonly destroying?: boolean;
  readonly expired?: boolean;
}): boolean {
  return (
    destructionPhaseOf({
      deadline: peekEphemeralDeadline({ message: input.message, isMine: input.isMine, now: input.now }),
      now: input.now,
      destroying: input.destroying ?? false,
      expired: input.expired ?? false,
    }) === 'gone'
  );
}

type LivingInput<M extends Message> = {
  readonly messages: readonly M[];
  readonly isMine: (message: Message) => boolean;
  readonly now: number;
  readonly destroyingIds: ReadonlySet<string>;
};

/**
 * Le fil SANS ses rangées parties — la MÊME identité quand rien ne part : le
 * `useMemo` de `place()` et le `memo` des rangées tiennent. Une réponse part
 * avec ce qu'elle cite (#10433) : chaque maillon se lit dans ce même fil.
 */
export function livingMessages<M extends Message>(
  input: LivingInput<M> & { readonly expiredIds: ReadonlySet<string>; readonly lookup?: ReadonlyMap<string, Message> },
): readonly M[] {
  const lookup = input.lookup ?? lookupOf(input.messages);
  const gone = (message: M): boolean =>
    destructionPhaseOf({
      deadline: deadlineThroughQuotes(message, { isMine: input.isMine, now: input.now, lookup }),
      now: input.now,
      destroying: input.destroyingIds.has(message.id),
      expired: input.expiredIds.has(message.id),
    }) === 'gone';
  return input.messages.some(gone) ? input.messages.filter((message) => !gone(message)) : input.messages;
}

/**
 * L'instant où la PROCHAINE rangée vivante part — son échéance, ou celle de ce
 * qu'elle cite, plus la combustion. `null` : rien à attendre. Une rangée qui
 * brûle déjà est laissée à `useEphemeralDestruction`, dont la minuterie
 * l'inscrit dans `expiredIds`. `lookup` : le fil où se lisent les citations
 * (par défaut, `messages`).
 */
export function nextEphemeralGoneAt<M extends Message>(
  input: LivingInput<M> & { readonly lookup?: ReadonlyMap<string, Message> },
): number | null {
  const lookup = input.lookup ?? lookupOf(input.messages);
  const instants = input.messages
    .filter((message) => !input.destroyingIds.has(message.id))
    .map((message) => deadlineThroughQuotes(message, { isMine: input.isMine, now: input.now, lookup }))
    .flatMap((deadline) => (deadline.state === 'scheduled' ? [deadline.expiresAtMs + DESTRUCTION_MS] : []));
  return instants.length === 0 ? null : Math.min(...instants);
}

export type Schedule = (run: () => void, ms: number) => () => void;

const timeoutSchedule: Schedule = (run, ms) => {
  const handle = setTimeout(run, ms);
  return () => clearTimeout(handle);
};

/**
 * LE CROCHET DE L'ÉCRAN — rend le fil vivant et se RÉVEILLE à l'instant où la
 * prochaine rangée part, qu'elle soit à l'écran ou non : une rangée échue hors
 * de la fenêtre virtualisée n'a aucun chrome pour l'annoncer, et elle
 * reparaîtrait vide au défilement.
 *
 * L'échéance est relue APRÈS chaque rendu (effet sans dépendances) : c'est le
 * rendu des rangées qui pose la réception d'un message nouvellement peint, et
 * l'attente doit la voir. Le calcul ne parcourt que les messages à échéance.
 */
export function useLivingMessages<M extends Message>(params: {
  readonly messages: readonly M[];
  readonly isMine: (message: Message) => boolean;
  readonly destroyingIds: ReadonlySet<string>;
  readonly expiredIds: ReadonlySet<string>;
  readonly clock?: () => number;
  readonly schedule?: Schedule;
}): readonly M[] {
  const clock = params.clock ?? Date.now;
  const schedule = params.schedule ?? timeoutSchedule;
  const [now, setNow] = useState(clock);
  const { messages, isMine, destroyingIds, expiredIds } = params;

  const living = useMemo(
    () => livingMessages({ messages, isMine, now, destroyingIds, expiredIds }),
    [messages, isMine, now, destroyingIds, expiredIds],
  );
  const timed = useMemo(() => living.filter(hasEphemeralClock), [living]);
  const lookup = useMemo(() => lookupOf(living), [living]);

  useEffect(() => {
    const at = clock();
    const due = nextEphemeralGoneAt({ messages: timed, isMine, now: at, destroyingIds, lookup });
    if (due === null) return undefined;
    return schedule(() => setNow(clock()), Math.max(0, due - at));
  });

  return living;
}

const hasEphemeralClock = (message: Message): boolean =>
  message.replyToId != null ||
  message.replyTo != null ||
  message.expiresAt != null ||
  (typeof message.ephemeralDuration === 'number' && message.ephemeralDuration > 0) ||
  (message.effectFlags ?? 0) !== 0;
