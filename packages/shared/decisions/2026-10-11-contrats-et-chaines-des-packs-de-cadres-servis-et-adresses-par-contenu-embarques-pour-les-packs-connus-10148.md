## 2026-10-11: D-P3 — Les contrats et les chaînes d'un pack de cadres de gloire sont SERVIS, adressés par contenu ; le socle iOS embarque les packs connus à la construction (#10148)

**Statut** : Accepté (lot LP0 ; appliqué par L3, L5, LP2).

**Contexte** : un pack `glory-frame` porte un contrat (le manifeste normalisé de ses collections), ses couches raster, un atlas et ses chaînes par langue. Il fallait décider si un pack neuf exige une version d'application.

**Décision** : pour `glory-frame`, contrats et chaînes sont servis par le magasin adressé par contenu (`PackAssetRef`, D-P5) et référencés par l'entrée de registre (`contract`, `strings`, `contractSchema`) ; le socle iOS embarque tous les packs connus à la construction, couches comprises pour les non retirables. Un pack neuf ne demande AUCUNE version d'application ; un client qui ne sait pas lire `contractSchema` affiche « Mettre à jour Meeshy » et ne télécharge rien. Pour `capture-frame`, tant que LC2 (#10187) n'est pas tranché : embarqués (Swift généré, import statique), et un pack neuf demande une version d'application.

**Alternatives rejetées** : tout embarquer (chaque pack exigerait une revue App Store) ; tout servir, socle compris (premier lancement hors ligne sans aucun cadre).

**Conséquences** : `PackIndexEntrySchema` exige `contract`, `strings.fr` par les noms, `contractSchema` ; la passerelle sert `contract`, `strings`, `contractSchema` dans le détail (`GET /api/v1/packs/glory-frame/:slug`).
