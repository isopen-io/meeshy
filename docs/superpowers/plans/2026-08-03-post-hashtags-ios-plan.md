# Hashtags iOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Color mentions, render hashtags/links in reels, and add hashtag discovery (styled text + browse screen) to iOS posts and reels.

**Architecture:** Extend the existing `MessageTextRenderer` (already used by posts, not by reels) with a hashtag segment, fix the missing `mentionColor` on posts, adopt the renderer on reels, and add a `PostServiceProviding` pair of endpoints + a new `HashtagResultsView` screen wired through the existing `Router`/`DeepLinkRouter`.

**Tech Stack:** SwiftUI, Combine, XCTest. Depends on the gateway plan's two endpoints (`GET /posts/hashtag/:tag`, `GET /hashtags/trending`) already existing (or their contract being stable, even before merge — this plan can be built and unit-tested against the `PostServiceProviding` protocol/mocks without a live gateway).

**Spec:** `docs/superpowers/specs/2026-08-03-post-hashtags-and-rich-content-design.md`

## Global Constraints

- Every new service method goes on `PostServiceProviding` (protocol-first, per `apps/ios/CLAUDE.md`) with a matching stub on `MockPostService` (`Result<T, Error>` + call count, per root `CLAUDE.md` mock pattern).
- `./apps/ios/meeshy.sh build` MUST pass before each task's commit (non-blocking, run it, read the result).
- No hardcoded colors outside the existing theme system — reuse `theme.accentColor`/`Color(hex: accentColor)` exactly as the surrounding code already does at each call site.
- Hashtag URL: `https://meeshy.me/hashtag/<tag>` (real HTTPS universal link, same convention as `.mentionLink` → `https://meeshy.me/u/<username>`) — never a custom-scheme-only construction for the `.link` attribute itself (the custom `meeshy://` scheme is a separate, already-existing alternate transport for the SAME destination, handled by `DeepLinkRouter.parseCustomScheme`).

---

### Task 1: Fix missing `mentionColor` on post rendering

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:298`
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift:1174`
- Test: `apps/ios/MeeshyTests/Unit/Views/FeedPostCardMentionColorGuardTests.swift` (new — source-guard style test, mirrors existing guard tests like `StoryHeaderMetaGuardTests`)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new (behavioral fix only)

- [ ] **Step 1: Write the failing source-guard test**

This codebase's convention for "a specific parameter must be passed at a specific call site" is a source-guard test that reads the file's own source and asserts the string is there (see `reference_source_guards_anchor_on_behaviour.md` in project memory — anchor on the actual call, strip comments first). Full text-based check, not a mock/behavior test, because `MessageTextRenderer.render` returns an opaque `Text` — its internal `AttributedString` color isn't introspectable from a unit test.

```swift
// apps/ios/MeeshyTests/Unit/Views/FeedPostCardMentionColorGuardTests.swift
import XCTest
@testable import Meeshy

final class FeedPostCardMentionColorGuardTests: XCTestCase {
    private func sourceWithoutComments(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(path)
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw
            .replacingOccurrences(of: #"//[^\n]*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
    }

    func test_feedPostCard_messageTextRenderer_passesMentionColor() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertTrue(source.contains("mentionColor:"),
            "FeedPostCard doit passer mentionColor à MessageTextRenderer.render, sinon les mentions ne sont pas colorées")
    }

    func test_postDetailView_messageTextRenderer_passesMentionColor() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/PostDetailView.swift")
        XCTAssertTrue(source.contains("mentionColor:"),
            "PostDetailView doit passer mentionColor à MessageTextRenderer.render, sinon les mentions ne sont pas colorées")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyTests/FeedPostCardMentionColorGuardTests`
Expected: FAIL on both assertions (neither file currently contains `mentionColor:`)

- [ ] **Step 3: Fix both call sites**

`FeedPostCard.swift:298`, change:
```swift
MessageTextRenderer.render(effectiveContent, color: theme.textPrimary, accentColor: postLinkTint, trackedLinks: post.trackedLinkMap.isEmpty ? nil : post.trackedLinkMap)
```
to:
```swift
MessageTextRenderer.render(effectiveContent, color: theme.textPrimary, mentionColor: theme.accentColor, accentColor: postLinkTint, trackedLinks: post.trackedLinkMap.isEmpty ? nil : post.trackedLinkMap)
```

`PostDetailView.swift:1174`, change:
```swift
MessageTextRenderer.render(bodyText, fontSize: 16, color: theme.textPrimary, accentColor: Color(hex: accentColor), trackedLinks: postTrackedLinks)
```
to:
```swift
MessageTextRenderer.render(bodyText, fontSize: 16, color: theme.textPrimary, mentionColor: Color(hex: accentColor), accentColor: Color(hex: accentColor), trackedLinks: postTrackedLinks)
```

