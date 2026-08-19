# Références de personnes dans les posts — modes d'exposition, droit d'accès, parité web/iOS

**Date** : 2026-08-19
**Statut** : design validé, implémentation à faire
**Portée** : gateway + iOS + web, de bout en bout

## Le besoin

Référencer une personne dans un contenu ne doit plus obliger à écrire son `@handle` dans le
corpus. L'auteur choisit **comment** la référence se montre — dans le texte, en badge sur le
canevas, en note sous le contenu, ou nulle part. Dans tous les cas la personne est notifiée de
la même façon, et elle peut ouvrir le contenu **au moins une fois**, même expiré.

## État des lieux au 2026-08-19

| Attendu | État réel |
|---|---|
| Surlignage validé côté Post | **absent**. Le web (`apps/web/components/v2/PostContentText.tsx:23`) linkifie par regex locale sans validation : `@nimportequoi` devient un lien vers un profil inexistant. Les messages, eux, ont `Message.validatedMentions` |
| Référencer sans `@` dans le corpus | **story iOS uniquement** (`StoryMentionPickerSheet` → `addMention` → pastille `StoryTextObject`, déclarée via `mentions[]` de `POST /posts`). Rien sur le composer de post iOS, rien sur le web |
| Notification unifiée | `user_mentioned` existe déjà pour les posts, avec `postType` en metadata — mais le libellé (`notification-strings.ts:790`) ne distingue pas le type de contenu |
| Voir même expiré | **déjà possible côté serveur** : `PostService.getPostById` ne filtre pas `expiresAt`, et les STORY ne sont jamais détruites (`ephemeralPosts.ts` — `SWEPT_POST_TYPES = ['STATUS']`). Ce sont les clients qui referment (`StoryItem.isExpired()`). Les STATUS, eux, sont réellement balayés à 1 h |

Deux divergences de fond, déjà présentes, que ce chantier corrige au passage :

1. **L'écriture et la lecture ne parlent pas de la même chose.** `resolveUsernames` (écriture) ne
   filtre ni `isActive` ni `deletedAt` ; `resolveMentionedUsers` (lecture) filtre `isActive: true`.
   Une `PostMention` peut donc exister sans jamais s'afficher.
2. **La lecture re-parse le texte à chaque requête** au lieu de lire les lignes déjà persistées —
   c'est la cause directe du surlignage faux, et ça rend structurellement impossible d'afficher
   une référence que le texte ne porte pas.

## Décisions produit

Toutes tranchées par le porteur du produit au cours du brainstorming du 2026-08-19.

| Question | Décision |
|---|---|
| Référencer donne-t-il le droit de voir ? | **Oui**, et le composer **avertit l'auteur** quand la personne n'est pas dans l'audience |
| Modes d'exposition | **INLINE / PINNED / NOTE / SILENT** |
| Qui déclare quoi | Le client ne déclare **jamais** INLINE. Il déclare les trois autres. Le serveur relit les `@` du texte, valide l'existence, et **dérive** INLINE |
| Fuite des SILENT | Charge utile de feed **neutre** (jamais de SILENT). Le détail est **projeté par lecteur** |
| Accès au contenu expiré | **Une seule ouverture**, puis fermeture. Le contenu vivant reste ouvert sans limite |
| Mécanisme de consommation | **Pas** de suppression de ligne — un horodatage, pour que compteurs et inbox restent exacts |
| Types concernés | **Tous** — même approche partout. Voir la note sur MOOD ci-dessous |

> **MOOD n'est pas un type.** `PostType` vaut `POST | REEL | STORY | STATUS`, et le schéma
> décrit STATUS comme « mood textuel avec audio optionnel ». MOOD est le **nom produit de
> STATUS**, pas une cinquième entité — seule l'union `postType` de `NotificationService`
> l'accepte, comme alias d'affichage. Il n'y a donc rien à créer côté modèle, et « composer
> mood » désigne le composer de statut.

## 1. Modèle de données

### 1.1 L'enum

`PostMentionSource` (CONTENT | CANVAS) devient `PostMentionDisplay` :

