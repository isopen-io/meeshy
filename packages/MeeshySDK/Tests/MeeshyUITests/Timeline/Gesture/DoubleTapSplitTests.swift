import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// La découpe au playhead et les gestes des barres de piste.
///
/// Le double tap DÉCOUPAIT le clip. C'est un geste que l'utilisateur fait pour
/// ouvrir des réglages, pas pour trancher son média — et il n'était câblé que
/// sur `VideoClipBar`, donc il ne voulait pas dire la même chose d'une piste à
/// l'autre. La découpe vit maintenant dans la fiche d'édition ; le double tap
/// ouvre celle-ci (directive user 2026-07-27).
@MainActor
final class DoubleTapSplitTests: XCTestCase {

    private static let trackDirectory = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // …/Gesture
        .deletingLastPathComponent()   // …/Timeline
        .deletingLastPathComponent()   // …/MeeshyUITests
        .deletingLastPathComponent()   // …/Tests
        .deletingLastPathComponent()   // …/MeeshySDK
        .appendingPathComponent("Sources/MeeshyUI/Story/Timeline/Views/Track")

    /// Retire les commentaires avant d'asserter : sans ça, le commentaire qui
    /// EXPLIQUE le motif banni le ferait échouer.
    private static func strippingComments(_ source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private func trackSource(_ name: String) throws -> String {
        let url = Self.trackDirectory.appendingPathComponent("\(name).swift")
        return Self.strippingComments(try String(contentsOf: url, encoding: .utf8))
    }

    // MARK: - La découpe elle-même (view model, inchangé)

    func test_splitAtPlayhead_producesTwoClips() async {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(engine: engine,
                                    commandStack: CommandStack(),
                                    snapEngine: SnapEngine(toleranceSeconds: 0.1))
        sut.bootstrap(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 6),
                      mediaURLs: [:], images: [:])
        await sut.awaitConfigured()

        sut.selectClip(id: "clip-1")
        sut.scrub(to: 2.0)
        sut.splitSelectedAtPlayhead()

        XCTAssertEqual(sut.project.mediaObjects.count, 2, "La découpe produit deux clips")
        let durations = sut.project.mediaObjects.compactMap { $0.duration }.sorted()
        XCTAssertEqual(durations[0], 2.0, accuracy: 0.01, "Moitié gauche = 2 s")
        XCTAssertEqual(durations[1], 4.0, accuracy: 0.01, "Moitié droite = 4 s")
    }

    /// La fiche ouverte par un double tap porte sur le clip surligné : c'est ce
    /// qui rend `splitSelectedAtPlayhead()` correct sans être paramétré.
    func test_inspectingAClip_alsoSelectsIt_soSplitTargetsIt() async {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(engine: engine,
                                    commandStack: CommandStack(),
                                    snapEngine: SnapEngine(toleranceSeconds: 0.1))
        sut.bootstrap(project: TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 6),
                      mediaURLs: [:], images: [:])
        await sut.awaitConfigured()

        sut.inspectClip(id: "clip-1")
        sut.scrub(to: 2.0)
        sut.splitSelectedAtPlayhead()

        XCTAssertEqual(sut.project.mediaObjects.count, 2,
                       "Le bouton Diviser de la fiche agit sur le clip qu'elle inspecte.")
    }

    // MARK: - Gardes de source sur les gestes des barres

    func test_clipBars_doubleTap_doesNotSplit() throws {
        for bar in ["VideoClipBar", "AudioClipBar", "TextClipBar"] {
            let code = try trackSource(bar)
            XCTAssertFalse(code.contains("split"),
                           "\(bar) : aucun geste de la barre ne doit déclencher une découpe.")
        }
    }

    /// Le glissement lent était avalé : `onLongPressGesture` s'engageait à 0,4 s
    /// de doigt immobile avant que le drag ne démarre, et `.gesture` (basse
    /// priorité) cédait au ScrollView horizontal de `TimelineScrubArea`.
    func test_clipBars_dragWinsOverScroll_andHasNoLongPress() throws {
        for bar in ["VideoClipBar", "AudioClipBar", "TextClipBar"] {
            let code = try trackSource(bar)
            XCTAssertTrue(code.contains("highPriorityGesture"),
                          "\(bar) : le drag doit gagner l'arbitrage contre le ScrollView parent.")
            XCTAssertFalse(code.contains("onLongPressGesture"),
                           "\(bar) : le long-press bloquait le glissement lent et faisait doublon avec le tap.")
        }
    }
}
