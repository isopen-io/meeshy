/**
 * Logger Winston partagé du gateway.
 *
 * Extrait de `server.ts` pour que `route-registration.ts` (et tout module
 * important les routes sans vouloir déclencher le bootstrap complet du
 * serveur — voir le commentaire en tête de `route-registration.ts`) puisse
 * logger sans importer `server.ts`, dont le chargement du module a des
 * effets de bord (instanciation de `MeeshyServer` + `meeshyServer.start()`
 * en bas de fichier).
 */

import winston from 'winston';

const isDev = (process.env.NODE_ENV || 'development') === 'development';

export const logger = winston.createLogger({
  level: isDev ? 'debug' : 'warn', // Production: seulement warn et error
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    isDev
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, stack }) => {
            return `${timestamp} [GWY] [${level}] ${message}${stack ? '\n' + stack : ''}`;
          })
        )
      : winston.format.combine(
          winston.format.printf((info) => {
            const { timestamp, level, message, stack, module, func, ...meta } = info;

            // Format structuré : [LEVEL][SERVICE][MODULE][FUNCTION] {data}
            const logParts = [
              `[${level.toUpperCase()}]`,
              '[GWY]',
              module ? `[${module}]` : '',
              func ? `[${func}]` : ''
            ].filter(Boolean);

            const logObj: any = {
              msg: message
            };

            // Ajouter le stack si présent
            if (stack) {
              logObj.stack = stack;
            }

            // Ajouter toutes les métadonnées supplémentaires
            if (Object.keys(meta).length > 0) {
              Object.assign(logObj, meta);
            }

            return `${timestamp} ${logParts.join('')} ${JSON.stringify(logObj)}`;
          })
        )
  ),
  transports: [
    new winston.transports.Console(),
    ...(!isDev ? [
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    ] : [])
  ]
});
