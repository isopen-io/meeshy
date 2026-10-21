## 2026-10-11: D-P1 — La clé d'installation d'un pack est son slug NU pour un sticker, `<domaine>.<slug>` sinon (`packChoiceKey`) — sans changement de schéma (#10148)

**Statut** : Accepté (lot LP0).

**Contexte** : l'installation d'un pack de stickers (#9141) est une ligne `UserStickerPack` clé par `(userId, packSlug)`. Les cadres de gloire et de capture s'installent désormais par le même moteur (D-P6, `services/gateway/decisions/`).

**Décision** : `packChoiceKey(domain, slug)` (`types/content-pack.ts`) rend le slug nu pour `sticker` — aucune ligne existante ne bouge — et `` `${domain}.${slug}` `` sinon ; `parsePackChoiceKey` est sa réciproque, et rend `null` pour une clé qui n'appartient à aucun domaine. `PACK_SLUG_PATTERN` interdit le point : aucune clé de cadre ne peut entrer en collision avec un slug de sticker. `isPackInstalled(domain, slug, choice, registries)` est LA règle (choix explicite, sinon défaut du registre du domaine, sinon non installé) ; `isStickerPackInstalled` en est une projection. `isReservedPackSlug` réserve PAR domaine, jamais à travers les domaines.

**Alternatives rejetées** : une colonne `domain` (migration d'index datée pour une information que la clé porte déjà) ; renommer les modèles (`@@map`) ; réserver aux stickers les slugs intégrés des autres domaines (une soumission acceptée hier rendrait 422 demain).

**Conséquences** : un client qui lit les choix d'un utilisateur filtre par domaine avec `parsePackChoiceKey` ; la passerelle le fait dans `PackCatalog`.
