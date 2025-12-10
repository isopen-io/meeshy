/**
 * Utilitaires pour parser et gérer les liens dans les messages
 */

import { buildApiUrl, API_ENDPOINTS } from '../config';

import { authManager } from '@/services/auth-manager.service';

// Regex pour détecter les liens
const URL_REGEX = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*))/gi;
// Détecte les liens de tracking sur n'importe quel domaine: http(s)://exemple.com/l/<token>
const TRACKING_LINK_REGEX = /https?:\/\/[^\/]+\/l\/([a-zA-Z0-9+\-_=]{6})/gi;
// Détecte le format court: m+<token>
const MSHY_SHORT_REGEX = /\bm\+([a-zA-Z0-9+\-_=]{6})\b/gi;

export interface ParsedLink {
  type: 'text' | 'url' | 'tracking-link' | 'mshy-link';
  content: string;
  originalUrl?: string;
  trackingUrl?: string;
  token?: string;
  start: number;
  end: number;
}

export interface LinkParserOptions {
  createTrackingLinks?: boolean; // Créer automatiquement des liens de tracking
  conversationId?: string;
  messageId?: string;
  userId?: string;
}

/**
 * Parse un message et extrait les liens
 */
export function parseMessageLinks(message: string): ParsedLink[] {
  const parts: ParsedLink[] = [];
  let lastIndex = 0;

  // Créer un tableau de toutes les correspondances
  const matches: Array<{ match: RegExpExecArray; type: 'tracking' | 'mshy' | 'url' }> = [];

  // Trouver tous les liens m+<token> (priorité la plus haute)
  let mshyMatch: RegExpExecArray | null;
  const mshyRegex = new RegExp(MSHY_SHORT_REGEX.source, 'gi');
  while ((mshyMatch = mshyRegex.exec(message)) !== null) {
    matches.push({ match: mshyMatch, type: 'mshy' });
  }

  // Trouver tous les liens de tracking meeshy.me/l/<token>
  let trackingMatch: RegExpExecArray | null;
  const trackingRegex = new RegExp(TRACKING_LINK_REGEX.source, 'gi');
  while ((trackingMatch = trackingRegex.exec(message)) !== null) {
    // Vérifier si ce n'est pas déjà un lien mshy
    const isAlreadyMshy = matches.some(
      (m) => m.match.index === trackingMatch!.index
    );
    if (!isAlreadyMshy) {
      matches.push({ match: trackingMatch, type: 'tracking' });
    }
  }

  // Trouver tous les liens normaux (qui ne sont pas des liens de tracking ou mshy)
  let urlMatch: RegExpExecArray | null;
  const urlRegex = new RegExp(URL_REGEX.source, 'gi');
  while ((urlMatch = urlRegex.exec(message)) !== null) {
    // Vérifier si ce lien n'est pas déjà un lien de tracking ou mshy
    const isAlreadyProcessed = matches.some(
      (m) => m.match.index === urlMatch!.index
    );
    if (!isAlreadyProcessed) {
      matches.push({ match: urlMatch, type: 'url' });
    }
  }

  // Trier les correspondances par position
  matches.sort((a, b) => a.match.index - b.match.index);

  // Construire les parts
  matches.forEach(({ match, type }) => {
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;

    // Ajouter le texte avant le lien
    if (lastIndex < matchStart) {
      parts.push({
        type: 'text',
        content: message.substring(lastIndex, matchStart),
        start: lastIndex,
        end: matchStart,
      });
    }

    // Ajouter le lien selon son type
    if (type === 'mshy') {
      const token = match[1]; // Le token de 6 caractères
      // Utiliser le domaine actuel ou un chemin relatif pour flexibilité
      const trackingUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/l/${token}`
        : `/l/${token}`;
      
      parts.push({
        type: 'mshy-link',
        content: match[0],
        trackingUrl,
        token,
        start: matchStart,
        end: matchEnd,
      });
    } else if (type === 'tracking') {
      const token = match[1]; // Le token de 6 caractères
      parts.push({
        type: 'tracking-link',
        content: match[0],
        trackingUrl: match[0],
        token,
        start: matchStart,
        end: matchEnd,
      });
    } else {
      parts.push({
        type: 'url',
        content: match[0],
        originalUrl: match[0],
        start: matchStart,
        end: matchEnd,
      });
    }

    lastIndex = matchEnd;
  });

  // Ajouter le texte restant
  if (lastIndex < message.length) {
    parts.push({
      type: 'text',
      content: message.substring(lastIndex),
      start: lastIndex,
      end: message.length,
    });
  }

  // Si aucun lien n'a été trouvé, retourner tout le message comme texte
  if (parts.length === 0) {
    parts.push({
      type: 'text',
      content: message,
      start: 0,
      end: message.length,
    });
  }

  return parts;
}

/**
 * Crée un lien de tracking pour une URL
 */
export async function createTrackingLink(
  originalUrl: string,
  options: {
    conversationId?: string;
    messageId?: string;
  } = {}
): Promise<{ success: boolean; trackingLink?: any; error?: string }> {
  // Vérifier que nous sommes côté client
  if (typeof window === 'undefined') {
    return { success: false, error: 'Function only available on client side' };
  }

  try {
    const token = authManager.getAuthToken();
    const sessionToken = localStorage.getItem('session_token');

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (sessionToken) {
      headers['x-session-token'] = sessionToken;
    }

    const response = await fetch(buildApiUrl('/api/tracking-links'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        originalUrl,
        conversationId: options.conversationId,
        messageId: options.messageId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Erreur lors de la création du lien de tracking',
      };
    }

    return {
      success: true,
      trackingLink: data.data.trackingLink,
    };
  } catch (error) {
    console.error('Error creating tracking link:', error);
    return {
      success: false,
      error: 'Erreur réseau lors de la création du lien de tracking',
    };
  }
}

/**
 * Enregistre un clic sur un lien de tracking
 */
export async function recordTrackingLinkClick(
  token: string,
  options: {
    referrer?: string;
    deviceFingerprint?: string;
  } = {}
): Promise<{ success: boolean; originalUrl?: string; error?: string }> {
  // Vérifier que nous sommes côté client
  if (typeof window === 'undefined') {
    return { success: false, error: 'Function only available on client side' };
  }

  try {
    const authToken = authManager.getAuthToken();
    const sessionToken = localStorage.getItem('session_token');

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    } else if (sessionToken) {
      headers['x-session-token'] = sessionToken;
    }

    // Détecter le navigateur et l'OS
    const userAgent = navigator.userAgent;
    const browser = detectBrowser(userAgent);
    const os = detectOS(userAgent);
    const device = detectDevice(userAgent);
    const language = navigator.language.split('-')[0];

    const response = await fetch(
      buildApiUrl(`/api/tracking-links/${token}/click`),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userAgent,
          browser,
          os,
          device,
          language,
          referrer: options.referrer || document.referrer,
          deviceFingerprint: options.deviceFingerprint,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Erreur lors de l\'enregistrement du clic',
      };
    }

    return {
      success: true,
      originalUrl: data.data.originalUrl,
    };
  } catch (error) {
    console.error('Error recording tracking link click:', error);
    return {
      success: false,
      error: 'Erreur réseau lors de l\'enregistrement du clic',
    };
  }
}

/**
 * Remplace les liens dans un message par des liens de tracking
 */
export async function replaceLinksWithTracking(
  message: string,
  options: LinkParserOptions = {}
): Promise<string> {
  const parts = parseMessageLinks(message);
  const newParts: string[] = [];

  for (const part of parts) {
    if (part.type === 'url' && options.createTrackingLinks) {
      // Créer un lien de tracking pour ce lien
      const result = await createTrackingLink(part.originalUrl!, {
        conversationId: options.conversationId,
        messageId: options.messageId,
      });

      if (result.success && result.trackingLink) {
        newParts.push(`https://meeshy.me/l/${result.trackingLink.token}`);
      } else {
        // Si la création échoue, garder le lien original
        newParts.push(part.content);
      }
    } else {
      newParts.push(part.content);
    }
  }

  return newParts.join('');
}

