import XCTest
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

/// Garde de source + comportement pour `Plan2DView` (D2) : la vue DESSINE ce
/// que `Plan2DLayout` (D1, gelé) calcule, en UN passe `Canvas` — jamais une
/// vue par keyframe (budget P15). Les quatre points du plan sont vérifiés
/// ici :
///
///   1. UN seul `Canvas {` porte le rendu ; aucun `ForEach` n'itère
///      `keyframeTimes` pour produire des vues (les losanges sont des
///      TRAITS dessinés dans le passe, pas des `KeyframeMarkerView`).
///   2. La graduation ne réinvente pas sa propre échelle de paliers : elle
///      appelle `RulerView.tickInterval(for:)` (dérivation par largeur de
///      libellé, `RulerView.swift:58/64/105`) plutôt que de redéclarer un
///      `tickLadder` local.
///   3. `TimelineMetrics.laneHeight` remplace les quatre littéraux `52` de
///      `StoryTimelineView.swift` — et `Plan2DView` dessine à la MÊME
///      hauteur, jamais un second littéral qui dériverait du premier.
///   4. Les gestes précisés (rév. 2, M11) sont des fonctions PURES,
///      testables sans monter la vue : armement du réordonnancement
///      vertical (appui court puis drag, jamais un drag nu), cran net au
///      franchissement d'un plan, poignées de bord ≥ 44 pt (débordantes sur
///      barre étroite), et le tap qui appelle `onSelectTrack` (l'Inspector
///      existant, ouvert par l'appelant — l'assertion porte sur l'APPEL, pas
///      sur une sheet : `Plan2DView` n'a et ne doit avoir aucune dépendance
///      à `Views/Inspector`).
///
/// `Plan2DView` n'est pas hostable en XCTest (précédent : `StoryComposerView`,
/// cf. `StoryComposerExitDialogSourceGuardTests`) — guard 1-3 s'ancrent donc
/// sur une analyse de SOURCE, comme `StoryBackgroundLayerVolumeSourceGuardTests`.
/// Guard 4 s'ancre sur les fonctions statiques PURES de la vue, exactement
/// comme `Plan2DLayout` (D1) ou `StoryTimelineView.resolveCompactTracks`
/// (`StoryTimelineViewHoistOrderTests`) : le geste est un calcul, la vue ne
/// fait que le déclencher.
final class Plan2DViewGuardTests: XCTestCase {

    // MARK: - Guard 1 — un seul Canvas, jamais une vue par keyframe

    func test_body_rendersThroughASingleCanvas() throws {
        let lines = try Self.strippedPlan2DViewLines()
        let canvasOpenings = lines.filter { $0.contains("Canvas {") || $0.contains("Canvas { ") }
        XCTAssertEqual(canvasOpenings.count, 1,
                       "Le corps doit dessiner via UN SEUL `Canvas {` — trouvé \(canvasOpenings.count)")
    }

    func test_body_neverIteratesKeyframeTimesWithForEach() throws {
        let lines = try Self.strippedPlan2DViewLines()
        let offendingLine = lines.first { $0.contains("ForEach") && $0.contains("keyframeTimes") }
        XCTAssertNil(offendingLine,
                     "Un `ForEach` sur `keyframeTimes` produirait une vue par keyframe (budget P15) : \(offendingLine ?? "")")
    }

    /// Contrôle positif : la garde doit réellement détecter le motif banni.
    func test_guardDetectsAForEachOverKeyframeTimes() {
        let sample = """
        struct Fake: View {
            var body: some View {
                ForEach(track.keyframeTimes, id: \\.self) { t in
                    KeyframeMarkerView(...)
                }
            }
        }
        """
        let lines = sample.components(separatedBy: "\n")
        XCTAssertNotNil(lines.first { $0.contains("ForEach") && $0.contains("keyframeTimes") })
    }

    // MARK: - Guard 2 — la graduation réutilise RulerView, ne la réinvente pas

