# Régression — détails de la story dans la citation : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rétablir l'affichage des détails de la story (réactions, commentaires, date, aperçu) dans la bulle de citation quand on répond à une story — cassé par un clobber de `replyToJson`.

**Architecture:** `MessagePersistenceActor.upsertFromAPIMessages` écrase inconditionnellement `replyToJson` lors d'un rafraîchissement serveur. Pour une réponse à une story, le serveur ne porte pas de `replyTo` (la cible est une story, exposée via `storyReplyToId`), donc le `replyToJson` recalculé vaut `nil` et efface le `ReplyReference` riche construit côté client. Le correctif applique le même garde `?? existing` que `attachmentsJson` voisin.

**Tech Stack:** Swift 6, MeeshySDK (SPM), GRDB, XCTest. Spec : `docs/superpowers/specs/2026-05-19-bubble-reply-citation-design.md` (Part A).

---

### Task 1 : Préserver le `replyToJson` riche lors d'un rafraîchissement serveur sans `replyTo`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift` (branche UPDATE de `upsertFromAPIMessages`, ~ligne 1033)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessagePersistenceActorTests.swift`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter cette méthode dans `MessagePersistenceActorTests` (après le bloc « Sprint 2 — APIMessage ingestion », à côté de `test_upsertFromAPIMessages_withImageAttachment_persistsAttachmentsAndThumbHash`). Elle réutilise les helpers existants de la classe (`actor`, `makeAPIMessage`, `MessageRecordFactory.make`).

```swift
/// Régression — une réponse à une STORY porte ses détails (compteurs de
/// réactions/commentaires, date, vignette) dans un `ReplyReference` construit
/// côté client depuis la story vivante et persisté dans `replyToJson`. Le
/// payload serveur n'a pas de `replyTo` pour une réponse à une story (la
/// cible est une story, exposée via `storyReplyToId`) — un rafraîchissement
/// serveur ne doit donc PAS écraser la référence riche locale.
func test_upsertFromAPIMessages_preservesRichStoryReplyWhenServerCarriesNoReply() async throws {
    let storyReply = ReplyReference(
        messageId: "story_42",
        authorName: "Andre",
        previewText: "Ma story du matin",
        isMe: false,
        isStoryReply: true,
        storyPublishedAt: Date(timeIntervalSince1970: 1_700_000_000),
        storyReactionCount: 12,
        storyCommentCount: 3,
        storyThumbnailUrl: "https://cdn.example/story_42_thumb.jpg"
    )
    var record = MessageRecordFactory.make(localId: "srv_reply_1", conversationId: "conv_r")
    record.replyToJson = try JSONEncoder().encode(storyReply)
    try await actor.insertOptimistic(record)

    // Rafraîchissement serveur du même message — aucun `replyTo` dans le payload.
    let apiMsg = makeAPIMessage(id: "srv_reply_1", conversationId: "conv_r",
                                content: "réponse à la story")
    try await actor.upsertFromAPIMessages([apiMsg])

    let rows = try actor.messages(for: "conv_r", limit: 10)
    XCTAssertEqual(rows.count, 1)
    let json = try XCTUnwrap(rows[0].replyToJson,
        "le ReplyReference riche d'une réponse à une story doit survivre à un refresh serveur sans replyTo")
    let decoded = try JSONDecoder().decode(ReplyReference.self, from: json)
    XCTAssertTrue(decoded.isStoryReply)
    XCTAssertEqual(decoded.storyReactionCount, 12)
    XCTAssertEqual(decoded.storyCommentCount, 3)
    XCTAssertEqual(decoded.storyThumbnailUrl, "https://cdn.example/story_42_thumb.jpg")
}
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build/SourcePackages \
  -only-testing:MeeshySDKTests/MessagePersistenceActorTests/test_upsertFromAPIMessages_preservesRichStoryReplyWhenServerCarriesNoReply 2>&1 | tail -20
```
Expected : **FAIL** — `XCTAssertTrue(decoded.isStoryReply)` ou `XCTUnwrap(rows[0].replyToJson)` échoue, car la branche UPDATE écrase `replyToJson` avec `nil`.

- [ ] **Step 3 : Appliquer le correctif minimal**

Dans `MessagePersistenceActor.swift`, branche UPDATE de `upsertFromAPIMessages` (~ligne 1033), remplacer :

```swift
                    existing.replyToJson = replyToJson
```

par :

```swift
                    // Préserve le ReplyReference riche déjà persisté quand le
                    // payload serveur n'a pas de `replyTo` : une réponse à une
                    // story porte ses détails (compteurs/date/vignette)
                    // uniquement dans le `replyToJson` local — le serveur n'expose
                    // que `storyReplyToId`. Même garde que `attachmentsJson` ci-dessus.
                    existing.replyToJson = replyToJson ?? existing.replyToJson
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run : même commande qu'au Step 2.
Expected : **PASS**.

- [ ] **Step 5 : Lancer toute la suite `MessagePersistenceActorTests` (non-régression)**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build/SourcePackages \
  -only-testing:MeeshySDKTests/MessagePersistenceActorTests 2>&1 | tail -20
```
Expected : **TEST SUCCEEDED**, tous les tests passent. En particulier, les tests de message-reply existants (où `api.replyTo` est non-nil) sont inchangés : le `?? existing` ne se déclenche que lorsque le serveur ne porte aucune réponse.

- [ ] **Step 6 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add \
  packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift \
  packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessagePersistenceActorTests.swift && \
  git commit -m "fix(sdk): préserve les détails de la réponse à une story au refresh serveur"
```

---

## Self-Review

1. **Spec coverage** — Part A du spec (« ne plus clobberer `replyToJson` ») → Task 1. ✅ Part B (citation en en-tête) est hors de ce plan : fusionnée dans le plan bulle footer-unification (décision de séquençage).
2. **Placeholder scan** — aucun TODO/TBD ; tout le code est concret. ✅
3. **Type consistency** — `ReplyReference` init et champs (`isStoryReply`, `storyReactionCount`, `storyCommentCount`, `storyThumbnailUrl`, `storyPublishedAt`) conformes à `CoreModels.swift`. `MessageRecord.replyToJson` est `var` (mutable). `MessageRecordFactory.make` et `makeAPIMessage` sont les helpers existants de la classe de test. ✅
4. **Scope** — un seul plan, un seul sous-système (persistence) ; producible et testable seul. ✅

## Déploiement

100 % iOS / MeeshySDK. Aucun changement backend. Aucun déploiement gateway.
