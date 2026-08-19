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
| Types concernés | Post, Reel, Story, Mood, Status — **même approche partout** |

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

L'unicité `[postId, mentionedUserId]` reste : **une personne, un mode par contenu**. Nommée
des deux côtés — badge posé *et* `@handle` dans le texte — elle compte INLINE, parce que
c'est la voie que l'édition relit, donc celle qui doit gouverner sa survie.

### 1.3 Migration

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

### 3.3 Ce que la porte n'ouvre PAS

La branche est câblée dans les ouvertures **unitaires**, pas dans
`buildPostVisibilityOrFilter`. Conséquence voulue : la story d'un inconnu qui vous épingle
**n'atterrit pas dans votre tray**. Vous l'ouvrez depuis la notification, l'inbox mentions ou
son profil — jamais par surprise au milieu du feed.

### 3.4 Balayage des STATUS

`ExpiredStoriesCleanupService` épargne tout post portant au moins une référence **non
consommée**, jusqu'à un plafond de grâce de **7 jours après `expiresAt`** (aligné sur
`EPHEMERAL_AUTHOR_ARCHIVE_MS`) — sans quoi un statut dont personne n'ouvre jamais la
notification vivrait éternellement. Passé ce délai, il est balayé même si des références
restent intactes, et leur notification devient morte.

Filtre, avec le piège Prisma-Mongo :

```ts
{ OR: [{ expiredViewAt: { isSet: false } }, { expiredViewAt: null }] }
```

## 4. Notification

Libellé unifié, dérivé de `postType` déjà présent en metadata :

> **X vous a référencé dans son Réel / Post / Story / Statut / Mood**

`packages/shared/utils/notification-strings.ts` — le cas `user_mentioned` cesse de rendre un
libellé unique et se branche sur `postType`, comme `friend_new_*` le fait déjà juste au-dessus.
Sept langues à couvrir (cliquet français : attention aux clés sans accent).

**`filterPostConsumers` sort du chemin mention.** C'est un changement de sécurité assumé : la
garde empêchait aujourd'hui l'extrait d'un post FRIENDS de partir vers un non-ami. Puisque le
référencement ouvre l'accès, la garde n'a plus d'objet — et **l'avertissement du composer
devient la seule protection restante**, donc il n'est pas cosmétique.

Le tap route vers la surface du type (`reference_notification_tap_routing_map`), en passant par
`resolveReferenceAccess` : une notification vers un contenu expiré dont le droit est déjà
dépensé ouvre l'écran « ce contenu n'est plus disponible », pas un 404 brut.

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

`resolveMentionedUsers` (re-parsing du texte) est **retiré** des routes de post. La charge
utile porte la relation, résolue au chargement — donc avec le `displayName` et l'avatar **du
moment**, jamais figés :

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

Identiques sur Post, Reel, Story, Mood et Status.

### 7.1 Le chip « Mentionner » — hors texte

Ouvre un panneau de personnes en **chips horizontaux scrollables**, filtrables.

| Geste | Résultat |
|---|---|
| **Tap simple** | **SILENT** |
| **Appui long** | menu : badge (**PINNED**) · référencer (**NOTE**) · notifier (**SILENT**) |

Un PINNED pose le badge sur le canevas ; l'auteur le déplace ensuite librement — c'est
`StoryTextObject` avec fond plein, qui hérite gratuitement du déplacement, de la rotation, du
z-order, de la timeline, du rendu à l'export et de la persistance dans `StoryEffects`.

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
| Composer post / mood | `UnifiedPostComposer.swift` | **les deux entrées** (chip + liste `@`) ; aujourd'hui seule l'insertion INLINE existe |
| Publication | `StoryViewModel.runStoryUpload`, `PostService.createStory` / `createPost` | cesser de dériver les mentions des `textObjects` ; envoyer la liste déclarée avec son mode |
| Surlignage | pendant post de `MessageTextRenderer.swift` | linkifier **uniquement** ce que `post.mentions` valide |
| Rangée « Avec … » | feed, détail, reel | nouveau composant, `display == NOTE` |
| Marqueur personnel | détail, viewer | « Vous êtes référencé·e ici » quand `display == SILENT` et que c'est soi |
| Viewer story / statut | `StoryViewModel` (filtres `!$0.isExpired()`, lignes ~2750 / ~2782) | ouverture par référence même expiré ; l'écran de fin quand le droit est dépensé |
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

**PINNED sur un contenu sans canevas.** Un POST ou un MOOD n'a aujourd'hui aucune couche de
positionnement sur ses médias. L'option « badge » y est donc **masquée** jusqu'à ce que la
convergence des composers donne un canevas à tous les types — plutôt que d'inventer une
couche jetable, ou de proposer un mode qui ne se verrait pas. Point de reprise explicite.

## 10. Tests

TDD, RED d'abord. Ce qui doit échouer avant d'être écrit :

**Gateway**
- INLINE dérivé du texte, jamais accepté en déclaration (Zod rejette `display: 'INLINE'`)
- une personne nommée des deux côtés compte INLINE
- édition : retirer un `@handle` supprime la ligne INLINE ; les déclarées survivent à
  `declared: undefined` ; `[]` les efface
- une SILENT ne sort **jamais** de la charge utile de feed
- le détail projette : auteur → tout, personne concernée → la sienne, tiers → rien
- contenu vivant : ouvertures illimitées, `expiredViewAt` reste absent
- contenu expiré : première ouverture accordée + horodatée, seconde refusée
- un STATUS portant une référence non consommée survit au balayage ; balayé une fois toutes
  consommées, ou passé le plafond de grâce
- le libellé de notification suit `postType`, dans les 7 langues

**Clients (règle pure, sans UI)**
- INLINE → NOTE retire le `@handle` du texte ; NOTE → INLINE le réinsère
- le payload ne contient que les non-INLINE
- dédup : le dernier mode choisi gagne

**Clients (rendu)**
- `@nimportequoi` n'est **pas** linkifié (le défaut web actuel)
- un SILENT n'apparaît jamais dans la rangée « Avec … », même servi par un cache de détail

## 11. Lots

1. **Schéma + migration** — enum, `expiredViewAt`, script `CONTENT→INLINE`, `CANVAS→PINNED`
2. **Gateway écriture** — `postMentions.ts` généralisé, Zod, dérivation INLINE
3. **Gateway lecture** — relation incluse, projection au détail, retrait de `resolveMentionedUsers`
4. **Gateway accès** — `resolveReferenceAccess`, branche ACL, balayage, notification unifiée
5. **Règle pure partagée** — Swift + TS, testée sans UI
6. **iOS** — composers, rendu, viewer
7. **Web** — composers, rendu, viewer

Les lots 1–4 sont séquentiels. 5 peut démarrer en parallèle de 2. 6 et 7 sont indépendants
l'un de l'autre une fois 3–5 livrés.

## 12. Hors scope

- Badge PINNED sur les médias d'un POST/MOOD (attend la convergence des composers)
- Injection des contenus référencés dans le feed ou le tray (décision §3.3)
- Rétention froide des `storyViews` anciennes, évoquée dans `ephemeralPosts.ts`
