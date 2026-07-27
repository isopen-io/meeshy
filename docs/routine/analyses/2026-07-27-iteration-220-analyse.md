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
