/**
 * Service ZMQ singleton pour éviter les conflits de ports multiples
 */

import { ZMQTranslationClient } from './zmq-translation-client';

class ZMQSingleton {
  private static instance: ZMQTranslationClient | null = null;
  private static isInitializing = false;
  private static initializationPromise: Promise<void> | null = null;

  private constructor() {}

  static async getInstance(): Promise<ZMQTranslationClient> {
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
      
      this.instance = new ZMQTranslationClient();
      await this.instance.initialize();
      
    } catch (error) {
      console.error('[GATEWAY] Erreur lors de l\'initialisation:', error);
      this.instance = null;
      throw error;
    }
  }

  static async close(): Promise<void> {
    if (this.instance) {
      try {
        await this.instance.close();
      } catch (error) {
        console.error('[GATEWAY] Erreur lors de la fermeture:', error);
      } finally {
        this.instance = null;
      }
    }
  }

  static getInstanceSync(): ZMQTranslationClient | null {
    return this.instance;
  }
}

export { ZMQSingleton };
