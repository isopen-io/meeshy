# Régression — détails de la story dans la citation (A.1 backend + A.2 iOS) : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher les détails de la story citée (réactions, commentaires, date, vignette, aperçu) dans la bulle de réponse — pour ses propres réponses ET cross-device.

**Architecture:** Le gateway `GET /messages` ne renvoyait que `storyReplyToId` (ID nu). A.1 ajoute un objet enrichi `storyReplyTo` (miroir de l'enrichissement « messages forwardés »). A.2 le décode côté SDK, le mappe en `ReplyReference` riche, et protège `replyToJson` d'un clobber lors d'un refresh sans réponse.

**Tech Stack:** Fastify 5 / Prisma / TypeScript (gateway), Zod-free JSON Schema (shared), Swift 6 / GRDB / XCTest (SDK), Vitest (shared), Jest (gateway). Spec : `docs/superpowers/specs/2026-05-19-bubble-reply-citation-design.md` (Part A).

**Simulateur de test :** iPhone 16 Pro, UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`.

---

### Task 1 : Shared — déclarer `storyReplyTo` dans `messageSchema`

**Files:**
- Modify: `packages/shared/types/api-schemas.ts` (`messageSchema.properties`)
- Test: `packages/shared/__tests__/types/api-schemas.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter ce bloc à la fin de `api-schemas.test.ts` (le fichier existe déjà, il teste `clientMessageId`) :

```typescript
describe('messageSchema — storyReplyTo enriched cited-story object', () => {
  it('declares storyReplyTo so Fastify does not strip the enriched story metadata', () => {
    expect(messageSchema.properties).toHaveProperty('storyReplyTo')
  })

  it('exposes the cited-story detail fields', () => {
    const prop = (messageSchema.properties as Record<string, { properties?: Record<string, unknown> }>)
      .storyReplyTo
    expect(prop.properties).toBeDefined()
    for (const field of ['id', 'reactionCount', 'commentCount', 'createdAt', 'thumbnailUrl', 'previewText']) {
      expect(prop.properties).toHaveProperty(field)
    }
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/shared && npx vitest run __tests__/types/api-schemas.test.ts 2>&1 | tail -12
```
Expected : **FAIL** — `toHaveProperty('storyReplyTo')` échoue.

- [ ] **Step 3 : Ajouter `storyReplyTo` à `messageSchema`**

Dans `api-schemas.ts`, dans `messageSchema.properties`, juste après le bloc `replyTo` (vers la ligne ~590-620, section « Reply & Forward »), ajouter :

```typescript
    storyReplyTo: {
      type: 'object',
      nullable: true,
      description: 'Métadonnées enrichies de la story citée quand le message répond à une story (null si la story est supprimée)',
      properties: {
        id: { type: 'string' },
        reactionCount: { type: 'integer' },
        commentCount: { type: 'integer' },
        createdAt: { type: 'string', format: 'date-time' },
        thumbnailUrl: { type: 'string', nullable: true },
        previewText: { type: 'string' }
      }
    },
```

- [ ] **Step 4 : Lancer le test — il passe**

Run : même commande qu'au Step 2.
Expected : **PASS** (tous les tests du fichier, y compris `clientMessageId`).

- [ ] **Step 5 : Rebuild le package shared**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/shared && npm run build 2>&1 | tail -5
```
Expected : `tsc` termine sans erreur (le gateway importe `@meeshy/shared` depuis `dist/`).

- [ ] **Step 6 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add packages/shared/types/api-schemas.ts packages/shared/__tests__/types/api-schemas.test.ts && git commit -m "feat(shared): messageSchema expose storyReplyTo enrichi"
```

---

### Task 2 : Gateway — enrichir `storyReplyTo` dans `GET /messages`

**Files:**
- Modify: `services/gateway/src/routes/conversations/messages.ts` (handler GET, après le bloc « ENRICHIR LES MESSAGES FORWARDÉS »)

- [ ] **Step 1 : Vérifier que `messageSelect` sélectionne `storyReplyToId`**

Run :
```bash
grep -n "storyReplyToId" services/gateway/src/routes/conversations/messages.ts | head
```
Expected : `storyReplyToId: true` présent dans `messageSelect` ET `storyReplyToId: message.storyReplyToId` dans `mappedMessage`. Si `messageSelect` ne l'a pas, l'ajouter dans la section « REPLY / FORWARD » du `select` : `storyReplyToId: true,`.

- [ ] **Step 2 : Ajouter le bloc d'enrichissement story**

Dans le handler GET de `/conversations/:id/messages`, localiser la fin du bloc `// ===== ENRICHIR LES MESSAGES FORWARDÉS =====` (juste avant la construction de la réponse `sendSuccess`/`data: mappedMessages`). Insérer juste après ce bloc :

```typescript
      // ===== ENRICHIR LES RÉPONSES À UNE STORY =====
      // Miroir de l'enrichissement forwardé : le client a besoin des détails
      // de la story citée (compteurs, date, vignette, aperçu) pour rendre la
      // bulle de citation. Le message ne porte que `storyReplyToId` en DB.
      const storyReplyIds = mappedMessages
        .filter((m: any) => m.storyReplyToId)
        .map((m: any) => m.storyReplyToId as string);

      if (storyReplyIds.length > 0) {
        const uniqueStoryIds = [...new Set(storyReplyIds)];
        const citedStories = await prisma.post.findMany({
          where: { id: { in: uniqueStoryIds } },
          select: {
            id: true,
            content: true,
            reactionCount: true,
            commentCount: true,
            createdAt: true,
            media: {
              select: { thumbnailUrl: true },
              orderBy: { order: 'asc' },
              take: 1
            }
          }
        });
        const storyMap = new Map(citedStories.map((s) => [s.id, s]));
        for (const m of mappedMessages) {
          if (!m.storyReplyToId) continue;
          const story = storyMap.get(m.storyReplyToId);
          if (!story) continue; // story supprimée → storyReplyTo reste absent
          const preview = (story.content ?? '').trim().slice(0, 80);
          m.storyReplyTo = {
            id: story.id,
            reactionCount: story.reactionCount,
            commentCount: story.commentCount,
            createdAt: story.createdAt,
            thumbnailUrl: story.media[0]?.thumbnailUrl ?? null,
            previewText: preview
          };
        }
      }
```

- [ ] **Step 3 : Compiler le gateway — aucune nouvelle erreur**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && npx tsc --noEmit 2>&1 | grep -E "messages\.ts" || echo "OK — aucune erreur dans messages.ts"
```
Expected : `OK — aucune erreur dans messages.ts`.

- [ ] **Step 4 : Lancer le test de route messages (le module charge sans casse)**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && npx jest --config=jest.config.json --testPathPatterns='send-message-schema' 2>&1 | tail -6
```
Expected : `Tests: 9 passed` (le module `messages.ts` s'importe correctement).

- [ ] **Step 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add services/gateway/src/routes/conversations/messages.ts && git commit -m "feat(gateway): enrichit storyReplyTo dans GET /messages"
```

---

### Task 3 : SDK — décoder `storyReplyTo` sur `APIMessage`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsTests.swift` (ajout) — ou `MessageModelsTests.swift` s'il existe

- [ ] **Step 1 : Écrire le test de décodage qui échoue**

Ajouter ce test dans `MessageModelsTests.swift` (créer le fichier s'il n'existe pas, avec `import XCTest` / `@testable import MeeshySDK` / `final class MessageModelsTests: XCTestCase {}`) :

```swift
func test_apiMessage_decodesStoryReplyTo() throws {
    let json = """
    {
      "id": "msg_1",
      "conversationId": "conv_1",
      "senderId": "sender_1",
      "createdAt": "2026-05-19T10:00:00.000Z",
      "updatedAt": "2026-05-19T10:00:00.000Z",
      "storyReplyToId": "story_42",
      "storyReplyTo": {
        "id": "story_42",
        "reactionCount": 12,
        "commentCount": 3,
        "createdAt": "2026-05-18T08:00:00.000Z",
        "thumbnailUrl": "https://cdn.example/s42.jpg",
        "previewText": "Ma story du matin"
      }
    }
    """
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let message = try decoder.decode(APIMessage.self, from: Data(json.utf8))
    let story = try XCTUnwrap(message.storyReplyTo)
    XCTAssertEqual(story.id, "story_42")
    XCTAssertEqual(story.reactionCount, 12)
    XCTAssertEqual(story.commentCount, 3)
    XCTAssertEqual(story.thumbnailUrl, "https://cdn.example/s42.jpg")
    XCTAssertEqual(story.previewText, "Ma story du matin")
}
```

- [ ] **Step 2 : Lancer le test — il échoue (type inconnu)**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build/SourcePackages \
  -only-testing:MeeshySDKTests/MessageModelsTests/test_apiMessage_decodesStoryReplyTo 2>&1 | tail -15
```
Expected : **FAIL** à la compilation — `value of type 'APIMessage' has no member 'storyReplyTo'`.

- [ ] **Step 3 : Ajouter `APIStoryReplyTarget` + le champ `storyReplyTo`**

Dans `MessageModels.swift`, ajouter la struct (à côté des autres types `API*`) :

```swift
/// Métadonnées enrichies de la story citée — renvoyées par le gateway dans
/// `GET /messages` quand le message répond à une story. `nil` si la story a
/// été supprimée.
public struct APIStoryReplyTarget: Decodable, Sendable {
    public let id: String
    public let reactionCount: Int
    public let commentCount: Int
    public let createdAt: Date
    public let thumbnailUrl: String?
    public let previewText: String
}
```

Dans `struct APIMessage`, ajouter la propriété (à côté de `storyReplyToId`, ~ligne 138) :

```swift
    public let storyReplyTo: APIStoryReplyTarget?
```

Ajouter `storyReplyTo` à l'enum `CodingKeys` (~ligne 171, sur la ligne contenant `storyReplyToId`) :

```swift
        case replyToId, storyReplyToId, storyReplyTo, forwardedFromId, forwardedFromConversationId
```

Dans `init(from:)` (~ligne 200, à côté de `storyReplyToId = try c.decodeIfPresent(...)`) :

```swift
        storyReplyTo = try c.decodeIfPresent(APIStoryReplyTarget.self, forKey: .storyReplyTo)
```

- [ ] **Step 4 : Lancer le test — il passe**

Run : même commande qu'au Step 2.
Expected : **PASS**.

- [ ] **Step 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/MessageModelsTests.swift && git commit -m "feat(sdk): APIMessage décode storyReplyTo enrichi"
```

---

### Task 4 : SDK — mapper `storyReplyTo` en `ReplyReference` + garde anti-clobber

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift` (`upsertFromAPIMessages` : construction de `replyToJson` ~ligne 870, branche UPDATE ~ligne 1033)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessagePersistenceActorTests.swift`

- [ ] **Step 1 : Écrire les deux tests qui échouent**

Ajouter dans `MessagePersistenceActorTests` (à côté du bloc « Sprint 2 — APIMessage ingestion »). Le 1er helper `makeAPIMessage` n'accepte pas `storyReplyTo` ; ce test construit donc l'`APIMessage` par JSON inline.

```swift
/// A.2 — un message qui répond à une story (payload serveur enrichi
/// `storyReplyTo`) est ingéré avec un `ReplyReference` riche dans `replyToJson`.
func test_upsertFromAPIMessages_storyReplyTo_buildsRichReplyReference() async throws {
    let json = """
    {
      "id": "srv_sr_1", "conversationId": "conv_sr", "senderId": "sender_1",
      "content": "réponse", "createdAt": "2026-05-19T10:00:00.000Z",
      "updatedAt": "2026-05-19T10:00:00.000Z", "storyReplyToId": "story_42",
      "storyReplyTo": {
        "id": "story_42", "reactionCount": 12, "commentCount": 3,
        "createdAt": "2026-05-18T08:00:00.000Z",
        "thumbnailUrl": "https://cdn.example/s42.jpg", "previewText": "Ma story"
      }
    }
    """
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let apiMsg = try decoder.decode(APIMessage.self, from: Data(json.utf8))

    try await actor.upsertFromAPIMessages([apiMsg])

    let rows = try actor.messages(for: "conv_sr", limit: 10)
    let replyJson = try XCTUnwrap(rows[0].replyToJson,
        "un message répondant à une story doit porter un ReplyReference riche")
    let ref = try JSONDecoder().decode(ReplyReference.self, from: replyJson)
    XCTAssertTrue(ref.isStoryReply)
    XCTAssertEqual(ref.storyReactionCount, 12)
    XCTAssertEqual(ref.storyCommentCount, 3)
    XCTAssertEqual(ref.storyThumbnailUrl, "https://cdn.example/s42.jpg")
}

/// A.2 — un refresh serveur sans `replyTo` ni `storyReplyTo` ne doit PAS
/// écraser un `ReplyReference` riche déjà persisté (filet de sécurité —
/// couvre la phase optimiste avant le 1er refresh enrichi).
func test_upsertFromAPIMessages_preservesRichReplyWhenServerCarriesNothing() async throws {
    let storyReply = ReplyReference(
        messageId: "story_42", authorName: "Andre", previewText: "Ma story",
        isMe: false, isStoryReply: true,
        storyPublishedAt: Date(timeIntervalSince1970: 1_700_000_000),
        storyReactionCount: 7, storyCommentCount: 1,
        storyThumbnailUrl: "https://cdn.example/s42.jpg"
    )
    var record = MessageRecordFactory.make(localId: "srv_sr_2", conversationId: "conv_sr2")
    record.replyToJson = try JSONEncoder().encode(storyReply)
    try await actor.insertOptimistic(record)

    let apiMsg = makeAPIMessage(id: "srv_sr_2", conversationId: "conv_sr2", content: "réponse")
    try await actor.upsertFromAPIMessages([apiMsg])

    let rows = try actor.messages(for: "conv_sr2", limit: 10)
    let replyJson = try XCTUnwrap(rows[0].replyToJson,
        "le ReplyReference riche local doit survivre à un refresh serveur vide")
    let ref = try JSONDecoder().decode(ReplyReference.self, from: replyJson)
    XCTAssertTrue(ref.isStoryReply)
    XCTAssertEqual(ref.storyReactionCount, 7)
}
```

- [ ] **Step 2 : Lancer les deux tests — ils échouent**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build/SourcePackages \
  -only-testing:MeeshySDKTests/MessagePersistenceActorTests/test_upsertFromAPIMessages_storyReplyTo_buildsRichReplyReference \
  -only-testing:MeeshySDKTests/MessagePersistenceActorTests/test_upsertFromAPIMessages_preservesRichReplyWhenServerCarriesNothing 2>&1 | tail -15
```
Expected : **FAIL** — `storyReplyTo` non mappé (replyToJson nil) ; le 2ᵉ test échoue car la branche UPDATE clobbe `replyToJson`.

- [ ] **Step 3 : Mapper `storyReplyTo` dans la construction de `replyToJson`**

Dans `upsertFromAPIMessages`, remplacer la construction de `replyToJson` (le bloc `let replyToJson: Data? = api.replyTo.flatMap { ... }`, ~lignes 870-883) par :

```swift
                let replyToJson: Data? = {
                    // Réponse à une story : le gateway enrichit `storyReplyTo`.
                    // On construit un ReplyReference riche pour BubbleStoryReplyPreview.
                    if let story = api.storyReplyTo {
                        let trimmed = story.previewText.trimmingCharacters(in: .whitespacesAndNewlines)
                        let ref = ReplyReference(
                            messageId: story.id,
                            authorName: "",
                            previewText: trimmed.isEmpty ? "\u{1F4F7} Story" : trimmed,
                            isMe: false,
                            isStoryReply: true,
                            storyPublishedAt: story.createdAt,
                            storyReactionCount: story.reactionCount,
                            storyCommentCount: story.commentCount,
                            storyThumbnailUrl: story.thumbnailUrl
                        )
                        return try? encoder.encode(ref)
                    }
                    // Réponse à un message : chemin historique inchangé.
                    return api.replyTo.flatMap { reply -> Data? in
                        let isMe = reply.senderId == nil
                        let authorName = reply.sender?.name ?? "?"
                        let firstAtt = reply.attachments?.first
                        let ref = ReplyReference(
                            messageId: reply.id,
                            authorName: authorName,
                            previewText: reply.content ?? "",
                            isMe: isMe,
                            attachmentType: firstAtt?.mimeType,
                            attachmentThumbnailUrl: firstAtt?.thumbnailUrl
                        )
                        return try? encoder.encode(ref)
                    }
                }()
```

> Note : si la signature exacte du `ReplyReference` du chemin message diffère
> du code actuel (lignes 870-883), reprendre **mot pour mot** l'existant pour
> la branche `api.replyTo` — seule la branche `api.storyReplyTo` est nouvelle.

- [ ] **Step 4 : Protéger `replyToJson` du clobber (branche UPDATE)**

Dans la branche UPDATE de `upsertFromAPIMessages` (~ligne 1033), remplacer :

```swift
                    existing.replyToJson = replyToJson
```

par :

```swift
                    // Préserve le ReplyReference riche déjà persisté quand le
                    // payload serveur ne porte aucune réponse — même garde que
                    // `attachmentsJson`. Couvre la phase optimiste avant le 1er
                    // refresh enrichi.
                    existing.replyToJson = replyToJson ?? existing.replyToJson
```

- [ ] **Step 5 : Lancer les deux tests — ils passent**

Run : même commande qu'au Step 2.
Expected : **PASS** pour les deux.

- [ ] **Step 6 : Lancer toute la suite `MessagePersistenceActorTests` (non-régression)**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build/SourcePackages \
  -only-testing:MeeshySDKTests/MessagePersistenceActorTests 2>&1 | tail -12
```
Expected : **TEST SUCCEEDED** — les tests de message-reply existants (où `api.replyTo` est non-nil, `api.storyReplyTo` nil) sont inchangés.

- [ ] **Step 7 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessagePersistenceActorTests.swift && git commit -m "fix(sdk): mappe storyReplyTo en ReplyReference riche + préserve replyToJson"
```

---

### Task 5 : Vérification d'intégration iOS

**Files:** aucun (vérification visuelle).

- [ ] **Step 1 : Build app**

Run : `./apps/ios/meeshy.sh build`
Expected : `Build succeeded`.

- [ ] **Step 2 : Contrôle visuel**

`./apps/ios/meeshy.sh run`, ouvrir une conversation contenant une réponse à une
story. Vérifier que la bulle de citation affiche les **détails de la story**
(compteurs réactions/commentaires, date, vignette/aperçu) via
`BubbleStoryReplyPreview` — et non la citation minimale « 📷 Story ».

> Le gateway A.1/A.2 n'est visible que si la **prod est redéployée** (l'app
> pointe prod). En attendant le déploiement, A.2 (garde anti-clobber) suffit
> à valider ses propres réponses optimistes.

---

## Self-Review

1. **Spec coverage** — Part A.1 (gateway enrichment + `messageSchema`) → Tasks 1-2 ; Part A.2 (SDK decode + mapping + anti-clobber) → Tasks 3-4 ; vérif → Task 5. ✅ Part B (citation en en-tête) est fusionnée dans le plan bulle footer-unification — hors de ce plan.
2. **Placeholder scan** — aucun TODO/TBD. Une seule note conditionnelle (Task 4 Step 3) : reprendre le code existant `api.replyTo` mot pour mot — instruction précise, pas un placeholder.
3. **Type consistency** — `APIStoryReplyTarget` (Task 3) ↔ `messageSchema.storyReplyTo` (Task 1) ↔ objet gateway (Task 2) : mêmes 6 champs `id/reactionCount/commentCount/createdAt/thumbnailUrl/previewText`. `ReplyReference` init et champs conformes à `CoreModels.swift`. `Post.media: PostMedia[]` confirmé dans `schema.prisma`.
4. **Scope** — un sous-système cohérent (la donnée de citation story, du gateway à GRDB), producible et testable de bout en bout. ✅

## Déploiement

Tasks 1-2 = gateway + shared → **déploiement production requis** pour l'affichage cross-device. Tasks 3-4 = SDK iOS. Aucune migration DB (champs `Post` existants).

## Exécution

Plan complet. Deux options d'exécution :
1. **Subagent-Driven (recommandé)** — un subagent par tâche, revue entre les tâches.
2. **Inline** — exécution en session avec checkpoints.
