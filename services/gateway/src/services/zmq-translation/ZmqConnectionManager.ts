/**
 * ZMQ Connection Manager
 * Gère les sockets PUSH et SUB pour la communication avec le service Translator
 *
 * Architecture:
 * - PUSH socket: Envoie des commandes au Translator
 * - SUB socket: Reçoit les résultats du Translator
 *
 * Compatibilité Jest:
 * - Pas de setInterval interne (géré par le client parent)
 * - Méthodes async pures pour receive()
 */

import type { Push, Subscriber, Context } from 'zeromq';
import * as zmq from 'zeromq';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'ZmqConnectionManager' });

export interface ConnectionManagerConfig {
  host: string;
  pushPort: number;  // Port où Gateway PUSH connect (Translator PULL bind)
  subPort: number;   // Port où Gateway SUB connect (Translator PUB bind)
}

export class ZmqConnectionManager {
  private pushSocket: Push | null = null;
  private subSocket: Subscriber | null = null;
  private context: Context | null = null;

  private config: ConnectionManagerConfig;
  private isConnected: boolean = false;

  constructor(config: ConnectionManagerConfig) {
    this.config = config;
  }

  /**
   * Initialise les sockets ZMQ
   * - Crée le contexte ZMQ
   * - Connecte PUSH socket pour envoyer les commandes
   * - Connecte SUB socket pour recevoir les résultats
   * - S'abonne à tous les messages sur SUB
   */
  async initialize(): Promise<void> {
    try {
      logger.debug('Initializing ZMQ Connection Manager');

      this.context = new zmq.Context();

      this.pushSocket = new zmq.Push();
      await this.pushSocket.connect(`tcp://${this.config.host}:${this.config.pushPort}`);

      this.subSocket = new zmq.Subscriber();
      await this.subSocket.connect(`tcp://${this.config.host}:${this.config.subPort}`);
      await this.subSocket.subscribe('');

      this.isConnected = true;
      logger.info('ZMQ Connection Manager initialized', {
        pushPort: this.config.pushPort,
        subPort: this.config.subPort,
        host: this.config.host,
      });

    } catch (error) {
      logger.error('ZMQ Connection Manager initialization failed', error as Error);
      throw error;
    }
  }

  /**
   * Envoie un message JSON simple via PUSH socket
   */
  async send(payload: object): Promise<void> {
    if (!this.pushSocket) {
      throw new Error('Socket PUSH non initialisé');
    }

    try {
      await this.pushSocket.send(JSON.stringify(payload));
    } catch (error) {
      logger.error('ZMQ send failed', error as Error);
      throw error;
    }
  }

  /**
   * Envoie un message multipart ZMQ avec des frames binaires
   * Frame 0: JSON metadata
   * Frame 1+: Données binaires (audio, embedding, etc.)
   */
  async sendMultipart(jsonPayload: object, binaryFrames: Buffer[]): Promise<void> {
    if (!this.pushSocket) {
      throw new Error('Socket PUSH non initialisé');
    }

    // Préparer les frames: JSON en premier, puis les binaires
    const frames: Buffer[] = [
      Buffer.from(JSON.stringify(jsonPayload), 'utf-8'),
      ...binaryFrames
    ];

    // Envoyer en multipart
    await this.pushSocket.send(frames);

    logger.debug('ZMQ multipart sent', { frames: frames.length, bytes: frames.reduce((sum, f) => sum + f.length, 0) });
  }

  /**
   * Reçoit un message du SUB socket (non-bloquant)
   * Retourne Buffer pour message simple, Buffer[] pour multipart
   * Throw si pas de message disponible
   */
  async receive(): Promise<Buffer | Buffer[]> {
    if (!this.subSocket) {
      throw new Error('Socket SUB non initialisé');
    }

    const messages = await this.subSocket.receive();

    if (!messages || messages.length === 0) {
      throw new Error('No message available');
    }

    // Convertir en Buffer array
    const frames = messages as Buffer[];

    // Retourner simple ou multipart
    return frames.length === 1 ? frames[0] : frames;
  }

  /**
   * Vérifie si les sockets sont connectés
   */
  getIsConnected(): boolean {
    return this.isConnected && this.pushSocket !== null && this.subSocket !== null;
  }

  /**
   * Envoie un ping pour vérifier la connectivité
   */
  async sendPing(): Promise<void> {
    if (!this.pushSocket) {
      logger.warn('Health check skipped: PUSH socket not initialized');
      return;
    }

    try {
      const pingMessage = {
        type: 'ping',
        timestamp: Date.now()
      };

      await this.pushSocket.send(JSON.stringify(pingMessage));
    } catch (error) {
      logger.error('ZMQ health check ping failed', error as Error, { port: this.config.pushPort });
    }
  }

  /**
   * Ferme les sockets et nettoie les ressources
   */
  async close(): Promise<void> {
    logger.info('Closing ZMQ Connection Manager');

    this.isConnected = false;

    try {
      if (this.pushSocket) {
        await this.pushSocket.close();
        this.pushSocket = null;
      }

      if (this.subSocket) {
        await this.subSocket.close();
        this.subSocket = null;
      }

      if (this.context) {
        this.context = null;
      }

      logger.info('ZMQ Connection Manager closed');

    } catch (error) {
      logger.error('Error closing ZMQ Connection Manager', error as Error);
    }
  }

  /**
   * Récupère les sockets pour des opérations avancées (tests uniquement)
   */
  getSockets(): { pushSocket: Push | null; subSocket: Subscriber | null } {
    return {
      pushSocket: this.pushSocket,
      subSocket: this.subSocket
    };
  }
}
