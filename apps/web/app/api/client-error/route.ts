/**
 * API endpoint pour logger les erreurs client
 * Permet de capturer les erreurs qui se produisent sur les appareils mobiles
 * Les erreurs sont loggées dans un fichier pour analyse ultérieure
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '@/utils/logger';

// Chemin du fichier de log (dans le dossier logs à la racine du projet frontend)
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'client-errors.log');

/**
 * Écrit une erreur dans le fichier de log avec contexte complet
 */
async function logToFile(errorData: Record<string, unknown>) {
  try {
    // Créer le dossier logs s'il n'existe pas
    await fs.mkdir(LOG_DIR, { recursive: true });

    // Le contexte complet est déjà fourni par error-context-collector
    // On garde tout pour analyse ultérieure
    const logEntry = {
      // Informations de base
      timestamp: errorData.timestamp || new Date().toISOString(),
      url: errorData.url,
      message: errorData.message,
      stack: errorData.stack,
      digest: errorData.digest,

      // User Agent et détails appareil
      userAgent: errorData.userAgent,
      platform: errorData.platform,
      language: errorData.language,
      languages: errorData.languages,

      // Appareil
      device: errorData.device || {
        type: 'unknown',
        os: 'Unknown',
        browser: 'Unknown',
      },

      // Écran
      screen: errorData.screen,

      // Réseau (IMPORTANT pour diagnostiquer les problèmes en Afrique)
      network: errorData.network || {
        online: true,
      },

      // Performance
      performance: errorData.performance,

      // Préférences
      preferences: errorData.preferences,

      // Localisation (timezone, langue)
      location: errorData.location,
    };

    // Écrire dans le fichier (append mode) - une ligne JSON par erreur
    const logLine = JSON.stringify(logEntry) + '\n';
    await fs.appendFile(LOG_FILE, logLine, 'utf-8');

    logger.info('[ApiClientError]', 'Logged client error to file', { file: LOG_FILE });
  } catch (fileError) {
    logger.error('[ApiClientError]', 'Failed to write to log file', { error: fileError });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;

    const errorData: Record<string, unknown> = {
      timestamp: body.timestamp || new Date().toISOString(),
      url: body.url,
      message: body.message,
      stack: body.stack,
      userAgent: body.userAgent,
      digest: body.digest,
    };

    logger.error('[ApiClientError]', 'Client-side error reported', { data: errorData });

    await logToFile(errorData);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error('[ApiClientError]', 'Failed to log client error', { error });
    return NextResponse.json(
      { success: false, error: 'Failed to log error' },
      { status: 500 }
    );
  }
}
