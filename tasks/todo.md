# Cycle 21 — Éditer un message détruisait ses mentions par nom d'affichage

Suivi direct du premier point laissé ouvert par le cycle 20 :
« **Le chemin d'édition est un quatrième écrivain de `validatedMentions`, et il extrait moins
bien.** `messages-advanced.ts` appelle `extractMentions` (handles bruts) là où la création appelle
`extractMentionsWithParticipants` (qui résout aussi `@Display Name`). Conséquence : éditer un
message qui contenait `@John Doe` **efface** la mention. »

Vérifié : réel, et la destruction est totale — pas une dégradation d'affichage. Le trou est aussi
plus large que le point noté : trois défauts distincts vivaient dans le même bloc, et deux d'entre
eux sont causés par le remède que le cycle 20 prescrivait.

> **Note d'intégration.** Ce cycle a été traité en parallèle par deux sessions. La première
> (PR #2640) a livré `replaceMessageMentions` + `computeValidatedMentions` et corrigé D1. La
> seconde a corrigé D1, D2 et D3. Ce document décrit l'état APRÈS réconciliation manuelle :
> l'API de la première (deux exports nommés, cœur commun sans écriture) porte les correctifs de
> la seconde. Rien n'a été écrasé.

## D1 (racine) — deux extracteurs pour un seul champ

La route d'édition commençait par **purger** les lignes `Mention` du message
(`prisma.mention.deleteMany`), puis ré-extrayait. Si la ré-extraction rendait moins que
l'originale, la différence était perdue définitivement :

| | création / lien | édition (avant ce cycle) |
|---|---|---|
| extracteur | `extractMentionsWithParticipants` | `extractMentions` |
| `@john` | reconnu | reconnu |
| `@John Doe` | reconnu (résolu vers `john`) | **ignoré** |

Corriger une faute de frappe dans un message qui nommait quelqu'un par son nom d'affichage
supprimait donc sa ligne `Mention` (il sort de l'inbox `/mentions`) et remettait
`validatedMentions` à `[]` (le web cesse de surligner, et `staleTime: Infinity` ne relit jamais).
Rien dans le texte n'avait changé pour elle. Deux extracteurs pour un même champ ne peuvent pas
rester d'accord : c'est la dérive qu'une source unique existe pour rendre inécrivable.

## D2 — purger-puis-recréer réécrit `mentionedAt` des mentions QUI N'ONT PAS BOUGÉ

`Mention.mentionedAt` est l'axe de tri de l'inbox (`@@index([mentionedParticipantId,
mentionedAt(sort: Desc)])`). Purger puis recréer donne à chaque mentionné restant un `mentionedAt`
neuf : une mention d'il y a trois jours remonte en tête parce que l'auteur a corrigé une faute de
frappe. Rien n'a changé pour ce mentionné.

## D3 — chaque édition re-notifiait TOUS les mentionnés

`createMentionNotificationsBatch(validatedUserIds, …)` partait sur l'ensemble complet à chaque
édition. Dix corrections successives = dix pushes à quelqu'un qui était déjà nommé au premier
envoi. Une mention doit notifier une fois. (Le commentaire de la route affirmait déjà « seul un
nouveau mentionné apprend quelque chose » ; le lot passé était l'ensemble entier — une intention
qui n'était pas dans le code.)

## D4 (même bloc) — 150 lignes en double, et leurs quatre chemins d'effacement

Le bloc d'édition ré-implémentait la résolution entière avec **quatre** branches distinctes
écrivant `validatedMentions: []` : aucun utilisateur trouvé, aucune mention extraite, service
absent, exception. Les deux dernières sont destructrices sur simple panne — et les lignes étaient
déjà purgées avant.

D2 et D3 ont la même racine : l'édition traitait la mise à jour comme une **re-création** alors
que c'est une **réconciliation**.

## Plan

- [x] `replaceMessageMentions` dans `services/messaging/messageMentions.ts` — même cœur que
      `resolveMessageMentions`, deux exports nommés plutôt qu'un drapeau
- [x] Le cœur commun (`computeValidatedMentions`) n'écrit rien : les deux exports décident de ce
      qu'ils persistent, parce que c'est exactement là qu'ils diffèrent
- [x] `replaceMessageMentions` RÉCONCILIE : lit l'ensemble précédent, ne supprime que les
      partants, ne crée que les entrants — `mentionedAt` des inchangés préservé (D2)
- [x] `ResolvedMentions.newlyMentionedUserIds` — l'éventail de notifications n'a plus à deviner
      qui est nouveau (D3)
- [x] Service absent ou exception ⇒ **on ne touche à rien** ; tout écrit vit dans le chemin de
      succès (D4)
- [x] `ResolvedMentions.reconciled` distingue « établi vide » de « rien établi », et la route
      garde son payload en conséquence
- [x] La route d'édition délègue ; sa notification reste locale et ne part qu'aux entrants
- [x] Tests vus ROUGES avant le correctif

## Revue

### Pourquoi deux exports plutôt qu'un drapeau

`resolveMessageMentions(…, { replace: true })` aurait été un paramètre qu'un appelant peut
oublier — et l'oublier, sur l'édition, laisse un `validatedMentions` périmé décrivant des lignes
`Mention` déjà supprimées. Deux noms au point d'appel disent laquelle des deux sémantiques on
demande, et aucune des deux n'a de valeur par défaut à deviner.

### L'absence de court-circuit EST le contrat de la variante

`resolveMessageMentions` ne touche à rien quand le contenu ne porte pas de `@` : ne rien écrire
est la bonne réponse à la création. `replaceMessageMentions` doit faire exactement l'inverse — un
contenu édité qui ne porte PLUS de `@` doit effacer le champ. La garde n'est donc pas une
optimisation qu'on aurait oublié de reporter : c'est ce qui distingue les deux unités.

### Réconcilier, pas re-créer

Le remède prescrit par le cycle 20 était « une variante *remplacement* (purge des lignes
existantes + écriture même vide) ». Écrit tel quel, il corrige D1 et pétrifie D2 et D3 — la purge
EST ce qui réécrit `mentionedAt`, et c'est elle qui détruit l'ensemble précédent, rendant « qui
est nouveau ? » insoluble. Lire cet ensemble coûte une requête sur un chemin qui en fait déjà
cinq, et les trois défauts tombent ensemble : les partants partent, les restants ne bougent pas,
les entrants sont exactement le lot à notifier.

### Détruire à l'aveugle n'est pas « best-effort »

La version précédente préférait le champ vide au champ périmé, et son `catch` réécrivait `[]`.
C'est le mauvais arbitrage quand le contenu, lui, est toujours là : une mention périmée surligne
quelqu'un de trop le temps d'une édition ; une mention détruite ne revient jamais, parce que rien
ne relit le texte pour la reconstruire. Le reste de l'unité tient déjà ce contrat (« Une mention
perdue ne doit pas transformer un envoi réussi en 500 ») ; l'édition en était le seul écrivain à
le rompre. La purge est passée dans le chemin de succès : une panne laisse la base telle qu'elle
était, au lieu de la laisser à mi-chemin.

### Un correctif de persistance n'est fini qu'une fois le payload vérifié

L'unité s'abstient désormais au lieu de détruire. Un appelant qui recopie mécaniquement son
résultat vide dans sa réponse HTTP et sa diffusion socket rejoue l'effacement un étage plus haut,
et le web le cache (`staleTime: Infinity`). D'où `reconciled` : « vide parce qu'établi vide » et
« vide parce qu'on n'a rien pu établir » doivent être distinguables dans le type de retour, sans
quoi aucun appelant ne peut faire la différence.

### `senderId` attend un `User.id`, et la route d'édition en passe un

`validateMentionPermissions` compare `senderId` aux `Participant.userId` de la conversation pour
écarter l'auto-mention en `direct`. C'est donc un `User.id` qu'il attend. La route d'édition lui
passe `userId` ; les chemins d'envoi passent un `Participant.id`, qui n'égale jamais un `User.id`.
Le filtre anti-auto-mention ne filtre donc rien à l'envoi — défaut préexistant, sans autre effet.

### `mentionedParticipantId` contient un `User.id`

Sur TOUS les chemins : `createMentions` y écrit les `validUserIds`, et l'inbox
(`getRecentMentionsForUser`) y compare un `userId`. Le nom du champ ment, la donnée est cohérente.
Ce cycle s'aligne sur l'existant plutôt que d'ouvrir une migration.

### Reste ouvert après ce cycle

- **`MessageHandler.handleMessageEdit` (édition par WebSocket) ne touche AUCUNE mention** —
  vérifié dans ce cycle, tête du suivant. Il écrit `content`, `isEdited`, `editedAt`,
  `translations: null` et s'arrête là : ni ligne `Mention`, ni `validatedMentions`. Éditer
  « salut @alice » en « salut @bob » par socket laisse Alice mentionnée (ligne + champ) et ne
  nomme jamais Bob. C'est le cinquième écrivain de la famille, et le seul qui n'écrit rien du
  tout — `replaceMessageMentions` est exactement ce qu'il lui faut. Non fait ici :
  `MessageHandler` ne reçoit pas `mentionService` dans ses `MessageHandlerDependencies`, donc le
  câblage passe par le constructeur, `MeeshySocketIOManager` et tous les doubles de test — une
  pièce distincte, pas une ligne de plus.
- **Le domaine social extrait encore avec `extractMentions`.** `routes/posts/core.ts` (création ET
  édition de post) et `routes/posts/comments.ts` appellent la variante handles-bruts : un
  `@John Doe` dans un post ou un commentaire ne nomme personne — jamais, pas seulement à
  l'édition. Même défaut que D1, autre domaine ; `createPostMentions` / `createCommentMentions`
  en sont les équivalents, et l'unité de ce cycle n'est pas réutilisable telle quelle (elle écrit
  `Message.validatedMentions`). À instruire à part.
- **`validateMentionPermissions` reçoit un `Participant.id` à la création et un `User.id` à
  l'édition.** Voir la revue ci-dessus : c'est la création qui est du mauvais côté. Sans effet
  observable au-delà de l'auto-mention en `direct`.
- **`MeeshySocketIOManager.getConversationParticipantsForMention` est un deuxième exemplaire du
  chargeur de participants** (celui de `MessageProcessor` a disparu au cycle 20). Même corps,
  même `select`, aucun appelant commun pour l'instant.
- **L'édition n'émet aucun `mention:created`** — pas plus qu'avant : le nouveau mentionné reçoit
  bien sa notification (ligne `Notification` + push), mais aucun événement socket dédié.
- **Une dérive `validatedMentions` non vide sans ligne `Mention` correspondante** peut subsister
  sur des messages écrits AVANT le cycle 20 (qui persistait les mentionnés rejetés). Inerte à
  l'affichage : `mentionsToLinks` ne surligne que les handles PRÉSENTS dans le texte.
- **`getLatestMessageSummary` résume le DERNIER message de la conversation, pas celui qu'on vient
  d'acquitter** (cycle 19, inchangé).
- **Aucun client iOS n'écoute `link:message:new`** — les conversations par lien restent une
  fonctionnalité web (cycle 15).
- **Les pièces jointes du chemin de lien n'entrent pas dans le pipeline audio** (cycle 16).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
