/**
 * Ce que l'export RGPD (`GET /me/export`) remet des connexions d'un compte
 * (#9614) : chaque session telle qu'elle est retenue, et les événements de
 * sécurité du compte.
 *
 * Jamais `sessionToken` / `refreshToken` / `deviceFingerprint` : ce sont des
 * secrets ou des identifiants de suivi, pas des données à porter — le hachage
 * n'annule pas la règle. Jamais `isCurrentSession` : la colonne valait « vrai »
 * pour toutes les sessions et n'a de sens que dans la requête qui la calcule.
 * Jamais de coordonnées : elles ne sont plus écrites (#9609), et l'existant
 * s'efface par migration. Le motif de clôture est donné EN CLAIR, dans la
 * langue de la personne ; une fermeture par l'administration se dit « par
 * l'équipe Meeshy », sans jamais nommer qui.
 *
 * Des événements de sécurité, jamais `metadata` (forme libre, écrite par
 * chaque producteur pour son propre usage) ni `deviceFingerprint`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { sessionClosureReasonText } from '@meeshy/shared/utils/client-session';
import type { ExportPage, ExportSection } from './export-sections';

const SESSION_EXPORT_SELECT = {
  id: true,
  createdAt: true,
  lastActivityAt: true,
  expiresAt: true,
  isValid: true,
  isTrusted: true,
  invalidatedAt: true,
  invalidatedReason: true,
  deviceType: true,
  deviceVendor: true,
  deviceModel: true,
  deviceName: true,
  osName: true,
  osVersion: true,
  browserName: true,
  browserVersion: true,
  isMobile: true,
  appVersion: true,
  appBuild: true,
  platform: true,
  loginMethod: true,
  ipAddress: true,
  country: true,
  city: true,
  location: true,
  timezone: true,
  userAgent: true,
} as const;

const SECURITY_EVENT_EXPORT_SELECT = {
  id: true,
  eventType: true,
  severity: true,
  status: true,
  description: true,
  ipAddress: true,
  userAgent: true,
  geoLocation: true,
  createdAt: true,
} as const;

const text = { type: 'string', nullable: true } as const;

export const sessionExportItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    createdAt: { type: 'string' },
    lastActivityAt: { type: 'string' },
    expiresAt: { type: 'string' },
    isValid: { type: 'boolean' },
    isTrusted: { type: 'boolean' },
    invalidatedAt: text,
    invalidatedReason: text,
    invalidatedReasonText: text,
    deviceType: text,
    deviceVendor: text,
    deviceModel: text,
    deviceName: text,
    osName: text,
    osVersion: text,
    browserName: text,
    browserVersion: text,
    isMobile: { type: 'boolean' },
    appVersion: text,
    appBuild: text,
    platform: text,
    loginMethod: text,
    ipAddress: text,
    country: text,
    city: text,
    location: text,
    timezone: text,
    userAgent: text,
  },
} as const;

export const securityEventExportItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    eventType: { type: 'string' },
    severity: { type: 'string' },
    status: { type: 'string' },
    description: text,
    ipAddress: text,
    userAgent: text,
    geoLocation: text,
    createdAt: { type: 'string' },
  },
} as const;

type ExportStore = Pick<PrismaClient, 'userSession' | 'securityEvent'>;

const toSection = <T>(items: readonly T[], total: number, page: ExportPage): ExportSection<T> => ({
  items,
  total,
  hasMore: page.offset + items.length < total,
});

export async function exportSessions(prisma: ExportStore, userId: string, page: ExportPage, language: string) {
  const where = { userId };
  const [rows, total] = await Promise.all([
    prisma.userSession.findMany({
      where,
      select: SESSION_EXPORT_SELECT,
      orderBy: { lastActivityAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.userSession.count({ where }),
  ]);
  const items = rows.map((row) => ({
    ...row,
    invalidatedReasonText: row.isValid ? null : sessionClosureReasonText(row.invalidatedReason, language),
  }));
  return toSection(items, total, page);
}

export async function exportSecurityEvents(prisma: ExportStore, userId: string, page: ExportPage) {
  const where = { userId };
  const [items, total] = await Promise.all([
    prisma.securityEvent.findMany({
      where,
      select: SECURITY_EVENT_EXPORT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.securityEvent.count({ where }),
  ]);
  return toSection(items, total, page);
}
