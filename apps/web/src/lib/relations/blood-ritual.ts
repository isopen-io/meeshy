import type { RelationRitualConsentKey, RelationRitualConsents, RelationRitualStage } from '@meeshy/shared/types/socketio-events/relation';

import type { RelationRefusal } from '@/lib/api/relations';

/**
 * **LE RITUEL DU SANG, LA MACHINE** (#13938) — miroir pur de
 * `BloodRitualViewModel` (`apps/ios/Meeshy/Features/Contacts/`). Le serveur tient
 * l'état — jeton, fenêtre de tenue, double confirmation, consentements — ;
 * l'écran le PILOTE (`POST /relations/:userId/ritual`) et se synchronise sur les
 * événements `relation:ritual-*`. Cette machine ne fait aucune I/O : la feuille
 * (`routes/blood-ritual-dialog.tsx`) joue les requêtes et lui rend leur issue.
 *
 * **L'ordre est celui du serveur.** Il n'accepte un `confirm` que sur une tenue
 * FRAÎCHE des deux côtés : les consentements se choisissent donc AVANT de tenir
 * l'écran, et le scellement part tout seul dès que les deux tiennent
 * (`shouldSeal`). Un consentement après la tenue la ferait périmer.
 *
 * **Lâcher est calme.** Si l'autre lâche, rien n'est enregistré et rien n'a
 * changé : l'écran le dit sans alarme et propose de recommencer.
 */

export type RitualStage =
  | 'consent'
  | 'ready'
  | 'opening'
  | 'waiting'
  | 'synchronised'
  | 'awaitingOther'
  | 'completed'
  | 'lapsed'
  | 'unavailable';

export type RitualNotice = 'busy' | 'openFailed' | 'sealFailed';

export type RitualState = {
  readonly stage: RitualStage;
  readonly consents: RelationRitualConsents;
  readonly holding: boolean;
  /** Ma tenue a été ENREGISTRÉE par le serveur (`hold` répondu) : sans elle, un `confirm` partirait sur une tenue qu'il ignore. */
  readonly holdAcked: boolean;
  readonly otherWaiting: boolean;
  readonly otherHolding: boolean;
  readonly token: string | null;
  readonly holdWindowMs: number;
  readonly refusal: RelationRefusal | null;
  readonly offline: boolean;
  readonly notice: RitualNotice | null;
};

/** Un partage n'est jamais accordé par défaut : tout refusé est le seul départ sûr. */
export const ALL_REFUSED: RelationRitualConsents = { listeningTitle: false, locationLive: false, locationHistory: false, locationProximity: false };

export const DEFAULT_HOLD_WINDOW_MS = 15_000;

export const INITIAL_RITUAL: RitualState = {
  stage: 'consent',
  consents: ALL_REFUSED,
  holding: false,
  holdAcked: false,
  otherWaiting: false,
  otherHolding: false,
  token: null,
  holdWindowMs: DEFAULT_HOLD_WINDOW_MS,
  refusal: null,
  offline: false,
  notice: null,
};

export type RitualEvent =
  | { readonly type: 'consent'; readonly key: RelationRitualConsentKey; readonly granted: boolean }
  | { readonly type: 'proceed' }
  | { readonly type: 'open-requested'; readonly online: boolean }
  | { readonly type: 'opened'; readonly token: string | null; readonly holdWindowMs: number | null }
  | { readonly type: 'open-failed'; readonly refusal: RelationRefusal | null }
  | { readonly type: 'hold-began' }
  | { readonly type: 'hold-acked' }
  | { readonly type: 'hold-failed'; readonly refusal: RelationRefusal | null }
  | { readonly type: 'hold-ended' }
  | { readonly type: 'other-started' }
  | { readonly type: 'other-progress'; readonly token: string; readonly stage: RelationRitualStage }
  | { readonly type: 'other-completed'; readonly token: string }
  | { readonly type: 'seal-started' }
  | { readonly type: 'sealed'; readonly completed: boolean }
  | { readonly type: 'seal-failed'; readonly refusal: RelationRefusal | null }
  | { readonly type: 'retry' }
  | { readonly type: 'notice-shown' };

const released = (state: RitualState): RitualState => ({ ...state, holding: false, holdAcked: false });

