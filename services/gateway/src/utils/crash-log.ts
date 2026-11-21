import fs from 'fs';
import path from 'path';
import { logger } from '../gateway-logger';

// Helper pour écrire les crash logs dans un fichier
export function writeCrashLog(type: string, error: unknown, promise?: Promise<unknown>): void {
  const timestamp = new Date().toISOString();
  const crashDir = path.join(process.cwd(), 'logs');
  const crashFile = path.join(crashDir, 'gateway-crashes.log');

  // Créer le dossier logs s'il n'existe pas
  if (!fs.existsSync(crashDir)) {
    fs.mkdirSync(crashDir, { recursive: true });
  }

  // Construire le message de crash détaillé
  let crashMessage = `\n${'='.repeat(80)}\n`;
  crashMessage += `[${timestamp}] ${type}\n`;
  crashMessage += `${'='.repeat(80)}\n`;

  if (error instanceof Error) {
    crashMessage += `Name: ${error.name}\n`;
    crashMessage += `Message: ${error.message}\n`;
    crashMessage += `Stack:\n${error.stack || 'No stack trace'}\n`;
    if ((error as { cause?: unknown }).cause) {
      crashMessage += `Cause: ${JSON.stringify((error as { cause?: unknown }).cause, null, 2)}\n`;
    }
  } else {
    crashMessage += `Reason: ${JSON.stringify(error, null, 2)}\n`;
    crashMessage += `Type: ${typeof error}\n`;
  }

  if (promise) {
    crashMessage += `Promise: ${promise.toString()}\n`;
  }

  crashMessage += `${'='.repeat(80)}\n`;

  // Écrire dans le fichier
  fs.appendFileSync(crashFile, crashMessage);

  // Aussi logger dans la console avec le stack complet
  logger.error('Crash', { message: crashMessage });
}
