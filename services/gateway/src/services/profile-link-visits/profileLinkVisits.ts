/**
 * LES VISITES DE MON LIEN DE PROFIL (#19206, chantier #18857) — le site UNIQUE qui les compte,
 * les lit, les exporte et les efface.
 *
 * ## Ce qui compte
 *
 * L'ouverture d'une fiche par une porte publique (`/directory/people/:handle`, où `/@pseudo`
 * redirige, et `/u/:username`) par un AUTRE que son propriétaire, depuis un navigateur ou une
 * application — jamais par un robot d'aperçu (`isPreviewRobot`).
 *
 * ## Ce qui se garde : un agrégat, rien d'autre
 *
 * Une ligne `ProfileLinkVisitDay` par propriétaire et par jour UTC, incrémentée ATOMIQUEMENT
 * sans lecture (`increment`, reprise en incrément sur `P2002`). Aucune IP, aucun identifiant de
 * visiteur, aucune ville : ni en base, ni dans la clé de dédoublonnage.
 *
 * ## Le dédoublonnage, grossier et sans mémoire
 *
 * Une même personne qui rouvre la fiche dans la demi-heure ne compte qu'une fois. La clé Redis
 * est un HMAC (secret `READER_KEY_HMAC_SECRET`) du JOUR, du propriétaire et du visiteur (son
 * compte, ou son adresse et son agent s'il n'en a pas) ; elle meurt en trente minutes et change
 * chaque jour, si bien qu'elle ne relie rien d'une fenêtre à l'autre. Sans Redis, chaque
 * ouverture compte.
 *
 * ## Jamais le chemin critique
 *
 * `noteProfileLinkVisit` est FIRE-AND-FORGET : la fiche part sans attendre le compte, et un
 * échec est journalisé, jamais remonté.
 */
import { createHmac } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { addUtcDays, utcDayKey, utcDayStart } from '@meeshy/shared/utils/iso-week';
import {
  PROFILE_LINK_VISIT_RETENTION_DAYS,
  profileLinkVisitStats,
  profileLinkVisitWindowStart,
  type ProfileLinkVisitPoint,
  type ProfileLinkVisitStats,
} from '@meeshy/shared/utils/profile-link-visits';
import { readerKeySecret } from '../posts/readerKey';
import { profileViewerId } from '../../routes/users/profile-block-gate';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { isPreviewRobot } from './previewRobots';

const logger = enhancedLogger.child({ module: 'ProfileLinkVisits' });

/** La fenêtre du dédoublonnage : une même personne ne compte qu'une fois par demi-heure. */
export const PROFILE_LINK_VISIT_DEDUP_SECONDS = 1800;

const MAX_ATTEMPTS = 3;

type VisitDayKey = { readonly userId: string; readonly day: Date };

export interface ProfileLinkVisitDb {
  readonly profileLinkVisitDay: {
    update(args: { where: { userId_day: VisitDayKey }; data: { visits: { increment: number } } }): PromiseLike<unknown>;
    create(args: { data: VisitDayKey & { visits: number; expiresAt: Date } }): PromiseLike<unknown>;
  };
}

export interface VisitSeenStore {
  set(key: string, value: string, ex: 'EX', seconds: number, nx: 'NX'): Promise<'OK' | null>;
}

export type ProfileLinkVisit = {
  readonly ownerId: string;
  readonly viewerId?: string;
  readonly ip: string;
  readonly userAgent?: string;
  readonly at: Date;
};

export type ProfileLinkVisitDeps = {
  readonly db: ProfileLinkVisitDb;
  readonly seen: VisitSeenStore | null;
  readonly secret?: string;
};

const errorCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;

