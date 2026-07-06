import XCTest
@testable import MeeshyUI

/// U4 inc.1 — pins du helper pur de fraîcheur de `DraftResumeCard`.
///
/// Les attentes sont construites via la MÊME résolution de catalogue
/// (`String(localized:bundle:.module)`) que l'implémentation : le catalogue
/// porte désormais fr/en/es/de (C14) et le simulateur CI tourne en anglais,
/// donc épingler la copie française en dur cassait la suite sur tout
/// environnement non-francophone. Ce qui est sous test reste la LOGIQUE de
/// sélection (bucket now/minutes/heures/jours, clamp horloge dérivante, nil)
/// et les arguments interpolés — pas la copie d'une langue donnée.
final class DraftResumeCardTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_000_000)

    private var expectedNow: String {
        String(localized: "story.draft.freshness.now",
               defaultValue: "modifié à l'instant", bundle: .module)
    }

    private func expectedMinutes(_ minutes: Int) -> String {
        String(localized: "story.draft.freshness.minutes",
               defaultValue: "modifié il y a \(minutes) min", bundle: .module)
    }

    private func expectedHours(_ hours: Int) -> String {
        String(localized: "story.draft.freshness.hours",
               defaultValue: "modifié il y a \(hours) h", bundle: .module)
    }

    private func expectedDays(_ days: Int) -> String {
        String(localized: "story.draft.freshness.days",
               defaultValue: "modifié il y a \(days) j", bundle: .module)
    }

    func test_freshness_nilDate_returnsNil() {
        XCTAssertNil(DraftResumeCard.freshnessLabel(from: nil, now: now))
    }

    func test_freshness_justNow() {
        let label = DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(-30), now: now)
        XCTAssertEqual(label, expectedNow)
    }

    func test_freshness_minutes_hours_days() {
        XCTAssertEqual(DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(-25 * 60), now: now),
                       expectedMinutes(25))
        XCTAssertEqual(DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(-3 * 3600), now: now),
                       expectedHours(3))
        XCTAssertEqual(DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(-2 * 86_400), now: now),
                       expectedDays(2))
    }

    func test_freshness_futureDate_clampsToNow() {
        let label = DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(120), now: now)
        XCTAssertEqual(label, expectedNow, "Horloge dérivante : jamais de « il y a -2 min »")
    }

    func test_freshness_bucketsAreDistinct() {
        // Garde-fou complémentaire (indépendant de la langue) : les quatre
        // buckets produisent bien des libellés différents pour des âges
        // différents — la sélection de clé ne peut pas s'aplatir sur un seul
        // libellé sans faire échouer ce test.
        let labels = [
            DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(-30), now: now),
            DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(-25 * 60), now: now),
            DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(-3 * 3600), now: now),
            DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(-2 * 86_400), now: now)
        ]
        XCTAssertEqual(Set(labels).count, 4)
    }
}
