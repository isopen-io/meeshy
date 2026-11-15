import { createHmac, timingSafeEqual } from 'crypto';

/**
 * #10288 — authentification du canal ZMQ passerelle → agent (PUSH → PULL 5560).
 *
 * Le PULL de l'agent écoute sur son réseau privé : sans cette garde, tout conteneur
 * qui le joint pousse un `agent:new-message` et déclenche des appels LLM payants et
 * des réponses publiées. La passerelle ajoute à chaque message une SECONDE trame
 * `v1.<ts>.<hex>` :
 *   - `<hex>` = HMAC-SHA256(`<ts>.<payload>`) sous une clé DÉRIVÉE de
 *     `AGENT_INTERNAL_TOKEN` (le secret des routes HTTP n'est pas utilisé tel quel) ;
 *   - `<ts>` (ms) est couvert par la signature et doit tomber dans ±60 s ;
 *   - l'agent garde les signatures vues pendant la fenêtre (rejeu refusé).
 * Fermé par défaut : un secret absent ou de moins de 32 caractères refuse tout.
 *
 * Un agent antérieur lit la seule première trame : la seconde ne le casse pas.
 */

export const AGENT_ZMQ_AUTH_VERSION = 'v1';
export const AGENT_ZMQ_MAX_SKEW_MS = 60_000;
export const AGENT_ZMQ_SECRET_MIN_LENGTH = 32;
const KEY_LABEL = 'meeshy-agent-zmq-v1';
const FRAME_RE = /^v1\.(\d{1,16})\.([0-9a-f]{64})$/;

export type AgentZmqVerdict =
  | { ok: true; signature: string }
  | { ok: false; reason: 'no-secret' | 'missing' | 'malformed' | 'stale' | 'bad-signature' };

function usableSecret(secret: string | null | undefined): string | null {
  const value = typeof secret === 'string' ? secret.trim() : '';
  return value.length >= AGENT_ZMQ_SECRET_MIN_LENGTH ? value : null;
}

function mac(secret: string, ts: string, payload: string): string {
  const key = createHmac('sha256', secret).update(KEY_LABEL).digest();
  return createHmac('sha256', key).update(`${ts}.${payload}`).digest('hex');
}

/** La trame d'authentification à envoyer après `payload`. Lève si le secret est inutilisable. */
export function signAgentZmqPayload(payload: string, secret: string, nowMs: number = Date.now()): string {
  const usable = usableSecret(secret);
  if (usable === null) throw new Error('AGENT_INTERNAL_TOKEN absent ou trop court : rien ne se signe');
  const ts = String(Math.trunc(nowMs));
  return `${AGENT_ZMQ_AUTH_VERSION}.${ts}.${mac(usable, ts, payload)}`;
}

export function verifyAgentZmqPayload(
  payload: string,
  authFrame: string | null | undefined,
  secret: string | null | undefined,
  nowMs: number = Date.now(),
  maxSkewMs: number = AGENT_ZMQ_MAX_SKEW_MS,
): AgentZmqVerdict {
  const usable = usableSecret(secret);
  if (usable === null) return { ok: false, reason: 'no-secret' };
  if (typeof authFrame !== 'string' || authFrame.length === 0) return { ok: false, reason: 'missing' };
  const match = FRAME_RE.exec(authFrame);
  if (!match) return { ok: false, reason: 'malformed' };
  const ts = match[1] ?? '';
  const presented = match[2] ?? '';
  if (Math.abs(nowMs - Number(ts)) > maxSkewMs) return { ok: false, reason: 'stale' };
  const expected = Buffer.from(mac(usable, ts, payload), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(presented, 'hex'))) return { ok: false, reason: 'bad-signature' };
  return { ok: true, signature: presented };
}
