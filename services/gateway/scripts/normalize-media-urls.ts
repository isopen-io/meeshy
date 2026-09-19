/**
 * NORMALISE LES ADRESSES DE MÉDIAS VERS LEUR CLÉ DE STOCKAGE (#7022).
 *
 * #4324 a tranché ce qui se persiste : « la clé de stockage, jamais une
 * adresse : ni hôte, ni préfixe d'API, ni version. Ce sont des décisions de
 * déploiement, et une donnée qui les porte devient fausse dès que l'une
 * d'elles change. » La règle n'a jamais été appliquée à l'existant — mesuré le
 * 2026-09-18 sur `meeshy-database` (production) :
 *
 *     fileUrl       ABSOLUE 1600 · ROUTE RELATIVE  574 · CLÉ NUE 738   (2912)
 *     thumbnailUrl  ABSOLUE 1184 · ROUTE RELATIVE  323 · CLÉ NUE 472   (1979)
 *
 * Les trois formes répondent `200` EN PRODUCTION — c'est ce qui les a tenues
 * invisibles : l'hôte gravé y est le bon. Partout ailleurs (staging, local, les
 * deux coques Capacitor) la base configurée n'est jamais consultée, et la page
 * va chercher ses médias sur la passerelle de PRODUCTION.
 *
 * FAÇADE MINCE : la décision et le balayage vivent dans
 * `src/services/attachments/mediaUrlNormalization.ts`, les DEUX requêtes dans
 * `src/services/attachments/mediaUrlStores.ts`, les trois sous témoins. Ce
 * fichier ne fait que trois choses — brancher le disque, imprimer, sortir.
 *
 * Les requêtes sont sous `src/` DÉLIBÉRÉMENT : `tsconfig.json` n'inclut que
 * `src/**` et `shared/**`, donc rien de ce qui vit dans `scripts/` n'est lu par
 * `tsc --noEmit` (mesuré : `tsc --listFiles | grep -c normalize-media-urls`
 * rend `0`). Un `select` écrit ICI ne serait jugé par personne — ni par le
 * compilateur, ni par un témoin, un faux Prisma acceptant toute forme de
 * requête.
 *
 * FAIL-CLOSED. Une ligne n'est réécrite QUE si sa clé a la forme de
 * l'arborescence datée ET que les octets sont présents sur le volume. Tout le
 * reste est laissé INTACT et compté : le magasin statique, les CDN tiers, les
 * pistes traduites, et les fichiers réellement absents (8 sur 2912, mesurés le
 * même jour). Réécrire l'adresse d'un fichier manquant perdrait la seule trace
 * de ce qu'on cherchait.
 *
 * ⚠ CE SCRIPT N'A PAS ÉTÉ JOUÉ SUR LA PRODUCTION. Le `--check` est le défaut ;
 * `--apply` est un choix du porteur, à prendre après lecture du compte.
 *
 * ⚠ Lancé depuis un poste de travail, `DATABASE_URL` cible la base LOCALE et le
 * script affichera « succès » sans avoir touché la production — celle-ci
 * n'expose aucun port, et son volume d'uploads n'est monté que dans son
 * conteneur. À exécuter DANS le conteneur du gateway.
 *
 * Usage:
 *   docker exec -it meeshy-gateway sh -lc '
 *     cd /app && bunx tsx scripts/normalize-media-urls.ts            # --check (défaut)
 *     cd /app && bunx tsx scripts/normalize-media-urls.ts --apply    # écrit
 *     cd /app && bunx tsx scripts/normalize-media-urls.ts --verbose  # détaille chaque refus
 *   '
 */
import { existsSync } from 'fs';
import path from 'path';

import { PrismaClient } from '@meeshy/shared/prisma/client';

import { MediaService } from '../src/services/MediaService';
import { sweepMediaUrls, type MediaUrlTally } from '../src/services/attachments/mediaUrlNormalization';
import { attachmentUrlStore, postMediaUrlStore } from '../src/services/attachments/mediaUrlStores';

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const UPLOAD_BASE = process.env['UPLOAD_PATH'] ?? '/app/uploads';

/**
 * LE DISQUE, LU UNE SEULE FOIS PAR CLÉ. Le balayage interroge la présence des
 * octets pour CHAQUE colonne, et un fichier porte souvent sa vignette dans le
 * même dossier : sans mémoire, le même `stat` partirait des milliers de fois.
 *
 * `path.resolve` puis vérification du préfixe : une clé qui remonterait
 * l'arborescence est déjà refusée par la forme, mais un script qui ÉCRIT ne
 * s'appuie pas sur une garde posée ailleurs.
 */
function makeHasBytes(): (key: string) => boolean {
  const vus = new Map<string, boolean>();
  const racine = path.resolve(UPLOAD_BASE);
  return (key: string) => {
    const connu = vus.get(key);
    if (connu !== undefined) return connu;
    const cible = path.resolve(racine, key);
    const dedans = cible === racine || cible.startsWith(racine + path.sep);
    const présent = dedans && existsSync(cible);
    vus.set(key, présent);
    return présent;
  };
}

function imprimer(titre: string, tally: MediaUrlTally): void {
  console.log(`  ${titre}`);
  console.log(`    lignes examinées      : ${tally.scanned}`);
  console.log(`    déjà en clé de stockage: ${tally.alreadyNormalized}`);
  console.log(`    À NORMALISER          : ${tally.normalized}`);
  console.log(`    octets absents (laissé): ${tally.missingBytes}`);
  console.log(`    hors arborescence     : ${tally.outsideTree}`);
  console.log(`    forme non reconnue    : ${tally.unknownShape}`);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const media = new MediaService(UPLOAD_BASE);

  console.log('Normalisation des adresses de médias (#7022)');
  console.log(`  mode    : ${APPLY ? 'ÉCRITURE (--apply)' : 'À BLANC (--check, défaut)'}`);
  console.log(`  uploads : ${UPLOAD_BASE}`);
  console.log('');

  try {
    const report = await sweepMediaUrls({
      stores: [attachmentUrlStore(prisma.messageAttachment), postMediaUrlStore(prisma.postMedia)],
      apply: APPLY,
      storageKeyOf: (value) => media.relativePathFromUrl(value),
      hasBytes: makeHasBytes(),
      ...(VERBOSE
        ? {
            onVerdict: ({ collection, id, field, verdict }) => {
              if (verdict.kind === 'déjà-normalisée' || verdict.kind === 'à-normaliser') return;
              console.log(`  ${verdict.kind.padEnd(18)} ${collection}.${field} ${id}`);
            },
          }
        : {}),
    });

    for (const [nom, tally] of Object.entries(report.parCollection)) imprimer(nom, tally);

    if (report.exemples.length > 0) {
      console.log('');
      console.log(`  exemples (${report.exemples.length} sur ${report.normalized}) :`);
      for (const exemple of report.exemples) console.log(`    ${exemple}`);
    }

    console.log('');
    console.log(`  TOTAL à normaliser : ${report.normalized}`);
    console.log(`  TOTAL laissé       : ${report.missingBytes + report.outsideTree + report.unknownShape}`);
    console.log('');
    console.log(
      APPLY
        ? '  Écrit. Rejouer le script doit désormais rendre « À NORMALISER : 0 ».'
        : '  Rien écrit. Relancer avec --apply pour appliquer.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
