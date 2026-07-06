# Iteration 93 — Analyse d'optimisation (2026-07-04)

## Protocole (démarrage)
`main` @ `aa4086f5` (« docs(story-sota): it.54 hash corrected post-rebase » — HEAD au démarrage,
working tree propre). Branche de travail `claude/brave-archimedes-czdq90` déjà synchronisée sur
`origin/main`, 0 commit non-mergé à préserver.

PR ouvertes au démarrage : #1448 (iOS calls — logging DTMF/transcript), #1447 (gateway —
`RedisDeliveryQueue` dedup par `messageId+eventType`), #1445 (iOS a11y — `KeypadTab` Dynamic Type).
Toutes disjointes des fichiers web ciblés ici. Cible retenue : **F56** (parké it.91→92,
MEDIUM-HIGH) — double-comptage de `likeCount` sur la réaction de l'utilisateur qui réagit
(self-echo socket + update optimiste), pure correction web vérifiable en jest.

## Cible : F56 — double-comptage de `likeCount` sur self-echo de réaction (posts + commentaires)

### Current state
Réagir à un post/commentaire suit deux chemins qui touchent tous deux le cache React Query :

1. **Mutation optimiste** (`use-post-mutations.ts` / `use-comment-mutations.ts`,
   `useLikePostMutation` / réaction commentaire) : `onMutate` fait `likeCount: p.likeCount + 1` +
   `reactionSummary[emoji] += 1`. Déclenchée par le reactor lui-même (feed, détail, reel).
2. **Echo socket** (`use-post-socket-cache-sync.ts`) : le gateway rediffuse l'événement de
   réaction vers `ROOMS.post(postId)`. Le reactor **est dans cette room** sur les pages
   détail/reel (`use-post-room.ts` join). `handlePostReactionAdded` faisait `likeCount: p.likeCount
   + 1` **en aveugle**, tandis que `reactionSummary[emoji]` était fixé à la valeur
   **autoritaire** `data.aggregation.count`.

Le gateway **route déjà le ❤️ sur POST/REEL via l'événement ABSOLU** `post:liked`
(`PostReactionHandler.broadcastReactionChange`, l.99-119) → `handlePostLiked` fait `likeCount =
data.likeCount` (absolu, auto-corrige) → **pas de double-comptage pour le ❤️ sur post**. MAIS :
- Les **emojis non-❤️** sur post (picker de réaction — `handleReact` → `likeMutation.mutate({postId,
  emoji})`) passent par `post:reaction-added` (chemin relatif) → double-comptage.
- Les **commentaires** : `CommentReactionHandler` (l.149) émet `comment:reaction-added` pour
  **TOUS** les emojis, y compris le ❤️ — **aucune exception heart-absolu**. Donc le double-comptage
  du commentaire touche même le like-cœur par défaut (cas le plus courant).

Résultat visible : après une réaction, « N likes » (`PostDetail.tsx:243`, total) affiche
`base + 2` alors que les badges emoji (`PostDetail.tsx:223`, somme du `reactionSummary`) affichent
`base + 1`. Divergence permanente jusqu'au prochain refetch.

### Problems identified
- **Double-comptage `likeCount`/`reactionCount`** sur le self-echo : l'update optimiste a déjà
  appliqué `+1`, l'echo en applique un second. `reactionSummary` (autoritaire) reste correct → le
  total et la somme des badges divergent.
- **Incohérence de source de vérité dans le même handler** : `reactionSummary` était réconcilié en
  absolu (`= aggregation.count`) mais `likeCount` en relatif (`+1`) — deux stratégies pour deux
  champs qui doivent rester cohérents.
- **Non-idempotence** : un echo dupliqué (reconnexion, multi-livraison) ajoutait encore `+1`.

### Root cause
`likeCount` (total agrégé de réactions) et `reactionSummary` (compte par emoji) doivent rester
liés par l'invariant `likeCount == Σ reactionSummary`. Le handler mettait `reactionSummary` à jour
en **absolu autoritaire** mais `likeCount` en **relatif aveugle** — l'incrément relatif ne connaît
pas l'état optimiste préexistant du reactor, d'où le double-comptage.

