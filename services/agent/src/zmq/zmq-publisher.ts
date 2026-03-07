import * as zmq from 'zeromq';
import type { AgentResponse, AgentReaction } from './types';

export class ZmqAgentPublisher {
  private pubSocket: zmq.Publisher | null = null;

  constructor(
    private host: string,
    private port: number,
  ) {}

  async initialize(): Promise<void> {
    this.pubSocket = new zmq.Publisher();
    await this.pubSocket.bind(`tcp://${this.host}:${this.port}`);
    console.log(`[ZMQ-Agent] PUB socket bound on ${this.host}:${this.port}`);
  }

  async publish(response: AgentResponse): Promise<void> {
    if (!this.pubSocket) {
      throw new Error('ZMQ publisher not initialized');
    }

    const data = JSON.stringify(response);
    await this.pubSocket.send(data);
    console.log(`[ZMQ-Agent] Published response for conversation ${response.conversationId} as user ${response.asUserId}`);
  }

  async publishReaction(reaction: AgentReaction): Promise<void> {
    if (!this.pubSocket) {
      throw new Error('ZMQ publisher not initialized');
    }

    const data = JSON.stringify(reaction);
    await this.pubSocket.send(data);
    console.log(`[ZMQ-Agent] Published reaction for conversation ${reaction.conversationId} as user ${reaction.asUserId} emoji=${reaction.emoji}`);
  }

  async close(): Promise<void> {
    if (this.pubSocket) {
      await this.pubSocket.close();
      this.pubSocket = null;
    }
    console.log('[ZMQ-Agent] Publisher closed');
  }
}