/**
 * Vérifie si une chaîne contient des liens
 */
export function hasLinks(message: string): boolean {
  const urlRegex = new RegExp(URL_REGEX.source, 'gi');
  return urlRegex.test(message);
}

/**
 * Vérifie si un lien est un lien de tracking Meeshy
 */
export function isTrackingLink(url: string): boolean {
  const trackingRegex = new RegExp(TRACKING_LINK_REGEX.source, 'gi');
  return trackingRegex.test(url);
}

/**
 * Extrait le token d'un lien de tracking
 */
export function extractTrackingToken(url: string): string | null {
  const trackingRegex = new RegExp(TRACKING_LINK_REGEX.source, 'gi');
  const match = url.match(trackingRegex);
  if (match && match.length > 0) {
    // Extraire le token du match complet
    const fullMatch = match[0];
    const tokenMatch = fullMatch.match(/\/l\/([a-zA-Z0-9+\-_=]{6})/);
    if (tokenMatch && tokenMatch[1]) {
      return tokenMatch[1];
    }
  }
  return null;
}

// Fonctions utilitaires pour détecter le navigateur, l'OS et le type d'appareil

function detectBrowser(userAgent: string): string {
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg'))
    return 'Chrome';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome'))
    return 'Safari';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';

  return 'Other';
}

function detectOS(userAgent: string): string {
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (
    userAgent.includes('iOS') ||
    userAgent.includes('iPhone') ||
    userAgent.includes('iPad')
  )
    return 'iOS';

  return 'Other';
}

function detectDevice(userAgent: string): string {
  if (
    userAgent.includes('Mobile') ||
    userAgent.includes('Android') ||
    userAgent.includes('iPhone')
  ) {
    return 'mobile';
  }
  if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
    return 'tablet';
  }

  return 'desktop';
}

/**
 * Génère une empreinte de l'appareil (simple)
 * Pour une empreinte plus robuste, utilisez une bibliothèque comme fingerprintjs
 */
export function generateDeviceFingerprint(): string {
  // Vérifier que nous sommes côté client
  if (typeof window === 'undefined') {
    return 'server-side-fingerprint';
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    return `simple-${navigator.userAgent}-${screen.width}x${screen.height}`;
  }

  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f60';
  ctx.fillRect(125, 1, 62, 20);
  ctx.fillStyle = '#069';
  ctx.fillText('Browser Fingerprint', 2, 15);
  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
  ctx.fillText('Browser Fingerprint', 4, 17);

  const canvasData = canvas.toDataURL();
  
  // Créer un hash simple
  let hash = 0;
  for (let i = 0; i < canvasData.length; i++) {
    const char = canvasData.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return `fp-${Math.abs(hash)}-${navigator.userAgent.length}-${screen.width}x${screen.height}`;
}

