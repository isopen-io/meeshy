import type { Push, Subscriber } from 'zeromq';
import * as zmq from 'zeromq';
import { z } from 'zod';

const agentResponseSchema = z.object({
  type: z.literal('agent:response'),
  conversationId: z.string().min(1),
  asUserId: z.string().min(1),
  content: z.string().min(1),
  originalLanguage: z.string().min(1),
  replyToId: z.string().optional(),
  mentionedUsernames: z.array(z.string()).optional(),
  messageSource: z.literal('agent'),
  metadata: z.object({
    agentType: z.enum(['impersonator', 'animator', 'orchestrator']),
    roleConfidence: z.number().min(0).max(1),
    archetypeId: z.string().optional(),
  }),
});

const agentReactionSchema = z.object({
  type: z.literal('agent:reaction'),
  conversationId: z.string().min(1),
  asUserId: z.string().min(1),
  targetMessageId: z.string().min(1),
  emoji: z.string().min(1),
});

const agentMessageSchema = z.discriminatedUnion('type', [agentResponseSchema, agentReactionSchema]);

type AgentResponse = z.infer<typeof agentResponseSchema>;
type AgentReaction = z.infer<typeof agentReactionSchema>;

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
        const raw = JSON.parse(msg.toString());
        const result = agentMessageSchema.safeParse(raw);
        if (!result.success) {
          console.warn('[ZMQ-AgentClient] Invalid message schema:', result.error.issues.map((i) => i.message).join(', '));
          continue;
        }
        const parsed = result.data;

        if (parsed.type === 'agent:response' && this.responseHandler) {
          await this.responseHandler(parsed);
        } else if (parsed.type === 'agent:reaction' && this.reactionHandler) {
          await this.reactionHandler(parsed);
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
