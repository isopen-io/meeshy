# Cycle 22 — Une mention nomme un utilisateur, et tout le sous-système doit le dire

Suivi du point laissé ouvert par le cycle 21 :
« **`validateMentionPermissions` reçoit un `Participant.id` à la création et un `User.id` à
l'édition.** […] la comparaison ne sert que dans la branche `direct` […] — à trancher dans un
cycle dédié, avec les tests des deux chemins. »

Vérifié, et la note était en dessous de la vérité. Les deux chemins passent aujourd'hui un
`Participant.id` (l'édition transmet `existingMessage.senderId`, qui est un `Participant.id` :
`Message.sender` est une relation vers `Participant`). Il n'y a donc plus de divergence entre
create et edit — mais **les deux se trompent d'espace d'identifiants**, et la même confusion
traverse le modèle `Mention` tout entier.

## La racine — une colonne, deux espaces d'identifiants

`Mention.mentionedParticipantId` est **déclarée** comme une relation vers `Participant` :

```prisma
mentionedParticipant Participant @relation(fields: [mentionedParticipantId], references: [id], onDelete: Cascade)
```

Or **tout** ce qui écrit et lit cette colonne y met un `User.id` :

| site | ce qu'il fait | espace écrit/lu |
|---|---|---|
| `MentionService.createMentions` | `mentionedParticipantId: userId` | `User.id` |
| `MentionService.getRecentMentionsForUser` | `where: { mentionedParticipantId: userId }` | `User.id` |
| `MentionService.getMentionsForMessage` | `include: { mentionedParticipant: { user } }` | `Participant.id` |
| `scripts/migrations/migrate-to-participant-model.ts` | réécrit `mentionedUserId` → `mentionedParticipantId` | `Participant.id` |

L'écrivain et l'inbox sont d'accord entre eux (en `User.id`), donc la fonctionnalité principale
marche — et masque les trois qui ne le sont pas.

## Ce que la confusion casse aujourd'hui

**D1 — `GET /mentions/message/:messageId` renvoie `[]` pour tout message.**
`getMentionsForMessage` joint la relation `mentionedParticipant`, donc cherche un `Participant`
dont l'`id` vaut un `User.id` : la jointure ne résout jamais, `filter(Boolean)` vide la liste.
La route existe, est authentifiée, vérifie l'accès au message — et rend toujours un tableau vide.
Elle rebaptise même le résultat `mentionedUserId` / `mentionedUser` en sortie : le contrat
d'API est déjà côté utilisateur. Seule la déclaration de la colonne dit autre chose.

**D2 — `onDelete: Cascade` ne se déclenche jamais.** La cascade est armée depuis `Participant` ;
aucune ligne `Mention` écrite par le code actuel n'est atteignable depuis un `Participant`.
Supprimer un utilisateur laisse donc derrière lui les lignes qui le nomment. À l'inverse, si la
cascade fonctionnait telle qu'elle est déclarée, retirer un membre d'une conversation
**effacerait l'historique de l'avoir mentionné** — ce qui n'est pas ce qu'une mention veut dire.

**D3 — la règle « on ne se mentionne pas soi-même » ne se déclenche jamais en conversation
directe.** `validateMentionPermissions` compare `userId !== senderId` où les `userId` viennent de
`Participant.userId` (des `User.id`) et où `senderId` est le `Message.senderId` reçu des appelants
(un `Participant.id`). Deux espaces disjoints : l'inégalité est toujours vraie. `@moi-même` dans
un DM produit donc une ligne `Mention` dans sa propre inbox et son propre nom dans
`validatedMentions` (le web se surligne soi-même). La notification, elle, est déjà bloquée en aval
par `createMentionNotificationsBatch` (`userId === commonData.senderId`), qui compare, lui, deux
`User.id` — la preuve que l'espace attendu est bien `User.id`.

**D4 — le classement admin `mentions_received` replie par un chemin mort.**
`foldParticipantCountsToUsers` cherche un `Participant` par ces ids, ne trouve rien, retombe sur
la clé brute — qui se trouve être le bon `User.id`. Juste par accident, avec une requête inutile
par classement et un commentaire qui affirme le contraire de la réalité.

**D5 — les lignes migrées sont invisibles.** `migrate-to-participant-model.ts` a réécrit les
`mentionedUserId` historiques en `mentionedParticipantId` (`$set` + `$unset`). Ces lignes-là
portent un vrai `Participant.id` ; l'inbox les cherche par `User.id` et ne les voit plus. La
colonne mélange donc bel et bien les deux espaces.

## La direction — converger vers `User`, pas vers `Participant`

Trois raisons, dans cet ordre :

1. **Ses deux frères le font déjà.** `CommentMention` et `PostMention`, tous deux plus récents,
   portent `mentionedUserId String` + `mentionedUser User @relation(...)`. `Mention` est le seul
   des trois à parler participant.
2. **Une mention nomme une personne, pas une adhésion.** Elle doit survivre au départ de celle
   qui est nommée. C'est aussi ce que dit l'index existant, dont le commentaire est
   `// User's mention inbox sorted by time`.
