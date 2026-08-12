# Iteration 170 — Analyse d'optimisation (2026-07-11)

## Protocole (démarrage)
`main` @ `11298df` (dernier merge : PR #1878 — android/profile avatar+banner upload).
Branche `claude/brave-archimedes-gldrgs` réinitialisée sur `origin/main` (0/0). Ce cycle prend **170**.

PRs ouvertes (périmètres à ne pas toucher) : #1877 (gateway `RedisDeliveryQueue.peek()` sort —
`services/gateway/src/services/RedisDeliveryQueue.ts`), #1842 (dependabot build-tools). Aucune ne
touche `apps/web/components/v2/CommentList.tsx` / `CommentThread.tsx` / `apps/web/lib/`.

Candidat consigné par l'itération 169 (backlog web reels) : **le like d'un commentaire dans
l'overlay Reels re-like indéfiniment**. Analyse approfondie ci-dessous — le défaut est plus large
que le seul écran Reels.

---

## Cible retenue : F129 — l'état « liké » d'un commentaire n'est jamais dérivé de l'objet commentaire ; le prop `likedCommentIds: Set` n'a aucun producteur → re-like infini (Reels) + cœur creux permanent (détail post)

### Current state
`CommentItem` décide like vs unlike à partir du seul booléen `isLiked`
(`CommentItem.tsx:76` — `handleLikeToggle`). Ce booléen est calculé par les conteneurs
`CommentList.tsx:123` et `CommentThread.tsx:96` **uniquement** via l'appartenance à un `Set`
optionnel : `isLiked={likedCommentIds.has(comment.id)}`, `likedCommentIds = new Set()` par défaut.

Or **aucun appelant ne peuple jamais `likedCommentIds`** :
- `ReelsFeedScreen.tsx:251` rend `<CommentList … />` **sans** `likedCommentIds`.
- `app/feeds/post/[postId]/page.tsx:206` rend `<PostDetail … />` **sans** `likedCommentIds` ;
  `PostDetail.tsx:340` le transmet tel quel (`undefined`) à `CommentList`.

Le prop `likedCommentIds` n'est donc que du câblage mort : `Set` toujours vide, `isLiked` toujours
`false` pour **tous** les commentaires en production.

### Problems identified
1. **Reels — re-like infini + divergence.** `isLiked` étant toujours `false`, chaque clic sur le
   cœur d'un commentaire appelle `onLike` (jamais `onUnlike`). La mutation optimiste
   `useLikeCommentMutation.onMutate` (`use-comment-mutations.ts:208`) fait `likeCount + 1`
   **inconditionnellement** et pousse `comment:reaction-add` au serveur à chaque clic. L'utilisateur
   peut regonfler `likeCount` sans limite ; l'état diverge de la vérité serveur jusqu'au prochain
   refetch.
2. **Détail post — cœur creux permanent.** Même après un like réussi (le serveur enregistre la
   réaction, `currentUserReactions` est mis à jour dans le cache par la mutation ET par le socket
   sync), le cœur du commentaire reste **creux** (`fill:none`, couleur muted) car `isLiked` ne
   consulte jamais l'état réel. `aria-pressed` reste `false` → régression d'accessibilité.
3. **Câblage mort.** Le prop `likedCommentIds` (défini sur 3 composants) suggère une source qui
   n'existe pas — dette de conception qui invite à « brancher un Set » alors que la donnée est déjà
   portée par chaque commentaire.

### Root cause
La **source de vérité** de « ce commentaire est-il liké par moi » est déjà `currentUserReactions`
sur l'objet `PostComment`, maintenue de façon autoritative aux deux chemins :
- optimiste : `use-comment-mutations.ts:213-215` (add) / `:279` (remove) ajoute/retire l'emoji ❤️ de
  `currentUserReactions` ;
- socket : `use-post-socket-cache-sync.ts:304-309` / `:327-330` fait de même quand
  `data.userId === currentUserId`.

