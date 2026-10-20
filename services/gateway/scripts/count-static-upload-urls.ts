/**
 * COMPTE, EN BASE, LES ADRESSES QUI PORTENT `static.<domaine>/uploads` (#11256).
 *
 * PRÉALABLE au retrait du montage des uploads de la passerelle dans le nginx
 * statique. Lecture SEULE : ce script n'écrit rien, il n'a pas de mode
 * `--apply`. S'il trouve des lignes, leur réécriture est une MIGRATION DE
 * DONNÉES soumise au feu vert du porteur (#9223), précédée d'une sauvegarde
 * vérifiée — pas un effet de bord de ce compte.
 *
 * Il balaie TOUTE colonne qui peut graver une adresse de média (pièces
 * jointes, médias de post, piste d'un post, avatars et bannières, sons) :
 * la liste vit dans `STATIC_UPLOAD_URL_COLUMNS`.
 *
 * FAÇADE MINCE : la décision et le balayage vivent dans
 * `src/services/attachments/staticUploadUrlCount.ts`, les requêtes dans
 * `staticUploadUrlStores.ts` (sous `src/`, donc lues par `tsc`).
 *
 * ⚠ Lancé depuis un poste de travail, `DATABASE_URL` cible la base LOCALE. À
 * exécuter DANS le conteneur du gateway de l'environnement visé :
 *
 *   docker exec -it meeshy-gateway-staging sh -lc 'cd /app && bunx tsx scripts/count-static-upload-urls.ts'
 *   docker exec -it meeshy-gateway sh -lc 'cd /app && bunx tsx scripts/count-static-upload-urls.ts'
 *
 * Code de sortie : 0 = aucune ligne, le retrait peut suivre ; 3 = des lignes
 * existent (migration de données d'abord) ; 1 = erreur.
 *
 * LE SECOND PRÉALABLE est le TRAFIC : une adresse que la base ne grave plus
 * peut encore vivre dans un cache client, un e-mail, un lien partagé. Le
 * journal d'accès de Traefik est un fichier JSON tourné chaque jour (14 jours
 * gardés, `/var/log/meeshy/traefik/` sur l'hôte, #10855) — pas `docker logs`.
 * Sept jours de requêtes `GET /uploads/` sur le domaine statique, par hôte, statut
 * et par client :
 *
 *   cd /var/log/meeshy/traefik && find . -name 'access.log*' -mtime -7 \
 *     -exec sh -c 'case "$1" in *.gz) zcat "$1";; *) cat "$1";; esac' _ {} \; \
 *   | jq -r 'select((.RequestHost // "") | startswith("static.")) | select((.RequestPath // "") | startswith("/uploads/"))
 *            | [.RequestHost, .DownstreamStatus, (."request_User-Agent" // "-")] | @tsv' \
 *   | sort | uniq -c | sort -rn | head -40
 *
 * Zéro ligne en `200` : rien ne lit plus ce chemin, le retrait ne casse
 * personne. Sinon, l'agent utilisateur dit QUEL client grave encore l'adresse.
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';

import { countStaticUploadUrls } from '../src/services/attachments/staticUploadUrlCount';
import { staticUploadUrlStores } from '../src/services/attachments/staticUploadUrlStores';

async function main(): Promise<number> {
  const prisma = new PrismaClient();
  try {
    const report = await countStaticUploadUrls({ stores: staticUploadUrlStores(prisma) });

    console.log('Adresses static.<domaine>/uploads en base (#11256)');
    for (const [nom, tally] of Object.entries(report.parCollection)) {
      console.log(`  ${nom} — lignes examinées : ${tally.scanned}`);
      for (const [colonne, n] of Object.entries(tally.parColonne)) console.log(`    ${colonne.padEnd(14)}: ${n}`);
    }
    for (const exemple of report.exemples) console.log(`    ${exemple}`);
    console.log('');
    console.log(`  TOTAL : ${report.total}`);
    console.log(
      report.total === 0
        ? '  Aucune adresse à migrer : le montage peut être retiré.'
        : '  Des adresses existent : migration de données (feu vert du porteur) AVANT le retrait.',
    );
    return report.total === 0 ? 0 : 3;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
