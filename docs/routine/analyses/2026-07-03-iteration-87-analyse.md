# Iteration 87 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `5624aa26` (working tree propre, branche `claude/brave-archimedes-f0k0p1` réalignée sur
`origin/main`, 0 commit non-mergé). PR ouvertes au démarrage : #1390 (web/realtime — resync feed room +
typing keepalive), #1389 (iOS composer photothèque), #1388 (iOS a11y Dynamic Type composer). Les trois
couvrent des surfaces disjointes (web-realtime, iOS-SwiftUI) de mes cibles — cette itération vise
délibérément des **bugs de correction backend/shared purement vérifiables en jest/vitest**,
indépendants de ces PR (l'env Linux n'a ni toolchain Swift ni MongoDB live).

Méthode : fan-out de 3 agents d'exploration en parallèle sur des clusters disjoints (services
messaging/social, shared utils/validation, routes/handlers gateway). Deux défauts de correction
indépendants, haute confiance, retenus ; les surfaces routes/handlers gateway auditées se sont
révélées propres (codebase déjà durci, commentaires `Audit gateway prod` documentant les fixes
antérieurs).

## Cible 87-A — `getReels` : curseur dérivé de l'ordre de score, pas de l'ordre chronologique

### Current state
`services/gateway/src/services/PostFeedService.ts`. Le sibling `getFeed` (l.79-151) porte un invariant
**documenté** : `candidateLimit = limit + 1` — fenêtre chronologique + 1 ligne sonde, *« We
deliberately do NOT over-fetch then drop: the cursor advances by createdAt, so any candidate we
fetch-but-drop would be silently skipped (or re-served as a duplicate) on the next page. Ranking
reorders within the window only, which keeps infinite scroll lossless »* (l.80-84). Le curseur y est
pris sur le post **chronologiquement le plus ancien** de la fenêtre affichée, **avant** réordonnancement
par score (l.142-151).

`getReels` (l.389-483) faisait l'**inverse** : `candidatePoolSize = Math.min(limit * 4, 120)` — un pool
4× sur-dimensionné — scoré **en entier** par `reelAffinityScore`, puis `top = scored.slice(0, limit+1)`
et `nextCursor = encodeCursor(lastItem.post.createdAt, ...)` où `lastItem` est le **dernier item
trié par score** (l.470-476).

### Problems identified
La page suivante filtre `createdAt < cursor.createdAt` (l.417). Le curseur pris sur un item à une
position **arbitraire dans le pool** (déterminée par le score, pas la date) casse le parcours :

Scénario concret : `limit=20` ⇒ pool de 80 réels T80 (récent)…T1 (ancien). Le scoring d'affinité
sélectionne le top 20. Si le plus mal classé des 20 affichés a été créé à **T60** (un réel récent bien
noté), `nextCursor=(T60)`. Page 2 filtre `createdAt < T60` ⇒ **les réels T61–T80 non affichés
(scorés plus bas) sont définitivement sautés** — l'utilisateur ne les voit jamais. À l'inverse si le
plus mal classé affiché est ancien (T5), page 2 démarre à `< T5` et abandonne ~55 réels T6–T80. Le
thread de scroll infini est lossy dans les deux sens.

### Root cause
Sibling-drift (leçons #40/#42/#45/#50/#55) : `getFeed` a été corrigé pour capturer le curseur sur la
borne chronologique **avant** le tri par score, mais `getReels` — écrit avec le même moteur de scoring
— a gardé le pattern « over-fetch → score tout → curseur sur l'item score-trié ». L'invariant lossless
documenté sur `getFeed` n'avait jamais été propagé à son sibling.

### Business impact
Le thread de découverte Reels (« Pour toi ») est **incomplet** : des réels présents dans le pool de
retrieval sont invisibles pour le viewer, d'autres re-servis. Régression fonctionnelle directe d'une
feature sociale à fort engagement.

### Technical impact
`getReels` aligné sur `getFeed` : `candidatePoolSize = limit + 1` (fenêtre chronologique + sonde) ;
`hasMore = candidates.length > limit` ; `page = slice(0, limit)` ; `nextCursor` sur le
**chronologiquement plus ancien** de la page affichée, capturé **avant** le tri ; le scoring
d'affinité ne réordonne QUE l'affichage (`scored.map(s => s.post)`). Aucune signature modifiée. Le
scoring d'affinité reste actif (réordonne la page) — la valeur de découverte est préservée, la perte
de données éliminée. `getFeed` inchangé.

### Risk assessment
FAIBLE. Le changement adopte l'invariant déjà validé en production sur le sibling `getFeed`. Perte
de comportement : le « meilleur 20 sur 80 par affinité » disparaît au profit des « 20 plus récents
réordonnés par affinité » — mais ce « meilleur 20 sur 80 » n'était jamais livré losslessly (il
produisait de la perte de données). Le commentaire d'origine (l.386-387) reconnaissait déjà le
retrieval chronologique comme fondation. Couverture : 3 régressions neuves + 1 test préexistant
(qui encodait le pool `limit×4` bogué) recadré sur l'invariant corrigé.

