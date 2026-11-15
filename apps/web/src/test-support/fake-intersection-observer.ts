import type { SocialEvent } from '@/lib/api/social-events';

/**
 * UN FAUX `IntersectionObserver` QUI SAIT CE QU'IL OBSERVE (#10501) — la page
 * n'a plus qu'un observateur partagé (`lib/view/viewability.ts`), qui range
 * chaque entrée par son `target` : le faux rend donc une entrée par nœud
 * observé, et la géométrie se pose à la main par `emitAll`.
 */
export type FakeEntry = { readonly target: Element; readonly isIntersecting: boolean; readonly intersectionRatio: number };

type Slot = { readonly callback: (entries: readonly FakeEntry[]) => void; readonly nodes: Set<Element>; disconnected: boolean };

export function createFakeIntersectionObservers() {
  let slots: Slot[] = [];
  class FakeIntersectionObserver {
    private readonly slot: Slot;
    constructor(callback: (entries: readonly FakeEntry[]) => void) {
      this.slot = { callback, nodes: new Set(), disconnected: false };
      slots.push(this.slot);
    }
    observe(node: Element) {
      this.slot.nodes.add(node);
    }
    unobserve(node: Element) {
      this.slot.nodes.delete(node);
    }
    disconnect() {
      this.slot.disconnected = true;
      this.slot.nodes.clear();
    }
    takeRecords() {
      return [];
    }
  }
  return {
    FakeIntersectionObserver,
    reset: () => {
      slots = [];
    },
    live: () => slots.filter((slot) => !slot.disconnected),
    /** Chaque nœud observé passe à la fraction `ratio`. */
    emitAll: (ratio: number) =>
      slots
        .filter((slot) => !slot.disconnected)
        .forEach((slot) => slot.callback([...slot.nodes].map((target) => ({ target, isIntersecting: ratio > 0, intersectionRatio: ratio })))),
  };
}

/**
 * La PROJECTION DE COMPTAGE d'un événement : ce que les témoins de #10483
 * comparent (type, post, source, surface, provenance). L'enveloppe v2 —
 * `eventId`, `occurredAt`, `visibility` — a ses propres témoins.
 */
export function countingProjection(event: SocialEvent): SocialEvent {
  const { eventId: _eventId, occurredAt: _occurredAt, ...rest } = event;
  if (rest.type !== 'impression') return rest as SocialEvent;
  const { visibility: _visibility, ...counting } = rest;
  return counting as SocialEvent;
}