    func test_ruler_reusesRulerViewsTickIntervalDerivation() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("RulerView.tickInterval("),
                     "Le plan doit dériver son intervalle de graduation de `RulerView.tickInterval(for:)`")
        XCTAssertFalse(source.contains("let tickLadder") || source.contains("var tickLadder"),
                       "Aucune échelle de paliers locale — `Plan2DView` ne doit pas redéclarer `tickLadder`, "
                       + "seulement RÉFÉRENCER `RulerView.tickLadder` en repli")
    }

    func test_tickInterval_matchesRulerViewAtEquivalentZoom() {
        // 300 pt pour 10 s de slide, zoom .fit ⇒ 30 px/s ⇒ zoom-équivalent
        // 30/50 = 0.6 vis-à-vis de `TimelineGeometry.basePixelsPerSecond`.
        let interval = Plan2DView.tickInterval(laneWidth: 300, zoom: .fit, slideDuration: 10)
        let expected = RulerView.tickInterval(for: 300 / 10 / TimelineGeometry.basePixelsPerSecond)
        XCTAssertEqual(interval, expected)
    }

    func test_tickInterval_withoutDuration_fallsBackToCoarsestRung() {
        XCTAssertEqual(Plan2DView.tickInterval(laneWidth: 300, zoom: .fit, slideDuration: 0),
                       RulerView.tickLadder.last)
    }

    // MARK: - Guard 3 — TimelineMetrics.laneHeight, une seule hauteur de lane

    func test_storyTimelineView_usesTimelineMetricsLaneHeight_atAllFourSites() throws {
        let lines = try Self.strippedStoryTimelineViewLines()
        let usages = lines.filter { $0.contains("TimelineMetrics.laneHeight") }
        XCTAssertEqual(usages.count, 4,
                       "Les quatre sites d'appel historiques doivent utiliser TimelineMetrics.laneHeight — trouvé \(usages.count)")
        XCTAssertFalse(lines.contains { $0.contains("laneHeight: 52") },
                       "Aucun littéral `laneHeight: 52` ne doit subsister dans StoryTimelineView.swift")
    }

    func test_plan2DView_drawsAtTimelineMetricsLaneHeight_neverASecondLiteral() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("TimelineMetrics.laneHeight"),
                     "Plan2DView doit dessiner à TimelineMetrics.laneHeight, pas un second littéral 52")
    }

    // MARK: - Guard 4a — réordonnancement vertical : armé, jamais un drag nu

    func test_rowIndex_mapsAYToItsRow() {
        XCTAssertEqual(Plan2DView.rowIndex(forY: 0, laneHeight: 52, trackCount: 3), 0)
        XCTAssertEqual(Plan2DView.rowIndex(forY: 51.9, laneHeight: 52, trackCount: 3), 0)
        XCTAssertEqual(Plan2DView.rowIndex(forY: 52, laneHeight: 52, trackCount: 3), 1)
        XCTAssertEqual(Plan2DView.rowIndex(forY: 200, laneHeight: 52, trackCount: 3), nil,
                       "Hors du plan (sous la dernière piste) : pas de rangée")
        XCTAssertEqual(Plan2DView.rowIndex(forY: -1, laneHeight: 52, trackCount: 3), nil)
    }

    func test_withinSlop_isTrueOnlyUnderTheThreshold() {
        XCTAssertTrue(Plan2DView.withinSlop(CGSize(width: 10, height: 5)))
        XCTAssertTrue(Plan2DView.withinSlop(CGSize(width: Plan2DView.reorderSlop, height: 0)))
        XCTAssertFalse(Plan2DView.withinSlop(CGSize(width: Plan2DView.reorderSlop + 1, height: 0)))
    }

    /// Le seuil d'armement existe et est strictement positif — un drag nu
    /// (relâché avant ce délai, ou ayant déjà dépassé le slop) ne s'arme
    /// jamais : c'est le SEUL fait que ce banc peut épingler sans monter la
    /// vue ni simuler une horloge ; le "drag nu fait défiler" est vérifié
    /// négativement par `test_body_neverArmsReorderWithoutTheLongPressGesture`.
    func test_reorderArmDuration_isPositive() {
        XCTAssertGreaterThan(Plan2DView.reorderArmDuration, 0)
    }

    func test_body_neverArmsReorderWithoutTheLongPressGesture() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("reorderArmDuration"),
                     "Le geste de réordonnancement doit passer par le délai d'armement, jamais un drag immédiat")
    }

    // MARK: - Guard 4b — franchir un plan = cran net (seuil + haptique .rigid)

    func test_crossedPlaneBoundary_trueOnlyWhenThePlaneActuallyChanges() {
        let tracks = [
            Plan2DTrack(id: "a", label: "a", plane: .fg, z: 1, bar: .ghost),
            Plan2DTrack(id: "b", label: "b", plane: .fg, z: 0, bar: .ghost),
            Plan2DTrack(id: "c", label: "c", plane: .content, z: 0, bar: .ghost)
        ]
        XCTAssertFalse(Plan2DView.crossedPlaneBoundary(from: 0, to: 1, tracks: tracks),
                       "a → b reste dans .fg : pas de cran")
        XCTAssertTrue(Plan2DView.crossedPlaneBoundary(from: 1, to: 2, tracks: tracks),
                      "b → c passe de .fg à .content : cran net")
        XCTAssertFalse(Plan2DView.crossedPlaneBoundary(from: 5, to: 2, tracks: tracks),
                       "Index hors bornes : pas de crash, pas de cran")
    }

    func test_body_signalsThePlaneCrossingWithRigidHaptic() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains(".rigid"),
                     "Le franchissement d'un plan doit jouer l'haptique .rigid (cran net, M11)")
    }

    // MARK: - Guard 4c — poignées de bord ≥ 44 pt, débordantes sur barre étroite

    func test_edgeHandleMinHitWidth_isAtLeast44Points() {
        XCTAssertGreaterThanOrEqual(Plan2DView.edgeHandleMinHitWidth, 44)
    }

    func test_edgeHandle_hitZoneOverflowsPastANarrowBar() {
        // Barre large de 4 pt (100 → 104) — bien plus étroite que la zone
        // tappable de 44 pt : la zone DOIT déborder de part et d'autre.
        let track = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0,
                                bar: .timed(start: 0, end: 4))
        // laneWidth choisie pour que x(0)=0, x(4)=4 en zoom .fit sur 4 s.
        let half = Plan2DView.edgeHandleMinHitWidth / 2
        let startX = Plan2DView.labelColumnWidth + 0
        let endX = Plan2DView.labelColumnWidth + 4

        XCTAssertEqual(Plan2DView.edgeHandle(touchX: startX - half + 1, track: track,
                                             zoom: .fit, laneWidth: 4, slideDuration: 4), .start,
                      "À 1 pt à l'intérieur du bord GAUCHE de la zone (débordante hors barre) : bord de début")
        XCTAssertEqual(Plan2DView.edgeHandle(touchX: endX + half - 1, track: track,
                                             zoom: .fit, laneWidth: 4, slideDuration: 4), .end,
                      "À 1 pt à l'intérieur du bord DROIT de la zone (débordante hors barre) : bord de fin")
        XCTAssertNil(Plan2DView.edgeHandle(touchX: startX - half - 5, track: track,
                                           zoom: .fit, laneWidth: 4, slideDuration: 4),
                    "Bien au-delà de la zone : aucune poignée")
    }

    func test_edgeHandle_ghostTrackHasNoHandle() {
        let track = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0, bar: .ghost)
        XCTAssertNil(Plan2DView.edgeHandle(touchX: 100, track: track,
                                           zoom: .fit, laneWidth: 300, slideDuration: 10),
                    "Un fantôme n'a pas de bord à tirer — il n'a pas de durée choisie")
    }

    // MARK: - Guard 4d — tap → appelle onSelectTrack (l'appel, pas la sheet)

    func test_body_tapCallsOnSelectTrack() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("onSelectTrack("),
                     "Le tap sur une piste doit appeler onSelectTrack — l'appelant (D3) ouvre l'Inspector existant")
    }

    func test_plan2DView_hasNoDependencyOnInspector() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertFalse(source.contains("ClipInspector") || source.contains("Views/Inspector") || source.contains("TimelineInspectorHost"),
                       "Plan2DView reste une vue de dessin pure : l'ouverture de l'Inspector est décidée par l'appelant (D3), pas ici")
    }

    // MARK: - Guard 4e — un tap qui TOMBE dans une zone de poignée de bord
    // reste un tap : `gestureOutcome` décide sur la translation FINALE, pas
    // sur `gestureEdge`/`isReorderArmed` seuls (sinon toute barre plus
    // étroite que 44 pt — le cas même que la zone débordante existe pour
    // couvrir — devient intappable : son Inspecteur devient inatteignable).

    func test_gestureOutcome_tapInsideEdgeHandleZone_stillSelectsTrack_evenThoughEdgeWasArmed() {
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: .zero, gestureEdge: .start,
                                      isReorderArmed: false, startRow: 0, endRow: 0),
            .select,
            "Touch-down à ±22 pt d'un bord arme gestureEdge ; relâché sans bouger, c'est un TAP — il doit sélectionner"
        )
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: CGSize(width: Plan2DView.reorderSlop, height: 0), gestureEdge: .end,
                                      isReorderArmed: false, startRow: 2, endRow: 2),
            .select,
            "Micro-mouvement encore DANS le slop : toujours un tap, même avec un bord armé"
        )
    }

    func test_gestureOutcome_realEdgeDragBeyondSlop_producesNoFurtherAction() {
        // Le trim a déjà été streamé via onTrimStart/onTrimEnd à chaque
        // onChanged — handleEnded n'a plus rien à déclencher lui-même.
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: CGSize(width: Plan2DView.reorderSlop + 20, height: 0),
                                      gestureEdge: .end, isReorderArmed: false, startRow: 1, endRow: 1),
            .none
        )
    }

    func test_gestureOutcome_armedReorderMovedToADifferentRow_producesReorder() {
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: CGSize(width: 0, height: Plan2DView.reorderSlop + 60),
                                      gestureEdge: nil, isReorderArmed: true, startRow: 0, endRow: 2),
            .reorder(to: 2)
        )
    }

    func test_gestureOutcome_armedReorderReleasedOnTheSameRow_producesNoAction() {
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: CGSize(width: 0, height: Plan2DView.reorderSlop + 60),
                                      gestureEdge: nil, isReorderArmed: true, startRow: 1, endRow: 1),
            .none
        )
    }

    func test_gestureOutcome_unarmedDragBeyondSlop_producesNoAction() {
        // Drag jamais armé (relâché avant le délai, ou ayant dépassé le slop
        // avant l'armement) — la liste défile, `Plan2DView` ne fait rien.
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: CGSize(width: 0, height: Plan2DView.reorderSlop + 60),
                                      gestureEdge: nil, isReorderArmed: false, startRow: 0, endRow: 2),
            .none
        )
    }

    func test_gestureOutcome_plainTapWithinSlop_producesSelect() {
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: .zero, gestureEdge: nil,
                                      isReorderArmed: false, startRow: 0, endRow: 0),
            .select
        )
    }

    // MARK: - Guard 4f — trim de bord : conversion px→secondes (§1.4 « drag
    // de bord ⇒ timing.start/end ») et haptique à l'ARMEMENT (jamais au
    // franchissement, qui est déjà `.rigid`, Guard 4b)

    func test_timeDelta_convertsPixelDeltaToSecondsAtCurrentZoom() {
        // 300 pt de laneWidth pour 10 s de slide, zoom .fit (scale 1) ⇒
        // 30 px/s ⇒ 30 pt de delta valent exactement 1 s.
        XCTAssertEqual(
            Plan2DView.timeDelta(forDeltaX: 30, zoom: .fit, laneWidth: 300, slideDuration: 10),
            1.0, accuracy: 0.0001
        )
        // zoom .detail double l'échelle (60 px/s) : le MÊME delta de pixels
        // vaut deux fois MOINS de secondes.
        XCTAssertEqual(
            Plan2DView.timeDelta(forDeltaX: 30, zoom: .detail, laneWidth: 300, slideDuration: 10),
            0.5, accuracy: 0.0001
        )
        // Delta négatif (bord tiré vers la gauche) : delta de temps négatif.
        XCTAssertEqual(
            Plan2DView.timeDelta(forDeltaX: -15, zoom: .fit, laneWidth: 300, slideDuration: 10),
            -0.5, accuracy: 0.0001
        )
    }

    func test_timeDelta_zeroLaneWidth_returnsZero_neverDividesByZero() {
        XCTAssertEqual(Plan2DView.timeDelta(forDeltaX: 30, zoom: .fit, laneWidth: 0, slideDuration: 10), 0)
    }

    func test_body_playsLightHapticImmediatelyAtArm() throws {
        let source = try Self.strippedPlan2DViewSource()
        guard let armRange = source.range(of: "isReorderArmed = true") else {
            return XCTFail("Le site d'armement (isReorderArmed = true) doit exister")
        }
        let afterArm = String(source[armRange.upperBound...].prefix(80))
        XCTAssertTrue(afterArm.contains("HapticFeedback.light()"),
                     "L'haptique .light doit jouer AU MOMENT de l'armement, immédiatement après isReorderArmed = true")
    }

    // MARK: - Guard 2b — la graduation n'est pas qu'une déclaration : le
    // corps du Canvas l'APPELLE réellement pour dessiner (sinon
    // RulerView.tickInterval(for:) n'est jamais exercé au rendu — code mort
    // qu'une garde sur l'enveloppe seule ne détecterait pas)

    func test_body_actuallyDrawsGraduationsUsingTickInterval() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("Self.tickInterval(laneWidth: laneWidth"),
                     "Le corps du Canvas doit APPELER tickInterval — pas seulement le déclarer — pour dessiner ses graduations")
    }

    // MARK: - Ghost = cadre pointillé pleine lane

    func test_body_drawsGhostAsADashedFrame() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("dash:"),
                     "Une piste fantôme se dessine en cadre POINTILLÉ (O4) — jamais une barre pleine")
    }

    // MARK: - Couleur par PLAN, jamais par format/kind (U15)

    func test_color_isPickedByPlaneAlone() {
        let fg = Plan2DView.color(for: .fg, isDark: false)
        let content = Plan2DView.color(for: .content, isDark: false)
        let bg = Plan2DView.color(for: .bg, isDark: false)
        XCTAssertNotEqual(fg, content)
        XCTAssertNotEqual(content, bg)
        XCTAssertNotEqual(fg, bg)
    }

    // MARK: - Helpers (garde de source)

    /// Le fichier vit dans `Tests/MeeshyUITests/Timeline/` : QUATRE remontées
    /// avant de redescendre dans `Sources` (un niveau de moins que les gardes
    /// qui vivent dans `Timeline/Story/Controls/`).
    private static var plan2DViewSourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Timeline
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine du package)
            .appendingPathComponent("Sources/MeeshyUI/Story/Timeline/Views/Plan2D/Plan2DView.swift")
    }

    private static var storyTimelineViewSourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/Timeline/Views/Container/StoryTimelineView.swift")
    }

    private static func strippedPlan2DViewSource() throws -> String {
        strippingLineComments(try String(contentsOf: plan2DViewSourceURL, encoding: .utf8))
    }

    private static func strippedPlan2DViewLines() throws -> [String] {
        try strippedPlan2DViewSource().components(separatedBy: "\n")
    }

    private static func strippedStoryTimelineViewLines() throws -> [String] {
        strippingLineComments(try String(contentsOf: storyTimelineViewSourceURL, encoding: .utf8))
            .components(separatedBy: "\n")
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
