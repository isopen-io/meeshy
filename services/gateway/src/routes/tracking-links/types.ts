import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import type { TrackingLink } from '@meeshy/shared/types/tracking-link';
import { TrackingLinkService } from '../../services/TrackingLinkService';

/**
 * Helper pour enrichir un TrackingLink avec l'URL complète
 * Construit l'URL basée sur FRONTEND_URL ou le domaine de la requête
 */
export function enrichTrackingLink(link: TrackingLink, request?: FastifyRequest): TrackingLink & { fullUrl?: string } {
  const trackingService = new TrackingLinkService(null as any);
  const fullUrl = trackingService.buildTrackingUrl(link.token);

  return {
    ...link,
    fullUrl
  };
}

/**
 * Schémas de validation Zod
 */
export const createTrackingLinkSchema = z.object({
  originalUrl: z.string().url('URL invalide'),
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  expiresAt: z.string().datetime().optional()
});

export const recordClickSchema = z.object({
  ipAddress: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  userAgent: z.string().optional(),
  browser: z.string().optional(),
  os: z.string().optional(),
  device: z.string().optional(),
  language: z.string().optional(),
  referrer: z.string().optional(),
  deviceFingerprint: z.string().optional()
});

export const getStatsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

/**
 * Fonctions utilitaires pour détecter le navigateur, l'OS et le type d'appareil
 */
export function detectBrowser(userAgent: string): string {
  if (!userAgent) return 'Unknown';

  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';

  return 'Other';
}

export function detectOS(userAgent: string): string {
  if (!userAgent) return 'Unknown';

  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';

  return 'Other';
}

export function detectDevice(userAgent: string): string {
  if (!userAgent) return 'Unknown';

  if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
    return 'mobile';
  }
  if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
    return 'tablet';
  }

  return 'desktop';
}