C'est **exactement** l'invariant utilisé pour les posts/reels :
`ReelsFeedScreen.tsx:37` — `isReelLiked = currentUserReactions.includes('❤️') || isLikedByMe`,
et `post/[postId]/page.tsx:212` inline la même expression. Les commentaires, eux, n'exploitent
jamais cet invariant : ils dépendent d'un `Set` externe fantôme au lieu de leur propre état.
Divergence de patron entre deux entités réactives (post vs comment) qui devraient être identiques.

### Business impact
**Priorité 1 — feature récente (feed social / reels / réactions de commentaires).** Deux défauts
visibles et fréquents : (a) sur Reels, spam de likes possible sur un commentaire ; (b) partout, le
cœur ne reflète jamais l'état liké — l'utilisateur ne sait pas s'il a déjà aimé un commentaire.
Contredit la promesse d'un feedback optimiste « instantané et correct » (Instant App Principles →
Optimistic Updates) et le principe de cohérence inter-entités.

### Technical impact
Aucune donnée serveur corrompue ; divergence purement client. Duplication de l'expression
« hearted-by-me » (reels local + post-detail inline) sans source unique → risque de re-divergence.
Le fix consolide en un helper pur réutilisable (Single Source of Truth).

### Risk assessment
Faible. Dérivation ajoutée au niveau des conteneurs (`CommentList`, `CommentThread`) qui itèrent
déjà chaque commentaire ; le prop `likedCommentIds` conserve sa sémantique d'**override** explicite
(union : `Set.has(id) || hearted(comment)`), donc les tests existants qui passent `isLiked`
directement à `CommentItem` restent verts. Contrats de mutation et events socket inchangés.

### Proposed improvements
Créer une **source unique** pure `apps/web/lib/reactions.ts` :

```ts
export const HEART_EMOJI = '❤️';

export function isHeartLikedByMe(entity: {
  currentUserReactions?: readonly string[] | null;
  isLikedByMe?: boolean;
}): boolean {
  return (entity.currentUserReactions ?? []).includes(HEART_EMOJI) || (entity.isLikedByMe ?? false);
}
```

- `CommentList` / `CommentThread` : `isLiked={likedCommentIds.has(c.id) || isHeartLikedByMe(c)}`.
- Dédup : `ReelsFeedScreen.isReelLiked`, l'inline du détail post, et `HEART_EMOJI` de
  `use-comment-mutations.ts` réutilisent le helper/const (une seule définition de ❤️).

### Expected benefits
- Reels : un second clic sur un commitement liké appelle `onUnlike` → plus de re-like infini,
  convergence optimiste ↔ socket.
- Partout : le cœur d'un commentaire liké s'affiche plein (`fill`, terracotta) et `aria-pressed`
  correct après like — parité avec les posts.
- Source unique de « hearted-by-me » (posts, reels, commentaires) → suppression de la duplication
  et du câblage mort conceptuel.

### Implementation complexity
Faible (~20 lignes prod : 1 helper + 1 const + dérivation dans 2 conteneurs + 3 substitutions de
dédup). TDD : unit tests du helper + tests de comportement « unlike au 2e clic » sur `CommentList`.

### Validation criteria
- RED confirmé : tests du helper + régression « CommentList appelle onUnlike quand le commentaire
  porte ❤️ dans currentUserReactions » échouent contre le code actuel (`isLiked` toujours `false`).
- GREEN : `reactions.test.ts` + `comment-components.test.tsx` + `comment-thread.test.tsx` verts.
- `tsc --noEmit` propre sur les fichiers touchés.
- Contrats de mutation, rollbacks et events socket inchangés.

## Backlog reporté (candidats futurs, non pris ce cycle)
- **web** — `likedCommentIds` prop désormais redondant sur `CommentList`/`CommentThread`/`PostDetail` :
  pourrait être supprimé entièrement dans un cycle ultérieur une fois le helper adopté partout
  (câblage mort → suppression pure). Laissé en place ce cycle comme override rétro-compatible.