## Cible 87-B — `languageCodeSchema` rejette les codes ISO 639-3 supportés

### Current state
`packages/shared/utils/attachment-validators.ts:58-62`. `languageCodeSchema = z.string().min(2).max(16)
.regex(/^[a-zA-Z]{2}(-[a-zA-Z0-9]+)*$/)`. Consommé par `attachmentTranscriptionSchema.language`
(l.111), `transcriptionSegmentSchema.language`/`translatedLanguage` (l.96/99), et les **clés** de
`attachmentTranslationsMapSchema` (l.189-192).

### Problems identified
Le corps `[a-zA-Z]{2}` fige le sous-tag primaire à exactement 2 lettres. Les 5 codes ISO 639-3 à
3 lettres **officiellement supportés** — `bas` (Basaa), `ksf`, `nnh`, `dua`, `ewo` (langues
camerounaises, `languages.ts:1035-1118`, `supportsSTT/supportsTranslation: true`, préservés verbatim
par `language-normalize.ts` comme **forme canonique** *« NE doivent JAMAIS être tronqués »*) — sont
**rejetés** au trust boundary.

Incohérence inter-schémas : `isSupportedLanguage('bas') === true` ⇒ `updateUserProfileSchema
.systemLanguage` et `CommonSchemas.language` (regex déjà élargi `/^[a-z]{2,3}(-[A-Z]{2})?$/` en
itération 86-B) **acceptent** `bas`. Un utilisateur peut définir `systemLanguage: 'bas'` et
s'enregistrer, mais toute transcription/traduction étiquetée `bas` est **rejetée** :
`parseAttachmentTranscription({ language: 'bas', ... })` ⇒ `INVALID_TRANSCRIPTION` ;
`parseAttachmentTranslationsMap({ bas: {...} })` ⇒ `INVALID_TRANSLATIONS_MAP`. Contradiction directe
avec le Prisme Linguistique (support multilingue = cœur produit).

### Root cause
Même motif « règle non homogène entre siblings » que l'itération 86-B, sur un **second** schéma de
langue (`languageCodeSchema` dans `attachment-validators.ts`) que le fix 86-B (`CommonSchemas.language`
dans `validation.ts`) n'avait pas couvert. Le regex fige la forme 2-lettres 639-1 et ignore les 639-3
que le reste de la plateforme traite comme canoniques.

### Technical impact
Regex élargi à `/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/` — accepte 2 **ou** 3 lettres pour le sous-tag
primaire + sous-tags BCP-47 optionnels inchangés. `min(2)/max(16)` inchangés (`bas` passe ;
`bas-Latn` reste dans les bornes). Choix du regex (vs bascule sur `.refine(isSupportedLanguage)`)
délibéré et cohérent avec 86-B : ne **widen** que l'acceptation (aucun input valide existant cassé),
conserve `pt-BR`/`zh-Hans`.

### Risk assessment
FAIBLE. N'élargit l'acceptation qu'aux codes 3-lettres (même profil de risque que 86-B). Rejette
toujours `a`, `1`, `!!`, `''`. Couverture : cas neuf `languageCodeSchema — 639-3 ×5` ajouté à la
suite existante (auparavant : 2-lettres + région seulement, jamais les 639-3).

## Validation
- `vitest __tests__/attachment-validators.test.ts` (shared) → 36/36 ✓ (dont `639-3 ×5` neuf)
- `jest PostFeedService.test.ts` → 35/35 ✓ (dont `getReels — chronological cursor` ×3 neufs +
  1 test recadré)
- `jest PostFeedService|posts-engagement-feed|reelAffinity` → 6 suites / 88 tests ✓, 0 régression
- `bun run build` (shared) → 0 erreur (attachment-validators.ts compile)

## Validation criteria (rappel)
- [x] `getReels` prend `nextCursor` sur le réel chronologiquement le plus ancien de la page affichée
  (pas l'item score-trié) ; fenêtre `limit+1` ; le scoring réordonne l'affichage seulement.
- [x] `getFeed` (invariant SSOT) inchangé.
- [x] `languageCodeSchema` accepte `bas`/`ksf`/`nnh`/`dua`/`ewo` et `pt-BR` ; rejette les malformés.
- [x] Homogène avec `CommonSchemas.language` (86-B) — aucun autre sibling `[a-zA-Z]{2}` résiduel.
- [x] Aucune régression sur les suites feed/reel/posts.
