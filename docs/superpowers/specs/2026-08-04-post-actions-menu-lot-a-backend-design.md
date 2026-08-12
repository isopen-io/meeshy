# Menu d'actions des postes — Lot A : backend

Date : 2026-08-04
Statut : spec validée, prêt pour plan d'implémentation
Lots suivants : B (iOS), C (web) — specs séparées

## Contexte

Les postes et les réels doivent exposer un menu « … » homogène sur toutes les
surfaces (carte de feed, carte de réel, page de détail) avec les actions
suivantes :

| Action | Visible pour |
|---|---|
| Copier le texte | tous |
| Partager (lien `/l/<token>`) | tous |
| Enregistrer les médias | tous |
| Signaler | tous |
| Modifier | auteur uniquement |
| Supprimer | auteur **ou** modérateur et plus |

L'audit du code existant montre que le gateway couvre déjà la majorité de ces
besoins. Ce lot ne livre que les deux écarts réels, afin que les lots clients
(B : iOS, C : web) codent contre un contrat stable.

### Ce qui existe déjà — à NE PAS réimplémenter

| Besoin | Existant |
|---|---|
| Signaler un poste | `POST /api/admin/reports`, `reportedType: 'post'` déjà accepté (`routes/admin/reports.ts:20`) |
| Partager un lien `/l/<token>` | `POST /posts/:postId/share` avec `generateLink: true` → `postService.shareWithTrackingLink` |
| Réutiliser le lien du partageur | garanti : unicité applicative `(targetId, createdBy)` sur `TrackingLink`, index partiel défini dans `prisma/migrations/2026-06-14-tracking-link-target.mongodb.js`. Réutiliser un lien n'incrémente PAS `shareCount` |
| Analytics du lien du partageur | `GET /posts/:postId/share` |
| Modifier le texte **et ajouter/retirer des médias** | `PUT /posts/:postId` — `UpdatePostSchema.mediaIds` (ajout, max 10) et `removeMediaIds` (retrait, max 50), `routes/posts/types.ts:303-309` |

### Les deux écarts traités par ce lot

1. Aucune traçabilité des téléchargements de médias.
2. `PostService.deletePost` refuse tout acteur qui n'est pas l'auteur — un
   modérateur ne peut pas retirer un contenu.

## Décisions produit actées

1. **« Enregistrer » = téléchargement des médias, exclusivement.** La mise en
   favori (bookmark) garde son bouton dédié dans la barre d'actions et
   disparaît du menu « … ». Sur iOS, l'entrée `feed.post.save` du menu de
   `FeedPostCard` (`FeedPostCard.swift:693-698`) sera retirée au lot B — le
   bouton favori dédié existe déjà (`FeedPostCard.swift:978`), rien n'est perdu.
2. **Un modérateur peut supprimer, jamais modifier.** Réécrire le texte
   d'autrui sous sa signature casse l'intégrité du contenu et la traçabilité.
   `updatePost` reste strictement réservé à l'auteur.
3. **Le signalement se fait avec un motif choisi**, comme pour les messages
   (`ReportMessageView` côté web). L'envoi direct en `inappropriate` pratiqué
   aujourd'hui par iOS (`FeedViewModel.swift:908`) sera remplacé au lot B. Le
   backend accepte déjà les huit motifs, aucun changement requis ici.
4. **La trace de téléchargement n'est pas remontée en UI** pour le moment.
   Elle est écrite et conservée, rien de plus. Les compteurs dénormalisés sont
   néanmoins alimentés dès ce lot (décision 7) : c'est ce qui garantit qu'une
   future surface analytique lira en O(1) sans jamais agréger la table
   d'événements.
5. **Historique complet des téléchargements** : chaque téléchargement produit
   une ligne, y compris répété par le même utilisateur sur le même média.
6. **Aucune purge ni TTL** sur la table d'événements pour l'instant. L'index
   `[createdAt]` rend une purge ou un index TTL triviaux à ajouter plus tard
   sans migration de schéma, et les compteurs dénormalisés garantissent que
   les totaux survivent à toute purge future.
7. **Lectures analytiques rapides par construction** — architecture à deux
   étages : compteurs dénormalisés pour tout ce qui se lit en O(1), table
   d'événements indexée pour l'analyse fine. Détail en section 1.
8. **Aucune notification à l'auteur** lors d'une suppression par un modérateur.
   La ligne d'audit est le seul artefact. Notifier impliquerait un type de
   notification, quatre traductions et une entrée dans la carte des préférences
   — sujet produit distinct.

## 1. Traçabilité des téléchargements de médias

### Architecture de lecture — deux étages

Une table d'événements brute grossit sans limite ; compter par agrégation
dessus se dégrade avec le volume. La lecture analytique rapide est donc obtenue
par construction, pas par optimisation ultérieure :

