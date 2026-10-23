## Un pack de lens se propose, se modère avec une fenêtre et des communautés, et s'installe par le moteur de packs (2026-10-23, #11271)

### Contexte

MeeshyLens v1 avait son contrat (`lens-format.ts`, #11270) mais aucun circuit : un partenaire ne pouvait rien proposer, la modération rien publier, et aucun client rien installer. Les défauts validés de #11251 tiennent : revue manuelle sur le circuit existant, validation automatique (taille, coût, contenu), pas de shader ni de script.

### Décision

1. **`lens` rejoint `PACK_DOMAINS`.**
   - Un ancien client iOS le décode en `.unknown` (`PackDomain.swift`) et l'ignore.
   - Le web l'adopte : libellé dans les 7 langues, routes dérivées de `/packs/lens`.
2. **Proposer** (`POST /packs/lens/submissions`, `{ document, assets }`) passe par `parseLens` (#11270), puis par ce que la passerelle exige en plus (`lens-pack.ts`) :
   - **le coût est MESURÉ** (`measureLensCost` : barème par primitive, calé sur les vecteurs du format), et une lens qui déclare moins qu'elle ne coûte est refusée ;
   - **les fichiers sont exactement ceux que les couches nomment.** Chacun est sous son plafond, ré-encodé par la porte des octets des stickers (`normalizeStickerImage`) puis renommé par l'empreinte de ses octets ;
   - **le document gardé est la copie re-sérialisée** de ce que le schéma a lu.

   La lens naît `pending`.
3. **Modérer** (`GET /pending`, `POST /:slug/review`) se fait sous `canModerateContent`, fail-closed, et jamais sur sa propre proposition. La publication :
   - **fixe** la fenêtre et les communautés (celles du document à défaut) ;
   - **réécrit** le document servi, donc le ré-adresse ;
   - **n'accepte aucun prix** : une lens est gratuite.
4. **Servir** :
   - le moteur de packs (`PackCatalog` + `LensPacks.store`) n'offre une lens publiée que dans sa fenêtre et à ses communautés (`isPackShelved`, #11274) ;
   - une lens installée reste en rayon, et s'installer hors offre rend 404 ;
   - `/pack-assets` sert le document et les fichiers d'une lens PUBLIÉE seulement, lus en base (`LensPackAsset`).
5. **Stockage** :
   - modèles `LensPack` et `LensPackAsset` (MongoDB, aucune migration) ;
   - fichiers en base : quelques centaines de Ko par lens, servis immuables par empreinte, et la passerelle reste sans état ;
   - RGPD : l'export (`packs.lensSubmissions`) et la purge (`PackPrivacy`) les couvrent comme les autres propositions.

### Corrigé après l'audit adversarial de #12293

- **Une lens publiée se RETIRE** (`POST /:slug/withdraw`, `canModerateContent`) : `approved → withdrawn`. Elle quitte la boutique, les lens installées et le magasin des fichiers. La purge d'un compte l'efface comme une proposition.
- **La modération est journalisée AVANT d'agir** (`AdminAuditLog`, entité `LensPack`) : `LENS_PACK_APPROVE`, `LENS_PACK_REJECT`, `LENS_PACK_WITHDRAW`. Sans journal, rien ne bouge (500 `LENS_AUDIT_UNAVAILABLE`). Une re-proposition après un refus efface la ligne, mais écrit d'abord `LENS_PACK_REJECTION_REPLACED` avec la note, le modérateur et la date du refus.
- **L'offre gouverne aussi le détail et le document.** Pour un tiers, `GET /:slug` et `GET /:slug/document` exigent que la lens lui soit offerte (fenêtre, communautés) ou qu'il l'ait installée. L'auteur et la modération la lisent toujours. `/pack-assets` (sans authentification) ne sert rien avant l'ouverture de la fenêtre. Après la fin, il sert encore les fichiers aux installés : l'adresse `<sha16>` ne s'apprend que par le détail.
- **Le document servi ne porte plus ses communautés** : des identifiants de communautés privées n'ont rien à faire dans un fichier public. Le ciblage reste en base (`LensPack.communities`).
- **La purge réécrit `credits.author`** dans le document publié et le ré-adresse (nouvelle empreinte, nouvelle adresse).
- **Une LUT passe par sa propre porte, sans perte** (`lensLutImage.ts`) : relue, ré-écrite en PNG, à sa définition. La porte des stickers la ramenait à 512 px et pouvait l'écrire en WebP q90, ce qui fausse une table de couleurs.

### Corrigé après le contre-audit de #12293, puis par #12329

- **Une LUT garde chacune de ses valeurs** (N2, `lensLutImage.ts`) :
  - le profil ICC est IGNORÉ, jamais appliqué : une table marquée Display P3 n'est pas convertie vers sRGB ;
  - une table 16 bits sort en 16 bits (`rgb16`), et une table 16 bits sans couleur est refusée ;
  - depuis #12329 (R4), une source hors RVB et gris (CMYK, Lab) est refusée : la convertir changerait chaque valeur.
- **Le journal nomme le modérateur** (N3) : `adminId` porte l'identifiant de qui a modéré. Ce n'est pas forcément un administrateur : un MODERATOR peut modérer les lens (`canModerateContent`).
- **Une lens retirée reste désinstallable, jamais réinstallable** (N4). `installable` la rend « non offerte » : `PUT /:slug/install` répond 404, tandis que `DELETE /:slug/install` aboutit pour qui l'avait installée. **Une lens retirée par erreur se rétablit** (#12321) : `POST /:slug/restore`, sous `canModerateContent`, fait `withdrawn → approved`, de façon conditionnelle.
  - Le geste est journalisé avant d'agir (`LENS_PACK_RESTORE`), puis son issue (`LENS_PACK_RESTORE_APPLIED` avec `installationsReset`, ou `LENS_PACK_RESTORE_NOT_APPLIED`).
  - **Tranché (#12329 R3) : ses installations retirées ne reviennent pas.** Elles sont remises à zéro avant que la lens redevienne visible, et `installCount` les décompte dans la même écriture. Chacun la réinstalle par son propre geste : une lens que la modération a jugée retirable ne réapparaît pas d'elle-même dans la caméra de qui ne l'a pas redemandée.
- **Un geste qui n'a pas eu lieu le dit** :
  - une course entre modérateurs (`updateMany` sans ligne) journalise `LENS_PACK_APPROVE_NOT_APPLIED`, `LENS_PACK_REJECT_NOT_APPLIED` ou `LENS_PACK_WITHDRAW_NOT_APPLIED`, avec la raison `concurrent-review` (N5) ;
  - depuis #12329 (R2), une écriture qui LÈVE journalise la même ligne avec la raison `write-failed` avant que l'erreur ne remonte (500) ;
  - si la ligne « non appliqué » ne s'écrit pas elle-même, le trou du journal se signale en erreur, nommé (action, slug, raison).

À dire au produit (#12329) : pendant un déploiement progressif, la boutique peut différer d'une instance à l'autre, chacune relisant les surcharges du registre à son rythme (30 s au plus). Et `adminId` peut désigner un utilisateur de rôle MODERATOR.

### Laissé absent, à dessein

- **Points « ATTEND » de #11251, jamais tranchés ici** :
  - pas de rémunération ;
  - pas de crédit « Lens par X » en E2EE ;
  - pas de géo-créneau : la revue retire `window.geo` du document servi.
- L'identité partenaire et le comptage d'usage reviennent à S26.
- Le coût est une mesure STATIQUE du graphe déclaré, pas un rendu headless sur fixtures. Ce rendu reste à outiller (issue de suivi).
