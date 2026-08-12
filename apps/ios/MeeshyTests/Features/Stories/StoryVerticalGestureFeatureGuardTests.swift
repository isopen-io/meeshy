import XCTest
@testable import Meeshy

/// Une surface ouverte doit se refermer AVANT que quoi que ce soit d'autre
/// n'arrive — y compris la fermeture du lecteur.
///
/// L'invariant était tenu au TOUCHER (`StoryReaderCanvas`, garde `hasActiveFeature`
/// au touch-down : le premier contact referme la surface et rien d'autre ne se
/// produit) mais PAS au GLISSEMENT vertical : `StoryVerticalGestureDecisions.decide`
/// ignorait complètement l'état des surfaces. Un swipe vers le bas alors que le
/// strip de langues, la barre d'emojis, l'overlay de commentaires ou la
/// transcription étaient ouverts fermait le lecteur d'un coup — l'utilisateur
/// perdait la story ET son overlay, alors qu'il voulait juste refermer ce
/// dernier.
///
/// La règle retenue vaut pour les DEUX directions, par cohérence avec la garde
/// du toucher : tant qu'une surface est ouverte, tout geste vertical de
/// dismissal lui revient.
/// `@MainActor` comme `StoryGestureDecisionsTests` : le target app compile en
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, donc `StoryVerticalGestureAction`
/// et sa conformance `Equatable` sont isolées. Une suite nonisolated ne peut ni
/// appeler `decide` ni comparer ses résultats.
@MainActor
final class StoryVerticalGestureFeatureGuardTests: XCTestCase {

    private let threshold: CGFloat = 120

    private func decide(translationY: CGFloat,
                        predictedY: CGFloat? = nil,
                        isFullscreen: Bool = false,
                        hasActiveFeature: Bool) -> StoryVerticalGestureAction {
        StoryVerticalGestureDecisions.decide(
            translationY: translationY,
            predictedY: predictedY ?? translationY,
            isFullscreen: isFullscreen,
            threshold: threshold,
            hasActiveFeature: hasActiveFeature
        )
    }

    // MARK: - Le défaut corrigé

    func test_swipeDown_withOpenFeature_closesTheFeature_notTheViewer() {
        XCTAssertEqual(
            decide(translationY: 300, hasActiveFeature: true),
            .dismissActiveFeature,
            "un swipe bas sur un overlay ouvert doit refermer l'overlay, jamais éjecter de la story"
        )
    }

    func test_swipeDownInFullscreen_withOpenFeature_closesTheFeature() {
        XCTAssertEqual(
            decide(translationY: 300, isFullscreen: true, hasActiveFeature: true),
            .dismissActiveFeature,
            "même en plein écran, la surface passe avant le changement de mode"
        )
    }

    func test_swipeUp_withOpenFeature_closesTheFeature_ratherThanEnteringFullscreen() {
        XCTAssertEqual(
            decide(translationY: -300, hasActiveFeature: true),
            .dismissActiveFeature,
            "cohérence avec la garde du toucher : la surface consomme le geste, dans les deux sens"
        )
    }

    /// Sous le seuil, rien ne se passe : un micro-mouvement ne doit pas fermer
    /// une surface que l'utilisateur est peut-être en train de lire.
    func test_belowThreshold_withOpenFeature_cancels() {
        XCTAssertEqual(
            decide(translationY: 40, hasActiveFeature: true),
            .cancel,
            "un geste qui ne franchit pas le seuil reste sans effet, surface ouverte ou non"
        )
    }

    // MARK: - Contrôle positif — sans surface, rien ne change

    func test_swipeDown_withoutFeature_stillDismissesTheViewer() {
        XCTAssertEqual(decide(translationY: 300, hasActiveFeature: false), .dismissViewer)
    }

    func test_swipeDownInFullscreen_withoutFeature_stillExitsFullscreen() {
        XCTAssertEqual(
            decide(translationY: 300, isFullscreen: true, hasActiveFeature: false),
            .exitFullscreen
        )
    }

    func test_swipeUp_withoutFeature_stillEntersFullscreen() {
        XCTAssertEqual(decide(translationY: -300, hasActiveFeature: false), .enterFullscreen)
    }

    /// Le flick court mais rapide reste validé par la prédiction — la garde ne
    /// doit pas avoir neutralisé ce chemin.
    func test_shortFastFlickDown_withoutFeature_stillDismisses() {
        XCTAssertEqual(
            decide(translationY: 30, predictedY: 400, hasActiveFeature: false),
            .dismissViewer
        )
    }

