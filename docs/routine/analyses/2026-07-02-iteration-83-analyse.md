# Iteration 83 — Analyse d'optimisation (2026-07-02)

## Protocole (démarrage)
`main` @ `dc8f37a4` (working tree propre, branche `claude/brave-archimedes-zk93ok` alignée sur
`origin/main`, aucun commit non-mergé). PR ouvertes au démarrage : #1367 (realtime guard
`message:edited` — web + iOS SDK) et #1366 (iOS a11y EmojiPickerSheet) — deux pistes indépendantes
gérées par d'autres sessions, sans conflit avec la cible retenue ici (gateway TypeScript).

Continuité du **thème dominant des 4 dernières itérations (79→82) : durcissement des races
« lost-update / out-of-order » sur les compteurs & curseurs partagés du gateway** (voir lessons
#50, #51, #47). Les résidus explicitement documentés en fin d'itération 82 étaient F47/F48/F49,
avec **F48 signalé comme « l'analogue lost-update le plus lourd restant »**.

## Cible iter 83 — F48 : `ConversationMessageStatsService` écritures absolues dérivées d'une lecture

### Current state
`services/gateway/src/services/ConversationMessageStatsService.ts` dénormalise les statistiques
d'une conversation (totaux de messages/mots/caractères, compteurs de pièces jointes, `textMessages`,
+ agrégats JSON `participantStats`/`dailyActivity`/…). Trois hooks écrivent la ligne
`conversationMessageStats` :

- `onNewMessage` (l.86-183) — écrit **déjà** les champs scalaires en atomique : `totalMessages:
  { increment: 1 }`, `totalWords: { increment: words }`, pièces jointes `{ increment: count }`.
- `onMessageEdited` (l.185-233) — écrivait `totalWords: Math.max(0, existing.totalWords + wordDiff)`
  et `totalCharacters: Math.max(0, existing.totalCharacters + charDiff)` : **valeurs absolues
  calculées en JS à partir de la lecture `existing`**.
- `onMessageDeleted` (l.235-300) — écrivait `totalMessages: Math.max(0, existing.totalMessages - 1)`,
  `totalWords`, `totalCharacters`, `textMessages`, et chaque compteur de pièce jointe de la même
  façon **absolue dérivée de `existing`**.

### Problems identified
Le pattern read (`findUnique`) → dérive en JS (`existing.total ± diff`) → write absolu est un
**lost-update** classique : deux `message:edited`/`message:deleted` concurrents sur la même
conversation lisent le même `existing` avant qu'aucun `update` ne commit ; le second write écrase
intégralement le premier. Sur une conversation de groupe active (édition + suppression rapprochées,
ou deux suppressions d'auteurs différents), les totaux affichés dérivent silencieusement à la
baisse. C'est la **signature exacte** du bug de compteur corrigé dans `updateMessageReactionSummary`
(lesson #50) et du curseur de PR #1362 — mais ici sur les scalaires les plus visibles (headline
`totalMessages`/`totalWords`).

### Root cause
Le fix atomique appliqué à `onNewMessage` (idiome `{ increment }`) **n'avait jamais été propagé**
aux deux hooks soeurs edit/delete. Exactement le motif « fix appliqué à un sibling, pas audité sur
tous les siblings » (lessons #40/#42/#45/#50).

### Business impact
Intégrité des statistiques de conversation exposées via `GET /conversations/:id/stats`
(headline totaux + répartitions). Modéré : denormalisation d'affichage, pas de donnée métier
critique, mais visible et non auto-réparé par le write lui-même.

### Technical impact
- `onMessageEdited` : `totalWords`/`totalCharacters` → `{ increment: wordDiff }` /
  `{ increment: charDiff }` (Prisma accepte un `increment` négatif → décrément atomique).
- `onMessageDeleted` : `totalMessages` → `{ decrement: 1 }` ; `totalWords`/`totalCharacters` →
  `{ decrement: words/chars }` ; `textMessages` → `{ decrement: 1 }` ; compteurs de pièces jointes
  → `{ decrement: count }`.
- Aucune signature publique modifiée. `onNewMessage` reste tel quel (déjà atomique).

### Subtilité assumée — perte du plancher `Math.max(0, …)` au niveau DB
Un `increment`/`decrement` atomique MongoDB ne peut pas « clamper » à 0 dans la même opération.
Le plancher est donc **volontairement abandonné au niveau du write**, arbitrage identique à celui
du fix réactions (lesson #50 : correctness sous concurrence > garde défensive sur une valeur
dénormalisée) :
1. Une opération équilibrée create↔delete / edit ne descend jamais sous 0.
2. Les champs JSON (`participantStats`) **conservent** leur `Math.max(0, …)` (ils restent en
   read-modify-write — non atomique — corrigé par `recompute()` périodique, cf. commentaire l.84).
3. Toute dérive résiduelle sur les scalaires dénormalisés est corrigée par le même `recompute()`.

### Risk assessment
FAIBLE. Increment/decrement atomique = strictement plus correct sous concurrence, comportement
observable identique hors course. Le seul changement de comportement observable est la disparition
du clamp-à-0 au niveau DB — couvert par des tests réécrits qui documentent explicitement le nouvel
invariant (atomicité). Couverture : suite `ConversationMessageStatsService` (61 tests, dont 2
régressions lost-update neuves) + 7 suites `MessageHandler` (420) + 13 suites `stats` (277) vertes.

## Validation
- `jest ConversationMessageStatsService` → 61/61 ✓
- `jest MessageHandler` (2 conventions de placement, cf. lesson #52) → 7 suites / 420 tests ✓
- `jest stats` → 13 suites / 277 tests ✓

## Améliorations futures (report)
- **F47** : cap `maxUses` du token d'affiliation — `updateMany` conditionnelle transactionnelle +
  rollback (TOCTOU résiduel, cf. iter 82).
- **F49** : `ConversationStatsService.updateOnNewMessage` — lost-update in-process sur le cache
  `messagesPerLanguage` (auto-guéri par TTL, sévérité basse).
- **F50 (nouveau)** : `participantStats`/`dailyActivity`/`hourlyDistribution`/`languageDistribution`
  restent en read-modify-write non atomique dans les 3 hooks (documenté l.84, recompute-corrigé).
  Les rendre atomiques nécessiterait un modèle relationnel (ou des updates `$` par-clé MongoDB non
  exposés par Prisma) — hors périmètre d'un cycle, la self-heal par `recompute()` couvre le besoin.
