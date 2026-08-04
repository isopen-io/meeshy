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
   Elle est écrite et conservée, rien de plus.
5. **Historique complet des téléchargements** : chaque téléchargement produit
   une ligne, y compris répété par le même utilisateur sur le même média.
6. **Aucune notification à l'auteur** lors d'une suppression par un modérateur.
   La ligne d'audit est le seul artefact. Notifier impliquerait un type de
   notification, quatre traductions et une entrée dans la carte des préférences
   — sujet produit distinct.

## 1. Traçabilité des téléchargements de médias

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
  mediaId   String   @db.ObjectId
  userId    String   @db.ObjectId
  /// Surface d'origine de l'action : feed | detail | reel
  surface   String   @default("detail")
  createdAt DateTime @default(now())

  post  Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  media PostMedia @relation(fields: [mediaId], references: [id], onDelete: Cascade)
  user  User      @relation("UserPostMediaDownloads", fields: [userId], references: [id])

  @@index([postId])
  @@index([userId, createdAt])
}
```

Relations inverses à ajouter : `mediaDownloads PostMediaDownload[]` sur `Post`,
sur `PostMedia`, et `postMediaDownloads PostMediaDownload[] @relation("UserPostMediaDownloads")`
sur `User`.

**Pas de compteur dénormalisé** (`downloadCount`) sur `Post` ni `PostMedia` :
la donnée n'est pas remontée, et le CLAUDE.md interdit les champs redondants.
Un `count()` suffira quand une surface en aura besoin.

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
3. Chargement du poste non supprimé — sinon `404 POST_NOT_FOUND`.
4. Contrôle de visibilité via `canUserViewPost(prisma, post, userId)`
   (`services/posts/postVisibility.ts:64`) — sinon `403 FORBIDDEN`.
5. Filtrage : seuls les `mediaIds` dont le `PostMedia.postId` correspond au
   poste sont retenus.
6. `createMany` des lignes retenues.
7. `sendSuccess(reply, { recorded })`.

#### Table des erreurs

| Cas | Statut | Code |
|---|---|---|
| Non authentifié | 401 | `UNAUTHORIZED` |
| Poste absent ou supprimé | 404 | `POST_NOT_FOUND` |
| Poste non visible pour l'appelant | 403 | `FORBIDDEN` |
| `mediaIds` vide, > 50, ou `surface` hors énum | 400 | `VALIDATION_ERROR` |
| Un `mediaId` n'appartient pas au poste | 200 | filtré, non compté dans `recorded` |

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
- poste invisible pour l'appelant → 403, aucune ligne écrite ;
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
première écriture.

**L'entrypoint de production ne joue aucune migration** (cf. mémoire projet) :
les index `@@index([postId])` et `@@index([userId, createdAt])` déclarés dans le
schéma ne seront pas créés automatiquement sur la base de production. Ils
devront être posés manuellement via `mongosh` après déploiement. À défaut, la
collection reste fonctionnelle en écriture — seules les futures lectures
analytiques seraient lentes.

## Hors périmètre de ce lot

- Toute UI : les lots B (iOS) et C (web) consomment ce contrat.
- Le téléchargement lui-même (écriture dans la photothèque ou le disque) :
  c'est du code client, le backend ne fait qu'enregistrer la trace.
- Remontée des statistiques de téléchargement dans une quelconque surface.
- Notification à l'auteur d'une suppression par un modérateur.
- Extension du droit de modification aux modérateurs — explicitement rejetée.