**Étage chaud — O(1), aucune agrégation.** Deux compteurs dénormalisés
incrémentés à l'écriture. Toute question « combien » se répond en lisant un
entier, quelle que soit la taille de la table. Ce n'est pas une entorse à la
règle anti-redondance du CLAUDE.md (qui vise les paires booléen + timestamp) :
`Post` porte déjà huit compteurs de ce type — `viewCount`, `impressionCount`,
`bookmarkCount`, `shareCount`, `playCount`, `postOpenCount`,
`qualifiedViewCount`, `repostCount`.

**Ordre d'écriture : événements d'abord, compteurs ensuite.** Le gateway
n'utilise `$transaction` nulle part ; le pattern impression
(`interactions.ts:374-392`) enchaîne `create` puis `update` sans transaction, et
ce lot le suit. La conséquence doit être assumée en connaissance de cause : une
panne entre les deux écritures laisse le compteur en retard sur l'historique.
Cet ordre est le seul réparable — un compteur sous-évalué se recalcule depuis
les événements, alors qu'un compteur incrémenté avant un `createMany` qui
échoue serait surévalué sans aucune trace permettant de le corriger.

**Étage froid — la table d'événements, indexée pour les requêtes réelles.**

| Index | Requête servie |
|---|---|
| `[postId, userId]` | téléchargeurs uniques d'un poste · « cet utilisateur a-t-il déjà téléchargé ? » |
| `[mediaId, createdAt]` | grain média sur une fenêtre temporelle |
| `[userId, createdAt]` | historique de téléchargement d'un utilisateur |
| `[createdAt]` | balayage par période, rollups futurs, TTL éventuel |

`[surface, createdAt]` est délibérément écarté : `surface` n'a que trois
valeurs, l'index serait trop peu sélectif pour être choisi par le planner. Le
filtre par surface s'applique après le filtre temporel.

### Modèle Prisma

Calqué sur `PostImpression` / `PostView`, qui écrivent une ligne par événement.

```prisma
/// Téléchargement d'un média de poste par un utilisateur.
/// Historique complet : un même utilisateur re-téléchargeant le même média
/// produit une nouvelle ligne (pas d'upsert). Le dédupliqué reste calculable
/// via distinct(userId).
model PostMediaDownload {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  postId    String   @db.ObjectId
  /// Pas de relation Prisma vers PostMedia, délibérément : une cascade
  /// effacerait la trace analytique en même temps que le média détaché ou
  /// supprimé, alors qu'on veut précisément la conserver. Même raisonnement
  /// que `PostMedia.uploaderId`, qui se passe de relation pour la même raison.
  mediaId   String   @db.ObjectId
  userId    String   @db.ObjectId
  /// Surface d'origine de l'action : feed | detail | reel
  surface   String   @default("detail")
  createdAt DateTime @default(now())

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  user User @relation("UserPostMediaDownloads", fields: [userId], references: [id])

  @@index([postId, userId])
  @@index([mediaId, createdAt])
  @@index([userId, createdAt])
  @@index([createdAt])
}
```

Relations inverses à ajouter : `mediaDownloads PostMediaDownload[]` sur `Post`
et `postMediaDownloads PostMediaDownload[] @relation("UserPostMediaDownloads")`
sur `User`. Rien sur `PostMedia`, qui n'a pas de relation entrante ici.

### Compteurs dénormalisés

Deux compteurs, deux sémantiques distinctes :

| Champ | Incrément | Répond à |
|---|---|---|
| `Post.downloadCount` | **+1 par action** « Enregistrer », quel que soit le nombre de médias | « combien de fois ce poste a-t-il été enregistré ? » |
| `PostMedia.downloadCount` | **+1 par média** effectivement écrit | « quelle image / vidéo de ce poste est la plus reprise ? » |

```prisma
// sur model Post
downloadCount Int @default(0)

// sur model PostMedia
downloadCount Int @default(0)
```

**La somme des `PostMedia.downloadCount` d'un poste ne vaut PAS son
`Post.downloadCount`, et c'est voulu** : l'un compte des actions, l'autre des
médias. Un poste à quatre images enregistré une fois donne `Post.downloadCount
= 1` et quatre `PostMedia.downloadCount = 1`. Ne jamais « corriger » cet écart
— il porte l'information.

### Route

`POST /posts/:postId/downloads` — `preValidation: [requiredAuth]`

Body :

```ts
{
  mediaIds: string[],                          // 1..50, obligatoire
  surface?: 'feed' | 'detail' | 'reel'         // défaut 'detail'
}
```

Réponse : `sendSuccess(reply, { recorded: number })` où `recorded` est le
nombre de lignes réellement écrites.

