/**
 * LA MIGRATION DES MÉDIAS VERS LE SEAU, EN LIGNE DE COMMANDE (#11267).
 *
 * Sous `src/` pour être compilée dans l'image (le conteneur ne porte que `dist/`) :
 *
 *   node dist/src/services/storage/objects/mediaMirrorCli.js                 # à blanc : compte
 *   node dist/src/services/storage/objects/mediaMirrorCli.js --apply         # staging : recopie
 *   node dist/src/services/storage/objects/mediaMirrorCli.js --apply --follow  # miroir continu
 *
 * - À BLANC par défaut : rien n'est écrit, ni dans le seau ni dans l'état.
 * - `--apply` recopie. Hors staging (`MEESHY_ENV` ≠ `staging`), il exige
 *   `--porteur-approval=<lien du feu vert>` : une migration de données de
 *   production attend le porteur (#9232), précédée d'une sauvegarde vérifiée.
 * - REPRISE : le curseur (dernier identifiant traité) de chaque collection se
 *   garde après chaque lot dans `<UPLOAD_PATH>/.media-mirror/state.json`, un
 *   dossier caché que la route de fichiers ne sert jamais. `--reset` repart du début.
 * - `--follow` : le miroir continu des écrivains qui posent encore sur le disque
 *   seul. Il reprend au curseur, puis repasse chaque cycle sur les 24 dernières
 *   heures (vignettes, pistes TTS écrites APRÈS la ligne) ; la copie à la même
 *   taille est sautée, le repassage coûte des `HEAD`.
 *   En staging, ce miroir tourne DANS la passerelle (`jobs/media-mirror-follow.ts`,
 *   `MEDIA_S3_MIRROR_FOLLOW=on`) : aucun conteneur voisin ne monte les dépôts.
 * - `--sweep` : retire du seau les copies qu'aucune ligne vivante ne nomme plus
 *   (message purgé, compte effacé), plus vieilles que 24 h. C'est une PURGE :
 *   même régime que `--apply`, et il refuse (code 2) sur une base qui ne nomme
 *   rien ou s'il devait effacer plus de la moitié du seau. Sortie documentée de
 *   ce second refus (jauge `media_bucket_sweep_refused{reason="too-many-removals"}`
 *   à 1) : vérifier que la base est la bonne, puis
 *   `--sweep --apply --allow-mass-removal`.
 * - `--batch=<1..5000>` (500), `--limit=<lignes par collection>`.
 *
 * Code de sortie : 0 = terminé sans échec ; 4 = des copies ont échoué (relancer
 * reprend) ; 2 = refusé (arguments, feu vert, seau non configuré, balayage
 * refusé, ou un autre passage tient le verrou du volume) ; 1 = erreur.
 *
 * Un passage APPLIQUÉ tient le verrou `<UPLOAD_PATH>/.media-mirror/lock`, que
 * le job de la passerelle prend aussi : jamais deux passages à la fois sur un
 * volume (audit D5). Un passage à blanc n'écrit rien et ne le prend pas.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { isStagingEnvironment } from '../../email/staging-marker';
import type { LocalObjectStore } from './LocalObjectStore';
import type { MediaObjectStore } from './MediaObjectStore';
import { emptyMirrorCounts, runMirrorBatch, type MirrorCounts, type MirrorRowSource } from './mediaMirror';
import { mediaObjectStoresFromEnv } from './mediaObjectStoreFactory';
import { isPorteurApproval } from './mediaObjectStoreConfig';
import { collectReferencedKeys, sweepBucket, type SweepReport } from './mediaBucketSweep';
import { withMirrorLock } from './mediaMirrorLock';
import type { S3ObjectStore } from './S3ObjectStore';

export type MirrorOptions = { readonly apply: boolean; readonly batchSize: number; readonly limit: number | null; readonly reset: boolean };

export type ParsedMirrorArgs =
  | ({ readonly kind: 'run'; readonly follow: boolean; readonly sweep: boolean; readonly allowMassRemoval: boolean } & MirrorOptions)
  | { readonly kind: 'refused'; readonly reason: 'unknown-argument' | 'invalid-batch' | 'invalid-limit' | 'follow-requires-apply' | 'mass-removal-requires-sweep-apply' | 'production-requires-porteur-approval' };

const MAX_BATCH = 5_000;
export const FOLLOW_WINDOW_MS = 24 * 60 * 60 * 1000;
/** L'échéance du verrou du miroir : un processus mort ne bloque pas plus longtemps ; un passage vivant la repousse. */
export const MIRROR_LOCK_TTL_MS = 10 * 60 * 1000;

/** Le verrou que la ligne de commande et le job partagent, à côté du fichier d'état. */
export function mirrorLockFile(uploadRoot: string): string {
  return path.join(path.resolve(uploadRoot), '.media-mirror', 'lock');
}

