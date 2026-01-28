/**
 * Service ZMQ singleton pour éviter les conflits de ports multiples
 */

import { ZmqTranslationClient } from './zmq-translation';

class ZMQSingleton {
  private static instance: ZmqTranslationClient | null = null;
  private static isInitializing = false;
  private static initializationPromise: Promise<void> | null = null;

  private constructor() {}

  static async getInstance(): Promise<ZmqTranslationClient> {
    if (this.instance) {
      return this.instance;
    }

    if (this.isInitializing) {
      // Attendre que l'initialisation en cours se termine
      if (this.initializationPromise) {
        await this.initializationPromise;
        return this.instance!;
      }
    }

    this.isInitializing = true;
    this.initializationPromise = this.initializeInstance();

    try {
      await this.initializationPromise;
      return this.instance!;
    } finally {
      this.isInitializing = false;
      this.initializationPromise = null;
    }
  }

  private static async initializeInstance(): Promise<void> {
    try {

      this.instance = new ZmqTranslationClient();
      await this.instance.initialize();

    } catch (error) {
      console.error('Erreur lors de l\'initialisation:', error);
      this.instance = null;
      throw error;
    }
  }

  static async close(): Promise<void> {
    if (this.instance) {
      try {
        await this.instance.close();
      } catch (error) {
        console.error('Erreur lors de la fermeture:', error);
      } finally {
        this.instance = null;
      }
    }
  }

  static getInstanceSync(): ZmqTranslationClient | null {
    return this.instance;
  }
}

export { ZMQSingleton };
