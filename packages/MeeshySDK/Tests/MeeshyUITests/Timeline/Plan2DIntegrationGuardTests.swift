import XCTest
import CryptoKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Garde de source pour D3 : le plan REMPLACE le conteneur mono-piste.
///
///   1. Le conteneur RACINE (`StoryTimelineHost` — c'est lui que
///      `TimelineSheetContent` construit en réponse à
///      `bandStateMachine.openTimeline`, identifié au premier pas et figé
///      ici) référence `Plan2DView` et ne référence plus `StoryTimelineView`
///      (la vue mono-piste remplacée — gardée par ailleurs pour ses propres
///      tests, mais plus le point d'entrée).
///   2. `Views/Inspector` reste référencé (S4 : l'édition de keyframes n'a
///      pas bougé) — et l'inspecteur timing gagne l'action « Suivre la
///      slide » (remise de `timing` à `nil`, revue totale U9) : garde de
///      source sur le LIBELLÉ (`ClipInspector`) et sur le NIL
///      (`TimelineViewModel+Plan4Helpers`).
///   3. `ComposerControlsLayer` (Story/Controls/, hors ownership de ce lot)
///      N'EST PAS TOUCHÉ — hash de contenu épinglé, pas un `git diff` (pas de
///      dépendance à l'état du dépôt / d'un remote pour faire tourner un test).
final class Plan2DIntegrationGuardTests: XCTestCase {

    // MARK: - Guard 1 — le conteneur racine bascule sur Plan2DView