export function parseMirrorArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): ParsedMirrorArgs {
  const flag = (name: string) => argv.includes(`--${name}`);
  const valueOf = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const known = ['--apply', '--follow', '--reset', '--sweep', '--allow-mass-removal'];
  const knownPrefixes = ['--batch=', '--limit=', '--porteur-approval='];
  if (argv.some((arg) => !known.includes(arg) && !knownPrefixes.some((prefix) => arg.startsWith(prefix)))) return { kind: 'refused', reason: 'unknown-argument' };
  const batchRaw = valueOf('batch');
  const batchSize = batchRaw === undefined ? 500 : Number(batchRaw);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH) return { kind: 'refused', reason: 'invalid-batch' };
  const limitRaw = valueOf('limit');
  const limit = limitRaw === undefined ? null : Number(limitRaw);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) return { kind: 'refused', reason: 'invalid-limit' };
  const apply = flag('apply');
  const approval = valueOf('porteur-approval') ?? '';
  if (apply && !isStagingEnvironment(env.MEESHY_ENV) && !isPorteurApproval(approval)) {
    return { kind: 'refused', reason: 'production-requires-porteur-approval' };
  }
  if (flag('follow') && !apply) return { kind: 'refused', reason: 'follow-requires-apply' };
  if (flag('allow-mass-removal') && !(apply && flag('sweep'))) return { kind: 'refused', reason: 'mass-removal-requires-sweep-apply' };
  return { kind: 'run', apply, follow: flag('follow'), sweep: flag('sweep'), allowMassRemoval: flag('allow-mass-removal'), batchSize, limit, reset: flag('reset') };
}

/** Le plus petit ObjectId créé à `instant` ou après : 4 octets de secondes, puis des zéros. */
export function objectIdAtOrAfter(instant: Date): string {
  return `${Math.floor(instant.getTime() / 1000).toString(16).padStart(8, '0')}0000000000000000`;
}

type MirrorState = { readonly cursors: Readonly<Record<string, string | null>>; readonly updatedAt: string };

async function readState(stateFile: string): Promise<MirrorState> {
  try {
    const parsed = JSON.parse(await readFile(stateFile, 'utf8')) as Partial<MirrorState>;
    return { cursors: typeof parsed.cursors === 'object' && parsed.cursors !== null ? parsed.cursors : {}, updatedAt: String(parsed.updatedAt ?? '') };
  } catch {
    return { cursors: {}, updatedAt: '' };
  }
}

