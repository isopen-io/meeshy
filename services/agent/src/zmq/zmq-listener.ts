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

    for await (const [msg] of this.pullSocket) {
      if (!this.running) break;

      try {
        const raw = JSON.parse(msg.toString());
        const parsed = agentEventSchema.safeParse(raw);

        if (!parsed.success) {
          console.warn('[ZMQ-Agent] Invalid event received:', parsed.error.message);
          continue;
        }

        await this.handler(parsed.data);
      } catch (error) {
        console.error('[ZMQ-Agent] Error processing event:', error);
      }
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