    func test_storyTimelineHost_referencesPlan2DView() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("Plan2DView("),
                     "StoryTimelineHost (conteneur racine) doit construire Plan2DView")
    }

    func test_storyTimelineHost_noLongerReferencesTheReplacedSingleLaneView() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertFalse(source.contains("StoryTimelineView"),
                       "Le conteneur racine ne doit plus référencer la vue mono-piste remplacée")
    }

    /// Contrôle positif : la garde doit réellement détecter le motif banni.
    func test_guardDetectsAStoryTimelineViewReference() {
        let sample = "struct Fake { var body: some View { StoryTimelineView(viewModel: vm) } }"
        XCTAssertTrue(sample.contains("StoryTimelineView"))
    }

    // MARK: - Guard 2a — Views/Inspector reste référencé (S4)

    func test_storyTimelineHost_stillPresentsTheExistingInspector() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains(".timelineInspectorSheet("),
                     "L'édition de keyframes/clips reste celle de Views/Inspector (S4) — inchangée par D3")
    }

    // MARK: - Guard 2b — l'inspecteur gagne « Suivre la slide » (libellé + nil)

    func test_clipInspector_carriesTheFollowSlideLabel() throws {
        let source = try Self.strippedSource(of: Self.clipInspectorURL)
        XCTAssertTrue(source.contains("story.timeline.inspector.followSlide"),
                     "L'action « Suivre la slide » doit exister comme libellé/clé dans ClipInspector")
        XCTAssertTrue(source.contains("onFollowSlide"),
                     "Le callback doit exister sur ClipInspector — l'appelant (D3) décide de la mutation")
    }

    func test_timelineViewModel_followSlide_resetsTimingToNil() throws {
        let source = try Self.strippedSource(of: Self.timelineViewModelPlan4HelpersURL)
        guard let range = source.range(of: "func followSlide(") else {
            return XCTFail("TimelineViewModel doit porter followSlide(id:)")
        }
        let body = String(source[range.lowerBound...].prefix(2000))
        XCTAssertTrue(body.contains("startTime = nil") && body.contains("duration = nil"),
                     "followSlide doit remettre start ET duration à nil (O4 : timing == nil = fantôme)")
    }

    /// Contrôle positif : la garde doit réellement détecter l'ABSENCE du nil.
    func test_guardDetectsAFollowSlideThatNeverResetsTiming() {
        let sample = """
        func followSlide(id: String) {
            project.mediaObjects[0].startTime = 0
        }
        """
        XCTAssertFalse(sample.contains("startTime = nil") && sample.contains("duration = nil"))
    }

    // MARK: - Guard 2c — tête de lecture + scrub + règle graduée du plan
    //
    // Le premier passage remplaçait le conteneur mono-piste par `Plan2DView`
    // SEUL : la tête de lecture (`TimelineScrubArea`), le scrub, le pinch et
    // la règle LABELLISÉE disparaissaient — `viewModel.scrub`/`beginScrub`/
    // `endScrub` n'avaient plus AUCUN appelant côté UI, et `addKeyframeAtPlayhead`/
    // `splitSelectedAtPlayhead` opéraient silencieusement à t≈0 (régression
    // constatée, corrigée ici). Plutôt que réinventer un scrub bespoke dans
    // la géométrie du plan (deux mappings temps→x incompatibles,
    // `Plan2DLayout.x` contre `TimelineGeometry.x`), le conteneur RÉUTILISE
    // `RulerView`/`PlayheadView` (gestes de scrub déjà construits, testés)
    // via `Plan2DView.equivalentGeometry` — la conversion pure qui les fait
    // coïncider exactement avec le repère du plan.

    func test_storyTimelineHost_reusesRulerViewForScrub() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("RulerView("),
                     "La tête de lecture doit réutiliser RulerView (scrub déjà construit) plutôt qu'un Canvas bespoke")
        XCTAssertTrue(source.contains("viewModel.scrub("),
                     "Le scrub doit atteindre viewModel.scrub(to:) — sinon addKeyframeAtPlayhead/splitSelectedAtPlayhead restent aveugles")
    }

    func test_storyTimelineHost_reusesPlayheadViewForTheIndicator() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("PlayheadView("),
                     "La tête de lecture visible doit réutiliser PlayheadView plutôt qu'une ligne bespoke")
    }

    func test_storyTimelineHost_scrubGeometryIsThePlansEquivalentGeometry() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("Plan2DView.equivalentGeometry("),
                     "RulerView/PlayheadView doivent recevoir la géométrie ÉQUIVALENTE du plan — "
                     + "sinon leurs graduations/scrub désynchronisent des barres dessinées par Plan2DLayout.x")
    }

    // MARK: - Guard 2d — chrome d'ouverture/fermeture + transitions inter-clips

    func test_storyTimelineHost_showsTheOpeningClosingChrome() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("TransitionChromeLane("),
                     "Le chrome ouverture/fermeture de slide doit rester visible (perdu par le premier passage)")
    }

    func test_storyTimelineHost_keepsPerClipTransitionsReachable() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("TransitionJunctionResolver.resolve("),
                     "Les jonctions inter-clips doivent être résolues — sinon aucune transition existante n'est plus affichée")
        XCTAssertTrue(source.contains("TransitionBadge(") && source.contains("TransitionCreationBadge("),
                     "La création ET l'édition d'une transition existante doivent rester atteignables (badges existants réutilisés, pas réinventés)")
    }

    // MARK: - Guard 2e — TransitionChromeLane partage le MÊME repère que la
    // règle/tête de lecture/plan, pas une TimelineGeometry indépendante
    //
    // `TransitionChromeLane.badgeWidth` dérive du `geometry` reçu pour
    // convertir les 1,2s fixes (`StoryRenderer.slideTransitionDuration`) en
    // largeur de pixels. Si ce `geometry` n'est pas le MÊME
    // `Plan2DView.equivalentGeometry` que RulerView/PlayheadView reçoivent,
    // la largeur des badges d'ouverture/fermeture ne représente pas 1,2s sur
    // l'axe temporel du plan — exactement la désynchronisation de repère que
    // `equivalentGeometry` a été créée pour supprimer.

    func test_storyTimelineHost_transitionChromeLaneSharesThePlansEquivalentGeometry() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        guard let range = source.range(of: "TransitionChromeLane(") else {
            return XCTFail("StoryTimelineHost doit construire TransitionChromeLane")
        }
        let body = String(source[range.upperBound...].prefix(400))
        XCTAssertTrue(body.contains("geometry: equivalentGeometry"),
                     "TransitionChromeLane doit recevoir la MÊME géométrie que RulerView/PlayheadView — "
                     + "sinon la largeur de ses badges ne représente pas la même échelle temporelle que le reste du plan")
        XCTAssertFalse(body.contains("geometry: TimelineGeometry(zoomScale:"),
                      "TransitionChromeLane ne doit plus recevoir une TimelineGeometry brute, indépendante du repère du plan")
    }

    /// Contrôle positif : la garde doit réellement détecter l'ABSENCE de la règle.
    func test_guardDetectsAMissingRulerView() {
        let sample = "struct Fake { var body: some View { Plan2DView(...) } }"
        XCTAssertFalse(sample.contains("RulerView("))
    }

    // MARK: - Guard 3 — ComposerControlsLayer n'est pas touché

    func test_composerControlsLayer_contentIsUnchanged() throws {
        let data = try Data(contentsOf: Self.composerControlsLayerURL)
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        XCTAssertEqual(
            digest,
            "1afabcd74659da2356e221d2364ef48f3a4b300264e4ae28c89376677b19f9b1",
            "ComposerControlsLayer.swift n'appartient pas à ce lot (Global Constraints) — aucune ligne ne doit bouger"
        )
    }

    // MARK: - Helpers (garde de source)

    /// Le fichier vit dans `Tests/MeeshyUITests/Timeline/` : QUATRE remontées
    /// avant de redescendre dans `Sources` (même profondeur que
    /// `Plan2DViewGuardTests`).
    private static var sourcesRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Timeline
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine du package)
            .appendingPathComponent("Sources/MeeshyUI")
    }

    private static var storyTimelineHostURL: URL {
        sourcesRoot.appendingPathComponent("Story/Timeline/Views/Container/StoryTimelineHost.swift")
    }

    private static var clipInspectorURL: URL {
        sourcesRoot.appendingPathComponent("Story/Timeline/Views/Inspector/ClipInspector.swift")
    }

    private static var timelineViewModelPlan4HelpersURL: URL {
        sourcesRoot.appendingPathComponent("Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift")
    }

    private static var composerControlsLayerURL: URL {
        sourcesRoot.appendingPathComponent("Story/Controls/ComposerControlsLayer.swift")
    }

    private static func strippedSource(of url: URL) throws -> String {
        strippingLineComments(try String(contentsOf: url, encoding: .utf8))
    }

    private static func strippingLineComments(_ source: String) -> String {
        source
            .components(separatedBy: "\n")
            .map { line -> String in
                guard let range = line.range(of: "//") else { return line }
                return String(line[line.startIndex..<range.lowerBound])
            }
            .joined(separator: "\n")
    }
}
