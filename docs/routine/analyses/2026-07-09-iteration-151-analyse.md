# Iteration 151 — Analyse d'optimisation (2026-07-09)

## Protocole (démarrage)
`main` @ `9e3d608f` (dernier merge : PR #1742 iter 150 — replay pin/unpin aux
participants hors-ligne). Branche `claude/brave-archimedes-ciz6qk` synchronisée sur
`origin/main` (0/0). PRs ouvertes au démarrage : #1743 (Android reply-thread overlay,
autre session, hors périmètre autonome). Ce cycle prend **151**.

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src` (delivery queue,
post/story views, présence, reactions, stats), (b) `apps/web` + `packages/shared`
(présence, prisme, typing, reactions, mentions). Consigne : **un** défaut de logique
quasi-pure, haute confiance, **actuellement en production**, non couvert par les tests.
Priorité 1 = features récemment développées.

---

## Cible retenue : F117 — l'autocomplete de mention web tue les usernames à tiret car son garde re-valide avec `\w` (sans tiret) alors que la regex de détection autorise le tiret

### Current state
`apps/web/hooks/composer/useMentions.ts`. Deux regex décrivent le charset d'une mention
en cours de frappe, et elles **divergent** :

- **Détection** (ligne 56) — inclut délibérément le tiret :
  ```ts
  // Inclut le tiret (charset username /^[a-zA-Z0-9_-]+$/) pour que
  // l'autocomplete continue après un tiret (`@marie-cl…`).
  const MENTION_REGEX = /@([\w-]{0,30})$/;
  ```
- **Garde du handler** (ligne 205) — re-valide la query extraite avec `\w` **seul** :
  ```ts
  const detection = detectMentionAtCursor(value, cursorPosition);
  if (detection && /^\w{0,30}$/.test(detection.query)) {
  ```

En JS, `\w` = `[A-Za-z0-9_]` — **le tiret n'y est pas**. Dès qu'un tiret apparaît dans la
query, la garde échoue et le code prend la branche `else` :
`setShowMentionAutocomplete(false)` + `setMentionQuery('')`. Le support tiret ajouté à
`MENTION_REGEX` (et à tout l'effort hyphen-username de `mention-parser.ts` /
`mention-display.ts`, `MENTION_HANDLE_CHARS = '\\w-'`) est donc **mort** — annulé par la
ligne suivante.

### Problems identified
Un utilisateur voulant mentionner `@marie-claire` :
1. Tape `@marie` → `detection.query = "marie"`, garde `/^\w{0,30}$/` passe → dropdown visible ✅
2. Tape `-` → `@marie-` : `detection.query = "marie-"` (MENTION_REGEX matche), mais
   `/^\w{0,30}$/.test("marie-")` → **false** → dropdown disparaît, query effacée ❌

Résultat : impossible de sélectionner un username à tiret depuis l'autocomplete une fois
le tiret tapé — exactement le cas que le commentaire de `MENTION_REGEX` prétend supporter.

### Root causes
Deux sources de vérité pour un même charset. La regex de détection a été étendue au tiret
(effort hyphen-username) sans propager la même extension à la garde de re-validation, qui
duplique le charset avec `\w`. La garde est de toute façon **redondante** avec
`MENTION_REGEX` (elle re-teste ce que la capture a déjà borné à `[\w-]{0,30}`).

### Business impact
Friction sur les mentions pour tout username contenant un tiret (courant : prénoms
composés, marques, handles). Le prisme social (mentions/notifications) rate silencieusement
sa cible : l'utilisateur ne peut pas déclencher l'autocomplete → mention non liée → pas de
notification au destinataire.

### Technical impact
Feature morte (le tiret de `MENTION_REGEX` est inatteignable via l'UX). Divergence de
charset non testée entre détection et garde.

### Risk assessment
Très faible. Changement d'un seul caractère dans une classe de caractères regex, alignant
la garde sur la regex de détection déjà en production. Aucune sémantique produit modifiée :
les usernames à tiret sont déjà valides côté parser/display/backend ; on rétablit juste
leur autocomplete. Les autres charsets (underscore, numérique, ≤30 / >30 chars) restent
couverts et inchangés.

### Proposed improvements
Aligner la garde sur la regex de détection (un caractère) :
```ts
if (detection && /^[\w-]{0,30}$/.test(detection.query)) {
```

### Expected benefits
- L'autocomplete continue après un tiret → sélection possible de `@marie-claire`.
- Le charset mention a une seule définition effective (détection ⇒ garde cohérente).
- Parité avec `mention-parser.ts` / `mention-display.ts` (`MENTION_HANDLE_CHARS`).

### Implementation complexity
Triviale : 1 caractère de production + 2 tests de comportement (RED→GREEN).

### Validation criteria
- Nouveau test « autocomplete reste ouvert après un tiret » (`@marie-` → query `marie-`).
- Nouveau test « username à tiret » (`@marie-claire` → query `marie-claire`).
- Suite `useMentions.test.tsx` verte (43/43, +2), aucune régression underscore/numérique/limite.

---

## Candidat gateway écarté ce cycle (décision produit requise) : changer l'emoji d'une réaction post/story renvoie HTTP 500

L'agent gateway a trouvé un vrai défaut : `PostService.likePost`
(`services/gateway/src/services/PostService.ts:725-734`) rappelle
`postReactionService.addReaction`, mais `PostReactionService.addReaction`
(`PostReactionService.ts:99-113`) applique un garde délibéré
`MAX_REACTIONS_PER_USER = 1` qui **throw** `"Maximum 1 different reactions per post
reached"` dès qu'un emoji différent existe. `likePost` ne filtre que
`not found`/`deleted` et rethrow → la route `POST /posts/:postId/like` fait
`sendInternalError` → **HTTP 500** sur un changement d'emoji.

**Pourquoi écarté ce cycle (pas rejeté définitivement)** : contrairement au modèle
réaction *message* (`ReactionService.addReaction`) qui **swappe** atomiquement via un
upsert sur clé unique `(messageId, participantId)` et renvoie `replacedEmojis`, les modèles
réaction *post ET comment* enforce tous deux un garde « max 1, throw » — **coché
délibérément**, avec un test qui asserte le throw
(`PostReactionService.test.ts:264`). Décider que les posts doivent **swapper** (comme les
messages) plutôt que **rejeter** est un choix **produit/architectural**, pas un défaut de
logique pure. Le mission-brief interdit de re-litiger un choix architectural délibéré sans
justification nouvelle.

**Ce qui reste incontestablement fautif** : un garde de domaine attendu et atteignable ne
doit **jamais** remonter en `500 INTERNAL_ERROR`. Deux directions possibles pour une
itération future (nécessite un signal d'intention produit) :
- **Option A (swap)** : aligner post/comment sur le modèle message (upsert single-reaction,
  `replacedEmojis`, broadcast remove+add). Change la sémantique produit → décision requise.
- **Option B (4xx propre)** : mapper l'erreur `Maximum … reactions` vers un `409 CONFLICT`
  (ou `400`) au lieu de `500`, dans `likePost` / la route. Préserve la sémantique « max 1 »,
  supprime juste le 500. Fix minimal et défendable sans décision produit.

Noté ici pour ne pas re-fan-outer dessus au prochain cycle. Divergence secondaire signalée
par l'agent (plus basse confiance, non retenue) : `SocialEventsHandler.getVisibilityFilteredRecipients`
fanne encore `story:created`/`post:liked` aux **amis seuls** alors que `c15e90ef` a élargi
l'audience *vues* à `amis ∪ contacts DM` — plausiblement intentionnel (le feed est SSOT).
