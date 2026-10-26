/**
 * #13100 — le RETOUR ARRIÈRE du scellement au repos. Avant de redéployer une
 * passerelle plus ancienne que ce lot (qui ne sait pas ouvrir un fichier
 * scellé, et servirait le chiffré à ses lecteurs), chaque fichier scellé est
 * rouvert EN PLACE, sous sa clé de stockage actuelle (le nom reste opaque), et
 * sa ligne de scellement part. Les lignes de pièces jointes n'ont pas à
 * changer : elles désignent déjà ces clés.
 *
 * À blanc, il ne fait que compter. Idempotent : un fichier déjà rouvert n'a
 * plus de ligne. Un fichier qui ne s'ouvre pas (clé perdue, fichier altéré)
 * est laissé tel quel et compté en échec — jamais remplacé par du vide.
 *
 * ATTENTION : rouvrir remet du CLAIR sur le disque. C'est le prix d'un retour
 * arrière ; en production, il attend le feu vert du porteur comme toute
 * migration.
 */
import { createWriteStream, createReadStream, promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { pipeline } from 'stream/promises';
import { openSealedStoredBytes, type AtRestFileAccess, type AtRestFileRecord } from './atRestFiles';

export type UnsealDeps = {
  readonly uploadRoot: string;
  readonly access: AtRestFileAccess;
  readonly records: () => Promise<readonly AtRestFileRecord[]>;
};

export type UnsealReport = { readonly sealed: number; readonly missing: number; readonly unsealed: number; readonly failed: number };

export async function unsealStoredFile(deps: Omit<UnsealDeps, 'records'>, record: AtRestFileRecord): Promise<void> {
  const absolute = path.join(deps.uploadRoot, record.storageKey);
  const temporary = path.join(path.dirname(absolute), `.unsealing-${randomBytes(8).toString('hex')}`);
  const size = (await fs.stat(absolute)).size;
  const cipher = {
    size,
    etag: '',
    open: async (range?: { readonly start: number; readonly end: number }) =>
      (range ? createReadStream(absolute, { start: range.start, end: range.end }) : createReadStream(absolute)),
  };
  const plain = await openSealedStoredBytes(cipher, record, deps.access.keyring).open();
  try {
    if (plain) await pipeline(plain, createWriteStream(temporary, { mode: 0o644, flags: 'wx' }));
    else await fs.writeFile(temporary, Buffer.alloc(0), { mode: 0o644, flag: 'wx' });
    if ((await fs.stat(temporary)).size !== record.plaintextSize) throw new Error('unsealed size mismatch');
    await fs.rename(temporary, absolute);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
  await deps.access.store.remove(record.storageKey);
}

export async function unsealAllAtRestFiles(deps: UnsealDeps, options: { readonly dryRun: boolean; readonly log: (line: string) => void }): Promise<UnsealReport> {
  const records = await deps.records();
  const report = { sealed: records.length, missing: 0, unsealed: 0, failed: 0 };
  for (const record of records) {
    const present = await fs.stat(path.join(deps.uploadRoot, record.storageKey)).then(() => true, () => false);
    if (!present) {
      report.missing += 1;
      continue;
    }
    if (options.dryRun) continue;
    try {
      await unsealStoredFile(deps, record);
      report.unsealed += 1;
    } catch (error) {
      report.failed += 1;
      options.log(`  échec : pièce ${record.attachmentId}, rôle ${record.role} (${error instanceof Error ? error.name : 'inconnu'})`);
    }
  }
  options.log(`  fichiers scellés : ${report.sealed} — absents du disque : ${report.missing}`);
  if (!options.dryRun) options.log(`  rouverts : ${report.unsealed}, échecs : ${report.failed}`);
  return report;
}
