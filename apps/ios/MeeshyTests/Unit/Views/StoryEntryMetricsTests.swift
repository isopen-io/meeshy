import XCTest
import MeeshyUI
@testable import Meeshy

/// #10925 — avant défilement, les points d'entrée de story en tête de la liste
/// des conversations ont EXACTEMENT les mesures de ceux du fil des posts : les
/// deux surfaces lisent `StoryEntryMetrics`, jamais une cote à elles.
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

    private var listRail: String {
        get throws { try source("Meeshy/Features/Main/Lentille/Chrome/StoriesVivantsRail.swift") }
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

    func test_theConversationListRail_readsTheSameMetrics_notTheLivesRailOnes() throws {
        let code = try listRail
        for mesure in ["StoryEntryMetrics.ring", "StoryEntryMetrics.avatar", "StoryEntryMetrics.labelWidth",
                       "StoryEntryMetrics.labelFontSize", "StoryEntryMetrics.labelSpacing",
                       "StoryEntryMetrics.itemSpacing", "StoryEntryMetrics.paddingVertical",
                       "StoryEntryMetrics.height", "StoryEntryMetrics.badge"] {
            XCTAssertTrue(code.contains(mesure), "StoriesVivantsRail.swift doit lire \(mesure)")
        }
        XCTAssertFalse(
            code.contains("LentilleMetrics.Rail.size"),
            "Le rail de tête de liste ne peint plus ses pastilles à la cote des DIRECTS (48) : " +
            "c'est cette seconde valeur qui le rendait deux fois plus petit que le plateau du fil."
        )
        XCTAssertFalse(code.contains("LentilleMetrics.Rail.ringWidth"))
    }
}
