import type { Push, Subscriber } from 'zeromq';
import * as zmq from 'zeromq';

type AgentResponse = {
  type: 'agent:response';
  conversationId: string;
  asUserId: string;
  content: string;
  originalLanguage: string;
  replyToId?: string;
  mentionedUsernames?: string[];
  messageSource: 'agent';
  metadata: {
    agentType: 'impersonator' | 'animator' | 'orchestrator';
    roleConfidence: number;
    archetypeId?: string;
  };
};

type AgentReaction = {
  type: 'agent:reaction';
  conversationId: string;
  asUserId: string;
  targetMessageId: string;
  emoji: string;
};

type AgentMessage = AgentResponse | AgentReaction;

export class ZmqAgentClient {
  private pushSocket: Push | null = null;
  private subSocket: Subscriber | null = null;
  private responseHandler: ((response: AgentResponse) => Promise<void>) | null = null;
  private reactionHandler: ((reaction: AgentReaction) => Promise<void>) | null = null;
  private running = false;

  constructor(
    private host: string = 'localhost',
    private pushPort: number = 5560,
    private subPort: number = 5561,
  ) {}

  onResponse(handler: (response: AgentResponse) => Promise<void>): void {
    this.responseHandler = handler;
  }

  onReaction(handler: (reaction: AgentReaction) => Promise<void>): void {
    this.reactionHandler = handler;
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
    if (!this.subSocket) return;
    this.running = true;

    for await (const [msg] of this.subSocket) {
      if (!this.running) break;
      try {
        const parsed = JSON.parse(msg.toString()) as AgentMessage;

        if (parsed.type === 'agent:response' && this.responseHandler) {
          await this.responseHandler(parsed as AgentResponse);
        } else if (parsed.type === 'agent:reaction' && this.reactionHandler) {
          await this.reactionHandler(parsed as AgentReaction);
        }
      } catch (error) {
        console.error('[ZMQ-AgentClient] Error processing message:', error);
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