async function writeState(stateFile: string, state: MirrorState): Promise<void> {
  await mkdir(path.dirname(stateFile), { recursive: true });
  const temporary = `${stateFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2));
  await rename(temporary, stateFile);
}

export type SourceReport = { readonly rows: number; readonly cursor: string | null; readonly counts: MirrorCounts };

const addCounts = (a: MirrorCounts, b: MirrorCounts): MirrorCounts =>
  Object.fromEntries(Object.keys(a).map((key) => [key, a[key as keyof MirrorCounts] + b[key as keyof MirrorCounts]])) as MirrorCounts;

/** Un passage sur chaque collection, du curseur gardé (ou de `startAfter`) jusqu'au bout ou à `limit` lignes. */
export async function runMediaMirror(params: {
  readonly sources: readonly MirrorRowSource[];
  readonly local: LocalObjectStore;
  readonly mirror: MediaObjectStore;
  readonly uploadRoot: string;
  readonly stateFile: string;
  readonly options: MirrorOptions;
  readonly log: (line: string) => void;
  /** Repasser depuis cet identifiant SANS toucher au curseur gardé (fenêtre du miroir continu). */
  readonly startAfter?: string;
}): Promise<Readonly<Record<string, SourceReport>>> {
  const { options } = params;
  const initial = options.reset ? { cursors: {}, updatedAt: '' } : await readState(params.stateFile);
  const reports: Record<string, SourceReport> = {};
  let cursors: Record<string, string | null> = { ...initial.cursors };
  for (const source of params.sources) {
    let cursor = params.startAfter ?? cursors[source.name] ?? null;
    let report: SourceReport = { rows: 0, cursor, counts: emptyMirrorCounts() };
    for (;;) {
      const remaining = options.limit === null ? options.batchSize : Math.min(options.batchSize, options.limit - report.rows);
      if (remaining <= 0) break;
      const batch = await runMirrorBatch({ source, uploadRoot: params.uploadRoot, local: params.local, mirror: params.mirror, after: cursor, batchSize: remaining, apply: options.apply });
      cursor = batch.nextCursor;
      report = { rows: report.rows + batch.rows, cursor, counts: addCounts(report.counts, batch.counts) };
      if (options.apply && params.startAfter === undefined) {
        cursors = { ...cursors, [source.name]: cursor };
        await writeState(params.stateFile, { cursors, updatedAt: new Date().toISOString() });
      }
      params.log(`${source.name} : ${report.rows} lignes, curseur ${cursor ?? '—'}, ${JSON.stringify(report.counts)}`);
      if (batch.done) break;
    }
    reports[source.name] = report;
  }
  return reports;
}

type PageDelegate = {
  findMany(args: {
    where: { id?: { gt: string } };
    orderBy: { id: 'asc' };
    take: number;
    select: Record<string, true>;
  }): Promise<Array<{ id: string } & Record<string, unknown>>>;
};

function prismaSource(name: string, delegate: PageDelegate, select: Record<string, true>): MirrorRowSource {
  return {
    name,
    page: async (after, take) =>
      (await delegate.findMany({ where: after === null ? {} : { id: { gt: after } }, orderBy: { id: 'asc' }, take, select: { id: true, ...select } })) as never,
  };
}

/** Toutes les colonnes qui portent une clé de stockage — une colonne tue ici, c'est une copie que le balayage effacerait. */
const MEDIA_KEY_COLUMNS = { filePath: true, fileUrl: true, thumbnailPath: true, thumbnailUrl: true, imageVariants: true, avifVariants: true, renditions: true, translations: true } as const;

export function mediaMirrorSources(prisma: PrismaClient): readonly MirrorRowSource[] {
  return [
    prismaSource('messageAttachment', prisma.messageAttachment as unknown as PageDelegate, MEDIA_KEY_COLUMNS),
    prismaSource('postMedia', prisma.postMedia as unknown as PageDelegate, MEDIA_KEY_COLUMNS),
    prismaSource('sound', prisma.sound as unknown as PageDelegate, { fileUrl: true, coverUrl: true }),
  ];
}

async function sweepOnce(
  sources: readonly MirrorRowSource[],
  mirror: S3ObjectStore,
  uploadRoot: string,
  options: { readonly apply: boolean; readonly allowMassRemoval: boolean },
  log: (line: string) => void,
): Promise<SweepReport> {
  const referenced = await collectReferencedKeys({ sources, uploadRoot, pageSize: 500 });
  const report = await sweepBucket({ lister: mirror, remover: mirror, referenced, now: new Date(), graceMs: FOLLOW_WINDOW_MS, ...options, log });
  log(`balayage du seau : ${JSON.stringify(report)}`);
  return report;
}

const failedCount = (reports: Readonly<Record<string, SourceReport>>) => Object.values(reports).reduce((sum, report) => sum + report.counts.failed, 0);

export async function runMediaMirrorCli(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<number> {
  const parsed = parseMirrorArgs(argv, env);
  if (parsed.kind === 'refused') {
    console.error(`Refusé : ${parsed.reason}`);
    return 2;
  }
  const uploadRoot = env.UPLOAD_PATH || 'uploads/attachments';
  const stores = mediaObjectStoresFromEnv(env, uploadRoot);
  if (stores.mirror === null) {
    console.error('Refusé : aucun seau configuré (MEDIA_S3_MIRROR=on et MEDIA_S3_*).');
    return 2;
  }
  const prisma = new PrismaClient();
  const stateFile = path.join(path.resolve(uploadRoot), '.media-mirror', 'state.json');
  const log = (line: string) => console.log(line);
  console.log(parsed.apply ? 'Migration des médias vers le seau : APPLIQUÉE' : 'Migration des médias vers le seau : À BLANC (aucune écriture)');
  const mirror = stores.mirror;
  const pass = async (renew: () => Promise<void>): Promise<number> => {
    const sources = mediaMirrorSources(prisma);
    const run = async (startAfter?: string) => {
      await renew();
      return runMediaMirror({ sources, local: stores.local, mirror, uploadRoot, stateFile, options: parsed, log, ...(startAfter === undefined ? {} : { startAfter }) });
    };
    const reports = await run();
    const sweep = parsed.sweep ? await sweepOnce(sources, mirror, uploadRoot, { apply: parsed.apply, allowMassRemoval: parsed.allowMassRemoval }, log) : null;
    if (sweep?.kind === 'refused') return 2;
    if (!parsed.follow) return failedCount(reports) > 0 || (sweep?.kind === 'swept' && sweep.counts.failed > 0) ? 4 : 0;
    const intervalMs = Number(env.MEDIA_MIRROR_INTERVAL_MS) > 0 ? Number(env.MEDIA_MIRROR_INTERVAL_MS) : 60_000;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      await run();
      await run(objectIdAtOrAfter(new Date(Date.now() - FOLLOW_WINDOW_MS)));
    }
  };
  try {
    if (!parsed.apply) return await pass(async () => undefined);
    const locked = await withMirrorLock({ file: mirrorLockFile(uploadRoot), owner: `cli:${process.pid}`, ttlMs: MIRROR_LOCK_TTL_MS }, async (renew) => {
      const heartbeat = setInterval(() => void renew().catch(() => undefined), MIRROR_LOCK_TTL_MS / 3);
      heartbeat.unref();
      try {
        return await pass(renew);
      } finally {
        clearInterval(heartbeat);
      }
    });
    if (locked.kind === 'busy') {
      console.error(`Refusé : un autre passage du miroir tourne déjà sur ce volume (${locked.holder}).`);
      return 2;
    }
    return locked.value;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runMediaMirrorCli(process.argv.slice(2), process.env)
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
