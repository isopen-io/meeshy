/**
 * LE VERDICT DE LA SAUVEGARDE NOCTURNE, LU PAR LA PASSERELLE (#9668).
 *
 * Le script d'hôte (`infrastructure/scripts/production-backup/meeshy-nightly-backup.sh`,
 * #9665) écrit après CHAQUE exécution, réussie ou non, un `etat.json` dans un
 * dossier à part, monté en lecture seule dans la passerelle — qui ne voit
 * jamais les sauvegardes elles-mêmes.
 *
 * Ce fichier est une FRONTIÈRE DE CONFIANCE : il est validé par un schéma Zod à
 * chaque lecture. Absent, illisible, trop gros ou hors schéma, il vaut `null`
 * (« inconnu ») — la carte de supervision ne se dessine pas, et l'alerte
 * quotidienne le traite comme une sauvegarde qui n'a jamais publié. Le schéma
 * ne garde que ses clés : rien d'autre ne traverse, même si le script en
 * écrivait davantage.
 *
 * La sauvegarde part chaque nuit à minuit, heure de Paris ; le contrôle a lieu
 * chaque jour à 5 h, heure de Paris. Une sauvegarde réussie de plus de 26 h est
 * VIEILLIE : la passerelle surveille le script, pas l'inverse, et c'est ce qui
 * attrape une sauvegarde qui ne s'est jamais lancée.
 */
import { open } from 'node:fs/promises';
import { z } from 'zod';

export const BACKUP_STATUS_FILE_DEFAULT = '/backup-status/etat.json';
export const BACKUP_TIME_ZONE = 'Europe/Paris';
export const BACKUP_RUN_HOUR = 0;
export const BACKUP_CHECK_HOUR = 5;
export const BACKUP_STALE_AFTER_MS = 26 * 60 * 60 * 1000;

/** Un verdict tient en quelques centaines d'octets : au-delà, ce n'est pas un verdict. */
const MAX_VERDICT_BYTES = 64 * 1024;

const count = z.number().int().nonnegative();
const instant = z.iso.datetime({ offset: true });

const volumeSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/),
  bytes: count,
});

const lastSuccessSchema = z.object({
  documents: count,
  collections: count,
  mismatches: count,
  indexes: count,
  archiveBytes: count,
  durationSeconds: count,
  volumes: z.array(volumeSchema).max(32),
});

export const backupVerdictSchema = z.object({
  generatedAt: instant,
  status: z.enum(['ok', 'failed']),
  reason: z.string().max(500).nullable(),
  lastSuccessAt: instant.nullable(),
  lastSuccess: lastSuccessSchema.nullable(),
});

export type BackupVerdict = z.infer<typeof backupVerdictSchema>;
export type BackupLastSuccess = z.infer<typeof lastSuccessSchema>;

export function backupStatusFile(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env.BACKUP_STATUS_FILE?.trim();
  return configured ? configured : BACKUP_STATUS_FILE_DEFAULT;
}