Un appel batch et non un appel par média : « Enregistrer » sur un poste à
quatre images télécharge les quatre d'un coup, un seul aller-retour.

#### Séquence

1. Authentification requise (`registeredUser`) — sinon `401 UNAUTHORIZED`.
2. Validation Zod du body — sinon `400 VALIDATION_ERROR`.
3. Chargement du poste non supprimé **filtré par la visibilité du
   demandeur** — sinon `404 POST_NOT_FOUND` (voir l'encadré ACL).
5. **Déduplication des `mediaIds`** (voir l'encadré ci-dessous — non
   négociable).
6. Filtrage : seuls les `mediaIds` dont le `PostMedia.postId` correspond au
   poste sont retenus.
7. `createMany` des lignes retenues.
8. `updateMany` sur `PostMedia` : `downloadCount { increment: 1 }` pour les ids
   retenus.
9. `update` sur `Post` : `downloadCount { increment: 1 }` — une seule fois,
   l'action compte pour une.
10. `sendSuccess(reply, { recorded })`.

#### Déduplication des `mediaIds` — la dérive à empêcher

`updateMany` avec un filtre `in` **déduplique** : `{ id: { in: ['a', 'a'] } }`
ne matche qu'un document et n'incrémente qu'une fois. Un batch contenant deux
fois le même `mediaId` écrirait donc deux lignes d'événement pour un seul
incrément de compteur — historique et compteur divergeraient silencieusement,
et définitivement, sans qu'aucune erreur ne soit levée.

Les `mediaIds` sont donc dédupliqués à l'entrée de la route, avant toute
écriture. `recorded` compte les lignes après déduplication.

#### Table des erreurs

| Cas | Statut | Code |
|---|---|---|
| Non authentifié | 401 | `UNAUTHORIZED` |
| Poste absent, supprimé **ou non visible** | 404 | `POST_NOT_FOUND` |
| `mediaIds` vide, > 50, ou `surface` hors énum | 400 | `VALIDATION_ERROR` |
| Un `mediaId` n'appartient pas au poste | 200 | filtré, non compté dans `recorded` |

#### ACL : quelle visibilité, et pourquoi pas 403

**Le filtre est celui de la VISIBILITÉ, pas celui de l'interaction.**
`postVisibility.ts` porte deux ACL délibérément différentes, et son en-tête
documente l'asymétrie comme un choix produit (décision 2026-07-08) :

- `buildPostVisibilityOrFilter` / `PostService.buildVisibilityFilter` — ce
  qu'un utilisateur peut **voir** : amis ∪ contacts DM ∪ co-membres de
  communauté ;
- `canUserViewPost` — ce sur quoi il peut **interagir** (réagir, commenter) :
  amis stricts.

Enregistrer un média est un acte de consommation, pas d'interaction : si
l'utilisateur a pu afficher le média, il doit pouvoir l'enregistrer. Utiliser
`canUserViewPost` refuserait le téléchargement d'un média affiché à l'écran
d'un contact DM. Le chargement passe donc par le **même** chemin que la lecture
du poste — `findFirst` avec `buildVisibilityFilter(userId)`, exactement comme
`PostService.getPostById` (`PostService.ts:581-586`).

**Conséquence : pas de `403`.** Un poste inexistant et un poste invisible sont
indiscernables par construction — le filtre de visibilité fait partie du
`where`. C'est le comportement voulu : répondre `403` révélerait qu'un poste
existe à cet identifiant. `getPostById` se comporte déjà ainsi.

**Arbitrage sur le dernier cas** : un client dont le cache est en retard sur une
édition (média détaché entre-temps) ne doit pas voir tout son batch rejeté.
Le filtrage silencieux est préféré au rejet global ; `recorded` dit la vérité.

## 2. Suppression par un modérateur

### Signature

`PostService.deletePost(postId, userId)` devient :

```ts
deletePost(
  postId: string,
  actorId: string,
  options: { actorRole: string },
)
```

### Règle d'autorisation

- `post.authorId === actorId` → autorisé, comportement actuel strictement
  inchangé (soft-delete `deletedAt`, désactivation des `TrackingLink`, purge des
  usages de son).
- `post.authorId !== actorId` et `actorRole ∈ { MODERATOR, ADMIN, BIGBOSS }` →
  autorisé, **plus** une ligne `AdminAuditLog`.
- sinon → `throw new Error('FORBIDDEN')`, mappé en `403 FORBIDDEN` par la route
  (inchangé).

### Ligne d'audit

```ts
await prisma.adminAuditLog.create({
  data: {
    userId: post.authorId,     // l'utilisateur affecté
    adminId: actorId,          // le modérateur
    action: 'DELETE_POST',
    entity: 'Post',
    entityId: postId,
    metadata: JSON.stringify({ type: post.type }),
  },
});
```

L'écriture d'audit est best-effort : un échec de log ne doit pas annuler la
suppression, mais doit être journalisé en `warn` — même traitement que la
désactivation des `TrackingLink` dans la méthode existante.

### Route

`DELETE /posts/:postId` transmet le rôle lu dans
`authContext.registeredUser.role`. Aucune autre modification.

`core.ts:404` est le **seul** appelant de `deletePost` dans le gateway : le
changement de signature ne se propage nulle part ailleurs.

## Tests

TDD : chaque test est écrit et rouge avant la ligne de production correspondante.

### `services/gateway/src/__tests__/posts-media-download-route.test.ts`

- écrit une ligne par média du batch et renvoie `recorded` égal au nombre écrit ;
- deux appels identiques successifs produisent **deux** lignes par média
  (non-déduplication — protège la décision 5 contre une régression en upsert) ;
- un `mediaId` appartenant à un autre poste est filtré : aucune ligne pour lui,
  `recorded` ne le compte pas, statut 200 ;
- **un `mediaId` répété dans le même batch ne produit qu'une ligne**, et
  `PostMedia.downloadCount` n'est incrémenté que d'un — verrouille la
  déduplication d'entrée contre le piège `updateMany` + `in` ;
- `Post.downloadCount` est incrémenté de **1** pour un batch de quatre médias,
  tandis que chacun des quatre `PostMedia.downloadCount` est incrémenté de 1 —
  verrouille la divergence volontaire entre les deux compteurs ;
- poste invisible pour l'appelant → **404** (pas 403 : ne pas révéler son
  existence), aucune ligne écrite, aucun compteur touché ;
