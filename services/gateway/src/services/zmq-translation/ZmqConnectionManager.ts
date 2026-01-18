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
      console.log(`[GATEWAY] 🔧 Début initialisation ZMQ Connection Manager...`);

      // Créer le contexte ZMQ
      this.context = new zmq.Context();
      console.log(`[GATEWAY] 🔧 Contexte ZMQ créé`);

      // Socket PUSH pour envoyer les commandes de traduction
      this.pushSocket = new zmq.Push();
      await this.pushSocket.connect(`tcp://${this.config.host}:${this.config.pushPort}`);
      console.log(`[GATEWAY] 🔧 Socket PUSH connecté à ${this.config.host}:${this.config.pushPort}`);

      // Socket SUB pour recevoir les résultats
      this.subSocket = new zmq.Subscriber();
      await this.subSocket.connect(`tcp://${this.config.host}:${this.config.subPort}`);
      await this.subSocket.subscribe(''); // S'abonner à tous les messages
      console.log(`[GATEWAY] 🔧 Socket SUB connecté à ${this.config.host}:${this.config.subPort}`);

      this.isConnected = true;
      console.log('[GATEWAY] ✅ ZMQ Connection Manager initialisé avec succès');
      console.log(`[GATEWAY] 🔌 Socket PUSH connecté: ${this.config.host}:${this.config.pushPort} (envoi commandes)`);
      console.log(`[GATEWAY] 🔌 Socket SUB connecté: ${this.config.host}:${this.config.subPort} (réception résultats)`);

    } catch (error) {
      console.error(`[GATEWAY] ❌ Erreur initialisation Connection Manager: ${error}`);
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
      console.error(`[GATEWAY] ❌ Erreur envoi message: ${error}`);
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

    console.log(`[GATEWAY] [ZMQ-Client] Multipart envoyé: ${frames.length} frames, total ${frames.reduce((sum, f) => sum + f.length, 0)} bytes`);
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
      throw new Error('Socket PUSH non initialisé');
    }

    const pingMessage = {
      type: 'ping',
      timestamp: Date.now()
    };

    await this.pushSocket.send(JSON.stringify(pingMessage));
    console.log(`[GATEWAY] 🏓 Health check ping envoyé via port ${this.config.pushPort}`);
  }

  /**
   * Ferme les sockets et nettoie les ressources
   */
  async close(): Promise<void> {
    console.log('[GATEWAY] 🛑 Arrêt Connection Manager...');

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

      console.log('[GATEWAY] ✅ Connection Manager arrêté');

    } catch (error) {
      console.error(`[GATEWAY] ❌ Erreur arrêt Connection Manager: ${error}`);
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