3. **C'est ce que le code fait déjà.** L'écrivain et l'inbox sont en `User.id` ; converger vers
   `User` ne déplace aucune donnée pour la ligne moyenne, là où converger vers `Participant`
   demanderait de réécrire écrivain, inbox, et toutes les lignes écrites depuis la migration.

Le nom **physique** de la colonne est conservé via `@map("mentionedParticipantId")` : le renommage
est un renommage de *type*, pas de données. Seules les lignes de D5 demandent une réparation.

## Plan

- [x] Schéma : `mentionedUserId String @map("mentionedParticipantId")`, relation `mentionedUser`
      vers `User`, backref déplacée de `Participant.mentions` vers `User.messageMentions`
- [x] `MentionService` : les trois sites (`createMentions`, `getMentionsForMessage`,
      `getRecentMentionsForUser`) parlent `mentionedUserId` / `mentionedUser`
- [x] `system-rankings` : `mentions_received` n'est plus replié par participant, et le commentaire
      cesse de compter `Mention` parmi les colonnes participant
- [x] D3 : la résolution du `User.id` de l'expéditeur vit DANS `messageMentions`, une fois, pas
      chez ses quatre appelants — ils tiennent tous un `Participant.id` et rien d'autre
- [x] `scripts/migrations/repair-mention-user-ids.ts` : idempotent, écriture sur `--apply`,
      reconvertit les lignes de D5
- [x] Tests vus ROUGE avant correctif sur D1, D3, D4 et sur les deux écritures (7 rouges)

## Revue

### Pourquoi le `@map` plutôt qu'un vrai renommage

Renommer physiquement la colonne aurait demandé un `$rename` sur TOUTES les lignes pour ne rien
gagner : le nom logique est ce que le code lit, le nom physique ne se voit que depuis Mongo. Le
`@map` fait du correctif un changement de TYPE — la seule donnée qui bouge est celle qui était
déjà fausse (D5). C'est aussi ce qui rend le déploiement ordonnable librement : l'ancien et le
nouveau code lisent la même colonne, et seules les lignes participant restent invisibles jusqu'à
la réparation — exactement comme avant ce cycle.

### La traduction d'espace vit dans l'unité, pas chez les appelants