const lapse = (state: RitualState): RitualState => ({ ...released(state), otherHolding: false, stage: 'lapsed' });

const matchesToken = (state: RitualState, served: string): boolean => state.token === null || state.token === served;

function openFailed(state: RitualState, refusal: RelationRefusal | null): RitualState {
  if (refusal === 'RELATION_RITUAL_BUSY') return { ...state, stage: 'ready', notice: 'busy' };
  if (refusal !== null) return { ...state, stage: 'unavailable', refusal };
  return { ...state, stage: 'ready', notice: 'openFailed' };
}

function holdFailed(state: RitualState, refusal: RelationRefusal | null): RitualState {
  if (refusal === 'RELATION_RITUAL_NO_REQUEST' || refusal === 'RELATION_RITUAL_INVALID') return { ...released(state), stage: 'unavailable', refusal };
  return state;
}

function sealFailed(state: RitualState, refusal: RelationRefusal | null): RitualState {
  switch (refusal) {
    case 'RELATION_RITUAL_LAPSED':
      return lapse(state);
    case 'RELATION_RITUAL_NOT_SYNCHRONISED':
      return { ...state, otherHolding: false, stage: 'waiting' };
    case 'RELATION_CONSENT_REQUIRED':
      return { ...released(state), stage: 'consent' };
    case 'RELATION_RITUAL_BUSY':
      return { ...state, stage: 'waiting' };
    case null:
      return { ...state, stage: 'waiting', notice: 'sealFailed' };
    default:
      return { ...released(state), stage: 'unavailable', refusal };
  }
}

function otherProgress(state: RitualState, token: string, stage: RelationRitualStage): RitualState {
  if (!matchesToken(state, token)) return state;
  if (stage === 'held') return { ...state, otherHolding: true };
  if (stage === 'lapsed') return lapse(state);
  return state;
}

export function reduceRitual(state: RitualState, event: RitualEvent): RitualState {
  switch (event.type) {
    case 'consent':
      return state.stage === 'consent' ? { ...state, consents: { ...state.consents, [event.key]: event.granted } } : state;
    case 'proceed':
      return state.stage === 'consent' ? { ...state, stage: 'ready' } : state;
    case 'open-requested':
      if (state.stage !== 'ready') return state;
      return event.online ? { ...state, stage: 'opening' } : { ...state, stage: 'unavailable', offline: true };
    case 'opened':
      return { ...state, stage: 'waiting', token: event.token, holdWindowMs: event.holdWindowMs ?? state.holdWindowMs };
    case 'open-failed':
      return openFailed(state, event.refusal);
    case 'hold-began':
      return state.stage === 'waiting' && !state.holding && state.token !== null ? { ...state, holding: true } : state;
    case 'hold-acked':
      return state.holding ? { ...state, holdAcked: true } : state;
    case 'hold-failed':
      return holdFailed(state, event.refusal);
    case 'hold-ended':
      return { ...released(state), stage: state.stage === 'synchronised' ? 'waiting' : state.stage };
    case 'other-started':
      return { ...state, otherWaiting: true };
    case 'other-progress':
      return otherProgress(state, event.token, event.stage);
    case 'other-completed':
      return matchesToken(state, event.token) ? { ...released(state), stage: 'completed' } : state;
    case 'seal-started':
      return shouldSeal(state) ? { ...state, stage: 'synchronised' } : state;
    case 'sealed':
      if (state.stage === 'completed') return state;
      return event.completed ? { ...released(state), stage: 'completed' } : { ...state, stage: 'awaitingOther' };
    case 'seal-failed':
      return sealFailed(state, event.refusal);
    case 'retry':
      return state.stage === 'lapsed' ? { ...released(state), token: null, otherHolding: false, otherWaiting: false, stage: 'ready' } : state;
    case 'notice-shown':
      return { ...state, notice: null };
  }
}

/** Les deux tiennent l'écran : le scellement part. */
export const shouldSeal = (state: RitualState): boolean =>
  state.stage === 'waiting' && state.holding && state.holdAcked && state.otherHolding && state.token !== null;

/** L'intervalle de la tenue rejouée : un tiers de la fenêtre servie, jamais moins d'une seconde. */
export const holdIntervalMs = (state: RitualState): number => Math.max(Math.floor(state.holdWindowMs / 3), 1_000);
