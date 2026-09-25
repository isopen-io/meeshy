import XCTest
import SwiftUI
@testable import MeeshyUI

/// **Light markdown and links in a message** (#7849) — the same cases as
/// `packages/shared/__tests__/text-segments-markdown.test.ts`, so web and iOS
/// read a message the same way.
@MainActor
final class MessageTextRendererMarkdownTests: XCTestCase {

    private func kinds(_ text: String) -> [String] {
        MessageTextRenderer.parse(text).map { segment in
            switch segment {
            case .text(let s, let styles):
                return styles.isEmpty ? "text(\(s))" : "text(\(s),\(styles.rawValue))"
            case .code(let s, _): return "code(\(s))"
            case .mentionLink(let d, _, _): return "mention(\(d))"
            case .hashtagLink(let d, _, _): return "hashtag(\(d))"
            case .meeshyTokenLink(let d, _, _): return "token(\(d))"
            case .urlLink(let d, let url): return "url(\(d)->\(url.absoluteString))"
            }
        }
    }

    // MARK: - Inline code

    func test_parse_inlineCode_isLiteral() {
        XCTAssertEqual(kinds("lance `**a** @alice` puis"), ["text(lance )", "code(**a** @alice)", "text( puis)"])
    }

    func test_parse_loneBacktick_staysText() {
        XCTAssertEqual(kinds("a ` b"), ["text(a ` b)"])
    }

    // MARK: - Markdown links

    func test_parse_markdownLink_showsLabel_followsURL() {
        XCTAssertEqual(kinds("lis [la doc](https://meeshy.me/docs)"), ["text(lis )", "url(la doc->https://meeshy.me/docs)"])
    }

    func test_parse_markdownMailto_isALink() {
        XCTAssertEqual(kinds("[écris](mailto:a@b.fr)"), ["url(écris->mailto:a@b.fr)"])
    }

    func test_parse_markdownLink_hostileScheme_neverLinks() {
        for hostile in ["[x](javascript:alert(1))", "[x](data:text/html,hi)", "[x](//evil.fr)"] {
            XCTAssertFalse(kinds(hostile).contains { $0.hasPrefix("url(") }, hostile)
        }
    }

    func test_parse_markdownLink_withDoubleUnderscores_isNotCut() {
        XCTAssertEqual(kinds("[init](https://x.fr/__init__)"), ["url(init->https://x.fr/__init__)"])
    }

    // MARK: - www. and e-mails

    func test_parse_www_becomesHttpsLink_withoutTrailingDot() {
        XCTAssertEqual(kinds("vois www.meeshy.me/a."), ["text(vois )", "url(www.meeshy.me/a->https://www.meeshy.me/a)", "text(.)"])
    }

    func test_parse_email_becomesMailto_notAMention() {
        XCTAssertEqual(kinds("écris à contact@marie.com"), ["text(écris à )", "url(contact@marie.com->mailto:contact@marie.com)"])
    }

    // MARK: - Combined emphasis

    func test_parse_tripleStar_isBoldItalic_withoutOrphanStar() {
        let bold = MessageTextRenderer.Styles.bold.rawValue | MessageTextRenderer.Styles.italic.rawValue
        XCTAssertEqual(kinds("***mot***"), ["text(mot,\(bold))"])
    }

    // MARK: - Plain text

    func test_plainText_dropsNotation() {
        XCTAssertEqual(MessageTextRenderer.plainText("un **mot** et [la doc](https://x.fr), `code`"), "un mot et la doc, code")
        XCTAssertEqual(MessageTextRenderer.plainText("# Titre\n- a\n- b\n> cité"), "Titre\na\nb\ncité")
    }

    func test_plainText_plainMessage_isUnchanged() {
        XCTAssertEqual(MessageTextRenderer.plainText("salut, 3 * 4 = 12\n\nfin"), "salut, 3 * 4 = 12\n\nfin")
    }

    // MARK: - Blocks

    func test_blocks_plainText_isOneIdenticalParagraph() {
        XCTAssertFalse(MessageBlockParser.hasBlockSyntax("ligne 1\n\nligne 2"))
        XCTAssertEqual(MessageBlockParser.parse("ligne 1\n\nligne 2"), [.paragraph("ligne 1\n\nligne 2")])
    }

    func test_blocks_headings() {
        XCTAssertEqual(
            MessageBlockParser.parse("# Un\n## Deux\n### Trois"),
            [.heading(level: 1, text: "Un"), .heading(level: 2, text: "Deux"), .heading(level: 3, text: "Trois")]
        )
    }

    func test_blocks_hashtagAtLineStart_isNotAHeading() {
        XCTAssertFalse(MessageBlockParser.hasBlockSyntax("#projet avance"))
    }

    func test_blocks_lists() {
        XCTAssertEqual(
            MessageBlockParser.parse("courses :\n- pain\n* lait\n\n1. un\n2. deux"),
            [
                .paragraph("courses :"),
                .list(ordered: false, start: 1, items: ["pain", "lait"]),
                .list(ordered: true, start: 1, items: ["un", "deux"]),
            ]
        )
        XCTAssertEqual(MessageBlockParser.parse("3. trois\n4. quatre"), [.list(ordered: true, start: 3, items: ["trois", "quatre"])])
    }

    func test_blocks_quote_groupsLines() {
        XCTAssertEqual(MessageBlockParser.parse("> il a dit\n> ceci\nréponse"), [.quote("il a dit\nceci"), .paragraph("réponse")])
    }

    func test_blocks_codeFence_isLiteral_keepsLanguage() {
        XCTAssertEqual(
            MessageBlockParser.parse("avant\n```ts\nconst a = **1**;\n# pas un titre\n```\naprès"),
            [.paragraph("avant"), .code(language: "ts", text: "const a = **1**;\n# pas un titre"), .paragraph("après")]
        )
    }

    func test_blocks_unclosedFence_runsToEnd() {
        XCTAssertEqual(MessageBlockParser.parse("```\nx\ny"), [.code(language: nil, text: "x\ny")])
    }

    func test_render_blocks_listItemCarriesBullet() {
        let attributed = MessageTextRenderer.renderBlocks(
            MessageBlockParser.parse("- un\n- deux"),
            fontSize: 15,
            color: .primary,
            context: .init(mentionColor: nil, hashtagColor: nil, accentColor: nil, usesRelativeFont: false,
                           mentionDisplayNames: nil, trackedLinks: nil, validUsernames: nil)
        )
        XCTAssertEqual(String(attributed.characters), "•  un\n•  deux")
    }
}
