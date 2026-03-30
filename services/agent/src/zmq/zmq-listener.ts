import * as zmq from 'zeromq';
import { agentEventSchema, type AgentEvent } from './types';

export type AgentEventHandler = (event: AgentEvent) => Promise<void>;

export class ZmqAgentListener {
  private pullSocket: zmq.Pull | null = null;
  private running = false;
  private handler: AgentEventHandler | null = null;

  constructor(
    private host: string,
    private port: number,
  ) {}

  onEvent(handler: AgentEventHandler): void {
    this.handler = handler;
  }

  async initialize(): Promise<void> {
    this.pullSocket = new zmq.Pull();
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
    const heartbeat = setInterval(() => {
      console.log(`[ZMQ-Agent] Heartbeat: loop alive, messages received=${messageCount}, running=${this.running}`);
    }, 30000);

    try {
      while (this.running) {
        try {
          for await (const [msg] of this.pullSocket!) {
            if (!this.running) break;
            messageCount++;

            try {
              const rawStr = msg.toString();
              console.log(`[ZMQ-Agent] Raw message received (${rawStr.length} bytes): ${rawStr.substring(0, 200)}`);

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

        await new Promise((r) => setTimeout(r, 5000));
      }
    } finally {
      clearInterval(heartbeat);
      console.log(`[ZMQ-Agent] Listener stopped. Total messages: ${messageCount}`);
    }
  }

  async close(): Promise<void> {
    this.running = false;
    if (this.pullSocket) {
      await this.pullSocket.close();
      this.pullSocket = null;
    }
    console.log('[ZMQ-Agent] Listener closed');
  }
}
