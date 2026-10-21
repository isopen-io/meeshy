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
 * jointes, médias de post, piste d'un post, avatars et bannières, sons), et
 * fouille en profondeur les colonnes JSON (`imageVariants`, pistes TTS de
 * `translations`, scènes de `storyEffects`, `metadata`) : la liste vit dans
 * `STATIC_UPLOAD_URL_COLUMNS`. Les références `static:uploads/…` (écrites par
 * la migration 017, résolues par `MeeshyConfig.staticOrigin` côté iOS et
 * `media-ref.ts` côté web) comptent comme les adresses absolues.
 *
 * FAÇADE MINCE : la décision et le balayage vivent dans
 * `src/services/attachments/staticUploadUrlCount.ts`, les requêtes dans
 * `staticUploadUrlStores.ts`, la ligne de commande dans
 * `countStaticUploadUrlsCli.ts` (sous `src/`, donc lues par `tsc` et
 * compilées dans l'image).
 *
 * ⚠ Lancé depuis un poste de travail, `DATABASE_URL` cible la base LOCALE.
 * L'image du gateway ne porte que `dist/` (ni `scripts/` ni `tsx`) : dans le
 * conteneur de l'environnement visé, lancer la version COMPILÉE de
 * `src/services/attachments/countStaticUploadUrlsCli.ts` :
 *
 *   docker exec meeshy-gateway-staging node dist/src/services/attachments/countStaticUploadUrlsCli.js
 *   docker exec meeshy-gateway         node dist/src/services/attachments/countStaticUploadUrlsCli.js
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
import { runStaticUploadUrlCount } from '../src/services/attachments/countStaticUploadUrlsCli';

runStaticUploadUrlCount()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