```prisma
/// Comment une référence se montre — et, par voie de conséquence, comment
/// l'édition la réconcilie.
///
/// INLINE est DÉRIVÉ : le client ne le déclare jamais. Le serveur relit les
/// `@handle` du contenu à chaque écriture, valide l'existence de la personne,
/// et pose ce mode lui-même. Les trois autres sont DÉCLARÉS — le texte ne peut
/// pas les porter, donc rien ne permettrait de les relire.
enum PostMentionDisplay {
  /// `@handle` écrit dans `content`. Relu dans le texte à chaque édition :
  /// retiré du texte, il disparaît.
  INLINE
  /// Badge posé sur le canevas. Déclaré, tri-état à l'édition.
  PINNED
  /// Rangée « Avec … » sous le contenu. Déclaré, tri-état.
  NOTE
  /// Métadonnée seule : notifiée, invisible pour les tiers. Déclaré, tri-état.
  SILENT
}
```

### 1.2 Le modèle

```prisma
model PostMention {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  postId            String   @db.ObjectId
  mentionedUserId   String   @db.ObjectId
  mentionedAt       DateTime @default(now())

  /// OPTIONNEL, et sans `@default` — même raison qu'aujourd'hui : sous MongoDB
  /// un `@default` ne s'applique qu'à l'ÉCRITURE, les lignes déjà en base n'ont
  /// pas le champ, et un champ requis absent fait échouer la LECTURE.
  /// Absent se lit INLINE : c'était la seule voie qui existait alors.
  display           PostMentionDisplay?

  /// Horodatage de l'UNIQUE ouverture accordée APRÈS expiration du contenu.
  /// Absent = droit intact. Nullable seul, sans booléen jumeau (règle du dépôt).
  ///
  /// La ligne SURVIT à la consommation : la détruire fausserait l'inbox
  /// `/mentions`, les compteurs et l'affinité de recommandation
  /// (`PostFeedService.getMentionsByPost`).
  expiredViewAt     DateTime?

  post           Post @relation("PostMentions", fields: [postId], references: [id], onDelete: Cascade)
  mentionedUser  User @relation("UserPostMentions", fields: [mentionedUserId], references: [id], onDelete: Cascade)

  @@unique([postId, mentionedUserId], name: "post_user_mention_unique")
  @@index([postId])
  @@index([mentionedUserId])
  @@index([mentionedAt])
}
```

### 1.3 Précédence — une personne, un mode

L'unicité `[postId, mentionedUserId]` reste : **un seul mode par personne et par contenu**. Il
faut donc trancher le cas où le texte la nomme *et* où le client la déclare :

| Situation | Mode retenu | Pourquoi |
|---|---|---|
| Déclarée PINNED ou NOTE **+** nommée dans le texte | **le mode déclaré** | C'est un choix explicite de l'auteur ; INLINE n'est qu'un défaut dérivé. Faire gagner INLINE détruirait le badge à la première mention du pseudo dans la légende |
| Déclarée **SILENT** + nommée dans le texte | **INLINE** | On ne peut pas cacher ce qui est écrit. Prétendre le contraire donnerait à l'auteur une illusion de discrétion que le rendu contredit aussitôt |
| Nommée dans le texte seulement | INLINE | dérivé |
| Déclarée seulement | le mode déclaré | — |

Cette règle **inverse** celle qui vaut aujourd'hui dans `postMentions.ts` (« nommée des deux
côtés, elle compte comme mention de TEXTE »). L'inversion est délibérée : cette règle-là datait
d'un modèle où le seul mode déclaré était la pastille, sans intention d'affichage distincte.

### 1.4 Où le serveur lit le texte

**Une story n'écrit pas son texte dans `content`.** La légende y vit, mais le texte porté par
la slide vit dans `storyEffects.textObjects[].text` — que le gateway, aujourd'hui, ne lit pas
du tout pour les mentions. Taper `@alice` dans un objet texte et valider INLINE ne produirait
donc **rien**.

La dérivation INLINE lit désormais les deux sources :

1. `content` — la légende ;
2. `storyEffects.textObjects[].text` — **à l'exclusion des badges de référence** (§1.5).

### 1.5 Un badge n'est pas du texte

Le badge PINNED est un `StoryTextObject` portant `@pseudo` — c'est ce qui lui donne
gratuitement déplacement, rotation, z-order, timeline, export et persistance. Mais il devient
**indistinguable d'un texte libre** dès que le serveur lit les `textObjects` : il re-dériverait
chaque badge en INLINE, c'est-à-dire exactement l'inverse de ce que l'auteur a demandé.