- poste supprimé → 404 ;
- appel non authentifié → 401 ;
- `mediaIds: []` → 400.

### `services/gateway/src/__tests__/posts-delete-moderator.test.ts`

- l'auteur supprime son poste → 200, aucune ligne d'audit ;
- un `USER` non auteur → 403, poste intact ;
- un `MODERATOR` non auteur → 200 **et** ligne d'audit avec
  `adminId` = modérateur, `userId` = auteur, `entityId` = postId,
  `action: 'DELETE_POST'` ;
- `ADMIN` et `BIGBOSS` non auteurs → 200 ;
- un échec d'écriture d'audit n'empêche pas la suppression.

### Commandes de vérification

```bash
cd packages/shared && npx prisma generate --generator client
cd packages/shared && bun run build
cd services/gateway && bun run test:coverage
```

Prérequis imposés par le CLAUDE.md racine : sans `prisma generate`, une
vingtaine de suites gateway échouent ; sans `shared build`, `SocialEventsHandler`
échoue. Les tests tournent sous **bun**, pas node — c'est ce que fait la CI.

## Migration

Le modèle `PostMediaDownload` est purement additif : aucune donnée existante
n'est touchée, aucun champ n'est retiré. MongoDB crée la collection à la
première écriture. Les deux `downloadCount` sont des `Int @default(0)` : les
documents `Post` et `PostMedia` existants les lisent à `0` sans backfill.

### Les index NE se créent PAS tout seuls

**L'entrypoint de production ne joue aucune migration.** Les quatre `@@index`
déclarés dans le schéma Prisma ne seront jamais créés sur la base de
production par un déploiement. Sans action explicite, la collection écrit
parfaitement et toute lecture analytique fait un COLLSCAN — exactement ce que
cette architecture cherche à éviter.

Le lot livre donc un script de migration versionné, sur le modèle de
`2026-07-04-reaction-single-per-user-unique-index.mongodb.js` :

`packages/shared/prisma/migrations/2026-08-04-post-media-download-indexes.mongodb.js`

- crée les quatre index sur `PostMediaDownload` avec des noms explicites ;
- **idempotent** : un index déjà présent avec la même spec est un no-op ;
  présent avec une spec divergente, il est droppé puis recréé ;
- s'exécute par `mongosh "$DATABASE_URL" < 2026-08-04-post-media-download-indexes.mongodb.js` ;
- l'en-tête du script documente la raison de chaque index (la table du § 1),
  pour qu'un futur mainteneur ne supprime pas « celui qui ne sert à rien ».

L'exécution de ce script sur la production fait partie de la définition de
« terminé » du lot A, au même titre que les tests verts.

## Hors périmètre de ce lot

- Toute UI : les lots B (iOS) et C (web) consomment ce contrat.
- Le téléchargement lui-même (écriture dans la photothèque ou le disque) :
  c'est du code client, le backend ne fait qu'enregistrer la trace.
- Remontée des statistiques de téléchargement dans une quelconque surface.
- Notification à l'auteur d'une suppression par un modérateur.
- Extension du droit de modification aux modérateurs — explicitement rejetée.