Les quatre appelants (`MessageProcessor`, les deux routes de lien, l'édition) ne tiennent qu'un
`Participant.id` : c'est ce que `Message.senderId` référence, et `handleMessage` ne reçoit rien
d'autre. Leur demander à chacun de résoudre l'utilisateur aurait été quatre occasions de
diverger — la dérive même que ce module a été créé pour rendre inécrivable au cycle 20. La
résolution est donc unique, placée APRÈS la garde `candidateUserIds.length === 0` pour n'être
payée que par les messages qui nomment réellement quelqu'un, et elle avale ses erreurs comme le
reste de l'unité : une mention perdue ne doit pas transformer un envoi réussi en 500.

Le sens du repli en cas d'échec est choisi : `null` laisse passer une auto-mention, jamais ne
rejette un tiers. Perdre une garde de confort vaut mieux que perdre une mention légitime.

### Ce que le test rouge d'un autre fichier a confirmé

`links-messages.test.ts` affirmait `validateMentionPermissions(CONV_ID, [PEER], PART_ID)` sous le
titre « against the conversation and **the anonymous sender** ». Le test décrivait donc déjà
l'intention — un expéditeur anonyme — tout en asseyant un `Participant.id` dans un champ comparé à
des `User.id`. Il passe maintenant à `null`, et son pendant inscrit (ajouté par ce cycle) prouve
le cas positif : `Participant.id` → `User.id` effectivement résolu.

### Trois confirmations indépendantes de l'espace attendu

Rien ici ne repose sur une interprétation : `createMentionNotificationsBatch` filtre déjà
`userId === commonData.senderId` avec deux `User.id` ; l'émission `mention:created` de
`MessageHandler` garde `targetUserId !== senderUserId` et son commentaire dit explicitement « the
sender's User.id » ; et la route `/mentions/messages/:id` rebaptise sa sortie `mentionedUserId` /
`mentionedUser`. Le seul endroit qui disait « participant » était la déclaration de la colonne.

## Cycle 21 (complément, PR #2641) — une édition RÉCONCILIE ses mentions

Le cycle 21 a été livré par deux sessions en parallèle. La PR #2640 a corrigé le défaut
d'extraction (`extractMentions` → `extractMentionsWithParticipants`) et posé l'API que ce cycle-ci
prolonge : deux exports nommés sur un cœur commun sans écriture. La PR #2641 traite les trois
défauts restants du même bloc, tous causés par la **purge en bloc** que le remède prescrit par le
cycle 20 impliquait :

| # | Défaut | Effet observable |
|---|---|---|
| D2 | purger-recréer réécrit `mentionedAt` des mentionnés **inchangés** | c'est l'axe de tri de l'inbox (`@@index([mentionedUserId, mentionedAt(sort: Desc)])`) : une mention de trois jours remonte en tête parce que l'auteur a corrigé une faute de frappe |
| D3 | la purge détruit l'ensemble précédent, donc « qui est nouveau ? » devient insoluble | chaque édition renotifiait TOUS les mentionnés — dix corrections, dix pushes. Le commentaire de la route affirmait déjà l'inverse : l'intention était écrite, pas implémentée |
| D4 | la purge précède la résolution, et le `catch` réécrit `[]` | service absent ou exception transitoire ⇒ les mentions d'un texte qui les porte toujours sont détruites, et rien ne relit le texte après coup |

`replaceMessageMentions` **réconcilie** : lit l'ensemble précédent, ne supprime que les partants,
ne crée que les entrants. Les trois défauts tombent ensemble — les restants ne bougent pas (D2),
les entrants sont exactement le lot à notifier (D3), et tout écrit vit dans le chemin de succès,
donc une panne laisse la base telle qu'elle était (D4).

`ResolvedMentions` porte deux champs de plus : `newlyMentionedUserIds` (le lot à notifier) et
`reconciled`. Ce dernier distingue « établi vide » de « rien établi » — sans lui, l'appelant
recopie le résultat vide dans sa réponse HTTP et sa diffusion socket, et rejoue **au niveau du
payload** l'effacement que l'unité vient d'empêcher en base ; le web le cache
(`staleTime: Infinity`) et la mention disparaît quand même.

### Détruire à l'aveugle n'est pas « best-effort »

Le code d'origine préférait le champ vide au champ périmé (`// Clear mentions on error to avoid
stale data`). Mauvais arbitrage quand le contenu, lui, est toujours là : une mention périmée
surligne quelqu'un de trop le temps d'une édition, une mention détruite ne revient jamais. Le
reste de l'unité tenait déjà ce contrat ; l'édition en était le seul écrivain à le rompre.

### Ce que ce cycle-ci a repris à #2641

La PR #2641 avait corrigé D3-du-cycle-22 (l'espace d'identifiants du `senderId`) en passant un
`User.id` depuis la route d'édition. Ce cycle tranche mieux : `resolveSenderUserId` fait la
traduction DANS l'unité, une fois, et les quatre appelants passent uniformément le
`Participant.id` qu'ils tiennent. La route d'édition est donc revenue à
`existingMessage.senderId` — corriger chez l'appelant aurait laissé les trois autres se tromper.

### Reste ouvert après ce cycle

- **`repair-mention-user-ids.ts` n'a pas été exécuté** — aucun accès base depuis cette routine.
  À lancer sans `--apply` d'abord : le rapport dit combien de lignes D5 existent réellement en
  production (peut-être zéro si la migration participant n'a jamais tourné là-bas).
- **`MentionCreatedEventData.mentionedParticipantId` reste dans les types partagés** et n'est
  peuplé par aucun émetteur ; le SDK iOS le décode. Champ mort des deux côtés, à retirer dans un
  cycle qui touchera le contrat socket.
- **`getMentionsForMessage` et `getRecentMentionsForUser` n'ont aucun consommateur d'écran.**
  `apps/web/services/mentions.service.ts` expose bien `getMessageMentions` et `getUserMentions`,
  mais seul `getSuggestions` est appelé par un composant. Les deux routes sont donc correctes et
  inertes — l'inbox `/mentions` reste une capacité backend sans écran.
- **`MessageHandler.handleMessageEdit` (édition par WebSocket) ne touche AUCUNE mention** —
  vérifié pendant le cycle 21, toujours vrai. Il écrit `content`, `isEdited`, `editedAt`,
  `translations: null` et s'arrête là : ni ligne `Mention`, ni `validatedMentions`. Éditer
  « salut @alice » en « salut @bob » par socket laisse Alice mentionnée et ne nomme jamais Bob.
  C'est le cinquième écrivain de la famille, et le seul qui n'écrit rien du tout ;
  `replaceMessageMentions` est exactement ce qu'il lui faut. Le câblage passe par
  `MessageHandlerDependencies`, `MeeshySocketIOManager` et tous les doubles de test — une pièce
  distincte, pas une ligne de plus. **Tête du prochain cycle.**
- **Le domaine social extrait encore avec `extractMentions`.** `routes/posts/core.ts` (création ET
  édition de post) et `routes/posts/comments.ts` appellent la variante handles-bruts : un
  `@John Doe` dans un post ou un commentaire ne nomme personne — jamais, pas seulement à
  l'édition. Même défaut que celui du cycle 21, autre domaine.
- **`MeeshySocketIOManager.getConversationParticipantsForMention` est toujours un deuxième
  exemplaire du chargeur de participants** (cycle 21, inchangé).
- **L'édition n'émet toujours aucun `mention:created`** (cycle 21, inchangé).
- **`getLatestMessageSummary` résume le DERNIER message de la conversation, pas celui qu'on vient
  d'acquitter** (cycle 19, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
