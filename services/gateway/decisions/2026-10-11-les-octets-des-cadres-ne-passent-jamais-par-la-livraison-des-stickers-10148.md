## D-P2 — Les octets des cadres ne passent JAMAIS par la livraison des stickers : ni `/attachments/file/*`, ni `normalizeStickerImage` (2026-10-11, #10148)

**Statut** : Accepté (lot LP0, servi au L5).

**Contexte** : les images d'un pack de stickers de tiers se chargent à la demande par `GET /attachments/file/*` (une lecture de base par fichier, `private`), et toute image de sticker entre par `normalizeStickerImage` (ré-encodage, 512 px). Un cadre de gloire est fait de couches raster de plusieurs centaines de Ko par format, adressées par empreinte, vérifiées par SHA-256 côté client et peintes par un canvas.

**Décision** : les fichiers d'un pack de cadres (couches, vignettes, atlas, couverture, contrat, chaînes) ne sont servis que par le magasin adressé par contenu (D-P5) et ne passent jamais par `normalizeStickerImage`, qui les dénaturerait (taille, profil, transparence). Le moteur des packs n'a qu'un port de propositions (`SubmissionSpec`), réservé au domaine `sticker`.

**Alternatives rejetées** : réutiliser `/attachments/file/*` (une lecture de base par fichier, pas de cache partagé possible, et un chemin `private` qui interdit le CDN) ; normaliser les couches comme des stickers (perte de la géométrie au pixel près que le contrat déclare).

**Conséquences** : les stickers de TIERS gardent leur livraison actuelle jusqu'à l'issue de suivi #10188 (« vers le magasin adressé ») ; aucun ancien client ne voit changer une adresse.
