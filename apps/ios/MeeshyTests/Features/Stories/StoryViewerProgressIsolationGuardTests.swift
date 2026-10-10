import XCTest
@testable import Meeshy

// **#9859 — un tick de progression n'écrit AUCUN état du lecteur de story.**
//
// La progression vivait dans `@State var progress` de `StoryViewerView`,
// réécrit par chaque tick du compte à rebours : chaque image réévaluait le
// lecteur, la carte, l'en-tête, le rail, et les calques des commentaires et du
// composeur. Elle vit désormais dans `StoryPlaybackProgressClock`, que seule
// `StoryLiveProgressBars` observe. Ces gardes lisent l'UNITÉ du lecteur
// (`StoryViewerView.swift` et toutes ses extensions `StoryViewerView+…`).

final class StoryViewerProgressIsolationGuardTests: XCTestCase {

    private static let viewerPath = "Meeshy/Features/Main/Views/StoryViewerView.swift"

    private static func viewerUnit() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(viewerPath))
    }

    private static func matches(_ pattern: String, in source: String) throws -> [String] {
        let regex = try NSRegularExpression(pattern: pattern)
        let range = NSRange(source.startIndex..., in: source)
        return regex.matches(in: source, range: range).compactMap {
            Range($0.range, in: source).map { String(source[$0]) }
        }
    }

    func test_theViewerUnit_isReadFromANonEmptySource() throws {
        let unit = try Self.viewerUnit()
        XCTAssertTrue(unit.contains("struct StoryViewerView"))
        XCTAssertTrue(unit.contains("struct StoryCardView"))
    }

    /// Le lecteur ne déclare plus d'état de progression.
    func test_theViewer_declaresNoProgressState() throws {
        let unit = try Self.viewerUnit()
        let declared = try Self.matches(#"@(State|Published)\s+(private\s+)?var\s+progress\b"#, in: unit)
        XCTAssertEqual(declared, [], "la progression ne vit plus dans un @State du lecteur")
    }

    /// Aucun site du lecteur n'assigne une progression nue : ni le tick, ni
    /// les remises à zéro (début, changement de story, boucle) — elles passent
    /// par l'horloge. Seul `RevealCircleShape` garde une `progress` à lui :
    /// son `animatableData` (`progress = newValue`) est l'interpolation de la
    /// forme, pas le temps de la story. Une constante locale (`let progress =`,
    /// l'anneau d'enregistrement du rail) n'est pas un état et n'est pas visée.
    func test_theViewer_neverAssignsAProgressValue() throws {
        let unit = try Self.viewerUnit()
        let writes = try Self.matches(#"(?<![\w.])(?<!let )(?<!var )progress\s*(=|\+=)(?!=)(?!\s*newValue\b)"#, in: unit)
        XCTAssertEqual(writes, [], "un tick ou une remise à zéro ne doit écrire aucun état du lecteur")
    }

    /// La carte ne reçoit plus la fraction : elle reçoit l'horloge, par
    /// référence, sans l'observer.
    func test_theCard_receivesTheClock_notTheFraction() throws {
        let unit = try Self.viewerUnit()
        XCTAssertFalse(unit.contains("let progress: CGFloat"))
        XCTAssertTrue(unit.contains("let progressClock: StoryPlaybackProgressClock"))
        XCTAssertEqual(try Self.matches(#"@ObservedObject\s+(private\s+)?var\s+progressClock"#, in: unit), [],
                       "le lecteur et la carte tiennent l'horloge sans l'observer")
        XCTAssertEqual(try Self.matches(#"@StateObject\s+(private\s+)?var\s+progressClock"#, in: unit), [],
                       "un @StateObject s'abonne : le lecteur se réévaluerait à chaque tick")
    }

    /// Le compte à rebours publie dans l'horloge ; la barre est montée derrière
    /// son seul observateur.
    func test_theCountdown_publishesIntoTheClock_andTheBarObservesIt() throws {
        let unit = try Self.viewerUnit()
        XCTAssertTrue(unit.contains("progressClock.publish("))
        XCTAssertTrue(unit.contains("StoryLiveProgressBars("))
        XCTAssertFalse(unit.contains("StoryProgressBarsView("),
                       "la barre nue lirait une fraction passée par le lecteur")
    }
}
