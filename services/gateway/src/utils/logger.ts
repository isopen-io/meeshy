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
    // CRITICAL BUG FIX — the info() body was EMPTY, silently dropping every
    // log line emitted via this logger (including the entire call subsystem
    // that imports `../utils/logger` rather than `../utils/logger-enhanced`).
    // Reason this matters today: production was completely blind to
    // `call:initiate`, `call:signal`, `Signal forwarded`, etc., making it
    // impossible to tell whether the SDP answer from the callee was being
    // relayed or not. Restoring the standard console.log keeps the format
    // consistent with error() and warn() and lights up the missing trail.
    console.log(this.formatMessage('info', message, ...args));
  }

  error(message: string, ...args: any[]): void {
    console.error(this.formatMessage('error', message, ...args));
  }

  warn(message: string, ...args: any[]): void {
    console.warn(this.formatMessage('warn', message, ...args));
  }

  debug(message: string, ...args: any[]): void {
    // Same root cause as info(): the body was empty — debug() was silently
    // dropping every line even with NODE_ENV=development / DEBUG=true.
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      console.debug(this.formatMessage('debug', message, ...args));
    }
  }
}

// Instance singleton
export const logger = new MeeshyLogger();

// Utility pour les logs d'erreur avec compatibilité Fastify
/**
 * Trace une erreur — et la fait SORTIR.
 *
 * L'ancienne version déléguait au seul logger reçu. Or `server.ts` construit
 * Fastify avec `logger: false` : `fastify.log` est le no-op d'`abstract-logging`,
 * dont les méthodes existent, ne rejettent pas, et n'écrivent rien. Comme 166
 * des 172 appels du dépôt lui passent `fastify.log` (ou `request.log`, le même
 * objet), la quasi-totalité des erreurs de route étaient écrites nulle part.
 *
 * Constaté le 2026-08-18 : un 500 reproductible sur
 * `POST /anonymous/join/:linkId` n'a laissé aucune ligne structurée en
 * production. Seul le `prisma:error` brut du client Prisma a fuité — et il ne
 * nomme ni la route, ni l'appelant. Un logger d'erreurs muet est pire que pas
 * de logger : le code se lit comme s'il traçait.
 *
 * La ligne part donc TOUJOURS par le `logger` de ce module, qui écrit sur la
 * console et dont on voit la sortie en production. Le logger reçu est servi EN
 * PLUS quand il sait émettre — les rares appelants qui en passent un vrai ne
 * perdent rien, et pour `fastify.log` cet appel supplémentaire est un no-op.
 */
export function logError(loggerOrMessage: any, message?: string | unknown, error?: unknown): void {
  // Six appels du dépôt emploient la signature à DEUX arguments
  // (`logError('Error fetching categories', error, { source })`). Le message
  // humain y arrive en position `logger` et la cause en position `message` :
  // la ligne sortait, amputée de ce qu'elle voulait dire. On la rattrape ici
  // plutôt que de la mutiler.
  const calledWithoutLogger = typeof loggerOrMessage === 'string';
  const sink = calledWithoutLogger ? null : loggerOrMessage;
  const text = calledWithoutLogger ? loggerOrMessage : String(message ?? '');
  const cause = calledWithoutLogger ? message : error;

  const detail = cause instanceof Error
    ? `${cause.message}${cause.stack ? `\n${cause.stack}` : ''}`
    : String(cause);

  logger.error(text, detail);

  if (sink && typeof sink.error === 'function') {
    try {
      sink.error(text);
      if (cause instanceof Error) {
        sink.error(cause.message);
        sink.error(cause.stack);
      } else {
        sink.error(String(cause));
      }
    } catch {
      // Un logger d'appelant qui casse ne doit pas emporter la trace : la
      // ligne est déjà partie par `logger.error` ci-dessus.
    }
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