`StoryTextObject` gagne donc un champ :

```swift
/// `User.id` quand cet objet EST un badge de référence, `nil` pour du texte libre.
/// Sans lui, la dérivation INLINE côté serveur relit le badge comme une mention
/// de texte et écrase le mode choisi par l'auteur.
public var referenceUserId: String?
```

Il sert deux fois : le rendu le traite comme un badge tappable plutôt que comme une phrase, et
la dérivation l'ignore.

### 1.6 Migration

Script dans `scripts/migrations/` : `CONTENT → INLINE`, `CANVAS → PINNED`.

Piège à tenir : sous Prisma-Mongo, `{ display: null }` **ne matche pas un champ absent**. Le
script cible `{ source: { isSet: true } }` et laisse les lignes sans champ telles quelles —
elles se lisent INLINE par défaut, ce qui est correct.

## 2. Résolution et réconciliation (gateway)

`services/gateway/src/services/posts/postMentions.ts` garde sa forme — `resolvePostMentions`
(création) / `reconcilePostMentions` (édition), best-effort, `newlyMentionedUserIds`,
`reconciled`. Trois généralisations :

1. **`declared` porte un mode.** `DeclaredPostMention` devient
   `{ userId?, username?, display: 'PINNED' | 'NOTE' | 'SILENT' }`. INLINE y est **refusé**
   au niveau du schéma Zod : le client ne le déclare pas.
2. **`persistBySource` devient `persistByDisplay`** — un lot d'écriture par mode, pour la
   raison inchangée : c'est le discriminant qui dit, à l'édition suivante, laquelle relire
   dans le texte.
3. **Le tri-état s'applique aux trois modes déclarés**, plus seulement à CANVAS : `undefined`
   = le client n'en parle pas, elles survivent ; `[]` = elles partent ; une liste remplace
   l'ensemble déclaré.

**La validation d'existence reste la seule garde d'écriture**, comme aujourd'hui — mais les
deux côtés cessent de diverger. Aujourd'hui l'écriture (`resolveUsernames`) ne filtre **rien**,
tandis que la lecture (`resolveMentionedUsers`) filtre `isActive: true` : une référence peut
être persistée puis rester invisible à jamais.

Règle unique retenue, appliquée des deux côtés : **`deletedAt` exclut, `isActive` n'exclut
pas**. Un compte supprimé n'est pas référençable ; un compte simplement inactif l'est — c'est
déjà le choix assumé de l'autocomplete, et quelqu'un qui apparaît dans le sélecteur doit
pouvoir être référencé. Comme la lecture ne re-parse plus le texte (§5.2), l'alignement se
réduit à une seule décision, au seul endroit qui écrit.

## 3. Droit d'accès

### 3.1 Une unité, tous les appelants

```ts
// services/gateway/src/services/posts/referenceAccess.ts
export type ReferenceAccess =
  | { kind: 'granted' }              // contenu vivant, ou lecteur déjà dans l'audience
  | { kind: 'granted-and-consumed' } // contenu expiré, droit de référence dépensé à l'instant
  | { kind: 'denied' };

export async function resolveReferenceAccess(params: {
  prisma: Pick<PrismaClient, 'postMention'> & PostAclPrisma;
  post: PostVisibilityRecord & { id: string; type: PostType; expiresAt: Date | null };
  viewerId: string;
  now: Date;
}): Promise<ReferenceAccess>
```

Elle vit dans une unité unique **pour la raison qui a fait naître `messageMentions.ts`** :
quatre écrivains contournaient `MessageProcessor` et perdaient chacun les mentions. Ici, les
ouvertures détaillées sont nombreuses — `GET /posts/:postId`, ouverture de story, de statut,
de réel — et aucune ne doit réimplémenter la règle.

### 3.2 La règle

| État du contenu | Membre de l'audience | Personne référencée (tout mode, SILENT compris) |
|---|---|---|
| Vivant | voit | voit, **sans limite** |
| Expiré (STORY / STATUS) | ne voit plus | **une seule ouverture**, puis non |
| Supprimé (`deletedAt`) | 404 | 404 |

La consommation ne se déclenche **qu'à une ouverture postérieure à l'expiration**. Ouvrir dix
fois une story vivante ne dépense rien.

