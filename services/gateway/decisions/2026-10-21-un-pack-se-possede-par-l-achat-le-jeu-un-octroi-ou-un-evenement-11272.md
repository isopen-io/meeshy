## Un pack se possède par l'achat, le jeu, un octroi ou un événement — une ligne par `(userId, packKey)`, quelle que soit la voie (2026-10-21, #11272, #11252)

**Statut** : Accepté (lot S17).

**Contexte** : #10632 a posé `UserPackOwnership` comme la trace d'un ACHAT en Meeshes, écrite dans la transaction du registre (`MeeshSpend`). La décision #11252 (verdict du porteur, 2026-10-21) fait des cosmétiques des biens GAGNÉS, OFFERTS ou issus d'un ÉVÉNEMENT — jamais achetés en argent réel. Il fallait qu'un pack payant puisse se posséder sans dépense.

**Décision** :
1. **Une seule table, quatre voies** : `UserPackOwnership.source` ∈ `purchase | game | grant | event` (`PACK_OWNERSHIP_SOURCES`, `packages/shared/types/pack-ownership.ts`), plus `reference` (la raison courte : `rank:voix`, `trophy:<clé>`, `season:2`, ou le motif d'un octroi). Les deux champs sont OPTIONNELS (MongoDB, aucune migration) : une ligne sans `source` est un ACHAT (`packOwnershipSourceOf`).
2. **La loi de possession ne lit que la CLÉ** : `ownedPackKeys(rows)` est le seul constructeur de l'ensemble des clés possédées (`PackCatalog`, `conversationAppearanceGuard`, `profileDecor`) — toute voie possède.
3. **`PackGrants` est le producteur UNIQUE des lignes sans achat** (`services/packs/PackGrants.ts`, appelé par `PackCatalog.award`). L'éligibilité d'une voie `game` (`PackEligibilityRule` : rang, trophée, saison) est évaluée sur des faits lus PAR LE SERVEUR (Gloire + place de Mythe, `GameTrophy`, `GameSeason` à au moins une étoile), jamais sur la parole d'un client ; seuls les faits de la règle demandée sont lus.
4. **Idempotence par l'unique `(userId, packKey)`** : pré-lecture, puis une violation d'unicité (course) vaut `already-owned`. Un pack déjà acheté n'est jamais réécrit (il garde sa source et son prix) ; une course octroi/achat rend `already-owned` à l'achat, sans débit (la transaction de `MeeshSpend` se défait).
5. **Retour arrière** : `priceMeeshes` et `requestId` deviennent optionnels, mais une ligne sans achat porte `priceMeeshes: 0` — un serveur d'avant #11272 le déclarait requis et l'export RGPD le sélectionne ; sans ce 0, un retour arrière ferait lever l'export de tout compte octroyé.
6. **RGPD** : l'export (`PackPrivacy.exportPackData`) sert `source` et `reference` en plus ; la purge efface toutes les lignes du compte sans filtre de voie.

**Alternatives rejetées** : une table par voie (la loi de possession lirait N tables, et un pack pourrait être « possédé deux fois ») ; un `source` requis à `@default("purchase")` (Prisma ne rétro-remplit pas MongoDB : le défaut ne vaut qu'à l'écriture, et la lecture des lignes d'avant le contredirait).

**Conséquences** : aucune route ni aucun déclencheur n'appelle encore `PackCatalog.award` (lots suivants : octroi d'administration audité, attribution de saison, événement) ; les registres ne déclarent pas encore de règle d'éligibilité par pack. Posséder n'est pas installer : l'installation reste un geste du compte.
