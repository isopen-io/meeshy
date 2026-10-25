/**
 * LE SEED DE RECETTE DU PUSH PHOTO (#10175, L19 — `docs/product/cadres-de-gloire/PROMPT-developpement.md` § 7) :
 * amène un compte de recette de STAGING à une étape de Flamme photographiable, comme le jeu l'y amènerait en
 * trente jours, pour prouver qu'une étape franchie app fermée arrive en UNE notification.
 *
 * Trois temps, dans cet ordre :
 *  1. **la détection** du compte (`GamePhotoMomentService.detect`) : elle pose la ligne de base sur la situation
 *     d'AVANT le seed quand elle manque, sans quoi l'étape portée au point 2 serait absorbée par la ligne de base
 *     et jamais annoncée ;
 *  2. **la Flamme** : série courante et record portés au seuil, dernier jour actif = AUJOURD'HUI dans le fuseau du
 *     compte, au marqueur que le jeu écrit lui-même (`markerOfDayKey`, minuit UTC de la clé du jour local) — l'instant
 *     brut placerait, à l'ouest d'UTC le soir, le dernier jour actif au lendemain du jour local ;
 *  3. **la marque** « à évaluer » dans l'ensemble Redis que vide le job (`PhotoMomentMarks`).
 *
 * **La garde est fail-closed** : la base doit être celle du staging (hôte `database-staging`, et lui seul), et
 * Redis aussi (`redis-staging`) — une marque posée dans l'ensemble en mémoire d'un processus de script ne serait
 * jamais lue par le job. Toute URL illisible, absente, SRV, ou qui mêle un autre hôte est refusée. La façade
 * (`scripts/game-photo-staging-seed.ts`) teste la garde AVANT d'ouvrir la moindre connexion.
 */

import { dayKeyOf, markerOfDayKey } from './gameClock';
import type { PhotoMomentMarks } from './PhotoMomentMarks';
import { PHOTO_FLAME_THRESHOLDS } from '@meeshy/shared/utils/game/photo-catch-up';

export const STAGING_DATABASE_HOSTS: readonly string[] = ['database-staging'];
export const STAGING_REDIS_HOSTS: readonly string[] = ['redis-staging'];

export type StagingGuard =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'database-url-missing' | 'database-not-staging' | 'redis-url-missing' | 'redis-not-staging' };

/** Les hôtes d'une URL `mongodb://` ou `redis://` (identifiants et ports retirés) ; `null` si elle est illisible. */
function hostsOf(url: string, schemes: readonly string[]): readonly string[] | null {
  const match = /^([a-z+]+):\/\/([^/?#]*)/i.exec(url.trim());
  if (match === null || !schemes.includes(match[1].toLowerCase())) return null;
  const authority = match[2];
  const hostList = authority.slice(authority.lastIndexOf('@') + 1);
  const hosts = hostList.split(',').map((entry) => entry.replace(/:\d+$/, '').trim().toLowerCase());
  return hosts.length === 0 || hosts.some((host) => host === '') ? null : hosts;
}

const onlyAmong = (hosts: readonly string[] | null, allowed: readonly string[]): boolean =>
  hosts !== null && hosts.every((host) => allowed.includes(host));

export function stagingSeedGuard(env: Readonly<Record<string, string | undefined>>): StagingGuard {
  const database = env.DATABASE_URL?.trim() ?? '';
  if (database === '') return { ok: false, reason: 'database-url-missing' };
  if (!onlyAmong(hostsOf(database, ['mongodb']), STAGING_DATABASE_HOSTS)) return { ok: false, reason: 'database-not-staging' };
  const redis = env.REDIS_URL?.trim() ?? '';
  if (redis === '') return { ok: false, reason: 'redis-url-missing' };
  if (!onlyAmong(hostsOf(redis, ['redis']), STAGING_REDIS_HOSTS)) return { ok: false, reason: 'redis-not-staging' };
  return { ok: true };
}

export type PhotoSeedArgs =
  | { readonly ok: true; readonly userId: string; readonly flameDays: number }
  | { readonly ok: false; readonly reason: 'user-missing' | 'user-invalid' | 'flame-invalid' };

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const FLAME_DAYS: readonly number[] = PHOTO_FLAME_THRESHOLDS;

const flagValue = (argv: readonly string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  return index < 0 ? undefined : argv[index + 1];
};

export function parsePhotoSeedArgs(argv: readonly string[]): PhotoSeedArgs {
  const userId = flagValue(argv, '--user');
  if (userId === undefined) return { ok: false, reason: 'user-missing' };
  if (!OBJECT_ID.test(userId)) return { ok: false, reason: 'user-invalid' };
  const flame = flagValue(argv, '--flame') ?? '';
  const flameDays = /^\d+$/.test(flame) ? Number(flame) : Number.NaN;
  if (!FLAME_DAYS.includes(flameDays)) return { ok: false, reason: 'flame-invalid' };
  return { ok: true, userId, flameDays };
}

type SeedUserRow = {
  readonly isActive: boolean | null;
  readonly deletedAt: Date | null;
  readonly longestStreakDays: number | null;
  readonly timezone: string | null;
};

export type PhotoSeedDeps = {
  readonly users: {
    findUnique(args: { where: { id: string }; select: { isActive: true; deletedAt: true; longestStreakDays: true; timezone: true } }): Promise<SeedUserRow | null>;
    update(args: { where: { id: string }; data: { currentStreakDays: number; longestStreakDays: number; lastStreakDate: Date }; select: { id: true } }): Promise<unknown>;
  };
  /** La détection même du job : pose la ligne de base sur la situation d'avant le seed. */
  readonly detect: (userId: string, now: Date) => Promise<unknown>;
  readonly marks: Pick<PhotoMomentMarks, 'mark'>;
};

export type PhotoSeedResult = 'seeded' | 'already-reached' | 'unknown-account';

export async function seedFlameStep(deps: PhotoSeedDeps, input: { readonly userId: string; readonly flameDays: number; readonly now: Date }): Promise<PhotoSeedResult> {
  const row = await deps.users.findUnique({ where: { id: input.userId }, select: { isActive: true, deletedAt: true, longestStreakDays: true, timezone: true } });
  if (row === null || row.isActive === false || row.deletedAt != null) return 'unknown-account';
  if ((row.longestStreakDays ?? 0) >= input.flameDays) return 'already-reached';
  await deps.detect(input.userId, input.now);
  await deps.users.update({
    where: { id: input.userId },
    data: { currentStreakDays: input.flameDays, longestStreakDays: input.flameDays, lastStreakDate: markerOfDayKey(dayKeyOf(input.now, row.timezone)) },
    select: { id: true },
  });
  await deps.marks.mark(input.userId);
  return 'seeded';
}
