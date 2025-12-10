/**
 * Logger utilitaire pour le service Fastify
 * Basé sur Fastify logger avec formatage personnalisé
 */

export interface Logger {
  info: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
}

class MeeshyLogger implements Logger {
  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ') : '';
    
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${formattedArgs}`;
  }

  info(message: string, ...args: any[]): void {
  }

  error(message: string, ...args: any[]): void {
    console.error(this.formatMessage('error', message, ...args));
  }

  warn(message: string, ...args: any[]): void {
    console.warn(this.formatMessage('warn', message, ...args));
  }

  debug(message: string, ...args: any[]): void {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
    }
  }
}

// Instance singleton
export const logger = new MeeshyLogger();

// Utility pour les logs d'erreur avec compatibilité Fastify
export function logError(logger: any, message: string, error: unknown | any): void {
  try {
    // Essaie d'abord avec le logger Fastify
    if (logger && typeof logger.error === 'function') {
      logger.error(message);
      if (error instanceof Error) {
        logger.error(error.message);
        logger.error(error.stack);
      } else {
        logger.error(String(error));
      }
    } else {
      // Fallback vers console
      console.error(message, error);
    }
  } catch (e) {
    // Dernier recours
    console.error(message, error);
  }
}

export function logWarn(logger: any, message: string, error: unknown | any): void {
  try {
    if (logger && typeof logger.warn === 'function') {
      logger.warn(message);
      if (error instanceof Error) {
        logger.warn(error.message);
      } else {
        logger.warn(String(error));
      }
    } else {
      console.warn(message, error);
    }
  } catch (e) {
    console.warn(message, error);
  }
}

export default logger;
