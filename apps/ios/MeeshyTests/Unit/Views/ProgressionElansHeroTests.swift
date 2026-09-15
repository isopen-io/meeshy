import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// LES PASTILLES DE L'ÉLAN (#5927, sous-issue de #5897) — la fenêtre SERVIE,
/// jamais les compteurs cumulés.
///
/// Mesuré sur staging le 2026-09-14, juste après une frappe : « Élan ×5 —
/// 5 familles actives sur 7 jours » au-dessus d'UNE pastille. La frappe avait
/// ramené quatre familles à zéro action, et le héros balayait `progress.axes`
/// quand la phrase lisait la fenêtre. Deux sources pour un même bloc.
@MainActor
final class ProgressionElansHeroTests: XCTestCase {

    private var ecran: RenderedScreen?

    override func tearDown() {
        ecran?.dismount()
        ecran = nil
        super.tearDown()
    }

    @discardableResult
    private func monter(_ vue: some View, file: StaticString = #filePath, line: UInt = #line) -> RenderedScreen {
        let e = RenderedScreen(vue, size: CGSize(width: 402, height: 400), file: file, line: line)
        ecran = e
        return e
    }

    /// Des compteurs positifs sur QUATRE familles, une seule active dans la fenêtre.
    private func progress(activeFamilies: [String]?) -> EngagementProgress {
        EngagementProgressResolver.resolve(APIEngagementProgress(
            counters: [
                .init(axisKey: "content.text_message", count: 40),
                .init(axisKey: "comment.text", count: 11),
                .init(axisKey: "tool.sticker", count: 6),
                .init(axisKey: "conversation.private", count: 12)
            ],
            milestones: [],
            streak: .init(currentStreakDays: 2, longestStreakDays: 14),
            level: .init(engagementScore: 400),
            elan: .init(factor: 2, activeFamilyCount: 1, hasStanding: true, windowDays: 7, activeFamilies: activeFamilies)
        ))
    }

    func test_chips_areTheServedWindow_notTheCumulativeCounters() {
        let ecran = monter(ProgressionElansHero(progress: progress(activeFamilies: ["conversation"]), isDark: false).frame(width: 370))

        let dit = ecran.labels
        XCTAssertTrue(dit.contains(ProgressionCopy.title(for: .conversation)), "La famille active n'a pas sa pastille : \(dit)")
        for famille in [EngagementAxisFamily.content, .comment, .tool] {
            XCTAssertFalse(dit.contains(ProgressionCopy.title(for: famille)),
                           "« \(ProgressionCopy.title(for: famille)) » a une pastille alors qu'elle est hors de la fenêtre : \(dit)")
        }
    }

    func test_withoutServedFamilies_noChipIsInvented() {
        let ecran = monter(ProgressionElansHero(progress: progress(activeFamilies: nil), isDark: false).frame(width: 370))

        let dit = ecran.labels
        for famille in EngagementAxisFamily.allCases {
            XCTAssertFalse(dit.contains(ProgressionCopy.title(for: famille)),
                           "Une pastille est inventée depuis les compteurs cumulés : \(dit)")
        }
    }
}
