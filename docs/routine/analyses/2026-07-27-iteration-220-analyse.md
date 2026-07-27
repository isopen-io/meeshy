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
# Iteration 220 — Canonicalisation de `originalLanguage` sur les chemins d'écriture **posts & commentaires**

## Protocole (démarrage)
`main` @ `7d65020e` (dernier commit : feat android/chat sticky day-header #2403).
Branche `claude/brave-archimedes-t8mcu5` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). `bun install` + `prisma generate` (client `native`). Le jest gateway mappe
`@meeshy/shared/(.*)` → **source** `packages/shared/$1` : l'import de `normalizeLanguageCode` est
transpilé par ts-jest à la volée, pas de rebuild `dist` requis.

PRs ouvertes au démarrage — **audit anti-doublon** (30 PRs) :
- **#2371** (`gateway/messaging` — canonicalise `originalLanguage` sur édition + share-links, 219i) et
  **#2375** (`shared/prisme` — canonicalise `customDestinationLanguage`) : suite directe de 218/219,
  mais ne touchent **PAS** `PostService.ts`/`PostCommentService.ts`/`routes/posts/`.
- **#2378** (`gateway/reactions` — idempotence réaction post/comment) : touche les réactions, pas
  `originalLanguage`.
- **#2380** (`shared/dnd`), **#2402** (`web/calls`), **#2374** (`gateway/calls`), **#2377/#2369/#2370/#2368/#2367**
  (ios), dependabot #2381→#2399 : aucun chevauchement avec les fichiers ciblés.
- **Aucune PR ouverte ne touche `PostService.ts`, `PostCommentService.ts`, `routes/posts/core.ts` ni
  `routes/posts/comments.ts`.** Zéro chevauchement de fichier.

## Sélection : **Priorité 1 — correctness + Single Source of Truth (suite directe de 218/219)**

Candidat **explicitement légué** par l'itération 219 (« Future Considerations ») :
> **Posts/commentaires** : `routes/posts/types.ts` définit `originalLanguage: z.string().min(2).max(16)` —
> auditer si le service posts/comments persiste une claim brute (même canonicalisation candidate).

