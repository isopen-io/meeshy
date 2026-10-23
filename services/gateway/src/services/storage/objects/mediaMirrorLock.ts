import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

type LockContent = { readonly owner: string; readonly expiresAt: string };

export type LockedRun<T> = { readonly kind: 'ran'; readonly value: T } | { readonly kind: 'busy'; readonly holder: string };

type LockOptions = {
  /** `<UPLOAD_PATH>/.media-mirror/lock` : un dossier caché, jamais servi. */
  readonly file: string;
  readonly owner: string;
  readonly ttlMs: number;
  readonly now?: () => Date;
};

const contentOf = (owner: string, now: Date, ttlMs: number): string =>
  JSON.stringify({ owner, expiresAt: new Date(now.getTime() + ttlMs).toISOString() } satisfies LockContent);

async function readLock(file: string): Promise<LockContent | null> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<LockContent>;
    return { owner: String(parsed.owner ?? '?'), expiresAt: String(parsed.expiresAt ?? '') };
  } catch {
    return null;
  }
}

async function tryAcquire(options: Required<LockOptions>): Promise<'acquired' | LockContent> {
  await mkdir(path.dirname(options.file), { recursive: true });
  try {
    await writeFile(options.file, contentOf(options.owner, options.now(), options.ttlMs), { flag: 'wx' });
    return 'acquired';
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return (await readLock(options.file)) ?? { owner: '?', expiresAt: '' };
  }
}

/**
 * Un seul passage du miroir à la fois sur un volume (#11267, audit D5) : la
 * ligne de commande et le job de la passerelle partagent le fichier d'état et
 * le seau. Le verrou est un fichier créé en exclusif (`wx`), à ÉCHÉANCE : un
 * processus mort ne bloque que jusqu'à son terme, et un passage long la
 * repousse par `renew`. Il sérialise les processus qui voient le MÊME volume ;
 * une flotte de passerelles exige le verrou Redis de #12362.
 */
export async function withMirrorLock<T>(options: LockOptions, run: (renew: () => Promise<void>) => Promise<T>): Promise<LockedRun<T>> {
  const resolved: Required<LockOptions> = { ...options, now: options.now ?? (() => new Date()) };
  const first = await tryAcquire(resolved);
  const acquired =
    first === 'acquired'
      ? 'acquired'
      : new Date(first.expiresAt).getTime() > resolved.now().getTime()
        ? first
        : await unlink(resolved.file).then(
            () => tryAcquire(resolved),
            () => tryAcquire(resolved),
          );
  if (acquired !== 'acquired') return { kind: 'busy', holder: acquired.owner };

  const renew = () => writeFile(resolved.file, contentOf(resolved.owner, resolved.now(), resolved.ttlMs));
  try {
    return { kind: 'ran', value: await run(renew) };
  } finally {
    await unlink(resolved.file).catch(() => undefined);
  }
}
