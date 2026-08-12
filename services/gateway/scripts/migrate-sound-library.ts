/**
 * Migration des entrées héritées de la bibliothèque de sons.
 *
 * Les entrées créées avant le volume dédié (`UPLOAD_DIR=/app/sounds`) pointent
 * vers des fichiers écrits sous l'ancien défaut `/tmp/meeshy-uploads` : un
 * répertoire éphémère, vidé au redémarrage de l'hôte. Beaucoup de ces `Sound`
 * n'ont donc plus de fichier. Ce script les repère et pose `mutedAt`, qui coupe
 * la diffusion sans détruire la ligne (crédit, usages et compteur restent
 * lisibles, et un opérateur peut annuler la neutralisation).
 *
 * IMPORTANT — le répertoire testé est le répertoire HÉRITÉ, jamais le volume
 * neuf : le volume neuf est vide par construction, l'y chercher neutraliserait
 * 100 % des entrées et la « vérification » serait une tautologie. Si les
 * fichiers hérités ont été déplacés (sauvegarde, restauration), pointer
 * `LEGACY_UPLOAD_DIR` sur leur emplacement RÉEL avant de lancer.
 *
 * Écriture uniquement avec `--apply`. Sans lui, le script compte et n'écrit rien.
 *
 * Usage:
 *   cd services/gateway
 *   bunx tsx scripts/migrate-sound-library.ts                     # à blanc (défaut)
 *   bunx tsx scripts/migrate-sound-library.ts --apply              # pose mutedAt
 *   LEGACY_UPLOAD_DIR=/mnt/restore/uploads bunx tsx scripts/migrate-sound-library.ts
 */
import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@meeshy/shared/prisma/client';

/** Défaut HISTORIQUE d'`UPLOAD_DIR` avant le volume dédié. */
const LEGACY_DIR = process.env.LEGACY_UPLOAD_DIR ?? '/tmp/meeshy-uploads';
const APPLY = process.argv.includes('--apply');
/** Pagination par curseur : la collection héritée peut être volumineuse. */
const BATCH_SIZE = 200;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  let examined = 0;
  let missing = 0;
  let neutralized = 0;

  console.log('Migration bibliothèque de sons — entrées héritées sans fichier');
  console.log(`  répertoire hérité : ${LEGACY_DIR}`);
  console.log(`  mode              : ${APPLY ? 'ÉCRITURE (--apply)' : 'À BLANC (--dry-run par défaut)'}`);
  console.log('');

  try {
    let cursor: string | undefined;

    for (;;) {
      // Projection MINIMALE : les documents hérités n'ont ni `waveform` ni
      // `mimeType`, et Prisma/MongoDB lève à la LECTURE sur un champ absent
      // qu'on aurait sélectionné. On ne lit que ce dont on a besoin.
      const batch = await prisma.sound.findMany({
        where: { mutedAt: null },
        select: { id: true, fileUrl: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      for (const sound of batch) {
        examined++;

        // `basename` neutralise aussi un `fileUrl` chargé de `../` : on ne
        // sonde jamais hors du répertoire hérité.
        const filename = path.basename(sound.fileUrl ?? '');
        if (filename && filename !== '.' && filename !== '/') {
          if (await fileExists(path.join(LEGACY_DIR, filename))) continue;
        }

        missing++;
        console.log(`  manquant  ${sound.id}  ${filename || '(fileUrl vide)'}`);

        if (!APPLY) continue;

        await prisma.sound.update({
          where: { id: sound.id },
          data: { mutedAt: new Date() },
        });
        neutralized++;
      }
    }

    console.log('');
    console.log(`examinées    : ${examined}`);
    console.log(`manquantes   : ${missing}`);
    console.log(`neutralisées : ${neutralized}`);
    if (!APPLY && missing > 0) {
      console.log('');
      console.log('Aucune écriture : relancer avec --apply après lecture de ce résultat.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
