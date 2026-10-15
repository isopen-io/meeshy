import * as zmq from 'zeromq';
import { AGENT_ZMQ_MAX_SKEW_MS, verifyAgentZmqPayload } from '@meeshy/shared/utils/agent-zmq-auth';
import { agentEventSchema, type AgentEvent } from './types';

export type AgentEventHandler = (event: AgentEvent) => Promise<void>;

export class ZmqAgentListener {
  private pullSocket: zmq.Pull | null = null;
  private running = false;
  private handler: AgentEventHandler | null = null;

  /** #10288 — signatures déjà acceptées, gardées le temps de la fenêtre : un rejeu est refusé. */
  private seenSignatures = new Map<string, number>();
  private rejected = 0;
  private wakeUp: (() => void) | null = null;

  constructor(
    private host: string,
    private port: number,
    /** `AGENT_INTERNAL_TOKEN` : sans lui (ou trop court), TOUT message est rejeté. */
    private internalToken?: string,
  ) {}

  /** Vrai si le message vient de la passerelle (trame signée valide, jamais vue). */
  private authenticate(payload: string, authFrame: string | undefined): boolean {
    const now = Date.now();
    const verdict = verifyAgentZmqPayload(payload, authFrame, this.internalToken, now);
    if (!verdict.ok) {
      this.rejected++;
      // Sans contenu (le message refusé n'est jamais journalisé), et échantillonné : un intrus
      // qui inonde le canal n'inonde pas les journaux (les 10 premiers, puis 1 sur 100).
      if (this.rejected <= 10 || this.rejected % 100 === 0) {
        console.warn(`[ZMQ-Agent] Unauthenticated message rejected (reason=${verdict.reason}, total=${this.rejected})`);
      }
      return false;
    }
    for (const [sig, expiry] of this.seenSignatures) {
      if (expiry <= now) this.seenSignatures.delete(sig);
    }
    if (this.seenSignatures.has(verdict.signature)) {
      this.rejected++;
      if (this.rejected <= 10 || this.rejected % 100 === 0) {
        console.warn(`[ZMQ-Agent] Replayed message rejected (total=${this.rejected})`);
      }
      return false;
    }
    this.seenSignatures.set(verdict.signature, now + 2 * AGENT_ZMQ_MAX_SKEW_MS);
    return true;
  }

  onEvent(handler: AgentEventHandler): void {
    this.handler = handler;
  }

  async initialize(): Promise<void> {
    // Un événement légitime pèse quelques Ko : au-delà de 1 Mo, libzmq coupe le pair (#10288).
    this.pullSocket = new zmq.Pull({ maxMessageSize: 1_048_576 });
    await this.pullSocket.bind(`tcp://${this.host}:${this.port}`);
    console.log(`[ZMQ-Agent] PULL socket bound on ${this.host}:${this.port}`);
  }

  async startListening(): Promise<void> {
    if (!this.pullSocket || !this.handler) {
      throw new Error('ZMQ listener not initialized or no handler registered');
    }

    this.running = true;
    console.log('[ZMQ-Agent] Listening for events...');

    let messageCount = 0;
    let heartbeatTick = 0;
    const heartbeat = setInterval(() => {
      heartbeatTick++;
      if (messageCount > 0 || heartbeatTick % 10 === 0) {
        console.log(`[ZMQ-Agent] Heartbeat: loop alive, messages received=${messageCount}, running=${this.running}`);
      }
    }, 30000);

    try {
      while (this.running) {
        try {
          for await (const [msg, auth] of this.pullSocket!) {
            if (!this.running) break;
            messageCount++;

            try {
              const rawStr = msg.toString();
              if (!this.authenticate(rawStr, auth?.toString())) continue;
              console.log(`[ZMQ-Agent] Authenticated message received (${rawStr.length} bytes)`);

              const raw = JSON.parse(rawStr);
              const parsed = agentEventSchema.safeParse(raw);

              if (!parsed.success) {
                console.warn('[ZMQ-Agent] Invalid event received:', parsed.error.message);
                continue;
              }

              console.log(`[ZMQ-Agent] Valid event: type=${parsed.data.type}`);
              await this.handler!(parsed.data);
              console.log(`[ZMQ-Agent] Handler completed for event type=${parsed.data.type}`);
            } catch (error) {
              console.error('[ZMQ-Agent] Error processing event:', error);
            }
          }

          if (!this.running) break;
          console.warn('[ZMQ-Agent] for-await loop exited unexpectedly, reconnecting in 5s...');
        } catch (error) {
          console.error('[ZMQ-Agent] Listener loop error:', error);
          if (!this.running) break;
          console.log('[ZMQ-Agent] Reconnecting in 5s...');
        }

        await new Promise<void>((r) => {
          const timer = setTimeout(r, 5000);
          this.wakeUp = () => { clearTimeout(timer); r(); };
        });
        this.wakeUp = null;
      }
    } finally {
      clearInterval(heartbeat);
      console.log(`[ZMQ-Agent] Listener stopped. Total messages: ${messageCount}`);
    }
  }

  async close(): Promise<void> {
    this.running = false;
    this.wakeUp?.();
    if (this.pullSocket) {
      await this.pullSocket.close();
      this.pullSocket = null;
    }
    console.log('[ZMQ-Agent] Listener closed');
  }
}
