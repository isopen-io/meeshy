import type { StoreApi } from 'zustand/vanilla';

import { callEvents, tickEvents, type JournalEvent, type TickMemory } from './call-network-journal';
import type { CallJournalStore } from './call-network-journal-store';
import type { QualityTick } from './call-quality-loop';
import type { ActiveCall } from './call-store';

/**
 * **L'ENREGISTREUR DU JOURNAL RÉSEAU** (#8698) — il écoute le magasin de
 * l'appel (phases, liens) et reçoit chaque relevé de la boucle de qualité ; ce
 * qui change s'écrit AUSSITÔT dans le journal persisté du compte qui a
 * commencé l'appel. Ce qui arrive avant que la passerelle ait donné
 * l'identifiant de l'appel attend, puis s'y range ; un appel qui finit sans
 * identifiant n'a pas de fiche où se relire, son attente part avec lui.
 * Posé À CÔTÉ du moteur (`engine-defaults.ts`) : `engine.ts` ne le connaît pas.
 */

export type JournalRecorderDeps = {
  readonly store: Pick<StoreApi<{ readonly call: ActiveCall | null }>, 'getState' | 'subscribe'>;
  readonly journal: CallJournalStore;
  readonly viewerId: () => string;
  readonly now: () => number;
};

export type JournalRecorder = { readonly noteTick: (tick: QualityTick) => void; readonly stop: () => void };

type Recording = { readonly owner: string; readonly callId: string | null; readonly pending: readonly JournalEvent[]; readonly memory: TickMemory | null };

export function createJournalRecorder(deps: JournalRecorderDeps): JournalRecorder {
  let recording: Recording | null = null;

  const write = (events: readonly JournalEvent[]): void => {
    const current = recording;
    if (current === null || current.owner === '' || events.length === 0) return;
    if (current.callId === null) {
      recording = { ...current, pending: [...current.pending, ...events] };
      return;
    }
    deps.journal.append(current.owner, current.callId, events);
  };

  const observe = (next: ActiveCall | null, previous: ActiveCall | null): void => {
    if (next === null) {
      recording = null;
      return;
    }
    const fresh = recording === null || (recording.callId !== null && next.callId !== null && next.callId !== recording.callId);
    if (fresh) recording = { owner: deps.viewerId(), callId: next.callId, pending: [], memory: null };
    const events = callEvents(fresh ? null : previous, next, deps.now());
    const current = recording;
    if (current !== null && current.callId === null && next.callId !== null) {
      recording = { ...current, callId: next.callId, pending: [] };
      write([...current.pending, ...events]);
      return;
    }
    write(events);
  };

  const unsubscribe = deps.store.subscribe((state, previous) => {
    if (state.call !== previous.call) observe(state.call, previous.call);
  });

  return {
    noteTick: (tick) => {
      const current = recording;
      if (current === null || current.callId === null) return;
      const [events, memory] = tickEvents(current.memory, tick, deps.now());
      recording = { ...current, memory };
      write(events);
    },
    stop: unsubscribe,
  };
}