### Business impact
Le compteur de likes est l'affordance sociale la plus visible du feed. Un « N likes » qui saute de
+2 sur sa propre réaction (et diverge des badges emoji) est un défaut de qualité perçu
immédiatement, sur le geste le plus fréquent de la surface sociale (like d'un post/commentaire).

### Technical impact
4 handlers convergent sur un helper unique `reactionDelta(entity, data)` :
`delta = aggregation.count − reactionSummary[emoji]` (le compte autoritaire de l'emoji moins le
compte en cache). `likeCount`/`reactionCount` avancent de ce delta. `reactionSummary[emoji]` reste
fixé en absolu. Zéro changement gateway/iOS/shared — correction purement web.

### Risk assessment
FAIBLE. Le delta reproduit exactement l'ancien comportement pour les cas remote/frais (tests
existants inchangés : `prev=0,next=1 → +1` ; `prev=1,next=0 → −1`) et corrige uniquement le
self-echo optimiste (`prev=next → delta 0`). Idempotent contre les echos dupliqués. Aucun schéma,
aucune migration, aucune API publique modifiée.

### Proposed improvements
1. Helper `reactionDelta(entity, data)` — delta autoritaire par emoji, réutilisé par les 4 handlers.
2. `handlePostReactionAdded` / `handlePostReactionRemoved` : `likeCount`/`reactionCount` += delta
   (au lieu de ±1).
3. `handleCommentReactionAdded` / `handleCommentReactionRemoved` : `likeCount` += delta.
4. Tests de régression explicites : self-echo optimiste (delta 0 → pas de double-comptage) +
   reactor distant (delta autoritaire) pour posts ET commentaires.

### Expected benefits
- `likeCount == Σ reactionSummary` garanti après chaque réaction, sur toutes les surfaces.
- Le geste le plus fréquent (like ❤️ d'un commentaire) cesse de double-compter.
- Handler cohérent : une seule stratégie (absolu autoritaire) pour `reactionSummary` ET les totaux.
- Idempotence contre les echos dupliqués — robustesse reconnexion.

### Implementation complexity
FAIBLE — 1 helper + 4 handlers convergés dans un seul fichier + 3 tests de régression.

### Validation criteria
- [x] Self-echo optimiste : `likeCount` inchangé (post non-❤️ ET commentaire ❤️).
- [x] Reactor distant : `likeCount += aggregation.count − cache` (delta autoritaire).
- [x] Tests existants de réaction (add/remove, dedup, other-user) : 0 régression.
- [x] `tsc --noEmit` web : pas de nouvelle erreur sur le fichier touché.

## Candidats écartés ce cycle (documentés)
- **Fix racine gateway (POST_REACTION_ADDED absolu comme POST_LIKED)** : le plus symétrique
  (payload porterait `likeCount` absolu), mais touche le type shared, `createUpdateEvent`, le
  décodage iOS — blast radius multi-service non testable ici (pas de toolchain iOS). Reporté (F56b)
  si une itération gateway+iOS coordonnée le justifie ; le fix web-only est suffisant et correct.

## Améliorations futures (report)
- **F51b** (LOW) : réécriture complète des docs `notifications/` (composition défunte, module
  fantôme `NotificationServiceExtensions`).
- **F55** (MEDIUM) : reels cache desync web sur edit/delete.
- **F56b** (LOW) : symétriser le gateway pour émettre un `likeCount` absolu sur
  `post:reaction-added/removed` (aligne posts non-❤️ sur le chemin heart-absolu).
- **F57** (LOW) : `hasMentions` (ASCII `\w`) vs `parseMentions` (Unicode) boundary drift.
- **F58** (LOW) : comment-reaction `postType` STATUS/REEL collapse.
- **F59** (LOW) : REST comment-like vs socket comment-reaction notif type divergence.
