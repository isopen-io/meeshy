# Iteration 167 — Analyse d'optimisation (2026-07-11)

## Protocole (démarrage)
`main` @ `e0143ae` (dernier merge : android/profile — share profile + QR code, #1864).
Branche `claude/brave-archimedes-eo12yo` en phase avec `origin/main` (0/0).
Aucune PR autonome ouverte à traiter au démarrage. Ce cycle prend **167**.

Cible choisie parmi le **backlog explicitement reporté** des itérations 152/166
(« Suivis, non traités ce cycle ») :

> **gateway** — `PostCommentService.likeComment` (REST) contourne l'invariant
> « max 1 réaction/user » appliqué par le path socket. Caveat de reachability
> (le client built-in n'envoie que `❤️`).

Confirmé toujours présent. Cible **validable en runtime** ici (service gateway,
tests Jest unitaires purs, aucune dépendance réseau) — contrairement à l'autre
candidat backlog (réaction cross-session Participant ID vs User ID, cross-couche,
non validable sans build web), reporté à nouveau.

---

## Cible retenue : F-CMT-LIKE — `likeComment` (REST) viole l'invariant « un seul like par user » que le chemin socket garantit

### Current state
`services/gateway/src/services/PostCommentService.ts:339`. Deux chemins écrivent dans
la table `CommentReaction` :

- **Socket** — `CommentReactionService.addReaction` applique
  `MAX_REACTIONS_PER_USER = 1` : si l'utilisateur possède déjà une réaction avec un
  emoji **différent**, une 2e réaction distincte est **refusée**
  (`throw 'Maximum 1 different reactions per comment reached'`). Un utilisateur a donc
  **au plus une ligne** `(commentId, userId)`.
- **REST** — `likeComment` faisait un `upsert` direct sur la contrainte unique
  `(commentId, userId, emoji)` :

  ```ts
  await this.prisma.commentReaction.upsert({
    where: { comment_user_reaction_unique: { commentId, userId, emoji } },
    create: { commentId, userId, emoji },
    update: {},
  });
  ```

  L'unicité porte sur le **triplet** `(commentId, userId, emoji)`. Un like avec un
  emoji différent crée donc une **2e ligne** `(commentId, userId, autreEmoji)`.

Le commentaire de code affirmait pourtant « IDEMPOTENT (un seul like par user) » —
l'implémentation ne garantissait en réalité qu'« un like par (user, emoji) ».

### Problems identified
Divergence d'invariant REST vs socket. Un utilisateur ayant réagi `❤️` (via socket)
puis appelant `POST /posts/:postId/comments/:commentId/like` avec `🔥` obtient **deux**
lignes de réaction → `likeCount`/`reactionCount` recomptés depuis la table à **2**,
`reactionSummary = { '❤️': 1, '🔥': 1 }`. Le socket, lui, aurait rejeté le 2e emoji.

Entrée → sortie fausse :
- user réagit `❤️` (socket), puis `likeComment(commentId, user, '🔥')` →
  2 lignes, `likeCount = 2`. Attendu (parité socket) : au plus 1 ligne par user.

### Root causes
`likeComment` a été écrit comme un `upsert` autonome au lieu de refléter le contrat
du service de réactions (max-1-per-user). À l'inverse, `PostService.likePost`
**délègue** à `postReactionService.addReaction` et hérite donc gratuitement de
l'enforcement de l'invariant + du handling de course `P2002`. Le like de commentaire
n'avait pas suivi ce patron.

### Business impact
Faible mais réel : sur-comptage possible des likes de commentaire et incohérence
d'état REST/socket. **Masqué en production** : le client built-in n'envoie que `❤️`
sur ce endpoint (LikeSchema par défaut), donc le chemin « emoji différent » n'est pas
atteignable via l'UI courante. Bug latent de correction/cohérence.

### Technical impact
Confiné au service gateway. Fonction sans état réseau ; compteurs déjà recomputés
depuis la table (`syncCommentLikeCounters`), donc la seule correction requise est
d'empêcher la 2e ligne d'exister.

### Risk assessment
Très faible. Sémantique retenue = **remplacement** (parité d'invariant, pas de throw
introduit) : on supprime d'abord toute réaction préexistante de ce user portant un
**autre** emoji, puis on upsert l'emoji courant. Propriétés :
- **Idempotent** sur le même emoji (aucune ligne autre-emoji → `deleteMany` no-op).
- **≤ 1 ligne** par `(commentId, userId)` garantie structurellement.
- **Aucun throw** ajouté → pas de 500 possible sur le endpoint (contrairement à une
  parité stricte « rejeter comme le socket », qui propagerait l'exception).
- Broadcast/notification de la route utilisent `emoji` = emoji stocké (car
  remplacement) → état observable cohérent (stored == broadcast == notified).

Divergence résiduelle assumée vs socket : le socket **refuse** le changement d'emoji
(remove+add requis), le REST le **remplace** atomiquement. L'invariant partagé
critique (max-1-per-user, pas de double-comptage) est honoré identiquement des deux
côtés ; la nuance de bascule est non atteignable avec le client `❤️`-only.

### Proposed improvements
Dans `likeComment`, avant l'upsert :
```ts
await this.prisma.commentReaction.deleteMany({
  where: { commentId, userId, emoji: { not: emoji } },
});
```
puis conserver l'upsert existant. Compteurs inchangés (recomputés depuis la table).

### Expected benefits
- Invariant « un seul like par user » désormais **vrai** (le commentaire de code ne
  ment plus), aligné sur le chemin socket et sur `likePost`.
- Pas de double-comptage des likes de commentaire via le fallback REST.
- État REST/socket cohérent.

### Implementation complexity
Triviale — 1 appel `deleteMany` de prod + commentaire, 1 test ajouté.

### Validation criteria
- Nouveau test : un like avec emoji différent supprime les réactions autre-emoji du
  user **avant** l'upsert (`deleteMany({ emoji: { not } })` puis `upsert`, ordre
  vérifié) — RED avant, GREEN après (confirmé par `git stash` du service : 1 failed).
- Non-régression : `likeComment` (idempotent ❤️), `unlikeComment`, suites route
  `comments.test.ts` + `comments-like-delete.test.ts` → **166/166 verts**.

---

## Suivis (backlog, non traités ce cycle)
- **web** — réaction cross-session : mauvaise identité comparée (Participant ID vs
  User ID), `apps/web/hooks/queries/use-reactions-query.ts:411,444`. Correctif propre
  = enrichir `ReactionUpdateEventData` du `userId` du réacteur (type partagé +
  `createUpdateEvent` gateway + consommateur web). Cross-couche, non validable en
  runtime ici — reporté.
- **web** — `friend_story_comment` route (F125) : **résolu** en itération 166.
