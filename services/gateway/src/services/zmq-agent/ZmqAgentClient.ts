import type { Push, Subscriber } from 'zeromq';
import * as zmq from 'zeromq';

type AgentResponse = {
  type: 'agent:response';
  conversationId: string;
  asUserId: string;
  content: string;
  replyToId?: string;
  messageSource: 'agent';
  metadata: {
    agentType: 'impersonator' | 'animator';
    roleConfidence: number;
    archetypeId?: string;
  };
};

export class ZmqAgentClient {
  private pushSocket: Push | null = null;
  private subSocket: Subscriber | null = null;
  private responseHandler: ((response: AgentResponse) => Promise<void>) | null = null;
  private running = false;

  constructor(
    private host: string = 'localhost',
    private pushPort: number = 5560,
    private subPort: number = 5561,
  ) {}

  onResponse(handler: (response: AgentResponse) => Promise<void>): void {
    this.responseHandler = handler;
  }

  async initialize(): Promise<void> {
    try {
      this.pushSocket = new zmq.Push();
      await this.pushSocket.connect(`tcp://${this.host}:${this.pushPort}`);
      console.log(`[ZMQ-AgentClient] PUSH connected to ${this.host}:${this.pushPort}`);

      this.subSocket = new zmq.Subscriber();
      await this.subSocket.connect(`tcp://${this.host}:${this.subPort}`);
      await this.subSocket.subscribe('');
      console.log(`[ZMQ-AgentClient] SUB connected to ${this.host}:${this.subPort}`);
    } catch (error) {
      console.error(`[ZMQ-AgentClient] Initialization error: ${error}`);
      throw error;
    }
  }

  async sendEvent(event: Record<string, unknown>): Promise<void> {
    if (!this.pushSocket) throw new Error('Agent PUSH socket not initialized');
    await this.pushSocket.send(JSON.stringify(event));
  }

  async startListening(): Promise<void> {
    if (!this.subSocket || !this.responseHandler) return;
    this.running = true;

    for await (const [msg] of this.subSocket) {
      if (!this.running) break;
      try {
        const response = JSON.parse(msg.toString()) as AgentResponse;
        if (response.type === 'agent:response') {
          await this.responseHandler(response);
        }
      } catch (error) {
        console.error('[ZMQ-AgentClient] Error processing response:', error);
      }
    }
  }

  async close(): Promise<void> {
    console.log('[ZMQ-AgentClient] Closing...');
    this.running = false;

    try {
      if (this.pushSocket) {
        await this.pushSocket.close();
        this.pushSocket = null;
      }

      if (this.subSocket) {
        await this.subSocket.close();
        this.subSocket = null;
      }

      console.log('[ZMQ-AgentClient] Closed');
    } catch (error) {
      console.error(`[ZMQ-AgentClient] Error during close: ${error}`);
    }
  }
}
