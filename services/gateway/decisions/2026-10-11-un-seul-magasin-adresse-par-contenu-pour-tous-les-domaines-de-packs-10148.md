## D-P5 — Un seul magasin adressé par contenu pour tous les domaines : `GET /api/v1/pack-assets/<sha16>.<ext>` (2026-10-11, #10148)

**Statut** : Accepté (lot LP0 pour la liste blanche, route servie au L5).

**Contexte** : avant l'amendement du 2026-10-11, le chantier prévoyait une route `/api/v1/game/frames/<sha16>.webp` propre aux cadres de gloire ; elle n'a jamais existé. Les packs à domaines (sticker, glory-frame, capture-frame) partagent la même forme de fichier (`PackAssetRef { src, bytes, sha256 }`, `src` = les 16 premiers caractères du SHA-256 et l'extension).

**Décision** : un seul magasin, `GET /api/v1/pack-assets/<sha16>.<ext>`, pour tous les domaines. Sa liste blanche est calculée AU DÉMARRAGE par `services/packs/PackIndex.ts` — les empreintes référencées par les registres courants et par `packages/shared/design/packs/retained.json` — sans aucune lecture de base par requête ; toute autre forme (`..`, majuscules, autre extension, empreinte inconnue) rend 404. Le résumé d'un pack de cadres sert déjà `coverUrl: /api/v1/pack-assets/<src>` ; L3, qui publie le premier registre, ne fusionne qu'une fois L5 servi sur staging, donc aucun client ne voit cette adresse avant qu'elle réponde.

**Alternatives rejetées** : un magasin par domaine (autant de seaux de débit, de couches Docker et de listes blanches à tenir alignés pour un contenu de même nature) ; un chemin par pack (`/packs/<slug>/<fichier>`), qui défait le partage d'un fichier entre packs et versions.

**Conséquences** : un pack OFFICIEL neuf se publie par sa PR (registre + fichiers) puis la promotion de la passerelle, sans version d'application pour `glory-frame` (D-P3). La route, son seau de débit propre et sa couche Docker sont l'affaire de L5 (#10157).