export async function recordProfileLinkVisit(
  db: ProfileLinkVisitDb,
  { ownerId, at }: { readonly ownerId: string; readonly at: Date },
): Promise<void> {
  const day = utcDayStart(at);
  const key: VisitDayKey = { userId: ownerId, day };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      await db.profileLinkVisitDay.update({ where: { userId_day: key }, data: { visits: { increment: 1 } } });
      return;
    } catch (error) {
      if (errorCode(error) !== 'P2025') throw error;
    }
    try {
      await db.profileLinkVisitDay.create({
        data: { ...key, visits: 1, expiresAt: addUtcDays(day, PROFILE_LINK_VISIT_RETENTION_DAYS) },
      });
      return;
    } catch (error) {
      if (errorCode(error) !== 'P2002') throw error;
    }
  }
  throw new Error('recordProfileLinkVisit: la ligne du jour change sans cesse, abandon après plusieurs reprises');
}

function seenKey(visit: ProfileLinkVisit, secret: string): string {
  const visitor = visit.viewerId ? `account:${visit.viewerId}` : `client:${visit.ip}|${visit.userAgent ?? ''}`;
  const digest = createHmac('sha256', secret)
    .update(`profile-link-visit:${utcDayKey(visit.at)}:${visit.ownerId}:${visitor}`)
    .digest('hex');
  return `profile-link-visit:seen:${digest}`;
}

async function alreadySeen(deps: ProfileLinkVisitDeps, visit: ProfileLinkVisit): Promise<boolean> {
  if (!deps.seen) return false;
  const placed = await deps.seen.set(seenKey(visit, deps.secret ?? readerKeySecret()), '1', 'EX', PROFILE_LINK_VISIT_DEDUP_SECONDS, 'NX');
  return placed === null;
}

export async function countProfileLinkVisit(
  deps: ProfileLinkVisitDeps,
  visit: ProfileLinkVisit,
): Promise<'counted' | 'ignored'> {
  if (!visit.ownerId || visit.viewerId === visit.ownerId || isPreviewRobot(visit.userAgent)) return 'ignored';
  if (await alreadySeen(deps, visit)) return 'ignored';
  await recordProfileLinkVisit(deps.db, { ownerId: visit.ownerId, at: visit.at });
  return 'counted';
}

/** Le point d'entrée des portes de la fiche : rien à attendre, rien qui jette. */
export function noteProfileLinkVisit(fastify: FastifyInstance, request: FastifyRequest, ownerId: string): void {
  const userAgent = request.headers['user-agent'];
  const deps: ProfileLinkVisitDeps = {
    db: fastify.prisma as unknown as ProfileLinkVisitDb,
    seen: (fastify.redis as unknown as VisitSeenStore | null | undefined) ?? null,
  };
  const visit: ProfileLinkVisit = {
    ownerId,
    viewerId: profileViewerId(request),
    ip: request.ip,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    at: new Date(),
  };
  Promise.resolve()
    .then(() => countProfileLinkVisit(deps, visit))
    .catch((error: unknown) => logger.warn('profile link visit not counted', { error }));
}

type VisitReadDb = Pick<PrismaClient, 'profileLinkVisitDay'>;

export async function readProfileLinkVisitStats(db: VisitReadDb, ownerId: string, now: Date): Promise<ProfileLinkVisitStats> {
  const rows = await db.profileLinkVisitDay.findMany({
    where: { userId: ownerId, day: { gte: profileLinkVisitWindowStart(now) } },
    select: { day: true, visits: true },
    orderBy: { day: 'asc' },
    take: PROFILE_LINK_VISIT_RETENTION_DAYS,
  });
  return profileLinkVisitStats(rows, now);
}

export async function exportProfileLinkVisitsOf(db: VisitReadDb, ownerId: string): Promise<ProfileLinkVisitPoint[]> {
  const rows = await db.profileLinkVisitDay.findMany({
    where: { userId: ownerId },
    select: { day: true, visits: true },
    orderBy: { day: 'asc' },
    take: PROFILE_LINK_VISIT_RETENTION_DAYS * 2,
  });
  return rows.map((row) => ({ day: utcDayKey(row.day), visits: row.visits }));
}

export async function eraseProfileLinkVisitsOf(db: VisitReadDb, ownerId: string): Promise<number> {
  const { count } = await db.profileLinkVisitDay.deleteMany({ where: { userId: ownerId } });
  return count;
}
