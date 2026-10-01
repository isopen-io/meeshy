import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord, asText } from './admin';
import { adminPageOf, type AdminPage } from './admin-page';
import {
  acknowledged,
  decodeAdminLinkConversation,
  decodeAdminLinkPerson,
  instantOrNull,
  textOrNull,
  type AdminLinkAck,
  type AdminLinkConversation,
  type AdminLinkPerson,
} from './admin-share-links-person';
import type { ApiResult } from './http';

/**
 * **LES LIENS DE SUIVI** (#8876, #6729) — `GET|PATCH /admin/tracking-links*`.
 *
 * Ces routes sont servies SOUS `/admin` : celles du partageur (`/tracking-links`)
 * sont hors de la zone que le service worker refuse de mettre en cache, et celles
 * qui lisent un jeton (`adminAll`, `adminByTokenClicks`) ne passent JAMAIS par ici.
 * Lecture : `canViewAnalytics` ; écriture : le rang d'administration en plus (un
 * auditeur voit les campagnes, il n'en ferme pas).
 *
 * ## Ce que ce décodeur ne lit JAMAIS
 *
 * Une ligne de clic porte une quarantaine de colonnes : l'adresse IP du visiteur,
 * son user-agent, son empreinte d'appareil, sa télémétrie. La passerelle n'en sert
 * que dix, et ce décodeur n'en garde que ces dix — **aucune IP, aucun user-agent,
 * aucune empreinte**. Le `token` (la clé publique de la redirection) n'est pas
 * décodé non plus : l'adresse courte le porte déjà, et aucun écran ne l'affiche à
 * part.
 *
 * Champ par champ, **jamais un spread**.
 */
export type AdminTrackingTarget = {
  readonly type: string;
  readonly id: string;
  /** Le nom résolu de la cible (auteur d'une publication, titre d'une conversation, nom d'un profil) ; `null` quand elle a disparu. */
  readonly label: string | null;
};

export type AdminTrackingLinkRow = {
  readonly id: string;
  readonly name: string | null;
  readonly campaign: string | null;
  readonly source: string | null;
  readonly medium: string | null;
  readonly originalUrl: string;
  readonly shortUrl: string;
  readonly targetType: string;
  readonly target: AdminTrackingTarget | null;
  readonly conversation: AdminLinkConversation | null;
  readonly creator: AdminLinkPerson | null;
  readonly totalClicks: number;
  readonly uniqueClicks: number;
  readonly isActive: boolean;
  readonly expiresAt: string | null;
  readonly lastClickedAt: string | null;
  readonly createdAt: string | null;
};

export type AdminTrackingBucket = { readonly key: string; readonly count: number };

export type AdminTrackingReferrer = { readonly referrer: string; readonly count: number };

export type AdminTrackingDay = { readonly date: string; readonly count: number };

export type AdminTrackingStats = {
  readonly confirmedClicks: number;
  readonly clicksByDate: readonly AdminTrackingDay[];
  readonly byCountry: readonly AdminTrackingBucket[];
  readonly byDevice: readonly AdminTrackingBucket[];
  readonly byBrowser: readonly AdminTrackingBucket[];
  readonly byOs: readonly AdminTrackingBucket[];
  readonly bySocialSource: readonly AdminTrackingBucket[];
  readonly byRedirectStatus: readonly AdminTrackingBucket[];
  readonly topReferrers: readonly AdminTrackingReferrer[];
};

export type AdminTrackingClick = {
  readonly id: string;
  readonly country: string | null;
  readonly city: string | null;
  readonly device: string | null;
  readonly browser: string | null;
  readonly os: string | null;
  readonly referrer: string | null;
  readonly socialSource: string | null;
  readonly redirectStatus: string | null;
  readonly clickedAt: string | null;
};

export type AdminTrackingLink = AdminTrackingLinkRow & {
  readonly stats: AdminTrackingStats;
  readonly recentClicks: readonly AdminTrackingClick[];
};

function decodeTarget(raw: unknown): AdminTrackingTarget | null {
  const target = asRecord(raw);
  if (target === null || typeof target.type !== 'string' || typeof target.id !== 'string' || target.id === '') return null;
  return { type: target.type, id: target.id, label: textOrNull(target.label) };
}

export function decodeAdminTrackingLinkRow(raw: unknown): AdminTrackingLinkRow | null {
  const link = asRecord(raw);
  if (link === null || typeof link.id !== 'string' || link.id === '') return null;
  return {
    id: link.id,
    name: textOrNull(link.name),
    campaign: textOrNull(link.campaign),
    source: textOrNull(link.source),
    medium: textOrNull(link.medium),
    originalUrl: asText(link.originalUrl),
    shortUrl: asText(link.shortUrl),
    targetType: asText(link.targetType),
    target: decodeTarget(link.target),
    conversation: decodeAdminLinkConversation(link.conversation),
    creator: decodeAdminLinkPerson(link.creator),
    totalClicks: asCount(link.totalClicks),
    uniqueClicks: asCount(link.uniqueClicks),
    isActive: link.isActive !== false,
    expiresAt: instantOrNull(link.expiresAt),
    lastClickedAt: instantOrNull(link.lastClickedAt),
    createdAt: instantOrNull(link.createdAt),
  };
}