Elle s'applique **même à quelqu'un qui appartenait à l'audience**. Passé l'échéance, l'audience
n'a plus aucun droit : le seul qui subsiste est celui de la référence, et c'est donc lui qui se
dépense. Un ami référencé et un inconnu référencé ont exactement le même droit.

L'auteur est hors de cette règle — son archive personnelle est inchangée, et il ne peut pas se
référencer lui-même (l'auto-mention est filtrée).

`canUserViewPost` gagne une branche « je suis référencé ici » — un `findUnique` sur l'index
unique `postId_mentionedUserId` déjà présent.

### 3.3 La consommation n'est PAS un effet de bord de la lecture

**C'est le point où une implémentation naïve casse la fonctionnalité en production.** Consommer
le droit dans `GET /posts/:postId` le dépenserait avant que l'utilisateur ait rien vu, par au
moins trois chemins déjà en place :

1. **La NSE préfetche le post à la réception de la notification** —
   `StoryNotificationTargetViewModel.load()` draine ce que `NSEPendingPostConsumer` a mis de
   côté. Le droit serait dépensé pendant que le téléphone est dans une poche.
2. **La revalidation cache-first** : ce même `load()` lit le cache *puis* rappelle
   `fetchPost` en silence. Deuxième dépense.
3. **Le pull-to-refresh**, que le ViewModel documente comme idempotent — troisième.

La consommation se greffe donc sur l'acte explicite qui existe déjà :
**`POST /posts/:postId/view`** (`routes/posts/interactions.ts:336` → `postService.recordView`),
appelé par le viewer quand le contenu est réellement affiché. Une lecture ne dépense jamais
rien ; seule une vue déclarée le fait.

### 3.4 Une fenêtre, pas un instant

Un droit qui s'éteint au premier `view` punit ce que l'utilisateur ne contrôle pas : une
coupure réseau au mauvais moment, un changement d'appareil, une app tuée pendant l'affichage.
« Au moins une fois » serait respecté à la lettre et trahi en pratique.

`expiredViewAt` marque donc le **début d'une fenêtre de 24 h** pendant laquelle le contenu
reste ouvrable autant de fois que voulu ; passé ce délai, il se ferme définitivement. Une seule
écriture, posée à la première vue post-expiration et jamais rafraîchie ensuite.

### 3.5 Ce que la porte n'ouvre PAS

La branche est câblée dans les ouvertures **unitaires**, pas dans
`buildPostVisibilityOrFilter`. Conséquence voulue : la story d'un inconnu qui vous épingle
**n'atterrit pas dans votre tray**. Vous l'ouvrez depuis la notification, l'inbox mentions ou
son profil — jamais par surprise au milieu du feed.

### 3.6 Balayage des STATUS

`ExpiredStoriesCleanupService` épargne tout post portant au moins une référence dont le droit
n'est pas éteint — soit jamais consommée, soit dans sa fenêtre de 24 h. Plafond de grâce :
**7 jours après `expiresAt`** (aligné sur `EPHEMERAL_AUTHOR_ARCHIVE_MS`), sans quoi un statut
dont personne n'ouvre jamais la notification vivrait éternellement. Passé ce délai il est
balayé, droits intacts ou non, et les notifications correspondantes deviennent mortes.

Filtre, avec le piège Prisma-Mongo — `{ expiredViewAt: null }` **ne matche pas un champ
absent**, il faut les deux branches :

```ts
{ OR: [
  { expiredViewAt: { isSet: false } },
  { expiredViewAt: null },
  { expiredViewAt: { gt: new Date(now.getTime() - 24 * 3600_000) } }, // fenêtre encore ouverte
] }
```

## 4. Notification

Libellé unifié, dérivé de `postType` déjà présent en metadata :

> **X vous a référencé dans son Réel / Post / Story / Statut**

Quatre libellés, pas cinq : STATUS et MOOD sont le même type (§ décisions). Le vocabulaire
affiché pour STATUS suit celui du reste de l'app.

`packages/shared/utils/notification-strings.ts` — le cas `user_mentioned` cesse de rendre un
libellé unique et se branche sur `postType`, comme `friend_new_*` le fait déjà juste au-dessus.
Sept langues à couvrir (cliquet français : attention aux clés sans accent).

**`filterPostConsumers` sort du chemin mention.** C'est un changement de sécurité assumé : la
garde empêchait aujourd'hui l'extrait d'un post FRIENDS de partir vers un non-ami. Puisque le
référencement ouvre l'accès, la garde n'a plus d'objet — et **l'avertissement du composer
devient la seule protection restante**, donc il n'est pas cosmétique.

Le tap route vers la surface du type (`reference_notification_tap_routing_map`), en passant par
`resolveReferenceAccess` : une notification vers un contenu expiré dont le droit est éteint
ouvre l'écran « ce contenu n'est plus disponible », pas un 404 brut. Côté iOS, l'état
`.expired` de `StoryNotificationTargetViewModel` existe déjà — il gagne la distinction entre
« expiré, mais j'ai encore mon droit » et « expiré, droit éteint ».

**Rétractation.** Retirer une référence à l'édition doit retirer la notification qu'elle a
produite — sinon elle pointe vers un contenu dont l'accès vient d'être révoqué. Le dépôt a déjà
le patron : `services/gateway/src/services/posts/retractCommentNotifications.ts`, septième
occurrence d'une famille ouverte aux cycles 46 à 51. Même cause ici : le lien vit dans un blob
JSON, la ligne porte une copie dénormalisée de l'extrait, et aucun filtre de lecture ne peut
rattraper. Le `user_mentioned` de post figure d'ailleurs déjà dans la liste des types que ce
module sait retirer — l'ajout se réduit à brancher le retrait sur le lot `departedUserIds` que
`reconcilePostMentions` calcule déjà.

## 5. Contrat API

### 5.1 Écriture

`CreatePostSchema` / `UpdatePostSchema` — `mentions[]` gagne `display`, INLINE refusé :

```ts
export const PostReferenceInputSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  username: z.string().min(1).max(64).optional(),
  display: z.enum(['PINNED', 'NOTE', 'SILENT']),
}).refine((m) => Boolean(m.userId || m.username), { message: 'userId ou username requis' });
```

### 5.2 Lecture

`resolveMentionedUsers` (re-parsing du texte) est **retiré des routes de post** — `core.ts`,
`feed.ts`, `comments.ts`, `interactions.ts`. La fonction elle-même **reste** : les messages de
conversation l'utilisent encore (`routes/conversations/messages.ts:1380`), et rien ici ne
change pour eux.

La charge utile porte la relation, résolue au chargement — donc avec le `displayName` et
l'avatar **du moment**, jamais figés :

```jsonc
// GET /posts/feed — NEUTRE, identique pour tous
"mentions": [
  { "userId": "…", "username": "alice", "displayName": "Alice B.", "avatar": "…", "display": "INLINE" },
  { "userId": "…", "username": "bob",   "displayName": "Bob",      "avatar": "…", "display": "NOTE"   }
]
// carol(SILENT) est écartée AU NIVEAU DU SELECT — elle ne quitte pas la base
```

```jsonc
// GET /posts/:postId — PROJETÉ pour le lecteur
// auteur          → tout, SILENT compris (il doit pouvoir en retirer une)
// carol           → les visibles + la SIENNE
// tiers           → les visibles seulement
```

**Ajustement par rapport au design présenté** : la projection au détail remplace la route
`GET /posts/:postId/mentions` initialement proposée. Même garantie de non-fuite, un
aller-retour de moins, et elle répond au besoin « quand on ouvre les détails, les mentions
remontent avec ».

### 5.3 Le droit se déclare, il ne se déduit pas

`StoryNotificationTargetViewModel` calcule aujourd'hui `isExpired(cached)` **localement**, à
partir de `expiresAt`. Laissé tel quel, il refuserait d'afficher un contenu que le serveur
autorise pourtant — le droit de référence lui est invisible.

Toute charge utile de contenu éphémère porte donc le verdict, calculé par
`resolveReferenceAccess` et jamais redérivé côté client :

```jsonc
"referenceAccess": "none" | "granted" | "consumed"
// none     — pas de référence pour ce lecteur ; l'expiration s'applique normalement
// granted  — droit intact, ou fenêtre de 24 h encore ouverte : afficher malgré l'expiration
// consumed — droit éteint : écran « ce contenu n'est plus disponible »
```

Le client garde `isExpired()` pour ce qu'il sait faire — masquer du tray, griser un aperçu —
mais l'**ouverture** obéit au serveur.

**Garde client obligatoire** : un `display: SILENT` n'est **jamais** rendu dans la rangée
« Avec … ». Il ne sert qu'à deux affichages — le marqueur « Vous êtes référencé·e ici » pour
la personne elle-même, et la liste de gestion de l'auteur dans le composer d'édition. Un post
détaillé mis en cache puis réutilisé pour rendre une carte de feed ne doit pas trahir la
règle : la garde est dans le composant de rendu, pas dans la couche réseau.

## 6. Clients — la règle avant l'UI

L'état déclaré, les transitions et la dérivation du payload vivent dans une unité **pure** —
ni SwiftUI, ni DOM, ni réseau :

- **Swift** : extension de `ComposerMentionQuery`
  (`packages/MeeshySDK/Sources/MeeshyUI/Story/ComposerMentionQuery.swift`), déjà `nonisolated`
  et déjà testée sans UI.
- **TypeScript** : jumelle dans `packages/shared`, consommée par les deux composers web.

Ce qu'elle porte :

| Règle | Comportement |
|---|---|
| Transition INLINE → non-INLINE | **retire le `@handle` du texte** en cours de frappe |
| Transition non-INLINE → INLINE | insère `@username ` à la position courante et sort de la liste déclarée |
| Dédup | une personne, un mode ; le dernier choix gagne |
| Payload | ne rend que les non-INLINE — le serveur dérive le reste |

**C'est elle qui survivra à la convergence** des composers Reel/Post/Story : l'interface
changera, la règle non.

## 7. Deux entrées, partout

Identiques sur les quatre types : POST, REEL, STORY, STATUS (« mood »).

### 7.1 Le chip « Mentionner » — hors texte

Ouvre un panneau de personnes en **chips horizontaux scrollables**, filtrables.

| Geste | Résultat |
|---|---|
| **Tap simple** | **SILENT** |
| **Appui long** | menu : badge (**PINNED**) · référencer (**NOTE**) · notifier (**SILENT**) |

Un PINNED pose le badge sur le canevas ; l'auteur le déplace ensuite librement — c'est
`StoryTextObject` avec fond plein, qui hérite gratuitement du déplacement, de la rotation, du
z-order, de la timeline, du rendu à l'export et de la persistance dans `StoryEffects`. Il porte
`referenceUserId` (§1.5) : c'est ce qui le distingue d'une phrase, au rendu comme à la
dérivation serveur.

### 7.2 La liste `@` — dans un objet texte

Apparaît à la frappe d'un `@`.

| Geste | Résultat |
|---|---|
| **Tap simple** | **INLINE** — le `@handle` reste écrit |
| **Appui long** | menu : insérer (**INLINE**) · badge (**PINNED**) · référencer (**NOTE**) · notifier (**SILENT**) |

Les trois derniers **retirent le `@handle` du texte** : c'est tout l'intérêt du geste.

### 7.3 Avertissement d'audience

Quand la personne choisie n'appartient pas à l'audience du contenu, le composer le dit avant
la publication : *« Carol n'est pas dans votre audience — la référencer lui donnera accès à ce
contenu. »* C'est la seule protection restante depuis le retrait de `filterPostConsumers` du
chemin mention (§4).

## 8. Surfaces à livrer

### iOS

| Surface | Fichier | Travail |
|---|---|---|
| Composer story | `StoryComposerView+Media.swift`, `StoryComposerViewModel+Elements.swift` | chip + appui long ; `addMention` généralisé aux 4 modes |
| Composer post / reel / statut | `UnifiedPostComposer.swift` | **les deux entrées** (chip + liste `@`) ; aujourd'hui seule l'insertion INLINE existe. Option « badge » masquée (§9) |
| Modèle de canevas | `StoryModels.swift` — `StoryTextObject` | nouveau `referenceUserId: String?` (§1.5), décodeur tolérant à son absence |
| Publication | `StoryViewModel.runStoryUpload`, `PostService.createStory` / `createPost` | cesser de dériver les mentions des `textObjects` ; envoyer la liste déclarée avec son mode |
| Vue déclarée | viewer story / statut → `POST /posts/:postId/view` | c'est **elle** qui consomme le droit (§3.3) — s'assurer qu'elle n'est pas appelée par un prefetch |
| Surlignage | pendant post de `MessageTextRenderer.swift` | linkifier **uniquement** ce que `post.mentions` valide |
| Rangée « Avec … » | feed, détail, reel | nouveau composant, `display == NOTE` |
| Marqueur personnel | détail, viewer | « Vous êtes référencé·e ici » quand `display == SILENT` et que c'est soi |
| Viewer story / statut | `StoryViewModel` (filtres `!$0.isExpired()`, lignes ~2750 / ~2782), `StoryNotificationTargetViewModel` | l'ouverture obéit à `referenceAccess` (§5.3), pas à `isExpired()` local ; l'état `.expired` existant se dédouble en « droit intact » / « droit éteint » |
| Notification | `NotificationModels.swift` | libellé par type ; `isLinkedContentExpired` reste un **marqueur visuel** (il ne bloque aucun tap aujourd'hui — ne pas l'y ajouter) |

### Web

| Surface | Fichier | Travail |
|---|---|---|
| Composer story | `apps/web/components/v2/StoryComposer.tsx` | chip + liste `@`, mêmes gestes (clic long / menu contextuel) |
| Composer post / mood | composer de post v2 | idem |
| Surlignage | `apps/web/components/v2/PostContentText.tsx` | **corrige le lien mort** : ne linkifier que les usernames validés par `post.mentions` |
| Rangée « Avec … » | feed, détail, reel | nouveau composant |
| Viewer story | `apps/web/components/v2/StoryViewer.tsx` | ouverture par référence même expiré |
| Notification | `apps/web/utils/notification-helpers.ts` | libellé par type ; `context.expired` reste un marqueur |

## 9. Cas particuliers

**Repost.** La republication crée automatiquement une référence **SILENT** vers l'auteur
original, en plus de l'attribution visible. Elle lui vaut notification, inbox et droit
d'accès. À articuler avec le chantier « Reposts cohérents + watermark » en cours.

**PINNED sur un contenu sans canevas.** Un POST, un REEL ou un STATUS n'a aujourd'hui aucune
couche de positionnement sur ses médias — seule la STORY en a une (`storyEffects`). L'option
« badge » y est donc **masquée** jusqu'à ce que la convergence des composers donne un canevas
à tous les types, plutôt que d'inventer une couche jetable ou de proposer un mode qui ne se
verrait pas. Point de reprise explicite.

**Affinité de recommandation.** `PostFeedService.getMentionsByPost` lit **toutes** les
`PostMention`, SILENT comprises. Une référence silencieuse influence donc le classement du feed
de la personne concernée. Ce n'est pas une fuite — aucun nom n'est exposé à un tiers, et elle a
de toute façon le droit d'accès — mais c'est un effet observable qu'il vaut mieux avoir écrit
qu'avoir à redécouvrir.

## 10. Tests

TDD, RED d'abord. Ce qui doit échouer avant d'être écrit :

**Gateway**
- INLINE dérivé du texte, jamais accepté en déclaration (Zod rejette `display: 'INLINE'`)
- la dérivation lit **`content` ET `storyEffects.textObjects[].text`**
- un `textObject` portant `referenceUserId` est **ignoré** par la dérivation — un badge PINNED
  ne se retransforme pas en INLINE à la première édition
- précédence : PINNED/NOTE déclaré **gagne** sur le texte ; SILENT déclaré **perd** contre lui
- édition : retirer un `@handle` supprime la ligne INLINE ; les déclarées survivent à
  `declared: undefined` ; `[]` les efface
- retirer une référence retire la notification qu'elle avait produite
- une SILENT ne sort **jamais** de la charge utile de feed
- le détail projette : auteur → tout, personne concernée → la sienne, tiers → rien
- **`GET /posts/:postId` ne consomme rien** — dix lectures laissent `expiredViewAt` absent
- `POST /posts/:postId/view` sur contenu vivant ne consomme rien
- `POST /posts/:postId/view` sur contenu expiré horodate **une fois** ; un second appel ne
  réécrit pas `expiredViewAt` (sinon la fenêtre glisserait indéfiniment)
- pendant la fenêtre de 24 h l'accès reste accordé ; après, `referenceAccess: "consumed"`
- un STATUS dont un droit n'est pas éteint survit au balayage ; balayé une fois tous éteints,
  ou passé le plafond de grâce
- le libellé de notification suit `postType`, dans les 7 langues

**Clients (règle pure, sans UI)**
- INLINE → NOTE retire le `@handle` du texte ; NOTE → INLINE le réinsère
- le payload ne contient que les non-INLINE
- dédup : le dernier mode choisi gagne

**Clients (rendu)**
- `@nimportequoi` n'est **pas** linkifié (le défaut web actuel)
- un SILENT n'apparaît jamais dans la rangée « Avec … », même servi par un cache de détail
- l'ouverture suit `referenceAccess`, pas `isExpired()` : un contenu expiré avec droit intact
  s'affiche ; le même avec droit éteint donne l'écran de fin
- **le prefetch NSE et la revalidation cache-first n'appellent jamais `/view`** — le test
  compte les appels, c'est la seule façon de verrouiller §3.3

## 11. Lots

1. **Schéma + migration** — enum, `expiredViewAt`, `StoryTextObject.referenceUserId`, script
   `CONTENT→INLINE` / `CANVAS→PINNED`
2. **Gateway écriture** — `postMentions.ts` généralisé, Zod, dérivation INLINE sur les deux
   sources de texte, précédence des modes, rétractation des notifications
3. **Gateway lecture** — relation incluse, projection au détail, `referenceAccess` dans la
   charge utile, retrait de `resolveMentionedUsers` des routes de post
4. **Gateway accès** — `resolveReferenceAccess`, branche ACL, consommation sur `/view`,
   fenêtre de 24 h, balayage, notification unifiée
5. **Règle pure partagée** — Swift + TS, testée sans UI
6. **iOS** — composers, rendu, viewer, `/view` non déclenchée par un prefetch
7. **Web** — composers, rendu, viewer

Les lots 1–4 sont séquentiels. 5 peut démarrer en parallèle de 2. 6 et 7 sont indépendants
l'un de l'autre une fois 3–5 livrés.

## 12. Hors scope

- Badge PINNED sur les médias d'un POST / REEL / STATUS (attend la convergence des composers)
- Injection des contenus référencés dans le feed ou le tray (décision §3.5)
- Rétention froide des `storyViews` anciennes, évoquée dans `ephemeralPosts.ts`

## 13. Ce que la relecture contradictoire a changé

Dix défauts trouvés en confrontant la première rédaction au code. Deux auraient cassé la
fonctionnalité en production.

| # | Défaut | Correction |
|---|---|---|
| 1 | **MOOD traité comme un 5e type** — `PostType` n'en a que quatre | MOOD = nom produit de STATUS (§ décisions) |
| 2 | **La consommation posée sur la lecture** — la NSE préfetche le post à la réception de la notification, et la revalidation cache-first relit derrière : le droit était dépensé avant tout affichage | Consommation sur `POST /posts/:postId/view`, qui existe déjà (§3.3) |
| 3 | **Un instant, pas une fenêtre** — coupure réseau ou changement d'appareil punissaient l'utilisateur | Fenêtre de 24 h ouverte par la première vue (§3.4) |
| 4 | **Le badge PINNED se serait re-dérivé en INLINE** — c'est un `StoryTextObject` portant `@pseudo`, indistinguable d'un texte libre | `StoryTextObject.referenceUserId`, ignoré par la dérivation (§1.5) |
| 5 | **Le texte d'une story n'est pas dans `content`** — un `@` tapé dans un objet texte n'aurait rien produit | La dérivation lit aussi `storyEffects.textObjects[].text` (§1.4) |
| 6 | **Précédence contradictoire** — « nommée des deux côtés → INLINE » détruisait tout badge dont le pseudo apparaît aussi dans la légende | Le mode déclaré gagne, sauf SILENT contre le texte (§1.3) |
| 7 | **Le client déduisait le droit** de `expiresAt`, sans voir la référence | `referenceAccess` dans la charge utile (§5.3) |
| 8 | **Aucune rétractation** — retirer une référence laissait sa notification pointer vers un accès révoqué | Branchement sur `retractCommentNotifications` (§4) |
| 9 | **`resolveMentionedUsers` présenté comme supprimable** — les messages l'utilisent encore | Retiré des routes de post seulement (§5.2) |
| 10 | **`getMentionsByPost` lit les SILENT** sans que ce soit dit | Effet documenté, jugé acceptable (§9) |
