# Iteration 220 — `post:reaction-add` / `comment:reaction-add` re-diffusent et re-notifient sur un ajout idempotent (doublon) : garde `unchanged` alignée sur `ReactionService`

## Protocole (démarrage)
`main` @ `9729b4b4` (dernier commit : feat android/chat unread-messages separator #2376).
Branche `claude/brave-archimedes-6glwtt` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(gateway). Le jest gateway mappe `@meeshy/shared/(.*)` → **source** `packages/shared/$1`, transpilé
par ts-jest à la volée. `prisma generate --generator client` fait ; `bun install` postinstall
(`turbo run generate`) hang réseau connu → contourné, deps déjà présentes, vitest/jest OK.

PRs ouvertes au démarrage — **audit anti-doublon** (12 PRs #2362→#2377). Le thème **canonicalisation
de code langue au write boundary** est **intégralement en vol** (#2375 `customDestinationLanguage` +
`PreferencesService`, #2371 `originalLanguage` edit, #2364 `originalLanguage` links) — **exclu** de
cette itération. **Aucune PR ouverte ne touche** `PostReactionService.ts`, `CommentReactionService.ts`,
`PostReactionHandler.ts`, `CommentReactionHandler.ts` ni leurs tests. Zéro chevauchement de fichier.

## Sélection : **Priorité 1 — correctness + consistance (parité des 4 handlers de réaction)**

Le codebase possède **4 familles de réactions** avec le même contrat socket `entity:reaction-add`.
Deux d'entre elles ont déjà été durcies contre le ré-envoi sur ajout idempotent, les deux autres
non — l'asymétrie est la cible :

| Handler | Service signale l'idempotence ? | Garde no-op sur add ? |
|---|---|---|
| `ReactionHandler` (messages) | ✅ `{ reaction, replacedEmojis, unchanged }` | ✅ `if (addResult.unchanged) …return` (SSOT) |
| `AttachmentReactionHandler` | ✅ `{ changed }` | ✅ `if (!changed) …return` (iter 134) |
| **`PostReactionHandler`** | ❌ `PostReactionData \| null` | ❌ **absente** |
| **`CommentReactionHandler`** | ❌ `CommentReactionData \| null` | ❌ **absente** |

Note : le chemin **remove** de Post/Comment a DÉJÀ la garde idempotente (`if (!removed) …success no-op`).
Seul le chemin **add** de ces deux handlers est en défaut, parce que leurs services ne surfacent
jamais « était-ce un no-op ? ».

## Current state (avant correctif)

`PostReactionService.addReaction` / `CommentReactionService.addReaction` renvoient la ligne
**existante** sur doublon, **indiscernable** d'un insert frais :
```ts
const existingReaction = await this.prisma.postReaction.findFirst({ where: { postId, userId, emoji } });
if (existingReaction) {
  return this.mapReactionToData(existingReaction);   // truthy — aucun signal "unchanged"
}
// … create … return this.mapReactionToData(reaction);   // même forme
// … branche P2002 (course concurrente) : idem, existing renvoyé sans marqueur
```
`PostReactionHandler.handleAddReaction` / `CommentReactionHandler.handleAddReaction` ne gardent que
« a-t-il échoué ? », jamais « a-t-il changé ? » :
```ts
const reaction = await this.postReactionService.addReaction({ postId, userId, emoji });
if (!reaction) { /* error */ return; }
// … ACK success …
this.broadcastReactionChange(postId, emoji, 'add', userId, updateEvent).catch(…);  // fanout post:liked / post:reaction-added
void this._createPostReactionNotification(postId, emoji, userId);                    // notif "a aimé votre post"
```

## Problems identified

1. **Bug de correctness — notification et broadcast en double sur re-fire.** Scénario réel : `u1` a
   déjà réagi `❤️` sur `p1` (ligne présente, `likeCount`/`reactionSummary` déjà à jour). Le client
   re-émet `post:reaction-add { p1, ❤️ }` — événement de routine (double-fire optimiste, retry socket
   après ACK perdu, second appareil connecté répercutant le même tap). `addReaction` renvoie la ligne
   existante (truthy) → **aucun changement DB**. Mais le handler : (a) `broadcastReactionChange` →
   `socialEvents.broadcastPostLiked` fanne `post:liked` vers les feed rooms de l'auteur **et** la post
   room, (b) `_createPostReactionNotification` → **crée une nouvelle notification `post_like`** à
   l'auteur. Résultat : **l'auteur reçoit une notif « a aimé votre post » à CHAQUE re-fire**, et toutes
   les sockets des rooms feed/post reçoivent un `post:liked` redondant. Identique pour les commentaires
   (`comment:reaction-added` + notif de réaction de commentaire).
2. **Incohérence architecturale.** `ReactionHandler` et `AttachmentReactionHandler` gardent déjà
   exactement ce cas (avec commentaire explicite « re-emitting them spams every participant … and
   re-notifies the author »). `PostReactionHandler`/`CommentReactionHandler` — documentés comme
   « Mirrors … exactly » — divergent silencieusement sur le chemin add.

## Root causes
- Les services Post/Comment ont été calqués sur un `addReaction` **antérieur** au durcissement de
  `ReactionService`, avant que le pattern `{ …, unchanged }` n'existe. La branche existing-reaction
  renvoie la donnée sans marqueur, donc le handler ne PEUT pas distinguer un no-op — il retombe sur le
  seul signal disponible (`!reaction`) qui ne couvre que l'échec.

## Business impact
- Spam de notifications push/in-app à l'auteur d'un post/commentaire populaire dès qu'un client répète
  un like (multi-appareil, reconnexion, UI optimiste) — dégrade la confiance dans les notifications et
  gonfle le trafic socket/push. Toutes les surfaces sociales (feed, détail post, reel viewer, thread de
  commentaires) sont concernées.

## Technical impact
- `addReaction` devient **honnête sur l'idempotence** : renvoie `{ …reactionData, unchanged }`. Les
  deux handlers gagnent la garde `if (reaction.unchanged) { ACK success; return; }` — parité stricte
  avec `ReactionHandler`. Le contrat ACK (`updateEvent`, décodé par iOS) est **préservé** sur le chemin
  no-op (idempotent = succès du point de vue client). `mapReactionToData` (utilisé par `getUserReactions`
  etc.) est **inchangé** — seul `addReaction` porte le marqueur.

## Risk assessment
**Faible.**
- Le champ `unchanged` est **additif et plat** sur l'objet renvoyé par `addReaction` uniquement : les
  assertions de test existantes (`result?.emoji`, `result?.userId`) restent valides ; les `toEqual`
  exacts ne portent que sur `getUserReactions`/`getReactions` (via `mapReactionToData`, non touché).
- `PostService.likePost` (seul autre appelant) **ignore** la valeur de retour → non affecté.
- Sur le chemin no-op, la seule différence observable est **l'absence** d'un broadcast et d'une notif
  qui n'auraient JAMAIS dû partir (aucun état n'a changé) — strictement une correction.
- La branche P2002 (course d'insert concurrente) est aussi marquée `unchanged: true` : deux appareils
  tapant simultanément ne déclenchent plus qu'un seul broadcast+notif (celui qui gagne l'insert).

## Proposed improvements
1. `PostReactionService.addReaction` / `CommentReactionService.addReaction` : type de retour
   `Promise<(…ReactionData & { readonly unchanged: boolean }) | null>` ; `unchanged: true` sur les deux
   branches existing-reaction (findFirst + P2002), `unchanged: false` sur l'insert frais.
2. `PostReactionHandler.handleAddReaction` / `CommentReactionHandler.handleAddReaction` : garde
   `if (reaction.unchanged) { ACK success avec updateEvent; return; }` avant broadcast + notification —
   miroir de `ReactionHandler.handleReactionAdd`.

## Expected benefits
- Un like/réaction répété n'émet plus de notification ni de broadcast redondants — parité des 4 handlers
  de réaction sur un pattern unique. Convergence vers un style d'ingénierie cohérent (objectif mission).

## Implementation complexity
Faible : +1 type + 3 lignes de retour par service (×2) ; +1 garde par handler (×2) ; +`unchanged: false`
sur la const `sampleReactionData` des 2 tests handler (propagé par spread) ; +8 tests RED→GREEN
(2 handler no-op + 6 service).

## Validation criteria
- RED prouvé (garde absente) : mock `addReaction` → `{ …data, unchanged: true }` ; `handleAddReaction`
  émet quand même `POST_REACTION_ADDED`/`broadcastPostLiked` + `createPostLikeNotification` (test échoue
  en attendant zéro appel).
- GREEN : chemin unchanged → ACK `{ success: true, data: updateEvent }`, **aucun** broadcast, **aucune**
  notification ; chemin `unchanged: false` (tests existants) → broadcast + notification comme avant.
- Service : `addReaction` renvoie `unchanged: true` (existing + P2002), `unchanged: false` (insert frais).
- Non-régression : suites `PostReactionService`, `CommentReactionService`, `PostReactionHandler`,
  `CommentReactionHandler` vertes ; surface gateway jest sans régression.

## Future Considerations
- Convergence complète : Post/Comment services pourraient adopter la forme wrapper exacte de
  `ReactionService` (`{ reaction, unchanged }`) si un `replacedEmojis` devenait pertinent (swap d'emoji
  à N>1) — hors scope tant que `MAX_REACTIONS_PER_USER = 1`.
- Idempotence du broadcast côté client : vérifier que les 3 surfaces sociales dédupliquent bien un
  `post:liked` par `(postId, userId)` (défense en profondeur, indépendante de ce correctif serveur).
