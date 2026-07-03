# Iteration 86 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `a4c4c4f4` (working tree propre, branche `claude/brave-archimedes-x42y3i` réalignée sur
`origin/main`, aucun commit non-mergé). PR ouvertes au démarrage : #1385 (web/realtime — auto-retry
forwards `clientMessageId`), #1384 (iOS a11y `AttachmentLoadingTile`). Les deux couvrent des surfaces
disjointes (web-realtime, iOS-SwiftUI) — cette itération vise délibérément des **bugs de correction
backend/shared purement vérifiables en jest**, indépendants de ces PR (l'env Linux n'a ni toolchain
Swift ni MongoDB live).

Méthode : fan-out de 3 agents d'exploration en parallèle sur des clusters de services disjoints
(social/posts, messaging/stats, shared utils). Deux défauts de correction indépendants, haute
confiance, retenus ; un troisième (asymétrie des maps JSON `dailyActivity/hourly/language` dans
`ConversationMessageStatsService.onMessageDeleted`) écarté car c'est précisément le filon
« agrégats JSON recompute()-corrigés » que l'itération 85 avait classé basse-sévérité/rendement
décroissant (self-healing par `recompute()`).

## Cible 86-A — Pagination des réponses (`getReplies`) inversée

### Current state
`services/gateway/src/services/PostCommentService.ts`. `getComments` (fil de niveau 1) ordonne
**descendant** (`orderBy: [{createdAt:'desc'},{id:'desc'}]`, l.192) et paie son curseur avec `lt`
(l.169-170) — cohérent. `getReplies` (réponses d'un commentaire) ordonne **ascendant**
(`orderBy: [{createdAt:'asc'},{id:'asc'}]`, l.252, ordre de lecture threadé) mais utilisait le
**même** comparateur `lt` (l.230-231) copié de `getComments`.

### Problems identified
Le `nextCursor` est pris sur le **dernier** item de la page (l.258-260) = le `createdAt`/`id` le
**plus grand** vu jusque-là sous un tri ascendant. Pour avancer il faut sélectionner les lignes
**strictement supérieures** au curseur (`gt`) ; avec `lt` la page suivante **remonte** : elle
re-sert des réponses déjà affichées et **abandonne définitivement** les plus récentes.

Scénario concret : 5 réponses à `10:00…10:04` (`r1..r5`), `limit=2`. Page 1 (`take:3`, asc) →
`r1,r2,r3`, items=`r1,r2`, `nextCursor=r2 (10:01)`. Page 2 avec `lt` → `createdAt < 10:01 …` ⇒ ne
matche que `r1`. `r3,r4,r5` ne sont **jamais** renvoyées.

### Root cause
Motif récurrent « fix/règle appliqué à un sous-ensemble de siblings, pas audité sur tous »
(leçons #40/#42/#45/#50/#55) : `getReplies` a hérité du comparateur `lt` de `getComments` en
inversant le tri en ascendant, sans inverser le comparateur. `encode/decodeCursor` ne font que
sérialiser `{createdAt,id}` — la direction du comparateur est le seul déterminant.

### Business impact
Le fil de réponses d'un commentaire est **incomplet et incohérent** dès la page 2 : certaines
réponses sont invisibles pour tout le monde, d'autres dupliquées. Régression fonctionnelle directe
d'une feature sociale.

### Technical impact
`getReplies` : `lt` → `gt` sur les deux clauses du curseur (`createdAt` et le tie-break `id`),
alignant le comparateur sur l'`orderBy: asc`. Aucune signature modifiée, aucune autre méthode
touchée. `getComments` (desc/`lt`) reste correct et inchangé.

### Risk assessment
FAIBLE. Le changement corrige strictement la direction de parcours ; sans curseur (page 1) le
comportement est identique. Couverture : 2 régressions neuves (`getReplies — pagination` : assert
`gt`/pas `lt` + survie du filtre `parentId`) + 16 tests conservés = 18 verts.

## Cible 86-B — `CommonSchemas.language` rejette les codes ISO 639-3 supportés

### Current state
`packages/shared/utils/validation.ts:62`. `language: z.string().min(2).max(5).regex(
/^[a-z]{2}(-[A-Z]{2})?$/)`. Consommé par `ConversationSchemas.sendMessage.originalLanguage` (l.615)
et `editMessage.originalLanguage` (l.623), et par les routes `messages.ts`/`messages-advanced.ts`.

### Problems identified
Le corps `[a-z]{2}` du regex n'accepte que les codes ISO 639-1 à 2 lettres. Les codes ISO 639-3 à
3 lettres — `bas` (Basaa), `ksf`, `nnh`, `dua`, `ewo` : langues camerounaises **officiellement
supportées** (`languages.ts:1034-1118`, `isSupportedLanguage('bas')===true`, préservées verbatim par
`normalizeLanguageCode`) — sont **rejetés** (« Code langue invalide »).

Incohérence inter-schémas : `systemLanguage`/`regionalLanguage` (l.175-182) valident via
`.refine(isSupportedLanguage)` et **acceptent** `bas` ; `MessageSchemas.send.originalLanguage`
(l.544) n'a **aucun** regex. Donc un utilisateur peut définir `systemLanguage: 'bas'` et
s'enregistrer, mais **ne peut pas envoyer/éditer** un message étiqueté `bas` via la route
conversations. Contradiction directe avec le Prisme Linguistique (support multilingue = cœur produit).

### Root cause
Le regex fige la forme 2-lettres ISO 639-1 et ignore les codes 639-3 que le reste de la plateforme
traite comme canoniques. Même motif « règle non homogène entre siblings », cette fois sur la
**validation de langue**.

### Technical impact
Regex élargi à `/^[a-z]{2,3}(-[A-Z]{2})?$/` — accepte 2 **ou** 3 lettres minuscules + sous-tag région
BCP-47 optionnel. Choix du regex (vs bascule sur `.refine(isSupportedLanguage)`) délibéré : ne
**widen** que l'acceptation (aucun input valide existant cassé), et conserve `en-US` (forme région)
que `isSupportedLanguage` rejetterait. `min(2)/max(5)` inchangés — `bas` (3) passe ; un 639-3 +
région (6 car.) reste hors-bornes mais cette combinaison n'existe pas en pratique.

### Risk assessment
FAIBLE. Le regex n'élargit l'acceptation qu'aux codes 3-lettres minuscules (même profil de risque
que l'acceptation actuelle de `zz` — le regex n'a jamais été une whitelist de vraies langues).
Rejette toujours `f`, `english`, `EN`, `fr2`. Couverture : suite `CommonSchemas.language` neuve
(4 cas : 639-1, 639-3 ×5, région, malformés) — auparavant 0 test sur ce schéma.

## Validation
- `vitest __tests__/validation.test.ts` (shared) → 28/28 ✓ (dont `language` ×4 neufs)
- `jest PostCommentService.test.ts` → 18/18 ✓ (dont `getReplies — pagination` ×2 neufs)
- `jest` comments + interactions + interactions2 + CommentReactionService + PostCommentService →
  5 suites / 293 tests ✓, 0 régression
- `bun run build` (shared) → 0 erreur (validation.ts compile)

## Validation criteria (rappel)
- [x] `getReplies` sélectionne les réponses avec `gt` (aligné sur `orderBy: asc`) ; `parentId`
  survit au curseur.
- [x] `getComments` (desc/`lt`) inchangé.
- [x] `CommonSchemas.language` accepte `bas`/`ksf`/`nnh`/`dua`/`ewo` et `en-US` ; rejette les codes
  malformés.
- [x] Aucune régression sur les suites posts/comments.
