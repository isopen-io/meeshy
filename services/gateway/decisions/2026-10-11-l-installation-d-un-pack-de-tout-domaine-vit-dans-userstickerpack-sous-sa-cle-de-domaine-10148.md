## D-P1 — L'installation d'un pack de TOUT domaine vit dans `UserStickerPack`, sous la clé `packChoiceKey(domaine, slug)` ; le compteur `installCount` devient atomique (2026-10-11, #10148, #9141)

**Statut** : Accepté (lot LP0).

**Contexte** : #9141 a posé le moteur des packs de stickers — boutique, installation, proposition par des tiers, modération — et #9190 l'a fermé côté clients, sans registre de décision. Le chantier « Cadres de gloire » (#9963, milestone #170) demande que les cadres de gloire, de succès et de photo s'installent « par le même code que les stickers » (porteur, 2026-10-11). Il fallait décider où vit l'état d'installation d'un pack de cadres, et le moteur hérité avait un défaut : `setInstalled` lisait l'état puis écrivait, si bien que deux `PUT` concurrents comptaient double.

**Décision** :
1. L'installation reste la ligne `UserStickerPack { userId, packSlug, installedAt?, updatedAt }`, clé unique `(userId, packSlug)`, avec `packSlug = packChoiceKey(domaine, slug)` — le slug NU pour un sticker (aucune ligne existante ne bouge), `<domaine>.<slug>` sinon. Le motif de slug interdit le point : aucune clé de cadre ne peut entrer en collision avec un sticker. Aucun changement de schéma, aucune migration, aucun index neuf, aucun feu vert au titre du moteur.
2. Les packs officiels et intégrés n'ont AUCUNE ligne de pack en base : leur catalogue est le registre versionné (`PackIndex.ts`).
3. `PackCatalog.settle` (`services/packs/PackCatalog.ts`) bascule par un `updateMany` CONDITIONNEL sur l'état inverse (`installedAt: { not: null }`, ou `OR: [{ installedAt: null }, { installedAt: { isSet: false } }]` pour un champ qui peut être absent) ; le delta est le nombre de lignes réellement basculées, jamais une lecture préalable. Une ligne déjà dans l'état voulu voit son `updatedAt` touché (l'ordre des installés en dépend, comme avant). Une ligne absente se crée ; un `P2002` mène à un nouvel essai (trois au plus).
4. Seul `services/packs/` écrit `userStickerPack` (cliquet `preference-writer-sweep.test.ts`).

**Alternatives rejetées** : renommer les modèles en `ContentPack` / `UserContentPack` avec `@@map` (remaniement du client Prisma, touche `prisma/**` donc la promotion, gain nul tant qu'aucune ligne de cadre n'existe) ; une colonne `domain` et un index `(userId, domain, slug)` (migration d'index datée #9035 pour une information que la clé porte déjà).

**Conséquences** : le `P2002` suppose l'index unique `(userId, packSlug)` EN BASE, posé par `packages/shared/prisma/migrations/2026-10-01-schema-indexes.mongodb.js` — à vérifier en lecture seule sur staging et production (`db.UserStickerPack.getIndexes()`), sortie citée dans #10148. Sans lui, deux créations concurrentes du même choix passent toutes deux. Le jour où des packs COMMUNAUTAIRES de cadres ouvriraient : `domain String?` sur `StickerPack`, lu par l'idiome `isSet`. Témoins : `packs-engine.test.ts` (deux `PUT` concurrents comptent un), `sticker-packs-frozen-responses.test.ts`.