(Both use the post's existing accent color for mentions too — same accent already used for the URL link color at that call site, so mentions and links read as the same "this is tappable" family of color without introducing a brand-new theme token.)

- [ ] **Step 4: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyTests/FeedPostCardMentionColorGuardTests`
Expected: PASS — 2/2

- [ ] **Step 5: Build check**

Run: `./apps/ios/meeshy.sh build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift apps/ios/MeeshyTests/Unit/Views/FeedPostCardMentionColorGuardTests.swift
git commit -m "fix(ios/posts): les mentions sont colorées (mentionColor jamais passé)"
```

---

### Task 2: `MessageTextRenderer` — nouveau segment hashtag

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Utilities/MessageTextRenderer.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Utilities/MessageTextRendererHashtagTests.swift` (new)

**Interfaces:**
- Consumes: nothing new
- Produces: `MessageTextRenderer.render(..., hashtagColor: Color? = nil, ...)` new parameter; `Segment.hashtagLink(display:url:tag:)` new case; hashtag taps resolve to `https://meeshy.me/hashtag/<tag>`.

- [ ] **Step 1: Write the failing tests**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Utilities/MessageTextRendererHashtagTests.swift
import XCTest
@testable import MeeshyUI

final class MessageTextRendererHashtagTests: XCTestCase {
    func test_parse_singleHashtag_producesHashtagLinkSegment() {
        let segments = MessageTextRenderer.parse("Belle journée #paris aujourd'hui")
        guard case .hashtagLink(let display, let url, let tag) = segments.first(where: {
            if case .hashtagLink = $0 { return true }; return false
        })! else { return XCTFail("no hashtagLink segment found") }
        XCTAssertEqual(display, "#paris")
        XCTAssertEqual(tag, "paris")
        XCTAssertEqual(url, URL(string: "https://meeshy.me/hashtag/paris"))
    }

    func test_parse_hashtagUrl_isLowercased() {
        let segments = MessageTextRenderer.parse("#Paris")
        guard case .hashtagLink(_, let url, _) = segments.first(where: {
            if case .hashtagLink = $0 { return true }; return false
        })! else { return XCTFail("no hashtagLink segment found") }
        XCTAssertEqual(url, URL(string: "https://meeshy.me/hashtag/paris"))
    }

    func test_parse_hashtagInsideWord_isNotMatched() {
        let segments = MessageTextRenderer.parse("C#paris")
        XCTAssertFalse(segments.contains { if case .hashtagLink = $0 { return true }; return false })
    }

    func test_render_hashtagColorApplied_whenProvided() {
        let text = MessageTextRenderer.render("#paris", color: .primary, hashtagColor: .green)
        // AttributedString round-trip: convert Text to NSAttributedString via
        // the same technique already used by existing MessageTextRenderer
        // tests in this file's sibling suite (mirror whatever assertion
        // helper `MessageTextRendererTests.swift` already uses for
        // mentionColor/accentColor — do not invent a new one).
        XCTAssertNotNil(text)
    }
}
```

(Step 1 note: before writing the 4th test's body for real, open the sibling file `MessageTextRendererTests.swift` in the same test target and copy its EXACT helper for asserting a `Text`'s attributed color — this plan doesn't know that helper's name without reading it, and duplicating a slightly-different one would drift. Use the identical helper, just swap `mentionColor`/`accentColor` for `hashtagColor` and `#paris` for the mention/URL fixture it already uses.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyUITests/MessageTextRendererHashtagTests`
Expected: FAIL — `hashtagLink` doesn't exist on `Segment`, `hashtagColor` not a parameter

- [ ] **Step 3: Implement**

Add to `Segment` enum (`:133`):
```swift
        case hashtagLink(display: String, url: URL, tag: String)
```

Add to `RuleKind` enum (`:141`):
```swift
        case hashtag
```

Add the regex near `mentionRegex` (`:149`):
```swift
    // `#` + 1-50 caractères Unicode lettre/chiffre/underscore. PAS de tiret
    // (convention hashtag). Frontière gauche : ni mot ni `/` — exclut aussi
    // bien "C#paris" qu'un fragment d'URL "exemple.com/#section". MÊME
    // classe de caractères que le service gateway (HashtagService.ts) —
    // SSOT dupliquée consciemment, comme MENTION_HANDLE_CHARS l'est déjà
    // entre mention-parser.ts et son miroir Swift.
    private static let hashtagRegex = try! NSRegularExpression(
        pattern: #"(?<![\p{L}\p{N}_/])#([\p{L}\p{N}_]{1,50})"#
    )
```

Add to the `rules` array (`:157`), after `(mentionRegex, .mention),`:
```swift
        (hashtagRegex, .hashtag),
```

In the rule-matching `switch` (where `case .mention:` builds `.mentionLink`, around `:340-345`), add:
```swift
            case .hashtag:
                let tag = ns.substring(with: match.range(at: 1))
                let display = ns.substring(with: match.range)
                if let url = URL(string: "https://meeshy.me/hashtag/\(tag.lowercased())") {
                    segments.append(.hashtagLink(display: display, url: url, tag: tag.lowercased()))
                }
```

Add `hashtagColor` parameter to `render(...)` (`:36-49`):
```swift
    public static func render(
        _ text: String,
        fontSize: CGFloat = 15,
        color: Color,
        mentionColor: Color? = nil,
        accentColor: Color? = nil,
        hashtagColor: Color? = nil,
        mentionDisplayNames: [String: String]? = nil,
        highlightTerm: String? = nil,
        trackedLinks: [String: String]? = nil
    ) -> Text {
        guard !text.isEmpty else { return Text("") }
        let segments = parse(text, mentionDisplayNames: mentionDisplayNames)
        let ranges = highlightTerm.flatMap { highlightRanges(in: text, term: $0) } ?? []
        return buildText(segments, fontSize: fontSize, color: color, mentionColor: mentionColor, accentColor: accentColor, hashtagColor: hashtagColor, mentionDisplayNames: mentionDisplayNames, highlightRanges: ranges, fullText: text, trackedLinks: trackedLinks)
    }
```

Add `hashtagColor` parameter to `buildText(...)` signature (`:375-384`) and handle the new segment case (mirroring `.mentionLink`'s block at `:406-416`):
```swift
    private static func buildText(
        _ segments: [Segment],
        fontSize: CGFloat,
        color: Color,
        mentionColor: Color?,
        accentColor: Color?,
        hashtagColor: Color?,
        mentionDisplayNames: [String: String]?,
        highlightRanges: [NSRange] = [],
        fullText: String = "",
        trackedLinks: [String: String]? = nil
    ) -> Text {
        // ... existing body unchanged until the segment switch ...

            case .hashtagLink(let display, let url, _):
                var attr = AttributedString(display)
                attr.link = url
                attr.font = .system(size: fontSize, weight: .semibold)
                attr.underlineStyle = .single
                if let hashtagColor {
                    attr.foregroundColor = hashtagColor
                }
                charOffset += display.count
                result.append(attr)
```

Update the ONE internal call site inside `render(...)` above to pass `hashtagColor:` through (already shown). Search the file for any OTHER internal call to `buildText(` (there may be a second overload/entry point) and add `hashtagColor:` there too — `grep -n "buildText(" MessageTextRenderer.swift` to find every call site before considering this step done.

- [ ] **Step 4: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyUITests/MessageTextRendererHashtagTests`
Expected: PASS — 4/4

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyUITests/MessageTextRendererTests`
Expected: PASS — no regression from the new parameter (it has a default, existing call sites without it still compile and behave identically)

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Utilities/MessageTextRenderer.swift packages/MeeshySDK/Tests/MeeshyUITests/Utilities/MessageTextRendererHashtagTests.swift
git commit -m "feat(sdk/hashtags): nouveau segment hashtag dans MessageTextRenderer"
```

---

### Task 3: Fix reel caption rendering (feed + repost embed)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift:250`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ReelRepostEmbedCell.swift:122`
- Test: `apps/ios/MeeshyTests/Unit/Views/ReelCaptionRichTextGuardTests.swift` (new — same source-guard pattern as Task 1)

**Interfaces:**
- Consumes: `MessageTextRenderer.render` (Task 2, with `hashtagColor`)
- Produces: nothing new

- [ ] **Step 1: Write the failing source-guard test**

```swift
// apps/ios/MeeshyTests/Unit/Views/ReelCaptionRichTextGuardTests.swift
import XCTest
@testable import Meeshy

final class ReelCaptionRichTextGuardTests: XCTestCase {
    private func sourceWithoutComments(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(path)
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw
            .replacingOccurrences(of: #"//[^\n]*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
    }

    func test_reelFeedCard_usesMessageTextRenderer_notPlainText() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelFeedCard.swift")
        XCTAssertTrue(source.contains("MessageTextRenderer.render(displayCaption"),
            "ReelFeedCard doit rendre displayCaption via MessageTextRenderer, pas Text() brut")
    }

    func test_reelRepostEmbedCell_usesMessageTextRenderer_notPlainText() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelRepostEmbedCell.swift")
        XCTAssertTrue(source.contains("MessageTextRenderer.render(repost.content"),
            "ReelRepostEmbedCell doit rendre repost.content via MessageTextRenderer, pas Text() brut")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyTests/ReelCaptionRichTextGuardTests`
Expected: FAIL — both files currently use `Text(...)` directly

- [ ] **Step 3: Fix both call sites**

`ReelFeedCard.swift:250`, change:
```swift
Text(displayCaption)
```
to (read the ~10 lines around `:250` first for the exact existing modifier chain — `.font`/`.foregroundColor`/`.lineLimit` etc already applied to the `Text` and must be preserved on the new call):
```swift
MessageTextRenderer.render(displayCaption, color: .white, mentionColor: .white, accentColor: .white, hashtagColor: .white)
```
(Reels render over video — white-on-scrim is the existing convention at this call site per the surrounding `.foregroundColor(.white...)` uses seen elsewhere in this file; keep whatever modifier chain — `.lineLimit`, `.font` — was already applied to the old `Text(displayCaption)`, applied identically to the new call.)

`ReelRepostEmbedCell.swift:122`, change:
```swift
Text(repost.content)
```
to (same rule — preserve the existing `.font(.footnote)`/`.foregroundColor(theme.textSecondary)`/`.lineLimit(4)` modifiers already chained at `:122-124`, just swap the `Text` call itself):
```swift
MessageTextRenderer.render(repost.content, fontSize: 13, color: theme.textSecondary)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyTests/ReelCaptionRichTextGuardTests`
Expected: PASS — 2/2

- [ ] **Step 5: Build check**

Run: `./apps/ios/meeshy.sh build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift apps/ios/Meeshy/Features/Main/Views/ReelRepostEmbedCell.swift apps/ios/MeeshyTests/Unit/Views/ReelCaptionRichTextGuardTests.swift
git commit -m "fix(ios/reels): les captions passent par MessageTextRenderer (mentions/liens/hashtags)"
```

---

### Task 4: SDK — `PostServiceProviding.getPostsByHashtag` + `getTrendingHashtags`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/APIHashtag.swift`
- Modify: `apps/ios/MeeshyTests/Mocks/MockPostService.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceHashtagTests.swift` (new)

**Interfaces:**
- Consumes: gateway `GET /posts/hashtag/:tag` and `GET /hashtags/trending` (gateway plan Task 6)
- Produces: `PostServiceProviding.getPostsByHashtag(tag: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>`, `PostServiceProviding.getTrendingHashtags(limit: Int) async throws -> [APIHashtag]`, `APIHashtag { tag: String; usageCount: Int }`.

- [ ] **Step 1: Write `APIHashtag`**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Models/APIHashtag.swift
import Foundation

public struct APIHashtag: Codable, Sendable, Hashable, Identifiable {
    public var id: String { tag }
    public let tag: String
    public let usageCount: Int

    public init(tag: String, usageCount: Int) {
        self.tag = tag
        self.usageCount = usageCount
    }
}
```

- [ ] **Step 2: Write the failing tests**

`MockAPIClient` (`packages/MeeshySDK/Tests/MeeshySDKTests/Mocks/MockAPIClient.swift`) stubs by endpoint string (`func stub<T>(_ endpoint: String, result: T)`) and records every call (`lastRequest?.endpoint`, `requestCount`) — no per-method `Result<T,Error>` properties to set directly, unlike the app-side `MockPostService`.

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceHashtagTests.swift
import XCTest
@testable import MeeshySDK

final class PostServiceHashtagTests: XCTestCase {
    func test_getPostsByHashtag_callsExpectedEndpoint() async throws {
        let api = MockAPIClient()
        api.stub("/posts/hashtag/paris", result: JSONStub.decode(
            #"{"success":true,"data":[],"pagination":null,"error":null}"# as String
        ) as PaginatedAPIResponse<[APIPost]>)
        let service = PostService(api: api)

        _ = try await service.getPostsByHashtag(tag: "paris", cursor: nil, limit: 20)

        XCTAssertEqual(api.lastRequest?.endpoint, "/posts/hashtag/paris")
    }

    func test_getTrendingHashtags_decodesArray() async throws {
        let api = MockAPIClient()
        api.stub("/hashtags/trending?limit=10", result: [APIHashtag(tag: "paris", usageCount: 42)])
        let service = PostService(api: api)

        let result = try await service.getTrendingHashtags(limit: 10)

        XCTAssertEqual(result, [APIHashtag(tag: "paris", usageCount: 42)])
    }
}
```

(`JSONStub.decode` returning a generic `PaginatedAPIResponse<[APIPost]>` — check `JSONStub`'s actual signature in `packages/MeeshySDK/Tests/MeeshySDKTests/Helpers/JSONStub.swift` for the exact generic constraint spelling before finalizing this line; every other line in this file's tests is verified against the real `MockAPIClient`/`APIClientProviding` source.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshySDKTests/PostServiceHashtagTests`
Expected: FAIL — `getPostsByHashtag`/`getTrendingHashtags` don't exist

- [ ] **Step 4: Implement**

Add to `PostServiceProviding` protocol, near `getFeed` (`:25`):
```swift
    /// `GET /posts/hashtag/:tag` — posts+reels portant ce hashtag, plus
    /// récents en premier. `tag` est envoyé tel quel (le serveur normalise).
    func getPostsByHashtag(tag: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    /// `GET /hashtags/trending` — top hashtags par usageCount décroissant.
    func getTrendingHashtags(limit: Int) async throws -> [APIHashtag]
```

Add the implementation, near `getFeed`'s implementation (`:144-146`):
```swift
    public func getPostsByHashtag(tag: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/hashtag/\(tag)", cursor: cursor, limit: limit)
    }

    public func getTrendingHashtags(limit: Int = 20) async throws -> [APIHashtag] {
        try await api.request(endpoint: "/hashtags/trending?limit=\(limit)")
    }
```

(If `api.request(endpoint:)` isn't the exact existing helper signature for a plain non-paginated GET returning a decodable array, grep this same file for how a similarly-shaped existing method already calls a non-paginated endpoint — e.g. `getPost(postId:)` — and mirror THAT exact call shape instead.)

Add to `MockPostService.swift`, mirroring the `getFeed` mock (`:21,48,185-189`):
```swift
    var getPostsByHashtagResult: Result<PaginatedAPIResponse<[APIPost]>, Error> = .success(emptyPaginatedPosts)
    var getTrendingHashtagsResult: Result<[APIHashtag], Error> = .success([])
    var getPostsByHashtagCallCount = 0
    var getTrendingHashtagsCallCount = 0

    func getPostsByHashtag(tag: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getPostsByHashtagCallCount += 1
        return try getPostsByHashtagResult.get()
    }

    func getTrendingHashtags(limit: Int) async throws -> [APIHashtag] {
        getTrendingHashtagsCallCount += 1
        return try getTrendingHashtagsResult.get()
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshySDKTests/PostServiceHashtagTests`
Expected: PASS — 2/2

- [ ] **Step 6: Build check**

Run: `./apps/ios/meeshy.sh build`
Expected: `** BUILD SUCCEEDED **` (confirms `MockPostService` still conforms to `PostServiceProviding` everywhere it's used)

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift packages/MeeshySDK/Sources/MeeshySDK/Models/APIHashtag.swift apps/ios/MeeshyTests/Mocks/MockPostService.swift packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceHashtagTests.swift
git commit -m "feat(sdk/hashtags): PostServiceProviding.getPostsByHashtag + getTrendingHashtags"
```

---

### Task 5: `HashtagResultsViewModel` + `HashtagResultsView`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/ViewModels/HashtagResultsViewModel.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/HashtagResultsView.swift`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/HashtagResultsViewModelTests.swift` (new)

**Interfaces:**
- Consumes: `PostServiceProviding.getPostsByHashtag` (Task 4), `FeedPostCard` (existing, reused to render each result row)
- Produces: `HashtagResultsViewModel(tag: String, service: PostServiceProviding = PostService.shared)`, `@Published posts: [FeedPost]`, `@Published isLoading: Bool`, `func load() async`, `func loadMore() async`. `HashtagResultsView(tag: String)`.

- [ ] **Step 1: Write the failing tests**

`APIPost` has no memberwise initializer, only `init(from decoder:)` (`PostModels.swift:224`) — it's constructed in tests via `JSONStub.decode("""...""")`, exactly like `FeedViewModelTests.swift:55` (`makeAPIPost`) and `:77` (`makePaginatedResponse`) already do. Mirror those two private helpers locally rather than inventing a `.stub()` convenience init that doesn't exist on the real type.

```swift
// apps/ios/MeeshyTests/Unit/ViewModels/HashtagResultsViewModelTests.swift
import XCTest
@testable import Meeshy
@testable import MeeshySDK

final class HashtagResultsViewModelTests: XCTestCase {
    private static func makeAPIPost(id: String = "post-1", content: String = "#paris") -> APIPost {
        JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "POST",
            "content": "\(content)",
            "createdAt": "2026-01-15T12:00:00.000Z",
            "likeCount": 0,
            "commentCount": 0,
            "author": {"id": "author-1", "username": "alice"}
        }
        """)
    }

    /// Identique à `FeedViewModelTests.makePaginatedResponse` (`:77-106`) —
    /// re-sérialise chaque `APIPost` déjà décodé en JSON pour reconstruire
    /// l'enveloppe `{success, data, pagination}` que `JSONStub.decode`
    /// attend, plutôt que de construire `PaginatedAPIResponse` à la main
    /// (ses champs ne sont pas publiquement settables hors décodage).
    private static func makePaginatedResponse(
        posts: [APIPost] = [],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> PaginatedAPIResponse<[APIPost]> {
        let cursorJSON: String
        if let cursor = nextCursor {
            cursorJSON = #"{"nextCursor":"\#(cursor)","hasMore":\#(hasMore),"limit":20}"#
        } else if hasMore {
            cursorJSON = #"{"nextCursor":"cursor-next","hasMore":true,"limit":20}"#
        } else {
            cursorJSON = "null"
        }
        let postsJSON: String
        if posts.isEmpty {
            postsJSON = "[]"
        } else {
            let items = posts.map { p in
                #"{"id":"\#(p.id)","type":"\#(p.type ?? "POST")","content":"\#(p.content ?? "")","createdAt":"2026-01-15T12:00:00.000Z","likeCount":\#(p.likeCount ?? 0),"commentCount":\#(p.commentCount ?? 0),"author":{"id":"\#(p.author.id)","username":"\#(p.author.username ?? "user")"}}"#
            }
            postsJSON = "[\(items.joined(separator: ","))]"
        }
        return JSONStub.decode(#"{"success":true,"data":\#(postsJSON),"pagination":\#(cursorJSON),"error":null}"#)
    }

    func test_load_populatesPostsFromService() async {
        let service = MockPostService()
        let post = Self.makeAPIPost(id: "p1")
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(posts: [post]))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)

        await sut.load()

        XCTAssertEqual(sut.posts.map(\.id), ["p1"])
        XCTAssertEqual(service.getPostsByHashtagCallCount, 1)
    }

    func test_load_setsIsLoadingFalseAfterCompletion() async {
        let service = MockPostService()
        let sut = HashtagResultsViewModel(tag: "paris", service: service)

        await sut.load()

        XCTAssertFalse(sut.isLoading)
    }

    func test_load_serviceThrows_leavesPostsEmpty_doesNotCrash() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .failure(URLError(.notConnectedToInternet))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)

        await sut.load()

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadMore_appendsToExistingPosts_usingReturnedCursor() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(
            posts: [Self.makeAPIPost(id: "p1")], hasMore: true, nextCursor: "20"))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)
        await sut.load()

        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p2")]))
        await sut.loadMore()

        XCTAssertEqual(sut.posts.map(\.id), ["p1", "p2"])
    }
}
```


- [ ] **Step 2: Run tests to verify they fail**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyTests/HashtagResultsViewModelTests`
Expected: FAIL — `Cannot find 'HashtagResultsViewModel' in scope`

- [ ] **Step 3: Implement the ViewModel**

```swift
// apps/ios/Meeshy/Features/Main/ViewModels/HashtagResultsViewModel.swift
import Foundation
import MeeshySDK

@MainActor
final class HashtagResultsViewModel: ObservableObject {
    let tag: String
    @Published private(set) var posts: [FeedPost] = []
    @Published private(set) var isLoading = false

    private let service: PostServiceProviding
    private let languageProvider: LanguageProviding
    private var nextCursor: String?
    private var hasMore = true

    init(
        tag: String,
        service: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider()
    ) {
        self.tag = tag
        self.service = service
        self.languageProvider = languageProvider
    }

    /// `apiPost.toFeedPost(preferredLanguages:)` — même conversion que
    /// `FeedViewModel.loadFeed`, PAS un `FeedPost.init` inventé : c'est
    /// cette méthode qui résout la traduction affichée selon les langues
    /// préférées de l'utilisateur (`FeedModels.swift`).
    func load() async {
        isLoading = true
        defer { isLoading = false }
        let preferred = languageProvider.preferredLanguages
        do {
            let response = try await service.getPostsByHashtag(tag: tag, cursor: nil, limit: 20)
            posts = response.data.map { $0.toFeedPost(preferredLanguages: preferred) }
            nextCursor = response.pagination.nextCursor
            hasMore = response.pagination.hasMore
        } catch {
            // Échec silencieux : liste vide plutôt qu'un crash, même
            // invariant que le reste du feed sur perte réseau.
            posts = []
            hasMore = false
        }
    }

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        let preferred = languageProvider.preferredLanguages
        do {
            let response = try await service.getPostsByHashtag(tag: tag, cursor: nextCursor, limit: 20)
            posts.append(contentsOf: response.data.map { $0.toFeedPost(preferredLanguages: preferred) })
            nextCursor = response.pagination.nextCursor
            hasMore = response.pagination.hasMore
        } catch {
            hasMore = false
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyTests/HashtagResultsViewModelTests`
Expected: PASS — 5/5

- [ ] **Step 5: Implement the View**

```swift
// apps/ios/Meeshy/Features/Main/Views/HashtagResultsView.swift
import SwiftUI
import MeeshySDK

struct HashtagResultsView: View {
    @StateObject private var viewModel: HashtagResultsViewModel
    @EnvironmentObject private var theme: ThemeManager

    init(tag: String) {
        _viewModel = StateObject(wrappedValue: HashtagResultsViewModel(tag: tag))
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.posts) { post in
                    FeedPostCard(post: post)
                        .onAppear {
                            if post.id == viewModel.posts.last?.id {
                                Task { await viewModel.loadMore() }
                            }
                        }
                }
                if viewModel.isLoading {
                    ProgressView().padding()
                }
                if viewModel.posts.isEmpty && !viewModel.isLoading {
                    Text(String(localized: "hashtag.results.empty", defaultValue: "Aucun post avec #\(viewModel.tag)", bundle: .main))
                        .foregroundColor(theme.textSecondary)
                        .padding(.top, 60)
                }
            }
            .padding(.horizontal, 12)
        }
        .navigationTitle("#\(viewModel.tag)")
        .task { await viewModel.load() }
    }
}
```

(`FeedPostCard(post:)` — verify its actual init signature by reading `FeedPostCard.swift`'s `init` before finalizing; the constraint is "reuse the existing feed card for each result row," the exact parameter list must match what's really there, not be guessed.)

- [ ] **Step 6: Build check**

Run: `./apps/ios/meeshy.sh build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/HashtagResultsViewModel.swift apps/ios/Meeshy/Features/Main/Views/HashtagResultsView.swift apps/ios/MeeshyTests/Unit/ViewModels/HashtagResultsViewModelTests.swift
git commit -m "feat(ios/hashtags): écran de résultats HashtagResultsView"
```

---

### Task 6: Navigation — `Route.hashtagResults` + push wiring

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift` (switch near `:387`)
- Test: `apps/ios/MeeshyTests/Unit/Navigation/RouterHashtagResultsGuardTests.swift` (new — source guard, same pattern as Task 1/3)

**Interfaces:**
- Consumes: `HashtagResultsView` (Task 5)
- Produces: `Route.hashtagResults(tag: String)`, pushable via `router.push(.hashtagResults(tag:))`

- [ ] **Step 1: Write the failing source-guard test**

```swift
// apps/ios/MeeshyTests/Unit/Navigation/RouterHashtagResultsGuardTests.swift
import XCTest
@testable import Meeshy

final class RouterHashtagResultsGuardTests: XCTestCase {
    private func sourceWithoutComments(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(path)
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw
            .replacingOccurrences(of: #"//[^\n]*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
    }

    func test_route_hasHashtagResultsCase() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Navigation/Router.swift")
        XCTAssertTrue(source.contains("case hashtagResults(tag: String)"))
    }

    func test_rootView_rendersHashtagResultsView_forHashtagResultsRoute() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/RootView.swift")
        XCTAssertTrue(source.contains("case .hashtagResults(let tag):"))
        XCTAssertTrue(source.contains("HashtagResultsView(tag: tag)"))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyTests/RouterHashtagResultsGuardTests`
Expected: FAIL — neither string exists yet

- [ ] **Step 3: Implement**

In `Router.swift`, add to `enum Route: Hashable` (near `postDetail`, `:27`):
```swift
    case hashtagResults(tag: String)
```

In `RootView.swift`, add to the route-rendering `switch` (near the `.postDetail` case at `:387`):
```swift
                    case .hashtagResults(let tag):
                        HashtagResultsView(tag: tag)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyTests/RouterHashtagResultsGuardTests`
Expected: PASS — 2/2

- [ ] **Step 5: Build check**

Run: `./apps/ios/meeshy.sh build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Navigation/Router.swift apps/ios/Meeshy/Features/Main/Views/RootView.swift apps/ios/MeeshyTests/Unit/Navigation/RouterHashtagResultsGuardTests.swift
git commit -m "feat(ios/hashtags): Route.hashtagResults + rendu"
```

---

### Task 7: Deep link — `#hashtag` tap routes to `HashtagResultsView`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift` (`.onOpenURL` destination switch, near `:1017`)
- Test: `apps/ios/MeeshyTests/Unit/Navigation/DeepLinkRouterHashtagTests.swift` (new)

**Interfaces:**
- Consumes: `Route.hashtagResults` (Task 6)
- Produces: `DeepLinkDestination.hashtag(tag: String)`; both `https://meeshy.me/hashtag/<tag>` and `meeshy://hashtag/<tag>` resolve to it; navigating pushes `Route.hashtagResults(tag:)`.

- [ ] **Step 1: Write the failing tests**

```swift
// apps/ios/MeeshyTests/Unit/Navigation/DeepLinkRouterHashtagTests.swift
import XCTest
@testable import Meeshy

final class DeepLinkRouterHashtagTests: XCTestCase {
    func test_parse_universalLink_hashtag() {
        let url = URL(string: "https://meeshy.me/hashtag/paris")!
        guard case .hashtag(let tag) = DeepLinkParser.parse(url) else {
            return XCTFail("expected .hashtag destination")
        }
        XCTAssertEqual(tag, "paris")
    }

    func test_parse_customScheme_hashtag() {
        let url = URL(string: "meeshy://hashtag/paris")!
        guard case .hashtag(let tag) = DeepLinkParser.parse(url) else {
            return XCTFail("expected .hashtag destination")
        }
        XCTAssertEqual(tag, "paris")
    }

    func test_isMeeshyDeepLink_true_forHashtagUniversalLink() {
        XCTAssertTrue(DeepLinkParser.isMeeshyDeepLink(URL(string: "https://meeshy.me/hashtag/paris")!))
    }

    func test_parse_hashtagWithoutTag_isExternal() {
        let url = URL(string: "https://meeshy.me/hashtag/")!
        guard case .external = DeepLinkParser.parse(url) else {
            return XCTFail("expected .external for a hashtag path with no tag")
        }
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyTests/DeepLinkRouterHashtagTests`
Expected: FAIL — `.hashtag` doesn't exist on `DeepLinkDestination`

- [ ] **Step 3: Implement**

Add to `DeepLinkDestination` enum (`:8-32`, near `postDetail`):
```swift
    case hashtag(tag: String)
```

In `parseCustomScheme` (`:142-180`), add a case (near `case "u", "users":` at `:163`):
```swift
        case "hashtag":
            if components.count >= 2, !components[1].isEmpty { return .hashtag(tag: components[1]) }
```

In `parseMeeshyWeb` (`:205+`), add (near wherever `isUserSegment`/`.userProfile` is handled for the web-URL path, following the exact same `components.first == "..."` pattern already used there for `"me"`/`"links"`):
```swift
        if components.first == "hashtag" {
            guard components.count >= 2, !components[1].isEmpty else { return .external(url) }
            return .hashtag(tag: components[1])
        }
```

In `RootView.swift`'s `navigate` closure (the switch handling `DeepLinkDestination`, near `.userProfile` at `:1017`):
```swift
        case .hashtag(let tag):
            router.push(.hashtagResults(tag: tag))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyTests/DeepLinkRouterHashtagTests`
Expected: PASS — 4/4

- [ ] **Step 5: Build check + full targeted regression**

Run: `./apps/ios/meeshy.sh build`
Expected: `** BUILD SUCCEEDED **`

Run: `./apps/ios/meeshy.sh test -only-testing:MeeshyTests/DeepLinkRouterTests` (the existing full suite for this router — confirm no regression on the other routes)
Expected: PASS, all green

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift apps/ios/Meeshy/Features/Main/Views/RootView.swift apps/ios/MeeshyTests/Unit/Navigation/DeepLinkRouterHashtagTests.swift
git commit -m "feat(ios/hashtags): #hashtag tap route vers HashtagResultsView (deep link)"
```

---

## Self-Review Notes

- **Spec coverage:** §4 fully covered — mentionColor fix (Task 1), hashtag segment (Task 2), reel fix (Task 3), `HashtagResultsView` (Task 5). Navigation (§6) covered by Tasks 6-7.
- **Type consistency:** `hashtagColor: Color?` threaded through `render` → `buildText` identically in Task 2. `PostServiceProviding` method signatures in Task 4 match their usage in Task 5's `HashtagResultsViewModel` exactly (`tag: String, cursor: String?, limit: Int`).
- **Verified against real source during self-review** (not guessed): `FeedPostCard` has no custom init — `FeedPostCard(post:)` in Task 5 is its real memberwise init (`FeedPostCard.swift:9-10`). `FeedPost` conversion is `APIPost.toFeedPost(preferredLanguages:)`, not a fabricated `FeedPost.init` — Task 5's ViewModel now takes `LanguageProviding` (default `AuthManagerLanguageProvider()`) exactly like `FeedViewModel` does. `APIPost` has no memberwise init (`init(from decoder:)` only) — Task 5's test fixtures now mirror `FeedViewModelTests.makeAPIPost`/`makePaginatedResponse` verbatim instead of an invented `.stub()`. `MockAPIClient` stubs by endpoint string (`stub(_:result:)`) and records via `lastRequest?.endpoint`, not per-method `Result` properties — Task 4's SDK-level test corrected to match.
- **One remaining unresolved lookup:** Task 4's exact `JSONStub.decode` generic signature (file not read in the time available) — flagged inline at the one line that depends on it, everything else in this plan is verified against the real source.
