## 2026-08-13 (2) : Le bloc de statut dénormalisé de `Message` sort entièrement du schéma

**Statut** : Accepté

**Contexte** : Le modèle `Message` portait un bloc « COMPUTED STATUS FIELDS (denormalized for
performance) » de quatre colonnes — `deliveredToAllAt`, `readByAllAt`, `deliveredCount`,
`readCount` — documentées « Updated when all conversation participants complete each action ».
Leur unique écrivain, `MessageReadStatusService.updateMessageComputedStatus`, est un **no-op
assumé depuis le passage aux curseurs de lecture**. Les quatre colonnes valaient donc `0` / `null`
sur tout message écrit depuis, sans qu'aucun test ni aucune garde ne le signale.

Les cycles précédents ont rebranché la LECTURE : les quatre valeurs se calculent maintenant dans
`getConversationReadStatuses` (union curseur / reçu figé, opt-out `showReadReceipts` retiré du
numérateur comme du dénominateur) et sont servies telles quelles par
`GET /conversations/:id/messages` et `GET /messages/:messageId`. Plus aucun `select` Prisma ne
lisait les colonnes ; `tsc --noEmit` sur la gateway le confirme après retrait.

**Décision** : les quatre colonnes sortent de `schema.prisma`. Le commentaire du modèle explique
désormais où la valeur se calcule, pour qu'aucun futur écrivain ne les « restaure » et ne rouvre
la divergence.

**Ce qui NE change PAS** : `deliveredCount`, `readCount`, `deliveredToAllAt`, `readByAllAt`
restent dans les types de CHARGE UTILE (`types/message-types.ts`, `types/conversation.ts`,
`types/api-schemas.ts`, `utils/validation.ts`) — trois clients les décodent
(`DeliveryStatusResolver` iOS et Android, `MessageRecord+ToMessage`). Application directe de la
leçon du cycle 103 : **la colonne « lecteurs » décide du geste, et ici le lecteur lit une valeur
CALCULÉE, pas une colonne**. Seul le stockage mort disparaît ; la charge utile est identique
au bit près.

**Alternatives rejetées** : *réécrire un écrivain* — reconstituerait une dénormalisation à tenir
cohérente à chaque curseur déplacé, alors que le calcul à la lecture est déjà la source de vérité
partagée par les quatre méthodes d'accusés.

**Conséquences** : MongoDB conserve les champs dans les documents existants (Prisma cesse
simplement de les connaître) — aucune migration, aucune perte. Toute tentative de les `select`
redevient une erreur de compilation.