export function parseBackupVerdict(raw: unknown): BackupVerdict | null {
  const parsed = backupVerdictSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Le verdict validé, ou `null` : aucune erreur de lecture ne remonte. */
export async function readBackupVerdict(file: string): Promise<BackupVerdict | null> {
  try {
    const handle = await open(file, 'r');
    try {
      const { size } = await handle.stat();
      if (size > MAX_VERDICT_BYTES) return null;
      return parseBackupVerdict(JSON.parse(await handle.readFile('utf8')));
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

const parisParts = new Intl.DateTimeFormat('en-US', {
  timeZone: BACKUP_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

type WallClock = { readonly year: number; readonly month: number; readonly day: number; readonly hour: number; readonly minute: number; readonly second: number };

function parisWallClock(instantMs: number): WallClock {
  const parts = Object.fromEntries(
    parisParts.formatToParts(new Date(instantMs)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

const parisOffsetMs = (instantMs: number): number => {
  const wall = parisWallClock(instantMs);
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return wallAsUtc - Math.floor(instantMs / 1000) * 1000;
};

/**
 * L'instant UTC où Paris affiche `hour:00` ce jour-là. Minuit et 5 h existent
 * une et une seule fois chaque jour (les changements d'heure ont lieu à 2 h et
 * 3 h) : deux raffinements du décalage suffisent.
 */
function parisInstant(year: number, month: number, day: number, hour: number): number {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour);
  const first = wallAsUtc - parisOffsetMs(wallAsUtc);
  return wallAsUtc - parisOffsetMs(first);
}

/** Le prochain `hour:00` à Paris, STRICTEMENT après `after`. */
export function nextParisTime(after: Date, hour: number): Date {
  const today = parisWallClock(after.getTime());
  const candidates = [0, 1, 2].map((offset) => {
    const civil = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    return parisInstant(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate(), hour);
  });
  return new Date(candidates.find((candidate) => candidate > after.getTime()) ?? candidates[2]);
}

const ageMs = (lastSuccessAt: string | null, now: Date): number | null =>
  lastSuccessAt === null ? null : now.getTime() - Date.parse(lastSuccessAt);

const isStale = (age: number | null): boolean => age === null || age > BACKUP_STALE_AFTER_MS;

export type BackupCard = {
  readonly status: BackupVerdict['status'];
  readonly checkedAt: string;
  readonly reason: string | null;
  readonly lastSuccessAt: string | null;
  readonly ageSeconds: number | null;
  readonly stale: boolean;
  readonly nextRunAt: string;
  readonly lastSuccess: BackupLastSuccess | null;
};

/** La carte servie par `GET /admin/monitoring` — `null` quand le verdict est inconnu. */
export function backupCardOf(verdict: BackupVerdict | null, now: Date): BackupCard | null {
  if (verdict === null) return null;
  const age = ageMs(verdict.lastSuccessAt, now);
  return {
    status: verdict.status,
    checkedAt: verdict.generatedAt,
    reason: verdict.reason,
    lastSuccessAt: verdict.lastSuccessAt,
    ageSeconds: age === null ? null : Math.max(0, Math.floor(age / 1000)),
    stale: isStale(age),
    nextRunAt: nextParisTime(now, BACKUP_RUN_HOUR).toISOString(),
    lastSuccess: verdict.lastSuccess,
  };
}

export type BackupIncidentKind = 'failed' | 'stale' | 'missing';

export type BackupAlert =
  | { readonly kind: 'healthy' }
  | {
      readonly kind: BackupIncidentKind;
      /** Un incident, un envoi : la clé ne change que lorsque l'incident change. */
      readonly incidentKey: string;
      readonly reason: string | null;
      readonly lastSuccessAt: string | null;
    };

/**
 * La règle d'alerte : le dernier verdict est un échec, OU la dernière
 * sauvegarde réussie a plus de 26 h, OU il n'y a aucun verdict.
 *
 * La clé d'un échec dérive du `generatedAt` de CE verdict (un nouvel échec, une
 * nouvelle nuit, est un nouvel incident) ; celle d'une sauvegarde vieillie, du
 * `lastSuccessAt` qui vieillit (elle reste la même tant que rien ne réussit).
 */
export function backupAlertOf(verdict: BackupVerdict | null, now: Date): BackupAlert {
  if (verdict === null) return { kind: 'missing', incidentKey: 'missing', reason: null, lastSuccessAt: null };
  if (verdict.status === 'failed') {
    return { kind: 'failed', incidentKey: `failed:${verdict.generatedAt}`, reason: verdict.reason, lastSuccessAt: verdict.lastSuccessAt };
  }
  if (isStale(ageMs(verdict.lastSuccessAt, now))) {
    return { kind: 'stale', incidentKey: `stale:${verdict.lastSuccessAt ?? 'never'}`, reason: null, lastSuccessAt: verdict.lastSuccessAt };
  }
  return { kind: 'healthy' };
}
