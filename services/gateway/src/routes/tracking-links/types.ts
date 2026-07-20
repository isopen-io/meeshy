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
  originalUrl: z.url('URL invalide'),
  name: z.string().max(32).optional(),
  campaign: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  medium: z.string().max(100).optional(),
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  expiresAt: z.iso.datetime().optional(),
  customToken: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,48}[a-zA-Z0-9]$/, 'Le token doit contenir 2-50 caractères alphanumériques et ne peut pas commencer ou finir par un tiret').optional()
});

export const recordClickSchema = z.object({
  ipAddress: z.string().max(45).optional(),
  country: z.string().max(10).optional(),
  city: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  userAgent: z.string().max(512).optional(),
  browser: z.string().max(64).optional(),
  os: z.string().max(64).optional(),
  device: z.string().max(64).optional(),
  language: z.string().max(35).optional(),
  languages: z.string().max(256).optional(),
  referrer: z.string().max(2048).optional(),
  deviceFingerprint: z.string().max(128).optional(),
  // Rich tracking fields
  screenResolution: z.string().max(20).optional(),
  viewportSize: z.string().max(20).optional(),
  pixelRatio: z.number().optional(),
  colorDepth: z.number().int().optional(),
  timezone: z.string().max(64).optional(),
  connectionType: z.string().max(32).optional(),
  connectionSpeed: z.number().optional(),
  touchSupport: z.boolean().optional(),
  platform: z.string().max(64).optional(),
  cookiesEnabled: z.boolean().optional(),
  hardwareConcurrency: z.number().int().optional(),
  deviceMemory: z.number().optional(),
  socialSource: z.string().max(100).optional(),
  utmClickSource: z.string().max(100).optional(),
  utmClickMedium: z.string().max(100).optional(),
  utmClickCampaign: z.string().max(100).optional(),
  utmClickTerm: z.string().max(100).optional(),
  utmClickContent: z.string().max(100).optional(),
});

export const getStatsSchema = z.object({
  startDate: z.iso.datetime().optional(),
  endDate: z.iso.datetime().optional()
});

/**
 * Fonctions utilitaires pour détecter le navigateur, l'OS et le type d'appareil
 */
export function detectBrowser(userAgent: string): string {
  if (!userAgent) return 'Unknown';

  // Order matters: Chromium-derived browsers (Opera, Edge) all carry the
  // `Chrome` token, so their specific markers (`OPR`/`Opera`, `Edg`) MUST be
  // tested before the generic Chrome branch — otherwise they fold into Chrome.
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('OPR') || userAgent.includes('Opera')) return 'Opera';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Safari')) return 'Safari';

  return 'Other';
}

export function detectOS(userAgent: string): string {
  if (!userAgent) return 'Unknown';

  // Order matters: every Android UA carries `Linux`, and every iPhone/iPad UA
  // carries `Mac OS X` ("like Mac OS X"). The mobile platforms MUST be tested
  // before the desktop tokens they contain — otherwise Android reads as Linux
  // and iOS reads as macOS.
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad') || userAgent.includes('iOS')) return 'iOS';
  if (userAgent.includes('Mac OS')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';

  return 'Other';
}

export function detectDevice(userAgent: string): string {
  if (!userAgent) return 'Unknown';

  // Order matters: iPad Safari UAs carry the `Mobile` token (`Mobile/15E148`),
  // so tablets MUST be tested before the generic mobile branch. Android tablets
  // are distinguished from phones by the ABSENCE of `Mobile` (the standard
  // Android convention: phones include `Mobile`, tablets omit it).
  if (userAgent.includes('iPad') || userAgent.includes('Tablet')) return 'tablet';
  if (userAgent.includes('Android') && !userAgent.includes('Mobile')) return 'tablet';
  if (userAgent.includes('Mobile') || userAgent.includes('iPhone') || userAgent.includes('Android')) {
    return 'mobile';
  }

  return 'desktop';
}
