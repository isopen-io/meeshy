import XCTest
import MeeshyUI
@testable import Meeshy

/// **Chaque case de sticker se désigne par un identifiant stable (#10683).**
///
/// La recette sur iPhone du 2026-10-15 n'a pu atteindre la feuille qu'en
/// coordonnées : aucune case ne portait d'identifiant, et un décalage de
/// mise en page faisait tomber le toucher sur la fiche d'un sticker du fil.
/// Ces témoins lisent la source, commentaires retirés, et exigent que chaque
/// hôte compose son identifiant par `StickerAccessibilityID`.
final class StickerAccessibilityIDGuardTests: XCTestCase {

    private static let sdkHosts: [(path: String, call: String)] = [
        ("Story/StickerSheetTabBar.swift", "StickerAccessibilityID.tab("),
        ("Story/StickerPickerView+Mee.swift", "StickerAccessibilityID.mee("),
        ("Story/StickerPickerView+MeeInstants.swift", "StickerAccessibilityID.instant("),
        ("Story/StickerPickerView+Packs.swift", "StickerAccessibilityID.pack("),
        ("Story/StickerPickerView+Emoji.swift", "StickerAccessibilityID.emoji("),
        ("Story/StickerPickerView+Emoji.swift", "StickerAccessibilityID.library("),
    ]

    private func sdkSource(_ relativePath: String, file: StaticString = #filePath) throws -> String {
        let repo = MyStoriesSourceCorpus.appRoot(file: file)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let url = repo.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/\(relativePath)")
        return MyStoriesSourceCorpus.strippingComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_everySheetCellHost_composesItsIdentifierThroughTheSingleSite() throws {
        for host in Self.sdkHosts {
            XCTAssertTrue(try sdkSource(host.path).contains(host.call),
                          "\(host.path) doit poser .accessibilityIdentifier(\(host.call)…)")
        }
    }

    func test_theMessageArtwork_carriesTheStickerIdentifier() throws {
        let source = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/Bubble/MessageStickerArtwork.swift")
        XCTAssertTrue(source.contains(".accessibilityIdentifier(StickerAccessibilityID.messageArtwork)"))
    }

    func test_everyComposerRailDoor_carriesItsIdentifier() throws {
        let source = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Composer/ComposerLeadingRail.swift")
        XCTAssertTrue(source.contains(".accessibilityIdentifier(\"composer.rail.\\(door.rawValue)\")"))
    }

    func test_identifiers_areStableAndDistinctPerKind() {
        XCTAssertEqual(StickerAccessibilityID.mee("mee-coucou"), "sticker.mee.mee-coucou")
        XCTAssertEqual(StickerAccessibilityID.pack("chats", item: "c1"), "sticker.pack.chats.c1")
        let sameId = [
            StickerAccessibilityID.tab("x"), StickerAccessibilityID.mee("x"), StickerAccessibilityID.instant("x"),
            StickerAccessibilityID.emoji("x"), StickerAccessibilityID.library("x"),
        ]
        XCTAssertEqual(Set(sameId).count, sameId.count, "deux genres de case ne partagent jamais un identifiant")
    }
}
