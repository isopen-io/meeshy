/**
 * Fichier de compatibilité - Alias vers nouveau service
 * Permet migration progressive sans casser le code existant
 */

import { webSocketService } from './websocket.service';

// Alias pour compatibilité
export const meeshySocketIOService = webSocketService;

