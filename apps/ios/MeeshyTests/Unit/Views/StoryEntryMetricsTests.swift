import XCTest
import MeeshySDK
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
        get throws { try source("Meeshy/Features/Stories/Views/StoryTrayView.swift") }
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

    // MARK: Mon cadre illustré dans la rangée (#15157)

    private func toile() throws -> AvatarRingDesign {
        try XCTUnwrap(AvatarRingCatalog.shared.packs.first { $0.slug == "cadres-illustres" }?.rings.first { $0.key == "toile-araignee" })
    }

    /// La rangée réserve ce que le film de « Moi » demande : l'avatar garde ses 88 pt, le film ne touche ni
    /// l'anneau du voisin (débordement latéral ≤ espacement + réserve), ni le libellé, ni le haut de la bande.
    func test_decorReserve_showsMyFrameFullSize_withoutTouchingTheNeighbourOrTheLabel() throws {
        let reserve = StoryEntryMetrics.decorReserve(try toile())
        let spill = StoryEntryMetrics.avatar * 0.2
        XCTAssertEqual(reserve.room, spill, accuracy: 0.001)
        let halo = (StoryEntryMetrics.ring - StoryEntryMetrics.avatar) / 2
        XCTAssertGreaterThanOrEqual(halo + StoryEntryMetrics.labelSpacing + reserve.bottom, spill - 0.001, "libellé")
        XCTAssertGreaterThanOrEqual(halo + StoryEntryMetrics.paddingVertical + reserve.top, spill - 0.001, "haut de la bande")
        let lateral = (StoryEntryMetrics.labelWidth - StoryEntryMetrics.avatar) / 2 + StoryEntryMetrics.itemSpacing
            + (StoryEntryMetrics.labelWidth - StoryEntryMetrics.ring) / 2
        XCTAssertGreaterThanOrEqual(lateral + reserve.side, spill - 0.001, "anneau du voisin")
        let layout = AvatarRingLayout.make(try toile(), box: StoryEntryMetrics.avatar, baseScale: 1, room: reserve.room)
        XCTAssertEqual(layout.contentScale, 1, accuracy: 0.0001)
    }

    func test_decorReserve_withoutIllustratedFrame_isNothing() {
        XCTAssertEqual(StoryEntryMetrics.decorReserve(nil), .none)
    }
}
