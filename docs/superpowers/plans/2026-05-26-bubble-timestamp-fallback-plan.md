# Bubble Timestamp Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un fallback synchrone qui formate `message.createdAt` quand `cachedTimeString` est `nil`, pour que toute bulle affiche son heure (`HH:mm`) même sur du cache GRDB legacy ou pendant la race fresh-socket.

**Architecture:** Modification unique dans `BubbleContent.init(message:translations:…)` (`apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift:155`). Ajout d'un `DateFormatter` statique memoizé sur l'extension `BubbleContent`. Chaîne de fallback à 3 niveaux : `timeString` paramètre → `message.cachedTimeString` → format(`message.createdAt`).

**Tech Stack:** Swift 6, SwiftUI, XCTest, MeeshySDK (`MeeshyMessage`), `meeshy.sh` build runner.

**Spec source :** `docs/superpowers/specs/2026-05-26-bubble-timestamp-fallback-design.md`

---

## File Structure

| File | Role | Change type |
|------|------|-------------|
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift` | Builder `BubbleContent.init(...)` — site de la chaîne de fallback. | Modify (1 ligne + ajout static formatter) |
| `apps/ios/MeeshyTests/Unit/Views/Bubble/BubbleContentMatrixTests.swift` | Tests existants du builder — on y ajoute 3 cas de test pour la chaîne timeString. | Modify (3 nouveaux tests + variante du helper `makeMessage` acceptant `cachedTimeString` optionnel et `createdAt` paramétrable) |

Aucun nouveau fichier. Aucun changement de signature publique. Aucun impact SDK/backend.

---

### Task 1: Ajouter un test rouge pour le fallback createdAt

**Files:**
- Modify: `apps/ios/MeeshyTests/Unit/Views/Bubble/BubbleContentMatrixTests.swift`

- [ ] **Step 1: Étendre `makeMessage` pour paramétrer `cachedTimeString` et `createdAt`**

Le helper actuel hard-code `cachedTimeString: "12:34"` et `createdAt: Date(timeIntervalSince1970: 0)` (ligne 332 et 349 du fichier). On le rend paramétrable sans casser les appels existants.

Remplace la signature de `makeMessage` (ligne 289-304) en ajoutant deux paramètres optionnels avec valeurs par défaut identiques au comportement actuel :

```swift
private func makeMessage(
    id: String = "m1",
    content: String,
    senderId: String = "u1",
    isMe: Bool = false,
    attachments: [MeeshyMessageAttachment] = [],
    replyTo: ReplyReference? = nil,
    deletedAt: Date? = nil,
    expiresAt: Date? = nil,
    isViewOnce: Bool = false,
    viewOnceCount: Int = 0,
    pinnedAt: Date? = nil,
    forwardedFromId: String? = nil,
    isEdited: Bool = false,
    reactions: [MeeshyReaction] = [],
    createdAt: Date = Date(timeIntervalSince1970: 0),
    cachedTimeString: String? = "12:34"
) -> MeeshyMessage {
```

Puis remplace les deux usages internes :
- `createdAt: Date(timeIntervalSince1970: 0)` → `createdAt: createdAt`
- `cachedTimeString: "12:34"` → `cachedTimeString: cachedTimeString`

- [ ] **Step 2: Ajouter trois tests pour la chaîne de fallback timeString**

Ajoute ce bloc juste avant `// MARK: - Helpers` (ligne 287 actuellement) :

```swift
// MARK: - Timestamp fallback (createdAt when cachedTimeString is nil)

/// Quand `cachedTimeString` est `nil` (cache GRDB legacy, race fresh-socket,
/// optimistic outgoing), le builder doit formater `message.createdAt` pour
/// que la bulle affiche toujours son heure.
func test_timeString_fallsBackToCreatedAt_whenCachedTimeStringIsNil() {
    let msg = makeMessage(content: "Salut", cachedTimeString: nil)
    let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

    XCTAssertFalse(content.meta.timeString.isEmpty,
                   "timeString should not be empty when cachedTimeString is nil — must fall back to formatted createdAt")
    XCTAssertEqual(content.meta.timeString.count, 5,
                   "Format expected: HH:mm (5 characters)")
    XCTAssertTrue(content.meta.timeString.contains(":"),
                  "Format expected: HH:mm with colon separator")
}

/// Quand `cachedTimeString` est présent, le builder l'utilise tel quel —
/// pas de re-formatage de `createdAt`.
func test_timeString_prefersCachedTimeString_overFallback() {
    let msg = makeMessage(content: "Salut", cachedTimeString: "09:15")
    let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")

    XCTAssertEqual(content.meta.timeString, "09:15")
}

/// Quand un `timeString` explicite est passé en paramètre (ex: tests ou
/// rendu groupé futur), il l'emporte sur tout le reste.
func test_timeString_prefersExplicitParameter_overCachedAndFallback() {
    let msg = makeMessage(content: "Salut", cachedTimeString: "09:15")
    let content = BubbleContent(
        message: msg,
        translations: [],
        preferredTranslation: nil,
        currentUserId: "u1",
        timeString: "EXPLICIT"
    )

    XCTAssertEqual(content.meta.timeString, "EXPLICIT")
}
```

- [ ] **Step 3: Compile-only check — confirmer que les autres tests passent toujours**

Run: `./apps/ios/meeshy.sh test`
Expected: les 3 nouveaux tests `test_timeString_fallsBackToCreatedAt_…`, `test_timeString_prefersCachedTimeString_…`, `test_timeString_prefersExplicitParameter_…` ÉCHOUENT avec une assertion sur `timeString` vide pour le premier (les deux autres devraient déjà passer car le code actuel honore correctement `cachedTimeString` et le paramètre explicite). Les tests existants restent verts.

Si la compilation échoue, fixer la signature de `makeMessage` (cf. Step 1).

- [ ] **Step 4: Commit du test rouge (TDD discipline)**

```bash
git add apps/ios/MeeshyTests/Unit/Views/Bubble/BubbleContentMatrixTests.swift
git commit -m "test(ios/bubble): red test for timestamp fallback to createdAt"
```

---

### Task 2: Implémenter le fallback synchrone

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift`

- [ ] **Step 1: Ajouter un `DateFormatter` statique memoizé dans l'extension `BubbleContent`**

Le fichier est une `extension BubbleContent` (cf. ligne 5). Ajouter un static stored property dans cette extension (Swift le permet sur extensions de types définis dans le même module — `BubbleContent` vient de `MeeshyUI` package, donc on doit utiliser une `private enum` namespace ou un static computed property workaround).

**Approche choisie :** caseless enum namespace dans le fichier, pour ne pas dépendre des contraintes d'extension cross-module.

Juste au-dessus de `extension BubbleContent {` (ligne 5), ajoute :

```swift
/// Namespace pour les helpers statiques du builder. Caseless enum =
/// pas d'instanciation possible, juste un scope.
private enum BubbleContentBuilderHelpers {
    /// Formatter `HH:mm` réutilisé pour formater `createdAt` quand
    /// `cachedTimeString` n'est pas peuplé (cache GRDB legacy, race
    /// fresh-socket, optimistic outgoing). `DateFormatter` est documenté
    /// safe en lecture concurrente depuis iOS 7 ; on le crée une fois.
    static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()
}
```

- [ ] **Step 2: Modifier la chaîne de fallback à la ligne 155**

Remplace exactement :

```swift
        // --- Meta ---
        let resolvedTimeString = timeString ?? message.cachedTimeString ?? ""
```

par :

```swift
        // --- Meta ---
        // Fallback à 3 niveaux :
        // 1. timeString explicite (rendu groupé futur, tests)
        // 2. message.cachedTimeString (chemin chaud — calculé à l'ingestion GRDB)
        // 3. format(message.createdAt) — couvre cache legacy + race socket fresh
        let resolvedTimeString = timeString
            ?? message.cachedTimeString
            ?? BubbleContentBuilderHelpers.timeFormatter.string(from: message.createdAt)
```

- [ ] **Step 3: Vérifier la compilation**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`. Si le compilateur se plaint d'un static dans extension, c'est que tu n'as pas suivi Step 1 — la stratégie est de mettre le static dans un caseless enum séparé.

- [ ] **Step 4: Lancer les 3 nouveaux tests pour les voir verts**

Run: `./apps/ios/meeshy.sh test`
Expected: les 3 tests `test_timeString_*` passent. Aucune régression sur les tests existants de `BubbleContentMatrixTests` ni du reste.

- [ ] **Step 5: Commit de l'implémentation**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift
git commit -m "fix(ios/bubble): fallback timeString to formatted createdAt when cachedTimeString is nil

Covers three cases where cachedTimeString stays nil:
- Legacy GRDB cache (bubbles persisted before the field was wired)
- Fresh socket race (10-50ms window before MessagePersistenceActor populates the field)
- Optimistic outgoing (local-only message)

Empirically confirmed via fresh-install A/B: after wipe, all bubbles show
the hour; on legacy cache, some bubbles render with timeString = empty.
The fallback is defensive — chemin chaud reste inchangé."
```

---

### Task 3: Vérification finale en simulateur

**Files:** aucun (validation manuelle + automatique)

- [ ] **Step 1: Build + lancement app**

Run: `./apps/ios/meeshy.sh build` (non-bloquant)
Expected: `Build succeeded`.

Run: `./apps/ios/meeshy.sh run &` (background, ou `run` dans un terminal séparé)
Expected: app installée + lancée sur iPhone 16 Pro simulator (UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`).

- [ ] **Step 2: Reproduction du scénario — bulles fraîches**

Naviguer vers une conversation. Envoyer un nouveau message texte (`"test"`). Vérifier que la bulle affiche son heure IMMÉDIATEMENT (avant tout fetch ou re-render).

Run: `./apps/ios/meeshy.sh screenshot`
Expected: capture montre la bulle avec `HH:mm` visible sous le texte.

- [ ] **Step 3: Reproduction du scénario — bulle legacy**

Le user a déjà réinstallé l'app (cache GRDB vide donc plus de bulles legacy à reproduire localement). **Validation côté code :** confirmer que le test unitaire `test_timeString_fallsBackToCreatedAt_whenCachedTimeStringIsNil` du Task 1 couvre bien ce cas. Si CI relance la suite complète SDK et `apps/ios`, vérifier la sortie `xcodebuild test`.

- [ ] **Step 4: Run de toute la suite test app**

Run: `./apps/ios/meeshy.sh test`
Expected: tous tests verts. La présence de flaky tests connus (`FeedViewModelTests.test_loadMoreIfNeeded`, `ConversationListViewModelTests.schedulePersist_*` — cf. mémoire `feedback_ios_test_suite_flaky.md`) peut nécessiter une re-run ; ne pas conclure à une régression sur premier échec.

- [ ] **Step 5: Capturer un avant/après pour le PR (optionnel)**

Si tu veux documenter le fix dans la PR description, capture une bulle qui aurait été problématique avant le fix (legacy cache). Sinon, skip.

---

## Self-Review

**Spec coverage :**
- Fallback synchrone 3 niveaux → Task 2 Step 2 ✓
- Static `DateFormatter` memoizé → Task 2 Step 1 ✓
- Tests : fallback createdAt, prefer cached, prefer explicit → Task 1 Step 2 (3 tests) ✓
- Décision conservation `HH:mm` strict (pas de locale-sensitive) → couvert par format dans Task 2 Step 1 ✓

**Placeholder scan :** aucun TBD/TODO. Toutes les commandes ont leur sortie attendue.

**Type consistency :** `BubbleContentBuilderHelpers.timeFormatter` référencé identiquement dans Task 2 Step 1 (déclaration) et Step 2 (usage). `MeeshyMessage.cachedTimeString: String?` et `MeeshyMessage.createdAt: Date` non-nil — cohérent avec spec.

**Risque assertion locale-sensitive :** le test `test_timeString_fallsBackToCreatedAt_…` assert `count == 5` et `contains(":")` pour rester déterministe entre simulateur local et CI UTC. Pas d'assertion sur valeur précise (ex: `"14:32"`).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-bubble-timestamp-fallback-plan.md`. Two execution options :

1. **Subagent-Driven (recommended)** — un subagent par tâche, review entre tâches, idéal pour la rigueur TDD.
2. **Inline Execution** — exécution dans la session courante via executing-plans, batch avec checkpoints.

Plan B (device locale 4e priorité) est écrit séparément ; le merger plan A d'abord car indépendant.
