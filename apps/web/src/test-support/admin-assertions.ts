import { expect } from 'bun:test';

import type { AdminPermissions } from '@/lib/admin/sections';

/**
 * **LES TÉMOINS COMMUNS DES ÉCRANS D'ADMINISTRATION** (#8876).
 *
 * `expectNoRawIdentifiers` est la garde des deux règles de la « vue de dieu » :
 * R1 (un identifiant n'est JAMAIS un libellé) et R2 (une métadonnée se lit en
 * mots, pas en valeur brute). Elle lit les NŒUDS TEXTE d'un écran monté et
 * échoue sur ce qu'un humain n'a pas à lire :
 *
 * - un ObjectId (24 hexadécimaux), hors d'un `[data-admin-technical-id]` — la
 *   seule ligne où un identifiant a le droit d'être écrit ;
 * - un horodatage ISO brut (`2026-09-30T14:03…`) ;
 * - `true` / `false` seuls dans leur nœud ;
 * - une énumération brute : `BIGBOSS`, `DRAFT`, `under_review`…
 *
 * Elle ne lit PAS les attributs : `data-admin-raw`, `data-admin-row`,
 * `href` portent des identifiants et des codes par construction — ce sont des
 * ancres de test et d'adresse, jamais du texte lu.
 */
const OBJECT_ID = /\b[0-9a-f]{24}\b/;
const ISO_INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const RAW_ENUMERATIONS: ReadonlySet<string> = new Set([
  'BIGBOSS',
  'MODERATOR',
  'AUDIT',
  'ANALYST',
  'DRAFT',
  'TRANSLATING',
  'READY',
  'SENDING',
  'SENT',
  'FAILED',
  'PUBLIC',
  'FRIENDS',
  'PRIVATE',
  'EXCEPT',
  'REEL',
  'STORY',
  'STATUS',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
  'SUCCESS',
  'BLOCKED',
  'CLOSED',
  'HALF_OPEN',
  'CONVERSATION',
  'PROFILE',
  'EXTERNAL',
  'under_review',
  'hate_speech',
  'fake_profile',
  'warning_sent',
  'content_removed',
  'user_suspended',
  'user_banned',
]);

function textNodesOutsideTechnicalIds(host: Element): readonly string[] {
  const texts: string[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent === null || parent.closest('[data-admin-technical-id]') !== null) continue;
    if (parent.closest('script, style') !== null) continue;
    const text = node.textContent?.trim() ?? '';
    if (text !== '') texts.push(text);
  }
  return texts;
}

export function expectNoRawIdentifiers(host: Element): void {
  const texts = textNodesOutsideTechnicalIds(host);
  const offenders = texts.flatMap((text) => {
    const problems: string[] = [];
    if (OBJECT_ID.test(text)) problems.push(`identifiant brut : « ${text} »`);
    if (ISO_INSTANT.test(text)) problems.push(`horodatage ISO brut : « ${text} »`);
    if (text === 'true' || text === 'false') problems.push(`booléen brut : « ${text} »`);
    const raw = text.split(/[^A-Za-z_]+/).find((token) => RAW_ENUMERATIONS.has(token));
    if (raw !== undefined) problems.push(`énumération brute « ${raw} » dans « ${text} »`);
    return problems;
  });
  expect(offenders).toEqual([]);
}

export type AdminIdentityFixture = { readonly role: string; readonly permissions: AdminPermissions };

const NONE: AdminPermissions = {
  canAccessAdmin: false,
  canManageUsers: false,
  canManageGroups: false,
  canManageConversations: false,
  canViewAnalytics: false,
  canModerateContent: false,
  canViewAuditLogs: false,
  canManageNotifications: false,
  canManageTranslations: false,
  canManageAgent: false,
};

const ALL: AdminPermissions = {
  canAccessAdmin: true,
  canManageUsers: true,
  canManageGroups: true,
  canManageConversations: true,
  canViewAnalytics: true,
  canModerateContent: true,
  canViewAuditLogs: true,
  canManageNotifications: true,
  canManageTranslations: true,
  canManageAgent: true,
};

/**
 * La matrice SERVIE par rôle — le miroir de `servedUserPermissions`
 * (`services/gateway/src/services/admin/served-permissions.ts`) sur les dix clés.
 * BIGBOSS les porte toutes ; les autres rôles, celles que la matrice centrale
 * leur accorde (ADMIN n'a pas `canViewAuditLogs`, MODERATOR n'a pas le rang…).
 */
const BY_ROLE: Readonly<Record<string, AdminPermissions>> = {
  BIGBOSS: ALL,
  ADMIN: { ...ALL, canViewAuditLogs: false },
  MODERATOR: { ...NONE, canAccessAdmin: true, canManageGroups: true, canManageConversations: true, canModerateContent: true },
  AUDIT: { ...NONE, canAccessAdmin: true, canViewAnalytics: true, canViewAuditLogs: true },
  ANALYST: { ...NONE, canViewAnalytics: true },
  USER: NONE,
};

/**
 * Une identité de lecteur PRÊTE pour `appQueryClient.setQueryData(
 * ADMIN_PERMISSIONS_QUERY_KEY, …)` : le rôle et les DIX clés de la matrice.
 * `permissions` surcharge clé par clé — le cas d'un témoin qui retire UNE
 * capacité pour voir un bloc se masquer.
 */
export function adminIdentityFixture(params: {
  readonly role: string;
  readonly permissions?: Partial<AdminPermissions>;
}): AdminIdentityFixture {
  return { role: params.role, permissions: { ...(BY_ROLE[params.role] ?? NONE), ...params.permissions } };
}
