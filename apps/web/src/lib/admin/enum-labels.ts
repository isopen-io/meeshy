import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES VALEURS SERVIES, DITES DANS LA LANGUE DE L'ÉCRAN** (#7845) — type de
 * conversation, gravité d'un événement de sécurité, type et statut d'un
 * signalement, statut d'une demande d'ami.
 *
 * La fiche d'un membre les montrait BRUTES : `group`, `HIGH`, `under_review`
 * — de l'anglais de base de données jusque dans l'interface arabe. Une table
 * par famille, et un repli sur la valeur servie quand elle est inconnue : la
 * passerelle peut ajouter une valeur demain, et une valeur montrée telle
 * quelle vaut mieux qu'une ligne vide qui ressemblerait à un oubli.
 *
 * Les tables sont des littéraux FERMÉS : une clé calculée par concaténation
 * compilerait vers n'importe quoi, et une clé absente d'un catalogue ne se
 * verrait qu'à l'exécution.
 */

const CONVERSATION_TYPES: Readonly<Record<string, AdminPlainCatalogKey>> = {
  direct: 'admin.conv.type.direct',
  group: 'admin.conv.type.group',
  public: 'admin.conv.type.public',
  global: 'admin.conv.type.global',
  broadcast: 'admin.conv.type.broadcast',
};

const SEVERITIES: Readonly<Record<string, AdminPlainCatalogKey>> = {
  LOW: 'admin.security.severity.low',
  MEDIUM: 'admin.security.severity.medium',
  HIGH: 'admin.security.severity.high',
  CRITICAL: 'admin.security.severity.critical',
};

const REPORT_TYPES: Readonly<Record<string, AdminPlainCatalogKey>> = {
  spam: 'admin.report.type.spam',
  inappropriate: 'admin.report.type.inappropriate',
  harassment: 'admin.report.type.harassment',
  violence: 'admin.report.type.violence',
  hate_speech: 'admin.report.type.hateSpeech',
  fake_profile: 'admin.report.type.fakeProfile',
  impersonation: 'admin.report.type.impersonation',
  other: 'admin.report.type.other',
};

const REPORTED_TYPES: Readonly<Record<string, AdminPlainCatalogKey>> = {
  message: 'admin.report.target.message',
  user: 'admin.report.target.user',
  conversation: 'admin.report.target.conversation',
  community: 'admin.report.target.community',
};

const STATUSES: Readonly<Record<string, AdminPlainCatalogKey>> = {
  pending: 'admin.status.pending',
  under_review: 'admin.status.underReview',
  resolved: 'admin.status.resolved',
  rejected: 'admin.status.rejected',
  dismissed: 'admin.status.dismissed',
  accepted: 'admin.status.accepted',
  blocked: 'admin.status.blocked',
};

/** Le statut d'un `SecurityEvent` : `"SUCCESS" | "FAILED" | "BLOCKED"` (schema.prisma). */
const EVENT_STATUSES: Readonly<Record<string, AdminPlainCatalogKey>> = {
  SUCCESS: 'admin.status.success',
  FAILED: 'admin.status.failed',
  BLOCKED: 'admin.status.blocked',
};

const TABLES = {
  conversationType: CONVERSATION_TYPES,
  severity: SEVERITIES,
  reportType: REPORT_TYPES,
  reportedType: REPORTED_TYPES,
  status: STATUSES,
  eventStatus: EVENT_STATUSES,
} as const;

export type AdminEnumFamily = keyof typeof TABLES;

/** Le libellé traduit d'une valeur servie ; la valeur elle-même si elle est inconnue. */
export function adminEnumLabel(language: InterfaceLanguage, family: AdminEnumFamily, value: string): string {
  const table: Readonly<Record<string, AdminPlainCatalogKey>> = TABLES[family];
  const cle = Object.hasOwn(table, value) ? table[value] : undefined;
  return cle === undefined ? value : translateAdmin(language, cle);
}

export const adminConversationTypeLabel = (language: InterfaceLanguage, value: string): string =>
  adminEnumLabel(language, 'conversationType', value);
