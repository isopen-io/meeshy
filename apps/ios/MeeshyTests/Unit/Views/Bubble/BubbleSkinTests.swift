import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// #10753 — la bulle envoyée prend l'accent personnel choisi avec une encre lisible
/// (noir ou blanc, seuil WCAG ≈ 0,179, miroir de `inkOnAccent` web) ; sans accent,
/// l'indigo de marque et le blanc. La bulle reçue est OPAQUE : l'accent mêlé à la surface.
@MainActor
final class BubbleSkinTests: XCTestCase {

    func test_resolve_withoutPersonalAccent_keepsTheBrandWithWhiteInk() {
        XCTAssertEqual(BubbleSkin.resolve(nil, isDark: false), .brand)
        XCTAssertEqual(BubbleSkin.resolve(.default, isDark: true), .brand)
        XCTAssertEqual(BubbleSkin.brand.sentFillHex, MeeshyColors.brandPrimaryHex)
        XCTAssertEqual(BubbleSkin.brand.sentInk, .white)
    }

    func test_resolve_lightAccent_takesTheAccentWithBlackInk() {
        let skin = BubbleSkin.resolve(ConversationAppearance(accent: "corail"), isDark: false)
        XCTAssertEqual(skin.sentFillHex, "#E0604E")
        XCTAssertEqual(skin.sentInk, .black)
    }

    func test_resolve_deepAccent_takesTheAccentWithWhiteInk() {
        let skin = BubbleSkin.resolve(ConversationAppearance(accent: "bleu-nuit"), isDark: false)
        XCTAssertEqual(skin.sentFillHex, ConversationBackgroundResolution.effectiveAccentHex(ConversationAppearance(accent: "bleu-nuit"), computedHex: "#000000", isDark: false))
        XCTAssertEqual(skin.sentInk, .white)
    }

    func test_resolve_followsTheSameAccentAsTheBackground() {
        for entry in AppearanceCatalog.shared.gamut.entries {
            for isDark in [false, true] {
                let appearance = ConversationAppearance(accent: entry.key)
                XCTAssertEqual(
                    BubbleSkin.resolve(appearance, isDark: isDark).sentFillHex,
                    ConversationBackgroundResolution.effectiveAccentHex(appearance, computedHex: "#000000", isDark: isDark),
                    "\(entry.key) \(isDark ? "sombre" : "clair")"
                )
            }
        }
    }

    func test_resolve_darkScheme_everyAccentInksBlack() {
        for entry in AppearanceCatalog.shared.gamut.entries {
            XCTAssertEqual(BubbleSkin.resolve(ConversationAppearance(accent: entry.key), isDark: true).sentInk, .black, entry.key)
        }
    }

    func test_resolve_unknownAccentKey_fallsBackToTheBrand() {
        XCTAssertEqual(BubbleSkin.resolve(ConversationAppearance(accent: "fuchsia"), isDark: false), .brand)
    }

    func test_ink_switchesAtTheWCAGEqualContrastPoint() {
        XCTAssertEqual(BubbleInk.readable(on: "#000000"), .white)
        XCTAssertEqual(BubbleInk.readable(on: "#FFFFFF"), .black)
        XCTAssertEqual(BubbleInk.readable(on: "#6366F1"), .black, "L ≈ 0,185 > 0,179 : la règle, pas l'habitude du blanc")
    }

    func test_accentHex_sentPiecesTakeTheSkinReceivedKeepTheirOwn() {
        let skin = BubbleSkin.resolve(ConversationAppearance(accent: "corail"), isDark: false)
        XCTAssertEqual(skin.accentHex(isMe: true, received: "123456"), "#E0604E")
        XCTAssertEqual(skin.accentHex(isMe: false, received: "123456"), "123456")
    }

    func test_receivedFill_isTheAccentMixedIntoTheOpaqueSurface() {
        XCTAssertEqual(BubbleSkin.receivedFillHex(accentHex: "6366F1", isDark: false), "E6E6FC")
        XCTAssertEqual(BubbleSkin.receivedFillHex(accentHex: "6366F1", isDark: true), "22234B")
        XCTAssertEqual(BubbleSkin.receivedFillHex(accentHex: "000000", isDark: false), "D6D6D6")
    }

    func test_ledger_servesTheMenuTheAppearanceTheThreadResolved() {
        let conversationId = "conv-\(UUID().uuidString)"
        XCTAssertEqual(BubbleSkinLedger.skin(for: conversationId, isDark: false), .brand)
        BubbleSkinLedger.record(ConversationAppearance(accent: "corail"), for: conversationId)
        XCTAssertEqual(BubbleSkinLedger.skin(for: conversationId, isDark: false).sentFillHex, "#E0604E")
        BubbleSkinLedger.record(nil, for: conversationId)
        XCTAssertEqual(BubbleSkinLedger.skin(for: conversationId, isDark: false), .brand)
    }

    // MARK: - Gardes de source

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private static let sentBubbleSources: [URL] = {
        let bubbleDir = appRoot.appendingPathComponent("Meeshy/Features/Main/Views/Bubble")
        let bubbleFiles = ((try? FileManager.default.contentsOfDirectory(at: bubbleDir, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.pathExtension == "swift" }
        return bubbleFiles + [
            "Meeshy/Features/Main/Views/ThemedMessageBubble.swift",
            "Meeshy/Features/Main/Components/MessageOverlayMenu.swift",
            "Meeshy/Features/Main/Components/MessageOverlayPreviewMedia.swift",
        ].map(appRoot.appendingPathComponent)
    }()

    func test_guard_readsTheBubbleSources() throws {
        XCTAssertGreaterThan(Self.sentBubbleSources.count, 20)
        for url in Self.sentBubbleSources {
            XCTAssertFalse(try String(contentsOf: url, encoding: .utf8).isEmpty, url.lastPathComponent)
        }
    }

    /// Le blanc en dur et l'indigo de marque ne reviennent pas sur la bulle envoyée : l'encre et le fond viennent de la peau.
    func test_guard_sentBubbleNeverHardcodesWhiteInkOrBrandFill() throws {
        let forbidden = try NSRegularExpression(pattern: #"\b(?:isMe|parentIsMe)\s*\?\s*(?:Color\.white|\.white|MeeshyColors\.brandPrimary)"#)
        for url in Self.sentBubbleSources {
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            let hits = forbidden.numberOfMatches(in: source, range: NSRange(source.startIndex..., in: source))
            XCTAssertEqual(hits, 0, "\(url.lastPathComponent) peint la bulle envoyée en dur au lieu de lire `bubbleSkin`")
        }
    }

    /// La peau entre dans la cellule ET dans l'aperçu du menu : sans montage, la bulle garde la marque par défaut.
    func test_guard_skinIsMountedOnTheCellAndTheMenuPreview() throws {
        let rows = try String(contentsOf: Self.appRoot.appendingPathComponent("Meeshy/Features/Main/Views/MessageListViewController+Rows.swift"), encoding: .utf8)
        XCTAssertEqual(AppSourceGuard.stripComments(rows).components(separatedBy: ".environment(\\.bubbleSkin, skin)").count - 1, 2)
        let menu = try String(contentsOf: Self.appRoot.appendingPathComponent("Meeshy/Features/Main/Components/MessageOverlayMenu.swift"), encoding: .utf8)
        XCTAssertTrue(AppSourceGuard.stripComments(menu).contains(".environment(\\.bubbleSkin, previewSkin)"))
    }
}
