import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { asRecord } from './admin';
import { listOf, readAdmin, rowsOf, servedCount, servedText, type AdminReadParams } from './admin-overview';
import type { ApiResult } from './http';

/**
 * **LA FILE DE TRAVAIL, LES PERSONNES ET LE SYSTÈME** (#8876, § 4) — les
 * lectures du tableau de bord qui nomment quelqu'un ou quelque chose : les
 * signalements récents, les diffusions en cours, les derniers inscrits, les
 * classements, la santé de la plateforme, l'agent.
 *
 * ## Ce que ces décodeurs ne gardent PAS
 *
 * Un tableau de bord compte et nomme ; il ne lit pas. Aucun décodeur d'ici ne
 * porte le texte d'un message ou d'une publication signalés (`excerpt`), la
 * raison libre ni les notes d'un signalement, l'adresse d'un compte, l'identifiant
 * PUBLIC d'une conversation, le corps d'une diffusion. La lecture du contenu a
 * son chemin — la lecture souveraine, avec un motif écrit — et ce n'est pas
 * celui-ci.
 *
 * Les identifiants de ligne (`id`) sont gardés : ils ne servent qu'à bâtir le
 * lien vers la fiche, jamais un libellé.
 */

/** Ce qui sert à NOMMER une personne (`personLabel`) : jamais une adresse, jamais un rôle. */
export type AdminPersonName = {
  readonly displayName: string | null;
  readonly username: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
};

/** Un acteur servi `{ id, username, displayName, avatar }`, réduit à son nom ; `null` si la charge n'en est pas un. */
export function decodePersonName(raw: unknown): AdminPersonName | null {
  const person = asRecord(raw);
  if (person === null || Array.isArray(raw)) return null;
  return {
    displayName: servedText(person.displayName),
    username: servedText(person.username),
    firstName: servedText(person.firstName),
    lastName: servedText(person.lastName),
  };
}

const NOBODY: AdminPersonName = { displayName: null, username: null, firstName: null, lastName: null };

const nameOf = (row: Readonly<Record<string, unknown>>): AdminPersonName => decodePersonName(row) ?? NOBODY;

// ---------------------------------------------------------------------------
// À traiter — signalements
// ---------------------------------------------------------------------------

export type AdminReportsQueue = {
  readonly pending: number | null;
  readonly underReview: number | null;
  /** En HEURES, hors dossiers classés sans suite (la passerelle ne compte que résolus et rejetés). */
  readonly averageResolutionHours: number | null;
};

export function decodeAdminReportsQueue(raw: unknown): AdminReportsQueue | null {
  const stats = asRecord(raw);
  if (stats === null || Array.isArray(raw)) return null;
  return {
    pending: servedCount(stats.pendingReports),
    underReview: servedCount(stats.underReviewReports),
    averageResolutionHours: servedCount(stats.averageResolutionTimeHours),
  };
}

export const loadAdminReportsQueue = (params: AdminReadParams): Promise<ApiResult<AdminReportsQueue>> =>
  readAdmin(params, adminEndpoints.reportsStats, decodeAdminReportsQueue);

export type AdminRecentReport = {
  readonly id: string;
  readonly reportType: string | null;
  readonly status: string | null;
  readonly createdAt: string | null;
  readonly entity: {
    readonly kind: string | null;
    readonly label: string | null;
    readonly owner: AdminPersonName | null;
    readonly deleted: boolean;
  } | null;
};

function decodeRecentReport(raw: unknown): AdminRecentReport | null {
  const report = asRecord(raw);
  const id = servedText(report?.id);
  if (report === null || id === null) return null;

  const entity = asRecord(report.reportedEntity);
  return {
    id,
    reportType: servedText(report.reportType),
    status: servedText(report.status),
    createdAt: servedText(report.createdAt),
    entity:
      entity === null
        ? null
        : {
            kind: servedText(entity.type),
            label: servedText(entity.label),
            owner: decodePersonName(entity.owner),
            deleted: entity.deleted === true,
          },
  };
}

export function decodeAdminRecentReports(raw: unknown): readonly AdminRecentReport[] | null {
  return Array.isArray(raw) ? rowsOf(raw, decodeRecentReport) : null;
}

