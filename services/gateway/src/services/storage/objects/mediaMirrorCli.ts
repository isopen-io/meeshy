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
 * - `--batch=<1..5000>` (500), `--limit=<lignes par collection>`.
 *
 * Code de sortie : 0 = terminé sans échec ; 4 = des copies ont échoué (relancer
 * reprend) ; 2 = refusé (arguments, feu vert, seau non configuré) ; 1 = erreur.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { isStagingEnvironment } from '../../email/staging-marker';
import type { LocalObjectStore } from './LocalObjectStore';
import type { MediaObjectStore } from './MediaObjectStore';
import { emptyMirrorCounts, runMirrorBatch, type MirrorCounts, type MirrorRowSource } from './mediaMirror';
import { mediaObjectStoresFromEnv } from './mediaObjectStoreFactory';
import { isPorteurApproval } from './mediaObjectStoreConfig';

export type MirrorOptions = { readonly apply: boolean; readonly batchSize: number; readonly limit: number | null; readonly reset: boolean };

export type ParsedMirrorArgs =
  | ({ readonly kind: 'run'; readonly follow: boolean } & MirrorOptions)
  | { readonly kind: 'refused'; readonly reason: 'unknown-argument' | 'invalid-batch' | 'invalid-limit' | 'follow-requires-apply' | 'production-requires-porteur-approval' };

const MAX_BATCH = 5_000;
export const FOLLOW_WINDOW_MS = 24 * 60 * 60 * 1000;

export function parseMirrorArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): ParsedMirrorArgs {
  const flag = (name: string) => argv.includes(`--${name}`);
  const valueOf = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const known = ['--apply', '--follow', '--reset'];
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
  return { kind: 'run', apply, follow: flag('follow'), batchSize, limit, reset: flag('reset') };
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
  const temporary = `${stateFile}.tmp`;
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
const MEDIA_KEY_COLUMNS = { filePath: true, fileUrl: true, thumbnailPath: true, thumbnailUrl: true, imageVariants: true, translations: true } as const;

export function mediaMirrorSources(prisma: PrismaClient): readonly MirrorRowSource[] {
  return [
    prismaSource('messageAttachment', prisma.messageAttachment as unknown as PageDelegate, MEDIA_KEY_COLUMNS),
    prismaSource('postMedia', prisma.postMedia as unknown as PageDelegate, MEDIA_KEY_COLUMNS),
  ];
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
  try {
    const sources = mediaMirrorSources(prisma);
    const run = (startAfter?: string) =>
      runMediaMirror({ sources, local: stores.local, mirror: stores.mirror as MediaObjectStore, uploadRoot, stateFile, options: parsed, log, ...(startAfter === undefined ? {} : { startAfter }) });
    const reports = await run();
    if (!parsed.follow) return failedCount(reports) > 0 ? 4 : 0;
    const intervalMs = Number(env.MEDIA_MIRROR_INTERVAL_MS) > 0 ? Number(env.MEDIA_MIRROR_INTERVAL_MS) : 60_000;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      await run();
      await run(objectIdAtOrAfter(new Date(Date.now() - FOLLOW_WINDOW_MS)));
    }
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
