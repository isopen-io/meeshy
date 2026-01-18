/**
 * ZMQ Connection Pool Manager
 * Gère les sockets ZMQ et leur cycle de vie
 */

import * as zmq from 'zeromq';
import { EventEmitter } from 'events';

export interface ConnectionPoolConfig {
  host: string;
  pushPort: number;
  subPort: number;
  pollIntervalMs?: number;
}

export interface ConnectionPoolStats {
  pushConnected: boolean;
  subConnected: boolean;
  messagesReceived: number;
  messagesSent: number;
  lastActivityTimestamp: number;
}

export class ZmqConnectionPool extends EventEmitter {
  private pushSocket: zmq.Push | null = null;
  private subSocket: zmq.Subscriber | null = null;
  private context: zmq.Context | null = null;
  private config: Required<ConnectionPoolConfig>;

  private running: boolean = false;
  private pollingIntervalId: NodeJS.Timeout | null = null;
  private heartbeatCount: number = 0;

  private stats: ConnectionPoolStats = {
    pushConnected: false,
    subConnected: false,
    messagesReceived: 0,
    messagesSent: 0,
    lastActivityTimestamp: Date.now()
  };

  constructor(config: ConnectionPoolConfig) {
    super();
    this.config = {
      ...config,
      pollIntervalMs: config.pollIntervalMs || 100
    };
  }

  async connect(): Promise<void> {
    try {
      console.log('[ConnectionPool] Initializing ZMQ context...');

      // Create ZMQ context
      this.context = new zmq.Context();

      // Setup PUSH socket for sending commands
      this.pushSocket = new zmq.Push();
      await this.pushSocket.connect(`tcp://${this.config.host}:${this.config.pushPort}`);
      this.stats.pushConnected = true;
      console.log(`[ConnectionPool] PUSH socket connected to ${this.config.host}:${this.config.pushPort}`);

      // Setup SUB socket for receiving results
      this.subSocket = new zmq.Subscriber();
      await this.subSocket.connect(`tcp://${this.config.host}:${this.config.subPort}`);
      await this.subSocket.subscribe(''); // Subscribe to all messages
      this.stats.subConnected = true;
      console.log(`[ConnectionPool] SUB socket connected to ${this.config.host}:${this.config.subPort}`);

      // Start message polling
      this.running = true;
      this.startMessagePolling();

      console.log('[ConnectionPool] Connection pool initialized successfully');

    } catch (error) {
      console.error(`[ConnectionPool] Initialization failed: ${error}`);
      throw error;
    }
  }

  private startMessagePolling(): void {
    console.log('[ConnectionPool] Starting message polling...');

    this.pollingIntervalId = setInterval(async () => {
      if (!this.running || !this.subSocket) {
        return;
      }

      try {
        // Periodic heartbeat log (only in development, every 5 minutes)
        if (process.env.NODE_ENV !== 'production' && this.heartbeatCount % 600 === 0) {
          console.log(`[ConnectionPool] Polling active (heartbeat ${this.heartbeatCount})`);
        }
        this.heartbeatCount++;

        // Non-blocking message receive
        try {
          const messages = await this.subSocket.receive();

          if (messages && messages.length > 0) {
            const frames = messages as Buffer[];
            this.stats.messagesReceived++;
            this.stats.lastActivityTimestamp = Date.now();

            // Emit received message event
            this.emit('message', frames.length === 1 ? frames[0] : frames);
          }
        } catch (receiveError) {
          // No message available - this is normal
        }

      } catch (error) {
        if (this.running) {
          console.error(`[ConnectionPool] Error receiving message: ${error}`);
          this.emit('error', error);
        }
      }
    }, this.config.pollIntervalMs);
  }

  async send(payload: object): Promise<void> {
    if (!this.pushSocket || !this.stats.pushConnected) {
      throw new Error('PUSH socket not connected');
    }

    try {
      await this.pushSocket.send(JSON.stringify(payload));
      this.stats.messagesSent++;
      this.stats.lastActivityTimestamp = Date.now();
    } catch (error) {
      console.error(`[ConnectionPool] Send error: ${error}`);
      throw error;
    }
  }

  async sendMultipart(jsonPayload: object, binaryFrames: Buffer[]): Promise<void> {
    if (!this.pushSocket || !this.stats.pushConnected) {
      throw new Error('PUSH socket not connected');
    }

    try {
      const frames: Buffer[] = [
        Buffer.from(JSON.stringify(jsonPayload), 'utf-8'),
        ...binaryFrames
      ];

      await this.pushSocket.send(frames);
      this.stats.messagesSent++;
      this.stats.lastActivityTimestamp = Date.now();

      const totalSize = frames.reduce((sum, f) => sum + f.length, 0);
      console.log(`[ConnectionPool] Multipart sent: ${frames.length} frames, ${totalSize} bytes`);
    } catch (error) {
      console.error(`[ConnectionPool] Multipart send error: ${error}`);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.running || !this.pushSocket || !this.subSocket) {
        return false;
      }

      const pingMessage = {
        type: 'ping',
        timestamp: Date.now()
      };

      await this.pushSocket.send(JSON.stringify(pingMessage));
      console.log('[ConnectionPool] Health check ping sent');
      return true;

    } catch (error) {
      console.error(`[ConnectionPool] Health check failed: ${error}`);
      return false;
    }
  }

  getStats(): ConnectionPoolStats {
    return { ...this.stats };
  }

  isConnected(): boolean {
    return this.stats.pushConnected && this.stats.subConnected && this.running;
  }

  async disconnect(): Promise<void> {
    console.log('[ConnectionPool] Disconnecting...');

    this.running = false;

    // Stop polling
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }

    try {
      // Close PUSH socket
      if (this.pushSocket) {
        await this.pushSocket.close();
        this.pushSocket = null;
        this.stats.pushConnected = false;
      }

      // Close SUB socket
      if (this.subSocket) {
        await this.subSocket.close();
        this.subSocket = null;
        this.stats.subConnected = false;
      }

      // Clear context
      if (this.context) {
        this.context = null;
      }

      console.log('[ConnectionPool] Disconnected successfully');

    } catch (error) {
      console.error(`[ConnectionPool] Disconnection error: ${error}`);
      throw error;
    }
  }
}