const rowsOf = <T>(raw: unknown, decode: (entry: unknown) => T | null): readonly T[] =>
  (Array.isArray(raw) ? raw : []).flatMap((entry) => {
    const decoded = decode(entry);
    return decoded === null ? [] : [decoded];
  });

const decodeBucket = (raw: unknown): AdminTrackingBucket | null => {
  const bucket = asRecord(raw);
  if (bucket === null || typeof bucket.key !== 'string') return null;
  return { key: bucket.key, count: asCount(bucket.count) };
};

const decodeReferrer = (raw: unknown): AdminTrackingReferrer | null => {
  const referrer = asRecord(raw);
  if (referrer === null || typeof referrer.referrer !== 'string' || referrer.referrer.trim() === '') return null;
  return { referrer: referrer.referrer.trim(), count: asCount(referrer.count) };
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Un jour qui n'est pas `AAAA-MM-JJ` est ÉCARTÉ : un point à un jour inventé fausserait la courbe. */
const decodeDay = (raw: unknown): AdminTrackingDay | null => {
  const day = asRecord(raw);
  if (day === null || typeof day.date !== 'string' || !DAY.test(day.date)) return null;
  return { date: day.date, count: asCount(day.count) };
};

export function decodeAdminTrackingStats(raw: unknown): AdminTrackingStats {
  const stats = asRecord(raw) ?? {};
  return {
    confirmedClicks: asCount(stats.confirmedClicks),
    clicksByDate: rowsOf(stats.clicksByDate, decodeDay),
    byCountry: rowsOf(stats.byCountry, decodeBucket),
    byDevice: rowsOf(stats.byDevice, decodeBucket),
    byBrowser: rowsOf(stats.byBrowser, decodeBucket),
    byOs: rowsOf(stats.byOs, decodeBucket),
    bySocialSource: rowsOf(stats.bySocialSource, decodeBucket),
    byRedirectStatus: rowsOf(stats.byRedirectStatus, decodeBucket),
    topReferrers: rowsOf(stats.topReferrers, decodeReferrer),
  };
}

function decodeClick(raw: unknown): AdminTrackingClick | null {
  const click = asRecord(raw);
  if (click === null || typeof click.id !== 'string' || click.id === '') return null;
  return {
    id: click.id,
    country: textOrNull(click.country),
    city: textOrNull(click.city),
    device: textOrNull(click.device),
    browser: textOrNull(click.browser),
    os: textOrNull(click.os),
    referrer: textOrNull(click.referrer),
    socialSource: textOrNull(click.socialSource),
    redirectStatus: textOrNull(click.redirectStatus),
    clickedAt: instantOrNull(click.clickedAt),
  };
}

export function decodeAdminTrackingLink(raw: unknown): AdminTrackingLink | null {
  const row = decodeAdminTrackingLinkRow(raw);
  const link = asRecord(raw);
  if (row === null || link === null) return null;
  return { ...row, stats: decodeAdminTrackingStats(link.stats), recentClicks: rowsOf(link.recentClicks, decodeClick) };
}

const UNREADABLE = { ok: false, status: 502, error: 'Charge illisible' } as const;

export async function loadAdminTrackingLinks(
  params: AdminDeps & { readonly query: URLSearchParams; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPage<AdminTrackingLinkRow>>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.trackingLinks}?${params.query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return adminPageOf(result, decodeAdminTrackingLinkRow, { kind: 'top' });
}

export async function loadAdminTrackingLink(
  params: AdminDeps & { readonly linkId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminTrackingLink>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.trackingLinksByLinkId(params.linkId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const link = decodeAdminTrackingLink(result.data);
  if (link === null) return UNREADABLE;
  return { ok: true, data: link, ...(result.status === undefined ? {} : { status: result.status }) };
}

/**
 * **DÉSACTIVER / RÉACTIVER** — `PATCH { isActive, reason? }`. Le motif (3 à 500
 * caractères) est facultatif : absent, le corps ne le porte pas. Un simple accusé,
 * la vérité se relit par invalidation.
 */
export async function setAdminTrackingLinkActive(
  params: AdminDeps & { readonly linkId: string; readonly isActive: boolean; readonly reason: string | null },
): Promise<ApiResult<AdminLinkAck>> {
  return acknowledged(
    await params.transport.request<unknown>({
      method: 'PATCH',
      path: adminEndpoints.trackingLinksByLinkId(params.linkId),
      body: { isActive: params.isActive, ...(params.reason === null || params.reason === '' ? {} : { reason: params.reason }) },
    }),
  );
}

/** LES CLÉS DE REQUÊTE — sous `['admin', 'tracking']` : jamais écrites sur le disque (`estClefNonPersistable`). */
export const ADMIN_TRACKING_LINKS_KEY = ['admin', 'tracking'] as const;
export const adminTrackingLinksListKey = (address: string) => ['admin', 'tracking', 'list', address] as const;
export const adminTrackingLinkKey = (linkId: string) => ['admin', 'tracking', 'one', linkId] as const;
