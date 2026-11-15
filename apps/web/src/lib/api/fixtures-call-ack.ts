import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

/** Le drapeau qu'un gate pose pour qu'un pair DÉCROCHE (`fixtures-call-peer.ts`, #8063). */
export const CALL_PEER_FLAG = 'meeshy.fixtures.callPeer';

export function callPeerArmed(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(CALL_PEER_FLAG) === '1';
  } catch {
    return false;
  }
}

/**
 * **LES ACCUSÉS D'APPEL DES FIXTURES** (#8046) — sans eux, le bouchon de
 * socket (`fixtures-realtime.ts`) ne savait pas accuser : chaque appel lancé
 * sur le `dist` des gates finissait « échec » dès l'`initiate`, et aucun gate
 * ne pouvait tenir un appel VIVANT pour le réduire, le déplacer, naviguer
 * dessous. Ils accusent comme la passerelle (`CallEventsHandler` : `{ success,
 * data }`) ; personne ne décroche, l'appel sonne donc jusqu'à son délai.
 */
export function fixtureCallAck(event: string, payload: unknown): unknown {
  if (event === CLIENT_EVENTS.CALL_INITIATE) {
    const conversationId = typeof payload === 'object' && payload !== null && 'conversationId' in payload ? String(payload.conversationId) : 'fixture';
    return { success: true, data: { callId: `call-fixture-${conversationId}`, mode: 'p2p', iceServers: [] } };
  }
  if (event === CLIENT_EVENTS.CALL_JOIN) return { success: true, data: { callSession: { participants: [] }, iceServers: [] } };
  return { success: true, data: {} };
}