    // MARK: - Câblage du drag parent (gardes de source)
    //
    // `unifiedDragGesture` est un `some Gesture` d'une View pilotée par des
    // `@State` : ni instanciable ni jouable en XCTest. Les trois invariants
    // ci-dessous sont donc vérifiés par analyse de source, commentaires retirés
    // (le texte explicatif cite les motifs qu'on interdit).

    /// Retire les commentaires ligne pour qu'une garde ne soit jamais satisfaite
    /// — ni mise en échec — par de la prose.
    private func codeOnly(_ source: String) -> String {
        source
            .components(separatedBy: "\n")
            .map { line -> String in
                guard let marker = line.range(of: "//") else { return line }
                return String(line[..<marker.lowerBound])
            }
            .joined(separator: "\n")
    }

    private func dragGestureCode() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Content.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        guard let start = source.range(of: "var unifiedDragGesture: some Gesture {"),
              let end = source.range(of: "\n    }", range: start.upperBound..<source.endIndex) else {
            XCTFail("unifiedDragGesture introuvable dans StoryViewerView+Content.swift")
            return ""
        }
        return codeOnly(String(source[start.upperBound..<end.lowerBound]))
    }

    /// L'ÉTAT DES SURFACES EST LU AU DÉBUT DU GESTE, PAS AU RELÂCHEMENT.
    ///
    /// L'overlay gestuel enfant consomme la surface ouverte dès le touch-down
    /// (il appelle `dismissActiveReaderFeature()`), donc au touch-up
    /// `hasActiveReaderFeature` vaut déjà `false` : le drag concluait
    /// `.dismissViewer` et l'utilisateur qui glissait vers le bas pour refermer
    /// son overlay perdait la story avec.
    func test_verticalDecision_readsTheFeatureStateFrozenAtDragStart() throws {
        let code = try dragGestureCode()
        XCTAssertFalse(
            code.contains("hasActiveFeature: hasActiveReaderFeature"),
            "Le relâchement ne doit pas relire l'état VIVANT des surfaces : il est " +
            "déjà périmé, l'enfant a refermé la surface au touch-down."
        )
        XCTAssertTrue(
            code.contains("hadActiveFeatureAtDragStart = hasActiveReaderFeature"),
            "La valeur doit être photographiée à la décision d'axe du geste."
        )
    }

    /// LE DRAG PARENT NE NAÎT PAS DANS UNE SURFACE SCROLLABLE.
    ///
    /// Il est monté sur un ancêtre des `ScrollView` de ces surfaces : quand
    /// l'`UIScrollView` emporte la séquence, SwiftUI ne délivre jamais `onEnded`.
    /// La garde est désormais une garde de POINT DE DÉPART (le geste né au-dessus
    /// de la surface reste au drag parent et peut la refermer), donc ce qui doit
    /// être vérifié ici c'est qu'elle interroge bien la position d'origine du
    /// geste — pas qu'elle neutralise tout.
    func test_dragGesture_yieldsOnlyForGesturesBornInsideTheScrollableSurface() throws {
        let code = try dragGestureCode()
        XCTAssertTrue(
            code.contains("StoryReaderDragStartZone.yieldsToScrollableSurface"),
            "La sortie anticipée doit passer par la décision pure — sans elle, " +
            "scroller la liste translate la carte et un onEnded jamais délivré " +
            "gèle la story."
        )
        XCTAssertTrue(
            code.contains("dragStartY: value.startLocation.y"),
            "C'est le POINT DE DÉPART du geste qui décide, pas sa position courante : " +
            "un geste né au-dessus de la surface doit rester au drag parent même " +
            "quand le doigt entre ensuite dans la liste."
        )
    }

    // MARK: - Garde de zone de départ (décision pure)

    private func yields(open: Bool, top: CGFloat?, startY: CGFloat) -> Bool {
        StoryReaderDragStartZone.yieldsToScrollableSurface(
            hasScrollableSurface: open,
            surfaceTopY: top,
            dragStartY: startY
        )
    }

    /// CAS NOMINAL — aucune surface ouverte : le drag parent s'exécute
    /// intégralement. C'est la très grande majorité des gestes du lecteur, et la
    /// garde ne doit jamais l'amputer.
    func test_startZone_noSurfaceOpen_neverYields() {
        XCTAssertFalse(yields(open: false, top: nil, startY: 0))
        XCTAssertFalse(yields(open: false, top: 400, startY: 700))
        XCTAssertFalse(yields(open: false, top: 400, startY: 100))
    }

    func test_startZone_gestureBornInsideTheSurface_yieldsToScroll() {
        XCTAssertTrue(
            yields(open: true, top: 400, startY: 500),
            "un geste né dans la liste appartient au scroll et à rien d'autre"
        )
    }

    func test_startZone_gestureBornOnTheSurfaceEdge_yieldsToScroll() {
        XCTAssertTrue(
            yields(open: true, top: 400, startY: 400),
            "le bord appartient à la surface : on cède plutôt que de risquer un onEnded jamais délivré"
        )
    }

    /// LA DEMANDE UTILISATEUR : le swipe bas redevient capable de refermer la
    /// surface quand il naît dans la story encore visible au-dessus d'elle.
    func test_startZone_gestureBornAboveTheSurface_staysWithTheParentDrag() {
        XCTAssertFalse(
            yields(open: true, top: 400, startY: 399),
            "au-dessus de la surface, la story est visible et le glissement doit pouvoir la refermer"
        )
        XCTAssertFalse(yields(open: true, top: 400, startY: 80))
    }

    /// FAIL-SAFE — surface ouverte mais bord inconnu (mesure pas encore arrivée,
    /// ou panneau non mesurable côté viewer) : on conserve la sortie anticipée
    /// intégrale. Un swipe inerte pendant une frame vaut mieux qu'une lecture
    /// gelée par un `onEnded` jamais délivré.
    func test_startZone_surfaceOpenButTopUnknown_yieldsEverything() {
        XCTAssertTrue(yields(open: true, top: nil, startY: 0))
        XCTAssertTrue(yields(open: true, top: nil, startY: 10_000))
    }

    // MARK: - Refermer une surface par glissement ne quitte JAMAIS le lecteur

    /// L'overlay gestuel enfant referme la surface active dès le TOUCH-DOWN,
    /// alors que le drag parent n'ouvre son premier `onChanged` qu'à 15 pt : sa
    /// photographie `hadActiveFeatureAtDragStart` vaut donc `false` et un
    /// glissement bas de plus de 120 pt concluait `.dismissViewer` — la story
    /// perdue pour un strip refermé. Le relâchement doit lire les DEUX sources.
    func test_verticalDecision_alsoHonoursTheFeatureConsumedByTheChildAtTouchDown() throws {
        let code = try dragGestureCode()
        XCTAssertTrue(
            code.contains("hadActiveFeatureAtDragStart || readerFeatureConsumedByTouch"),
            "Sans le signal du touch-down de l'enfant, refermer une surface par " +
            "glissement éjecte l'utilisateur de la story."
        )
        XCTAssertTrue(
            code.contains("readerFeatureConsumedByTouch = false"),
            "Le signal doit être CONSOMMÉ par le geste qui le lit, sinon il " +
            "neutralise le geste suivant (le lecteur ne se fermerait plus)."
        )
    }

    /// Le signal ne peut pas non plus survivre à un geste dont SwiftUI n'a jamais
    /// délivré le `onEnded` : le filet anti-état-collant doit le purger aussi.
    func test_resetGestureTracking_purgesTheConsumedFeatureSignal() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Content.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        guard let start = source.range(of: "func resetGestureTracking() {"),
              let end = source.range(of: "\n    }", range: start.upperBound..<source.endIndex) else {
            return XCTFail("resetGestureTracking introuvable")
        }
        XCTAssertTrue(
            codeOnly(String(source[start.upperBound..<end.lowerBound]))
                .contains("readerFeatureConsumedByTouch = false"),
            "Un signal collant rendrait le prochain swipe bas incapable de fermer le lecteur."
        )
    }

    /// LA PAUSE DU DRAG EST ÉTAT-DIRIGÉE, PAS ÉVÉNEMENTIELLE.
    ///
    /// Un `pauseTimer()` posé à la décision d'axe exige un `resumeTimer()`
    /// symétrique — jamais appelé quand SwiftUI saute le `onEnded`. Adossée à
    /// `gestureAxis`, la reprise redevient automatique dès que l'axe retombe à 0.
    func test_dragPause_isDrivenByGestureAxis_notByAPairedPauseCall() throws {
        let code = try dragGestureCode()
        XCTAssertFalse(
            code.contains("pauseTimer()"),
            "Le drag ne doit plus poser de pause événementielle : son annulation " +
            "n'est pas garantie (onEnded sauté = story gelée)."
        )

        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Content.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        guard let start = source.range(of: "var shouldPauseTimer: Bool {"),
              let end = source.range(of: "\n    }", range: start.upperBound..<source.endIndex) else {
            return XCTFail("shouldPauseTimer introuvable")
        }
        XCTAssertTrue(
            codeOnly(String(source[start.upperBound..<end.lowerBound])).contains("gestureAxis != 0"),
            "L'agrégat de pause doit porter le drag en cours, sinon plus rien ne gèle " +
            "la lecture pendant le geste."
        )
    }
}