export const loadAdminRecentReports = (params: AdminReadParams): Promise<ApiResult<readonly AdminRecentReport[]>> =>
  readAdmin(params, `${adminEndpoints.reportsRecent}?limit=5`, decodeAdminRecentReports);

// ---------------------------------------------------------------------------
// À traiter — diffusions en cours
// ---------------------------------------------------------------------------

export type AdminSendingBroadcast = {
  readonly id: string;
  readonly name: string | null;
  readonly subject: string | null;
  readonly totalRecipients: number;
  readonly sentCount: number;
  readonly failedCount: number;
};

export type AdminSendingBroadcasts = { readonly rows: readonly AdminSendingBroadcast[]; readonly total: number };

function decodeSendingBroadcast(raw: unknown): AdminSendingBroadcast | null {
  const row = asRecord(raw);
  const id = servedText(row?.id);
  if (row === null || id === null) return null;
  return {
    id,
    name: servedText(row.name),
    subject: servedText(row.subject),
    /* Une PROGRESSION part de zéro : un compteur illisible n'y fabrique pas une mesure, il laisse la barre vide. */
    totalRecipients: servedCount(row.totalRecipients) ?? 0,
    sentCount: servedCount(row.sentCount) ?? 0,
    failedCount: servedCount(row.failedCount) ?? 0,
  };
}

export function decodeAdminSendingBroadcasts(raw: unknown): AdminSendingBroadcasts | null {
  const payload = asRecord(raw);
  if (payload === null || !Array.isArray(payload.broadcasts)) return null;
  const rows = rowsOf(payload.broadcasts, decodeSendingBroadcast);
  return { rows, total: servedCount(asRecord(payload.pagination)?.total) ?? rows.length };
}

export const loadAdminSendingBroadcasts = (params: AdminReadParams): Promise<ApiResult<AdminSendingBroadcasts>> =>
  readAdmin(params, `${adminEndpoints.broadcasts}?status=SENDING&limit=5`, decodeAdminSendingBroadcasts);

// ---------------------------------------------------------------------------
// Personnes et échanges
// ---------------------------------------------------------------------------

export type AdminRecentMember = AdminPersonName & {
  readonly id: string;
  readonly avatar: string | null;
  readonly createdAt: string | null;
};

function decodeRecentMember(raw: unknown): AdminRecentMember | null {
  const row = asRecord(raw);
  const id = servedText(row?.id);
  if (row === null || id === null) return null;
  return { id, ...nameOf(row), avatar: servedText(row.avatar), createdAt: servedText(row.createdAt) };
}

export function decodeAdminRecentMembers(raw: unknown): readonly AdminRecentMember[] | null {
  const payload = asRecord(raw);
  return payload !== null && Array.isArray(payload.users) ? rowsOf(payload.users, decodeRecentMember) : null;
}

export const loadAdminRecentMembers = (params: AdminReadParams): Promise<ApiResult<readonly AdminRecentMember[]>> =>
  readAdmin(params, `${adminEndpoints.users}?sortBy=createdAt&sortOrder=desc&limit=5`, decodeAdminRecentMembers);

export type AdminRankedConversation = {
  readonly id: string;
  readonly title: string | null;
  readonly type: string | null;
  readonly count: number;
};

/** Le titre que la passerelle replie sur l'identifiant public, ou sur son propre « Sans titre », n'est pas un titre. */
const SERVED_UNTITLED = 'Sans titre';

function decodeRankedConversation(raw: unknown): AdminRankedConversation | null {
  const row = asRecord(raw);
  const id = servedText(row?.id);
  const count = servedCount(row?.count);
  if (row === null || id === null || count === null) return null;

  const title = servedText(row.title);
  const real = title !== null && title !== servedText(row.identifier) && title !== SERVED_UNTITLED;
  return { id, title: real ? title : null, type: servedText(row.type), count };
}

function rankingsOf(raw: unknown): readonly unknown[] | null {
  const payload = asRecord(raw);
  return payload !== null && Array.isArray(payload.rankings) ? listOf(payload.rankings) : null;
}

export function decodeAdminRankedConversations(raw: unknown): readonly AdminRankedConversation[] | null {
  const rankings = rankingsOf(raw);
  return rankings === null ? null : rowsOf(rankings, decodeRankedConversation);
}

