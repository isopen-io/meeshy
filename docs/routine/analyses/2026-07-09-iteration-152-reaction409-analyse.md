# Iteration 152 — Analyse d'optimisation (2026-07-09)

## Protocole (démarrage)
`main` @ `1142cc58` (dernier merge : PR #1749 iter — Android starred-messages list).
Branche `claude/brave-archimedes-1o2vbq` synchronisée sur `origin/main` (0/0). Ce cycle
prend **152**.

Cible retenue = le **candidat gateway explicitement différé par l'itération 151** (voir
`2026-07-09-iteration-151-analyse.md`, section « Candidat gateway écarté ce cycle ») :
changer l'emoji d'une réaction post/story renvoie **HTTP 500**. L'itération 151 avait tranché
l'ambiguïté produit : **Option B** (mapper vers un 4xx propre) est le fix minimal et défendable
« sans décision produit ». Ce cycle implémente Option B avec une erreur **typée** (pas de
string-matching fragile).

---

## Cible retenue : F118 — un garde de domaine atteignable (max 1 réaction) remonte en `500 INTERNAL_ERROR` sur `POST /posts/:id/like`

### Current state
`PostReactionService.addReaction` (`services/gateway/src/services/PostReactionService.ts:99-113`)
applique un garde délibéré `MAX_REACTIONS_PER_USER = 1` qui **throw** dès qu'un emoji
différent est demandé :
```ts
if (uniqueEmojis.size >= MAX_REACTIONS_PER_USER && !uniqueEmojis.has(sanitized)) {
  throw new Error(`Maximum ${MAX_REACTIONS_PER_USER} different reactions per post reached`);
}
```
Ce garde est **délibéré** (test `PostReactionService.test.ts` l'asserte). Le problème n'est
PAS le garde — c'est son **mapping HTTP**. La route `POST /posts/:postId/like`
(`routes/posts/interactions.ts`) ne filtre que `POST_NOT_FOUND` (→ 404) ; tout autre throw
tombe dans le `catch` générique → `sendInternalError` → **HTTP 500**.

`PostService.likePost` (`PostService.ts:725-734`) ne rattrape que les messages contenant
`not found` / `deleted` (→ `null`) et **rethrow** le reste — donc l'erreur du garde remonte
intacte jusqu'au 500.

### Problems identified
Reachability confirmée en production via **iOS** :
- `StoryInteractionService.react(storyId:emoji:)` (`apps/ios/.../StoryInteractionService.swift:117-127`)
  POST un emoji **arbitraire** sur `/posts/\(storyId)/like`.
- `OutboxDispatcher` (`OutboxDispatcher.swift:485`) rejoue les likes/réactions post via le
  même `POST /posts/:id/like`.

Scénario : un utilisateur réagit ❤️ à une story, puis change pour 😂 → `addReaction` throw →
route → **HTTP 500**. Le web passe par le socket (`post:reaction-add`) qui, lui, dégrade déjà
proprement (ACK `{success:false, error}`), donc le 500 est spécifique au **chemin REST**
(iOS + tout appelant direct de l'API).

### Root causes
Une erreur de **domaine attendue et atteignable** (l'utilisateur change son emoji) est levée
comme un `Error` générique non typé. La route n'a aucun moyen de la distinguer d'un vrai
défaut serveur → elle la classe en `INTERNAL_ERROR`. Il manque un **type d'erreur** portant
sa sémantique HTTP (409 Conflict) le long de la chaîne service → route.

### Business impact
Un 500 sur un changement de réaction est un signal d'erreur serveur (bruit d'observabilité,
alerte, ret– rien à corriger côté infra) pour un comportement produit **nominal**. Côté iOS,
l'appel est fire-and-forget : l'UI optimiste garde le nouvel emoji tandis que le backend
conserve l'ancien — mais le mapping 500 masque la vraie nature « conflit » de l'événement.

### Technical impact
- Pollution des logs `error` + métriques 5xx pour un cas 4xx légitime.
- Contrat d'API incohérent : les autres gardes de domaine de la même route (`POST_NOT_FOUND`
  → 404, `FORBIDDEN` → 403 sur pin/repost) sont mappés correctement ; seul le garde réaction
  échappait au mapping.

### Risk assessment
Très faible. Aucune sémantique produit modifiée : le garde `max 1` **throw toujours** et
rejette toujours le 2e emoji. On change uniquement (a) le **type** de l'erreur levée
(`Error` → `ConflictError`, message préservé à l'identique) et (b) le **code HTTP** rendu
(500 → 409). Le test existant `.rejects.toThrow('Maximum 1 different reactions per post reached')`
reste vert (message inchangé). Le chemin socket (`PostReactionHandler`) lit `error.message`
→ inchangé. `likePost` rethrow le `ConflictError` intact (message ne matche pas
`not found`/`deleted`).

### Proposed improvements
1. `PostReactionService.addReaction` lève un `ConflictError` typé
   (`errors/custom-errors.ts`, `statusCode = 409`, `code = 'REACTION_LIMIT_REACHED'`),
   message identique.
2. La route `POST /posts/:postId/like` mappe `instanceof ConflictError` → `sendConflict`
   (409) avant le fallback `sendInternalError`.

### Expected benefits
- Un changement de réaction post/story renvoie **409 CONFLICT** (`code: REACTION_LIMIT_REACHED`),
  plus jamais 500.
- Erreur de domaine **typée** : la route décide le statut HTTP sans string-matching fragile.
- Cohérence avec le reste de la route (404/403 déjà typés) et avec la hiérarchie
  `BaseAppError` documentée.

### Implementation complexity
Triviale : 1 throw retypé + 3 lignes de mapping route + 2 imports. Tests RED→GREEN.

### Validation criteria
- Nouveau test route « returns 409 (not 500) when the reaction-limit guard trips » vert.
- Nouveau test service « throws a typed ConflictError (409) » vert.
- Test existant « should throw error when max reactions per user reached » toujours vert.
- Suites `PostReactionService.test.ts` + `interactions.test.ts` vertes, aucune régression.

---

## Note de suivi (pour les cycles futurs)
- **Option A (swap)** reste ouverte et nécessite un signal produit : aligner post/comment sur
  le modèle message (upsert single-reaction, `replacedEmojis`, broadcast remove+add) pour que
  changer d'emoji **remplace** au lieu de rejeter. Hors périmètre autonome tant qu'aucune
  intention produit n'est signalée.
- Le **chemin comment** (`CommentReactionService.addReaction`) applique le même garde
  `max 1, throw new Error(...)`. Si un chemin REST comment expose un 500 équivalent, le même
  retypage `ConflictError` s'y appliquera (non traité ce cycle — le chemin réaction commentaire
  passe par le socket `CommentReactionHandler`, qui dégrade déjà via ACK).
