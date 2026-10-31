## Le lien entre deux personnes vit dans `UserRelation`, une ligne par paire non orientée, historique embarqué (2026-10-31, #13926)

**Statut** : Accepté

**Contexte** : les cercles de proximité (milestone #215) exigent un niveau ACCORDÉ par chacun des deux (PUBLIC · COMMUNITY · ACQUAINTANCE · FRIEND · CLOSE · BLOOD), une date d'entrée et un historique des passages. `FriendRequest` est un journal orienté, sans unique de paire, dont `dismiss` supprime la ligne : il ne peut porter ni deux niveaux (un par sens), ni une Connaissance née sans demande, ni la date d'entrée. `UserContact` est un carnet unidirectionnel lié à l'appareil.

**Décision** :
1. `model UserRelation` (`packages/shared/prisma/schema.prisma`) : `userLowId` / `userHighId` (le plus petit ObjectId en `low`, `relationPairKey`), `grantedByLow` / `grantedByHigh`, `levelSince`, `cooldownLowUntil` / `cooldownHighUntil`, `origin`. Index : `@@unique([userLowId, userHighId])` et `@@index([userHighId])` seulement ; les colonnes de niveau (6 valeurs) ne s'indexent pas, la requête est bornée par les liens de l'utilisateur. Migration rejouable : `migrations/2026-10-31-user-relation-indexes.mongodb.js` (sans `prisma db push`, #9035).
2. **Écart assumé avec la spec § 2** : l'historique est un type composite embarqué (`RelationTransition { actorId, from, to, at }`), pas une collection `UserRelationTransition`. L'historique d'une paire est borné (cool-down de 30 jours, cran par cran), se lit avec la ligne, n'a besoin d'aucun index. Une baisse y est gravée mais JAMAIS servie (`visibleRelationTransitions`).
3. `FriendRequest.targetLevel String?` (`null` = FRIEND, l'ancien sens) : un ancien client reste intact. `AtomLink` est déclaré, sans route (Atome hors MVP).
4. **Un seul écrivain**, `services/relations/userRelationWriter.ts` : `recordFriendship` (relève à FRIEND au moins, ne baisse jamais), `resetFriendship` (rupture : deux accords à PUBLIC, SANS événement ni notification), `createFriendshipIfAbsent` (rattrapage, jamais d'écrasement). Appelé par l'acceptation (`friend-requests-core`), l'affiliation (`AffiliateTrackingService`) et le rattrapage. La suppression d'une demande ACCEPTÉE rompt le lien sauf si une autre demande acceptée relie encore la paire.
5. Rattrapage `scripts/2026-10-31-backfill-user-relations.ts` (`DRY_RUN=1`) : staging en autonomie, **production après feu vert du porteur et sauvegarde vérifiée** (#9223).

**Alternatives rejetées** : étendre `FriendRequest` seul (pas de niveau par sens, ligne supprimée par `dismiss`) ; une collection d'historique (index et collection de plus pour une liste bornée) ; des index sur les niveaux (six valeurs, aucune sélectivité).

**Conséquences** : rien ne LIT encore `UserRelation` — `friendship.ts` la lira, avec repli sur la `FriendRequest` acceptée, dans `rel-loi-acces` (la présence de la ligne fait autorité). Aucune route, aucun événement à ce lot. Dette tracée : la purge d'un compte supprimera ses liens (lot de la loi d'accès) ; l'acceptation écrit FRIEND/FRIEND tant que `rel-demandes` ne consomme pas `targetLevel`.
