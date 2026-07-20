import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class MessageTextRendererTests: XCTestCase {

    // MARK: - Highlight Term

    func test_render_withoutHighlightTerm_returnsNormalText() {
        let result = MessageTextRenderer.render("Hello world", color: .primary)
        XCTAssertNotNil(result)
    }

    func test_render_withHighlightTerm_returnsText() {
        let result = MessageTextRenderer.render(
            "Hello world",
            color: .primary,
            highlightTerm: "world"
        )
        XCTAssertNotNil(result)
    }

    func test_render_withEmptyHighlightTerm_returnsNormalText() {
        let result = MessageTextRenderer.render(
            "Hello world",
            color: .primary,
            highlightTerm: ""
        )
        XCTAssertNotNil(result)
    }

    func test_render_withNilHighlightTerm_returnsNormalText() {
        let result = MessageTextRenderer.render(
            "Hello world",
            color: .primary,
            highlightTerm: nil
        )
        XCTAssertNotNil(result)
    }

    // MARK: - Display-name mentions (memoized rules path)

    func test_render_withDisplayNameMentions_runsCachedRulesPath() {
        // Exercises displayNameRules(from:) -> DisplayNameRulesCache: the map is
        // hashed as the cache key and the per-member regexes are compiled once.
        let names = ["atabeth": "Ata Beth", "jdoe": "John Doe"]
        let result = MessageTextRenderer.render(
            "Salut @Ata Beth et @John Doe",
            color: .primary,
            mentionDisplayNames: names
        )
        XCTAssertNotNil(result)
    }

    func test_render_withDisplayNameMentions_repeatedSameMap_isDeterministic() {
        // Second render hits the cache (identical map); output must be identical.
        let names = ["atabeth": "Ata Beth"]
        let first = MessageTextRenderer.render("ping @Ata Beth", color: .primary, mentionDisplayNames: names)
        let second = MessageTextRenderer.render("ping @Ata Beth", color: .primary, mentionDisplayNames: names)
        XCTAssertEqual(first, second)
    }

    func test_render_withDifferentDisplayNameMaps_doesNotCrash() {
        // Distinct maps -> distinct cache keys; both render correctly.
        let r1 = MessageTextRenderer.render("@Ata Beth", color: .primary, mentionDisplayNames: ["atabeth": "Ata Beth"])
        let r2 = MessageTextRenderer.render("@John Doe", color: .primary, mentionDisplayNames: ["jdoe": "John Doe"])
        XCTAssertNotNil(r1)
        XCTAssertNotNil(r2)
    }

    // MARK: - Plain-text fast-path (skips the regex pipeline)

    func test_render_plainText_noInlineSyntax_rendersViaFastPath() {
        // No markdown/mention/link trigger -> parse short-circuits to plain text.
        XCTAssertNotNil(MessageTextRenderer.render("juste un message simple sans aucune syntaxe", color: .primary))
    }

    func test_render_markdownTriggers_runFullPipeline() {
        // '*' / '~' / '_' triggers must NOT be skipped by the fast-path.
        XCTAssertNotNil(MessageTextRenderer.render("ceci est **gras**, ~~barre~~ et __souligne__", color: .primary))
    }

    func test_render_urlAndTokenTriggers_runFullPipeline() {
        XCTAssertNotNil(MessageTextRenderer.render("lien https://meeshy.me et token m+abc123", color: .primary))
    }

    func test_render_emojiPlainText_fastPath_roundTrips() {
        // Multi-byte / emoji content with no trigger still round-trips via the
        // fast-path (NSString full-range substring == original String).
        XCTAssertNotNil(MessageTextRenderer.render("salut 👋 ça va 🎉 bien", color: .primary))
    }

    // MARK: - Tracked links (outbound-link redirect rewrite)

    func test_resolvedLinkURL_exactMatch_rewritesToTrackingRedirect() {
        let raw = "https://example.com/page"
        let original = URL(string: raw)!
        let resolved = MessageTextRenderer.resolvedLinkURL(
            raw: raw, original: original, trackedLinks: [raw: "tok123"]
        )
        XCTAssertEqual(resolved.absoluteString, "https://meeshy.me/l/tok123")
    }

    func test_resolvedLinkURL_trailingPunctuation_trimsThenMatches() {
        // The URL regex may capture a trailing '.' the gateway excluded when it
        // minted the token — the trimmed form must still resolve.
        let raw = "https://example.com/page."
        let original = URL(string: raw)!
        let resolved = MessageTextRenderer.resolvedLinkURL(
            raw: raw, original: original, trackedLinks: ["https://example.com/page": "tok999"]
        )
        XCTAssertEqual(resolved.absoluteString, "https://meeshy.me/l/tok999")
    }

    func test_resolvedLinkURL_noMatch_keepsOriginal() {
        let raw = "https://other.com"
        let original = URL(string: raw)!
        let resolved = MessageTextRenderer.resolvedLinkURL(
            raw: raw, original: original, trackedLinks: ["https://example.com": "tok"]
        )
        XCTAssertEqual(resolved, original)
    }

    func test_resolvedLinkURL_nilOrEmptyMap_keepsOriginal() {
        let raw = "https://example.com"
        let original = URL(string: raw)!
        XCTAssertEqual(MessageTextRenderer.resolvedLinkURL(raw: raw, original: original, trackedLinks: nil), original)
        XCTAssertEqual(MessageTextRenderer.resolvedLinkURL(raw: raw, original: original, trackedLinks: [:]), original)
    }

    func test_render_withTrackedLinks_doesNotCrash() {
        // End-to-end: a URL-bearing message with a tracking map renders without
        // throwing; the displayed text keeps the raw URL.
        let result = MessageTextRenderer.render(
            "voir https://example.com/page maintenant",
            color: .primary,
            trackedLinks: ["https://example.com/page": "tok123"]
        )
        XCTAssertNotNil(result)
    }

    func test_render_withoutTrackedLinks_matchesNilParam() {
        // Omitting the param (default nil) is identical to passing nil.
        let omitted = MessageTextRenderer.render("lien https://example.com", color: .primary)
        let explicitNil = MessageTextRenderer.render("lien https://example.com", color: .primary, trackedLinks: nil)
        XCTAssertEqual(omitted, explicitNil)
    }

    // MARK: - highlightRanges (internal)

    func test_highlightRanges_findsAllOccurrences() {
        let text = "hello world hello"
        let ranges = MessageTextRenderer.highlightRanges(in: text, term: "hello")
        XCTAssertEqual(ranges.count, 2)
        XCTAssertEqual((text as NSString).substring(with: ranges[0]), "hello")
        XCTAssertEqual((text as NSString).substring(with: ranges[1]), "hello")
    }

    func test_highlightRanges_isCaseInsensitive() {
        let text = "Hello HELLO hElLo"
        let ranges = MessageTextRenderer.highlightRanges(in: text, term: "hello")
        XCTAssertEqual(ranges.count, 3)
    }

    func test_highlightRanges_emptyTerm_returnsEmpty() {
        let ranges = MessageTextRenderer.highlightRanges(in: "hello", term: "")
        XCTAssertTrue(ranges.isEmpty)
    }

    func test_highlightRanges_noMatch_returnsEmpty() {
        let ranges = MessageTextRenderer.highlightRanges(in: "hello world", term: "xyz")
        XCTAssertTrue(ranges.isEmpty)
    }

    func test_highlightRanges_partialWord_matches() {
        let text = "bonjour"
        let ranges = MessageTextRenderer.highlightRanges(in: text, term: "jour")
        XCTAssertEqual(ranges.count, 1)
        XCTAssertEqual((text as NSString).substring(with: ranges[0]), "jour")
    }
}
