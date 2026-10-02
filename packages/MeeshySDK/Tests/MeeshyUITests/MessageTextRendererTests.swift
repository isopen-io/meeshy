import XCTest
import SwiftUI
@testable import MeeshyUI
import MeeshySDK

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

    // #9093 — la loi de rendu d'un lien, lue sur le texte RENDU (texte des
    // runs liés + destination), pour les quatre formes écrites.

    private static let staging = "https://staging.meeshy.me"

    private func linkRuns(_ text: String, map: [String: String]?) -> [String] {
        let rendered = MessageTextRenderer.attributed(text, color: .primary, trackedLinks: map, webOrigin: Self.staging)
        return rendered.runs.compactMap { run in
            run.link.map { "\(String(rendered[run.range].characters))->\($0.absoluteString)" }
        }
    }

    private func plain(_ text: String, map: [String: String]?) -> String {
        String(MessageTextRenderer.attributed(text, color: .primary, trackedLinks: map, webOrigin: Self.staging).characters)
    }

    func test_law_bareMappedURL_showsShortCode_opensTrackedRedirect() {
        let map = ["https://example.com/page": "tok123"]
        XCTAssertEqual(linkRuns("voir https://example.com/page.", map: map), ["m+tok123->https://staging.meeshy.me/l/tok123"])
        XCTAssertEqual(plain("voir https://example.com/page.", map: map), "voir m+tok123.")
    }

    func test_law_bareUnmappedURL_keepsAddress_opensDirect() {
        XCTAssertEqual(linkRuns("voir https://other.com/x", map: ["https://example.com": "tok"]),
                       ["https://other.com/x->https://other.com/x"])
    }

    func test_law_labelledMappedURL_showsLabel_opensTrackedRedirect() {
        XCTAssertEqual(linkRuns("lis [la page](https://example.com/page)", map: ["https://example.com/page": "tok123"]),
                       ["la page->https://staging.meeshy.me/l/tok123"])
    }

    func test_law_labelledUnmappedURL_showsLabel_opensDirect() {
        XCTAssertEqual(linkRuns("lis [la page](https://example.com/page)", map: nil),
                       ["la page->https://example.com/page"])
    }

    func test_law_verbatimURL_showsAddressWithoutBrackets_opensDirect_evenWhenMapped() {
        let map = ["https://example.com/page": "tok123"]
        XCTAssertEqual(linkRuns("lis [[https://example.com/page]] !", map: map), ["https://example.com/page->https://example.com/page"])
        XCTAssertEqual(plain("lis [[https://example.com/page]] !", map: map), "lis https://example.com/page !")
    }

    func test_law_historicShortCode_staysLiteral_opensActiveOriginRedirect() {
        XCTAssertEqual(linkRuns("regarde m+Ab12cd", map: nil), ["m+Ab12cd->https://staging.meeshy.me/l/Ab12cd"])
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

    // MARK: - Hashtags

    /// Réduit les segments à une forme comparable sans dépendre de `Text`.
    private func kinds(_ text: String) -> [String] {
        MessageTextRenderer.parse(text).map { segment in
            switch segment {
            case .text(let s, _): return "text(\(s))"
            case .mentionLink(let d, _, _): return "mention(\(d))"
            case .hashtagLink(let d, _, _): return "hashtag(\(d))"
            case .link(.shortCode(let token)): return "token(m+\(token))"
            case .link(let written): return "url(\(LinkDisplayLaw.resolve(written, trackedLinks: nil)?.text ?? ""))"
            case .code(let s, _): return "code(\(s))"
            }
        }
    }

    func test_parse_loneHashtag_producesHashtagSegment() {
        XCTAssertEqual(kinds("#meeshy"), ["hashtag(#meeshy)"])
    }

    func test_parse_hashtagInSentence_keepsSurroundingText() {
        XCTAssertEqual(
            kinds("vive #meeshy aujourd'hui"),
            ["text(vive )", "hashtag(#meeshy)", "text( aujourd'hui)"]
        )
    }

    func test_parse_hashtagAndMention_bothRecognizedInSameText() {
        XCTAssertEqual(
            kinds("@alice regarde #swift"),
            ["mention(@alice)", "text( regarde )", "hashtag(#swift)"]
        )
    }

    func test_parse_hashtagGluedToPunctuation_stopsAtPunctuation() {
        XCTAssertEqual(kinds("génial #swift!"), ["text(génial )", "hashtag(#swift)", "text(!)"])
        XCTAssertEqual(kinds("(#swift)"), ["text(()", "hashtag(#swift)", "text())"])
    }

    func test_parse_hashtagWithAccentedLetters_capturesFullWord() {
        XCTAssertEqual(kinds("#été"), ["hashtag(#été)"])
    }

    func test_parse_purelyNumericTag_isAHashtag() {
        // SSOT gateway (HashtagService.ts, HASHTAG_REGEX) n'exclut pas les
        // tags purement numériques — le SDK doit rester aligné pour que le
        // rendu client corresponde exactement à ce que le backend indexe.
        XCTAssertEqual(kinds("Réunion #3 demain"), ["text(Réunion )", "hashtag(#3)", "text( demain)"])
        XCTAssertEqual(kinds("#42"), ["hashtag(#42)"])
    }

    func test_parse_alphanumericTagStartingWithDigit_isAHashtag() {
        XCTAssertEqual(kinds("#1direction"), ["hashtag(#1direction)"])
    }

    func test_parse_hashSuffixedToAWord_isNotAHashtag() {
        // Lookbehind : `C#` ne doit pas ouvrir un hashtag vide, et
        // `page#section` reste du texte.
        XCTAssertEqual(kinds("langage C#"), ["text(langage C#)"])
    }

    func test_parse_urlFragment_staysASingleURLSegment() {
        // Le `#` d'une ancre est INTERNE à l'URL — jamais un hashtag.
        XCTAssertEqual(
            kinds("voir https://meeshy.me/a#top"),
            ["text(voir )", "url(https://meeshy.me/a#top)"]
        )
    }

    func test_parse_hashtagInsideBold_survivesNestedParsing() {
        XCTAssertEqual(kinds("**#swift**"), ["hashtag(#swift)"])
    }

    func test_hasInlineSyntax_hashtagOnly_isTrue() {
        // Sans ce trigger, le fast-path plain-text court-circuiterait le hashtag.
        XCTAssertTrue(MessageTextRenderer.hasInlineSyntax("juste #swift ici"))
    }

    func test_hasInlineSyntax_plainTextWithoutTrigger_remainsFalse() {
        XCTAssertFalse(MessageTextRenderer.hasInlineSyntax("aucun trigger ici"))
    }

    func test_render_withHashtagColor_doesNotCrash() {
        XCTAssertNotNil(
            MessageTextRenderer.render(
                "salut @alice #meeshy",
                color: .primary,
                mentionColor: .blue,
                hashtagColor: .purple
            )
        )
    }

    func test_render_hashtagColor_changesOutput() {
        // Le paramètre est réellement appliqué au segment hashtag.
        let tinted = MessageTextRenderer.render("#meeshy", color: .primary, hashtagColor: .purple)
        let plain = MessageTextRenderer.render("#meeshy", color: .primary)
        XCTAssertNotEqual(tinted, plain)
    }

    func test_extractURLs_ignoresHashtags() {
        XCTAssertTrue(MessageTextRenderer.extractURLs(from: "#meeshy #swift").isEmpty)
    }

    // MARK: - Relative (Dynamic Type) font opt-in

    func test_render_relativeFont_differsFromFixedFont() {
        let fixed = MessageTextRenderer.render("bonjour", color: .primary)
        let relative = MessageTextRenderer.render("bonjour", color: .primary, usesRelativeFont: true)
        XCTAssertNotEqual(fixed, relative)
    }

    func test_render_relativeFont_defaultsToFixed() {
        let omitted = MessageTextRenderer.render("bonjour", color: .primary)
        let explicit = MessageTextRenderer.render("bonjour", color: .primary, usesRelativeFont: false)
        XCTAssertEqual(omitted, explicit)
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
