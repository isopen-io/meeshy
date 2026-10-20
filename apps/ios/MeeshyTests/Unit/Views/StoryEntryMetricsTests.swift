import XCTest
import MeeshyUI
@testable import Meeshy

/// #10925 — avant défilement, les points d'entrée de story en tête de la liste
/// des conversations ont EXACTEMENT les mesures de ceux du fil des posts. Depuis
/// #11033 les deux surfaces montent le MÊME `StoryTrayView`, qui lit
/// `StoryEntryMetrics`.
@MainActor
final class StoryEntryMetricsTests: XCTestCase {

    private func source(_ relativeToAppRoot: String) throws -> String {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(relativeToAppRoot))
        XCTAssertFalse(code.isEmpty, "\(relativeToAppRoot) : source vide — chemin faux")
        return code
    }

    private var feedTray: String {
        get throws { try source("Meeshy/Features/Main/Views/StoryTrayView.swift") }
    }

    func test_theEntry_isTheFeedTrayAvatarAndRing() {
        XCTAssertEqual(StoryEntryMetrics.avatar, AvatarContext.storyTray.size)
        XCTAssertEqual(StoryEntryMetrics.ring, AvatarContext.storyTray.ringSize)
        XCTAssertEqual(StoryEntryMetrics.avatar, 88)
    }

    func test_theFeedTray_isAsTallAsTheSharedEntry() {
        XCTAssertEqual(StoryTrayView.trayHeight, StoryEntryMetrics.height)
    }

    func test_theFeedTray_readsTheSharedMetrics() throws {
        let code = try feedTray
        for mesure in ["StoryEntryMetrics.labelWidth", "StoryEntryMetrics.labelFontSize",
                       "StoryEntryMetrics.labelSpacing", "StoryEntryMetrics.itemSpacing",
                       "StoryEntryMetrics.paddingVertical", "StoryEntryMetrics.avatarContext"] {
            XCTAssertTrue(code.contains(mesure), "StoryTrayView.swift doit lire \(mesure)")
        }
    }
}