export const loadAdminRankedConversations = (params: AdminReadParams): Promise<ApiResult<readonly AdminRankedConversation[]>> =>
  readAdmin(
    params,
    `${adminEndpoints.ranking}?entityType=conversations&criterion=message_count&period=7d&limit=5`,
    decodeAdminRankedConversations,
  );

export type AdminRankedMember = AdminPersonName & { readonly id: string; readonly count: number };

/** Le pseudo que la passerelle pose quand le compte a disparu : ce n'est le nom de personne. */
const SERVED_UNKNOWN_USER = 'Unknown';

function decodeRankedMember(raw: unknown): AdminRankedMember | null {
  const row = asRecord(raw);
  const id = servedText(row?.id);
  const count = servedCount(row?.count);
  if (row === null || id === null || count === null) return null;

  const name = nameOf(row);
  return { id, ...name, username: name.username === SERVED_UNKNOWN_USER ? null : name.username, count };
}

export function decodeAdminRankedMembers(raw: unknown): readonly AdminRankedMember[] | null {
  const rankings = rankingsOf(raw);
  return rankings === null ? null : rowsOf(rankings, decodeRankedMember);
}

export const loadAdminRankedMembers = (params: AdminReadParams): Promise<ApiResult<readonly AdminRankedMember[]>> =>
  readAdmin(
    params,
    `${adminEndpoints.ranking}?entityType=users&criterion=messages_sent&period=7d&limit=5`,
    decodeAdminRankedMembers,
  );

// ---------------------------------------------------------------------------
// Système
// ---------------------------------------------------------------------------

export type AdminDependencyHealth = { readonly status: string | null; readonly latencyMs: number | null };

export type AdminMonitoring = {
  readonly database: AdminDependencyHealth;
  readonly redis: AdminDependencyHealth;
  readonly connections: number | null;
  readonly connectedUsers: number | null;
  readonly breakers: readonly { readonly name: string; readonly state: string | null }[];
};

/** Une dépendance que la charge ne mentionne pas est INCONNUE : jamais « en service » par défaut. */
const decodeDependency = (raw: unknown): AdminDependencyHealth => {
  const dependency = asRecord(raw);
  return { status: servedText(dependency?.status), latencyMs: servedCount(dependency?.latencyMs) };
};

function decodeBreaker(raw: unknown): { readonly name: string; readonly state: string | null } | null {
  const breaker = asRecord(raw);
  const name = servedText(breaker?.name);
  return name === null ? null : { name, state: servedText(breaker?.state) };
}

export function decodeAdminMonitoring(raw: unknown): AdminMonitoring | null {
  const payload = asRecord(raw);
  if (payload === null || Array.isArray(raw)) return null;
  const realtime = asRecord(payload.realtime);
  return {
    database: decodeDependency(payload.database),
    redis: decodeDependency(payload.redis),
    connections: servedCount(realtime?.connections),
    connectedUsers: servedCount(realtime?.connectedUsers),
    breakers: rowsOf(payload.circuitBreakers, decodeBreaker),
  };
}

export const loadAdminMonitoring = (params: AdminReadParams): Promise<ApiResult<AdminMonitoring>> =>
  readAdmin(params, adminEndpoints.monitoring, decodeAdminMonitoring);

export type AdminAgentDigest = {
  readonly totalConfigs: number | null;
  readonly activeConfigs: number | null;
  readonly messagesSent: number | null;
  readonly lastActivityAt: string | null;
};

export function decodeAdminAgentDigest(raw: unknown): AdminAgentDigest | null {
  const stats = asRecord(raw);
  if (stats === null || Array.isArray(raw)) return null;
  /* La passerelle sert `recentActivity` du plus récent au plus ancien : la première ligne porte la dernière activité. */
  const latest = asRecord(listOf(stats.recentActivity)[0]);
  return {
    totalConfigs: servedCount(stats.totalConfigs),
    activeConfigs: servedCount(stats.activeConfigs),
    messagesSent: servedCount(stats.totalMessagesSent),
    lastActivityAt: servedText(latest?.lastResponseAt),
  };
}

export const loadAdminAgentDigest = (params: AdminReadParams): Promise<ApiResult<AdminAgentDigest>> =>
  readAdmin(params, adminEndpoints.agentStats, decodeAdminAgentDigest);