218 a rendu `Message.originalLanguage` canonique au funnel ; 219 (PR #2371) a fermé les 3 chemins
d'écriture messages hors funnel. Cette itération applique **la même canonicalisation write-boundary au
domaine social** (Post + PostComment), qui souffre exactement de la même asymétrie write-verbatim /
read-canonical.

## Current state (avant correctif)

Trois écritures social persistent `originalLanguage` **verbatim** depuis la claim client :

1. `PostService.createPost` (`services/PostService.ts:117`) :
   `const originalLanguage = data.originalLanguage ?? (data.content ? detectLanguage(data.content) : undefined);`
   → `post.create({ data: { originalLanguage } })`. Schema `CreatePostSchema.originalLanguage = z.string().min(2).max(5)`
   → **accepte `fr-FR`, `en-US`, `pt-BR` verbatim** (5 chars).
2. `PostService.updatePost` (`services/PostService.ts:666-670`) :
   `const languageChanged = requestedLanguage !== undefined && requestedLanguage !== post.originalLanguage;`
   puis `updateData.originalLanguage = requestedLanguage; updateData.translations = {};`. Schema
   `UpdatePostSchema.originalLanguage = z.string().min(2).max(16)` → **accepte BCP-47 verbatim**.
3. `PostCommentService.addComment` (`services/PostCommentService.ts:65`) :
   `originalLanguage: originalLanguage ?? null`. Schema `CreateCommentSchema.originalLanguage = z.string().min(2).max(16)`
   → **accepte BCP-47 verbatim**.

Le chemin `detectLanguage(content)` retourne déjà des codes canoniques 2-lettres — seule la **claim
client** contourne la canonicalisation. Les clients envoient le locale brut de la plateforme (iOS
`Locale.current` → `fr_FR`, web `navigator.language` → `fr-FR`).

Corollaire côté déclenchement de traduction :
- `routes/posts/core.ts:109` alimente `PostTranslationService.translatePost` avec
  `parsed.data.originalLanguage ?? post.originalLanguage` → **la claim brute** est utilisée comme langue
  source NLLB (le `post` est pourtant déjà en main et sera canonique après le correctif).
- `routes/posts/comments.ts:272` utilise déjà `(comment as any).originalLanguage` (valeur stockée) →
  **auto-corrigé** dès que `addComment` canonicalise au write.

## Problems identified

1. **Bug de correctness — fragmentation des consommateurs de `originalLanguage` (même classe que 218/219).**
   Un `'fr-FR'` persisté casse :
   - **Source NLLB** : mapping keyé `'fr' → 'fra_Latn'` ; `'fr-FR'` ne matche pas → source mal résolue.
   - **Clé de cache de traduction** (`PostTranslationService`) : mélange `'fr-FR'`/`'fr'` → miss de cache,
     doublons de jobs ZMQ.
   - **Résolution du Prisme au read** : `postIncludes` surface `originalLanguage`+`translations` pour le
     resolver ; un original `'fr-FR'` fausse la comparaison langue-préférée-vs-original.
2. **Bug secondaire propre à `updatePost` — re-traduction fantôme.** Un post déjà stocké `'fr'` édité avec
   `requestedLanguage='fr-FR'` (même langue, variante régionale) déclenche `languageChanged = true`
   (`'fr-FR' !== 'fr'`) → **`translations = {}` efface toutes les traductions existantes** et relance
   5 jobs ZMQ pour rien. La canonicalisation avant comparaison élimine ce faux positif.
3. **Incohérence write-boundary cross-domaine.** 218/219 ont canonicalisé les messages ; le domaine social
   produisait encore des lignes non canoniques → base hétérogène selon le type de contenu (message vs
   post/comment).

## Root causes
- Le domaine social (`PostService`/`PostCommentService`) a été développé en parallèle du funnel messages et
  n'a jamais reçu la normalisation au write (leçon 218/219 non encore propagée).
- La claim est trustée verbatim au write pour éviter un round-trip détecteur — mais « trust » ≠ « ne pas
  normaliser » : normaliser est local, pur, sans I/O.

## Business impact
- Traductions manquées/dupliquées pour tout post/commentaire créé/édité dès que la plateforme émet un
  locale région-taggé (la majorité), plus effacement de traductions valides à l'édition. Impact direct sur
  le Prisme Linguistique du feed social (surface d'engagement clé).

## Technical impact
- `Post.originalLanguage` et `PostComment.originalLanguage` deviennent canoniques par construction sur tous
  les chemins d'écriture claim-driven. SSOT en base réellement homogène messages **et** social. Zéro
  nouveau helper, zéro dépendance de build : réutilise `normalizeLanguageCode`
  (SSOT `@meeshy/shared/utils/language-normalize`), déjà consommé par messages (218/219).

## Risk assessment
**Faible.**
- Repli `normalizeLanguageCode(claim) ?? claim` **identique** au funnel 218/219 → mêmes garanties : code
  irréductible (`'bas'`, 2-lettres inconnu) conservé verbatim ; codes déjà canoniques inchangés
  (idempotence) ; seuls les claims réductibles (`'fr-FR'`→`'fr'`, `'en_US'`→`'en'`) changent = améliorations.
- Aucun round-trip détecteur ajouté ; `detectLanguage(content)` (fallback sans claim) inchangé.
- `core.ts` : bascule vers la valeur canonique déjà stockée sur le `post` en main (SSOT), jamais moins
  correcte.

## Proposed improvements
1. `PostService.createPost` : normaliser la claim —
   `const originalLanguage = data.originalLanguage ? (normalizeLanguageCode(data.originalLanguage) ?? data.originalLanguage) : (data.content ? detectLanguage(data.content) : undefined);`
2. `PostService.updatePost` : canonicaliser `requestedLanguage` **avant** la comparaison et l'écriture, de
   sorte qu'une variante régionale de la même langue ne déclenche plus de re-traduction.
3. `PostCommentService.addComment` : normaliser la claim au `create`
   (`originalLanguage: originalLanguage != null ? (normalizeLanguageCode(originalLanguage) ?? originalLanguage) : null`).
4. `routes/posts/core.ts:109` : utiliser la valeur canonique déjà persistée sur le `post` créé comme source
   de traduction (SSOT), au lieu de re-lire la claim brute.

## Expected benefits
- `Post`/`PostComment.originalLanguage` canoniques en base → NLLB source correcte, clé de cache stable,
  résolution Prisme exacte, plus de re-traduction fantôme à l'édition. Parité write-boundary
  messages ↔ social.

## Implementation complexity
Très faible : +2 imports, ~4 sites re-câblés, +tests RED→GREEN (createPost `fr-FR`→`fr`, createPost `bas`
verbatim, updatePost variante régionale = pas de re-traduction, updatePost vraie bascule `en_US`→`en`,
addComment `fr-FR`→`fr` + `bas` verbatim).

## Validation criteria
- RED prouvé (source revertée via `git stash`) : claim `'fr-FR'`/`'en_US'` → `create/update` avec la valeur
  brute ; `updatePost` déclenche `translations={}` sur variante régionale (échecs). `'bas'` reste vert.
- GREEN : `'fr-FR'`→`'fr'`, `'en_US'`→`'en'` persistés ; `'bas'`→`'bas'` verbatim ; variante régionale =
  pas de re-traduction. Suites `PostService`/`PostCommentService` vertes. Suite gateway complète sans
  régression.

## Future Considerations
- **Migration légère optionnelle** (léguée par 217/218/219) : normaliser les lignes
  `Post`/`PostComment.originalLanguage` historiques région-taggées (batch idempotent).
- **Convergence schema** : porter la normalisation dans un `.transform` Zod partagé (`CommonSchemas.language`)
  une fois tous les consommateurs audités (messages + social désormais couverts) — SSOT unique au parse.
- **Préférences in-app** (`systemLanguage` & co) : #2375 couvre `customDestinationLanguage` ; auditer
  `systemLanguage`/`regionalLanguage` pour la même asymétrie write-verbatim.
