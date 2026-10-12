/**
 * #10288 — le canal ZMQ passerelle → agent n'accepte que la passerelle.
 * Chaque message porte une seconde trame `v1.<ts>.<hmac>` : HMAC-SHA256 de `<ts>.<payload>`
 * sous une clé dérivée de `AGENT_INTERNAL_TOKEN`. Ces témoins tiennent la loi des deux côtés.
 */
import { describe, it, expect } from 'vitest';
import {
  AGENT_ZMQ_MAX_SKEW_MS,
  signAgentZmqPayload,
  verifyAgentZmqPayload,
} from '../agent-zmq-auth';

const TOKEN = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const NOW = 1_760_000_000_000;
const PAYLOAD = JSON.stringify({ type: 'agent:new-message', conversationId: 'c1', content: 'salut' });

describe('agent-zmq-auth (#10288)', () => {
  it('accepte une trame signée par le même secret, dans la fenêtre', () => {
    const auth = signAgentZmqPayload(PAYLOAD, TOKEN, NOW);
    expect(auth).toMatch(/^v1\.\d+\.[0-9a-f]{64}$/);
    expect(verifyAgentZmqPayload(PAYLOAD, auth, TOKEN, NOW + 1_000)).toEqual({ ok: true, signature: auth.split('.')[2] });
  });

  it('refuse un message sans trame d’authentification (ancien format, intrus)', () => {
    expect(verifyAgentZmqPayload(PAYLOAD, undefined, TOKEN, NOW)).toEqual({ ok: false, reason: 'missing' });
    expect(verifyAgentZmqPayload(PAYLOAD, '', TOKEN, NOW)).toEqual({ ok: false, reason: 'missing' });
  });

  it('refuse une trame signée par un autre secret', () => {
    const auth = signAgentZmqPayload(PAYLOAD, OTHER, NOW);
    expect(verifyAgentZmqPayload(PAYLOAD, auth, TOKEN, NOW)).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('refuse un contenu modifié après signature', () => {
    const auth = signAgentZmqPayload(PAYLOAD, TOKEN, NOW);
    const tampered = PAYLOAD.replace('salut', 'achète');
    expect(verifyAgentZmqPayload(tampered, auth, TOKEN, NOW)).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('refuse un horodatage réécrit (il est couvert par la signature)', () => {
    const auth = signAgentZmqPayload(PAYLOAD, TOKEN, NOW);
    const [, , sig] = auth.split('.');
    expect(verifyAgentZmqPayload(PAYLOAD, `v1.${NOW + 5}.${sig}`, TOKEN, NOW)).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('refuse une trame trop ancienne ou trop en avance (rejeu tardif)', () => {
    const old = signAgentZmqPayload(PAYLOAD, TOKEN, NOW - AGENT_ZMQ_MAX_SKEW_MS - 1);
    const future = signAgentZmqPayload(PAYLOAD, TOKEN, NOW + AGENT_ZMQ_MAX_SKEW_MS + 1);
    expect(verifyAgentZmqPayload(PAYLOAD, old, TOKEN, NOW)).toEqual({ ok: false, reason: 'stale' });
    expect(verifyAgentZmqPayload(PAYLOAD, future, TOKEN, NOW)).toEqual({ ok: false, reason: 'stale' });
  });

  it('refuse une trame mal formée', () => {
    for (const bad of ['v2.1.ab', 'v1.x.' + '0'.repeat(64), 'v1.1', 'v1.1.' + 'z'.repeat(64), 'v1.1.' + '0'.repeat(63)]) {
      expect(verifyAgentZmqPayload(PAYLOAD, bad, TOKEN, NOW)).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('ferme tout quand le secret est absent ou trop court (moins de 32 caractères)', () => {
    const auth = signAgentZmqPayload(PAYLOAD, TOKEN, NOW);
    expect(verifyAgentZmqPayload(PAYLOAD, auth, undefined, NOW)).toEqual({ ok: false, reason: 'no-secret' });
    expect(verifyAgentZmqPayload(PAYLOAD, auth, 'court', NOW)).toEqual({ ok: false, reason: 'no-secret' });
    expect(() => signAgentZmqPayload(PAYLOAD, 'court', NOW)).toThrow();
  });

  it('ne signe pas avec le secret brut : la clé HMAC est dérivée (vecteur fixe)', () => {
    expect(signAgentZmqPayload('{}', TOKEN, 0)).toBe(signAgentZmqPayload('{}', `  ${TOKEN}  `, 0));
    expect(signAgentZmqPayload('{}', TOKEN, 0)).toBe('v1.0.29b96731cdfc28f66d5e176e51b41e0ab2d21573939e508282f6f1770d23c423');
  });
});
