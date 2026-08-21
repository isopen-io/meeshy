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

    // MARK: - Guard 2c — géométrie ÉQUIVALENTE : réutiliser RulerView/PlayheadView
    // sans jamais désynchroniser leur repère de celui du plan
    //
    // `Plan2DLayout.x` (D1, gelé) et `TimelineGeometry.x` (RulerView,
    // PlayheadView, TimelineScrubArea) sont DEUX mappings temps→x distincts
    // — le premier proportion-au-viewport à deux paliers de zoom, le second
    // continu en pixels/seconde. `equivalentGeometry` est la conversion PURE
    // qui les fait coïncider EXACTEMENT pour un (laneWidth, zoom,
    // slideDuration) donné — c'est elle qui permet au conteneur (D3) de
    // réutiliser RulerView/PlayheadView tels quels comme règle/tête de
    // lecture du plan, plutôt que de réinventer un scrub bespoke.

    func test_equivalentGeometry_xMatchesPlan2DLayoutXExactly() {
        let geometry = Plan2DView.equivalentGeometry(laneWidth: 300, zoom: .fit, slideDuration: 10)
        for t: Float in [0, 2.5, 5, 10] {
            XCTAssertEqual(
                geometry.x(for: t),
                Plan2DLayout.x(forTime: Double(t), zoom: .fit, laneWidth: 300, slideDuration: 10),
                accuracy: 0.001
            )
        }
    }

    func test_equivalentGeometry_atDetailZoom_stillMatches() {
        let geometry = Plan2DView.equivalentGeometry(laneWidth: 300, zoom: .detail, slideDuration: 10)
        XCTAssertEqual(
            geometry.x(for: 10),
            Plan2DLayout.x(forTime: 10, zoom: .detail, laneWidth: 300, slideDuration: 10),
            accuracy: 0.001
        )
    }

    func test_equivalentGeometry_withoutDuration_neverDividesByZero() {
        // `Plan2DLayout.x` replie sur l'origine à durée nulle (garde dédiée) ;
        // `TimelineGeometry` n'a pas cette notion (son plancher `zoomScale`
        // est strictement positif) — la garantie ICI est l'ABSENCE de crash/NaN,
        // pas l'égalité avec `Plan2DLayout.x` sur ce cas dégénéré.
        let geometry = Plan2DView.equivalentGeometry(laneWidth: 300, zoom: .fit, slideDuration: 0)
        XCTAssertTrue(geometry.x(for: 5).isFinite)
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

        XCTAssertEqual(Plan2DView.edgeHandle(touchX: startX - half + 1, track: track, isSelected: true,
                                             zoom: .fit, laneWidth: 4, slideDuration: 4), .start,
                      "À 1 pt à l'intérieur du bord GAUCHE de la zone (débordante hors barre) : bord de début")
        XCTAssertEqual(Plan2DView.edgeHandle(touchX: endX + half - 1, track: track, isSelected: true,
                                             zoom: .fit, laneWidth: 4, slideDuration: 4), .end,
                      "À 1 pt à l'intérieur du bord DROIT de la zone (débordante hors barre) : bord de fin")
        XCTAssertNil(Plan2DView.edgeHandle(touchX: startX - half - 5, track: track, isSelected: true,
                                           zoom: .fit, laneWidth: 4, slideDuration: 4),
                    "Bien au-delà de la zone : aucune poignée")
    }

    /// Barre de 4 pt : les deux zones de 44 pt se recouvrent entièrement. La
    /// règle de partage est le MILIEU de la barre — sans elle, le premier test
    /// (`.start`) avale tout contact et la poignée de FIN devient inatteignable
    /// sur toute barre plus étroite que la moitié de la zone tappable.
    func test_edgeHandle_aBarNarrowerThanItsHitZone_keepsItsEndHandleReachable() {
        let track = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0,
                                bar: .timed(start: 0, end: 4))
        let startX = Plan2DView.labelColumnWidth
        let endX = Plan2DView.labelColumnWidth + 4
        let midX = (startX + endX) / 2

        XCTAssertEqual(Plan2DView.edgeHandle(touchX: midX + 2, track: track, isSelected: true,
                                             zoom: .fit, laneWidth: 4, slideDuration: 4), .end,
                      "Au-delà du milieu d'une barre étroite, le contact vise la FIN")
        XCTAssertEqual(Plan2DView.edgeHandle(touchX: midX - 2, track: track, isSelected: true,
                                             zoom: .fit, laneWidth: 4, slideDuration: 4), .start,
                      "En deçà du milieu, le contact vise le DÉBUT")
    }

    /// La zone des deux poignées est UNE seule source : le hit-test et les
    /// cibles réellement posées à l'écran la lisent au même endroit.
    func test_edgeHandleZones_aWideBar_keepsTwoFullSizedZones() {
        let track = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0,
                                bar: .timed(start: 0, end: 10))
        let zones = Plan2DView.edgeHandleZones(for: track, rowIndex: 3, isSelected: true, zoom: .fit,
                                               laneWidth: 300, slideDuration: 10)
        XCTAssertEqual(zones.map(\.edge), [.start, .end])
        XCTAssertEqual(zones.map(\.rowIndex), [3, 3])
        for zone in zones {
            XCTAssertEqual(zone.width, Plan2DView.edgeHandleMinHitWidth, accuracy: 0.001,
                           "Une barre large garde deux cibles pleines")
        }
    }

    func test_edgeHandleZones_aNarrowBar_sharesItAtTheMidpoint() {
        let track = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0,
                                bar: .timed(start: 0, end: 4))
        let zones = Plan2DView.edgeHandleZones(for: track, rowIndex: 0, isSelected: true, zoom: .fit,
                                               laneWidth: 4, slideDuration: 4)
        let midX = Plan2DView.labelColumnWidth + 2
        XCTAssertEqual(zones.first(where: { $0.edge == .start })?.maxX ?? .nan, midX, accuracy: 0.001)
        XCTAssertEqual(zones.first(where: { $0.edge == .end })?.minX ?? .nan, midX, accuracy: 0.001,
                       "Les deux poignées se partagent la barre étroite au milieu — aucune n'avale l'autre")
    }

    func test_edgeHandleZones_ofAWholePlan_targetOnlyTimedTracks_onTheirOwnRow() {
        let tracks = [
            Plan2DTrack(id: "ghost", label: "g", plane: .fg, z: 1, bar: .ghost),
            Plan2DTrack(id: "clip", label: "c", plane: .fg, z: 0, bar: .timed(start: 0, end: 5))
        ]
        let zones = Plan2DView.edgeHandleZones(tracks: tracks, selectedTrackId: "clip", zoom: .fit,
                                               laneWidth: 300, slideDuration: 10)
        XCTAssertEqual(zones.map(\.trackId), ["clip", "clip"],
                       "Un fantôme n'a pas de bord à tirer : aucune cible ne se pose sur sa rangée")
        XCTAssertEqual(zones.map(\.rowIndex), [1, 1],
                       "Les cibles se posent sur la RANGÉE de leur piste")
        XCTAssertEqual(Set(zones.map(\.id)).count, 2,
                       "Deux cibles distinctes, sinon un ForEach en perdrait une")
    }

    func test_edgeHandleZones_aGhostTrackHasNoZone() {
        let track = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0, bar: .ghost)
        XCTAssertTrue(Plan2DView.edgeHandleZones(for: track, rowIndex: 0, isSelected: true, zoom: .fit,
                                                 laneWidth: 300, slideDuration: 10).isEmpty)
    }

    func test_edgeHandle_ghostTrackHasNoHandle() {
        let track = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0, bar: .ghost)
        XCTAssertNil(Plan2DView.edgeHandle(touchX: 100, track: track, isSelected: true,
                                           zoom: .fit, laneWidth: 300, slideDuration: 10),
                    "Un fantôme n'a pas de bord à tirer — il n'a pas de durée choisie")
    }

    // MARK: - Guard 4n — le trim exige la sélection PRÉALABLE, et une piste
    // verrouillée n'a NI poignées NI déplacement (revue Opus, constat 3 —
    // parité `ClipTrimHandles.shouldShow(isSelected:isLocked:)`)

    func test_edgeHandleZones_anUnselectedTimedTrack_hasNoZone() {
        let track = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0,
                                bar: .timed(start: 0, end: 10))
        XCTAssertTrue(Plan2DView.edgeHandleZones(for: track, rowIndex: 0, isSelected: false, zoom: .fit,
                                                 laneWidth: 300, slideDuration: 10).isEmpty,
                     "Sélectionner une piste, c'est passer en mode édition dessus — sans ça, pas de poignée")
    }

    func test_edgeHandleZones_aSelectedButLockedTrack_hasNoZone() {
        let track = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0,
                                bar: .timed(start: 0, end: 10), isLocked: true)
        XCTAssertTrue(Plan2DView.edgeHandleZones(for: track, rowIndex: 0, isSelected: true, zoom: .fit,
                                                 laneWidth: 300, slideDuration: 10).isEmpty,
                     "Une piste verrouillée (fond synthétique) n'a jamais de poignée, même sélectionnée")
    }

    func test_edgeHandle_anUnselectedTrack_returnsNilEvenOnTheExactEdge() {
        let track = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0,
                                bar: .timed(start: 0, end: 4))
        XCTAssertNil(Plan2DView.edgeHandle(touchX: Plan2DView.labelColumnWidth, track: track, isSelected: false,
                                           zoom: .fit, laneWidth: 4, slideDuration: 4),
                    "Contact pile sur le bord d'une piste NON sélectionnée : toujours pas de poignée")
    }

    func test_edgeHandleZones_ofAWholePlan_omitsTheUnselectedTrack() {
        let tracks = [
            Plan2DTrack(id: "selected", label: "s", plane: .fg, z: 1, bar: .timed(start: 0, end: 5)),
            Plan2DTrack(id: "other", label: "o", plane: .fg, z: 0, bar: .timed(start: 0, end: 5))
        ]
        let zones = Plan2DView.edgeHandleZones(tracks: tracks, selectedTrackId: "selected", zoom: .fit,
                                               laneWidth: 300, slideDuration: 10)
        XCTAssertEqual(Set(zones.map(\.trackId)), ["selected"],
                       "Seule la piste sélectionnée pose des cibles de rognage")
    }

    // MARK: - Guard 4g — tap sur un losange AFFICHÉ route vers SON keyframe
    // (S4 : « l'édition de keyframes n'a pas bougé » — encore faut-il pouvoir
    // en désigner UN). `keyframeHit` est la fonction PURE que `handleEnded`
    // doit consulter AVANT `onSelectTrack` sur un outcome `.select` : sans
    // elle, aucun losange n'est individuellement atteignable (régression
    // constatée sur D3, corrigée ici).

    func test_keyframeHit_returnsTheClosestKeyframeWithinItsHitRadius() {
        let track = Plan2DTrack(id: "clip", label: "clip", plane: .fg, z: 0,
                                bar: .timed(start: 0, end: 10),
                                keyframes: [Plan2DKeyframe(id: "kf-1", time: 1),
                                            Plan2DKeyframe(id: "kf-2", time: 5)])
        // laneWidth choisie pour que x(t) = t * 10 en zoom .fit sur 10 s.
        let xOfKf1 = Plan2DView.labelColumnWidth + 10
        XCTAssertEqual(
            Plan2DView.keyframeHit(touchX: xOfKf1, track: track, zoom: .fit, laneWidth: 100, slideDuration: 10),
            "kf-1"
        )
    }

    /// Le versant VUE de la collision assumée (revue DoD de D6c, constat 3) :
    /// deux losanges repliés sur la même abscisse par l'écrêtage de
    /// `Plan2DLayout.markers` ne peuvent pas être départagés par la distance —
    /// le hit-test en désigne UN, et un seul. Ce test épingle ce que
    /// l'utilisateur obtient (une cible, pas un `nil`, pas une oscillation)
    /// sans prétendre LEQUEL : l'ordre entre temps égaux n'est pas une
    /// garantie de la bibliothèque de tri, et le plan n'en fait pas une
    /// promesse. La collision reste réversible — ré-étendre la barre les
    /// re-sépare (`Plan2DLayoutTests`).
    func test_keyframeHit_onTwoKeyframesCollapsedByClamping_stillDesignatesExactlyOne() {
        let track = Plan2DTrack(id: "clip", label: "clip", plane: .fg, z: 0,
                                bar: .timed(start: 0, end: 4),
                                keyframes: [Plan2DKeyframe(id: "kf-over-1", time: 4),
                                            Plan2DKeyframe(id: "kf-over-2", time: 4)])
        // laneWidth choisie pour que x(t) = t * 10 en zoom .fit sur 10 s.
        let xOfTheEdge = Plan2DView.labelColumnWidth + 40
        let hit = Plan2DView.keyframeHit(touchX: xOfTheEdge, track: track,
                                         zoom: .fit, laneWidth: 100, slideDuration: 10)
        XCTAssertTrue(["kf-over-1", "kf-over-2"].contains(hit),
                      "Deux losanges à la même abscisse : le tap en désigne un — jamais aucun")
    }

    func test_keyframeHit_beyondItsHitRadius_returnsNil() {
        let track = Plan2DTrack(id: "clip", label: "clip", plane: .fg, z: 0,
                                bar: .timed(start: 0, end: 10),
                                keyframes: [Plan2DKeyframe(id: "kf-1", time: 1)])
        let farFromKf1 = Plan2DView.labelColumnWidth + 10 + Plan2DView.keyframeHitRadius + 5
        XCTAssertNil(
            Plan2DView.keyframeHit(touchX: farFromKf1, track: track, zoom: .fit, laneWidth: 100, slideDuration: 10)
        )
    }

    // MARK: - Guard 4h — POSITION TEMPORELLE des losanges : l'axe du plan est
    // ABSOLU (`Plan2DLayout.x` mappe un temps de TIMELINE), alors que
    // `StoryKeyframe.time` est RELATIF à son clip. Un losange posé sur le
    // temps relatif dérive du début de son clip — il se dessine hors de sa
    // propre barre et le tap tombe sur le mauvais keyframe (constat critique
    // de la revue DoD). Ces bancs branchent `Plan2DLayout` sur `Plan2DView` :
    // l'un projette, l'autre dessine et teste le tap — un décalage entre les
    // deux ne peut plus passer.

    func test_diamondsAreDrawnAtTheAbsoluteTimeOfAnOffsetClip() {
        // Texte à start 1 s, keyframes RELATIFS 1 s et 2 s, slide de 10 s
        // dessinée sur 300 pt ⇒ 30 pt/s. Les losanges se posent à t=2 et t=3,
        // donc à 60 et 90 pt après l'origine des barres.
        let effects = StoryEffects(
            textObjects: [
                StoryTextObject(id: "txt", text: "A", startTime: 1, duration: 3,
                                keyframes: [StoryKeyframe(id: "kf-1", time: 1),
                                            StoryKeyframe(id: "kf-2", time: 2)])
            ],
            timelineDuration: 10
        )
        guard let track = Plan2DLayout.tracks(from: effects, slideDuration: 10).first else {
            return XCTFail("Le texte doit produire une piste")
        }
        let xs = track.keyframeTimes.map {
            Plan2DLayout.x(forTime: $0, zoom: .fit, laneWidth: 300, slideDuration: 10)
        }
        XCTAssertEqual(xs, [60, 90],
                       "Un losange se dessine au temps ABSOLU (début du clip + temps relatif), pas au temps relatif")
    }

    func test_aTapAtTheDrawnPositionHitsThatKeyframe_notItsRelativeNeighbour() {
        let effects = StoryEffects(
            textObjects: [
                StoryTextObject(id: "txt", text: "A", startTime: 1, duration: 3,
                                keyframes: [StoryKeyframe(id: "kf-1", time: 1),
                                            StoryKeyframe(id: "kf-2", time: 2)])
            ],
            timelineDuration: 10
        )
        guard let track = Plan2DLayout.tracks(from: effects, slideDuration: 10).first else {
            return XCTFail("Le texte doit produire une piste")
        }
        // t=2 (absolu) : le PREMIER losange. Sur un axe relatif, ce même point
        // porterait le SECOND (kf-2, relatif 2 s) — le tap ouvrirait la
        // mauvaise fiche.
        let xAtTwoSeconds = Plan2DView.labelColumnWidth
            + Plan2DLayout.x(forTime: 2, zoom: .fit, laneWidth: 300, slideDuration: 10)
        XCTAssertEqual(
            Plan2DView.keyframeHit(touchX: xAtTwoSeconds, track: track,
                                   zoom: .fit, laneWidth: 300, slideDuration: 10),
            "kf-1"
        )
        let xAtThreeSeconds = Plan2DView.labelColumnWidth
            + Plan2DLayout.x(forTime: 3, zoom: .fit, laneWidth: 300, slideDuration: 10)
        XCTAssertEqual(
            Plan2DView.keyframeHit(touchX: xAtThreeSeconds, track: track,
                                   zoom: .fit, laneWidth: 300, slideDuration: 10),
            "kf-2"
        )
    }

    func test_everyDiamondFallsInsideItsOwnBar() {
        let effects = StoryEffects(
            mediaObjects: [
                StoryMediaObject(id: "clip", mediaType: "video", aspectRatio: 1.777,
                                 startTime: 3, duration: 3,
                                 keyframes: [StoryKeyframe(id: "kf-1", time: 1),
                                             StoryKeyframe(id: "kf-2", time: 2)])
            ],
            timelineDuration: 10
        )
        guard let track = Plan2DLayout.tracks(from: effects, slideDuration: 10).first,
              case let .timed(start, end) = track.bar else {
            return XCTFail("Le clip média doit produire une barre à durée choisie")
        }
        let barStartX = Plan2DLayout.x(forTime: start, zoom: .fit, laneWidth: 300, slideDuration: 10)
        let barEndX = Plan2DLayout.x(forTime: end, zoom: .fit, laneWidth: 300, slideDuration: 10)
        for time in track.keyframeTimes {
            let x = Plan2DLayout.x(forTime: time, zoom: .fit, laneWidth: 300, slideDuration: 10)
            XCTAssertTrue(x >= barStartX && x <= barEndX,
                          "Un losange dessiné hors de la barre de son clip trahit un temps relatif posé sur l'axe absolu")
        }
    }

    func test_keyframeHit_trackWithoutKeyframes_returnsNil() {
        let track = Plan2DTrack(id: "clip", label: "clip", plane: .fg, z: 0, bar: .timed(start: 0, end: 10))
        XCTAssertNil(
            Plan2DView.keyframeHit(touchX: Plan2DView.labelColumnWidth, track: track,
                                   zoom: .fit, laneWidth: 100, slideDuration: 10)
        )
    }

    func test_body_aTapChecksKeyframeHitBeforeSelectingTheTrack() throws {
        let source = try Self.strippedPlan2DViewSource()
        guard let selectRange = source.range(of: "case .select:") else {
            return XCTFail("Le corps doit décider l'outcome .select quelque part")
        }
        let afterSelect = String(source[selectRange.upperBound...].prefix(400))
        XCTAssertTrue(afterSelect.contains("Self.tapTarget("),
                     "Un tap classé .select doit passer par la décision PURE tapTarget — sinon aucun losange n'est atteignable, "
                     + "ou c'est le bord du clip qui devient inatteignable")
        XCTAssertTrue(afterSelect.contains("onSelectKeyframe("),
                     "Un losange désigné doit router vers onSelectKeyframe, pas onSelectTrack")
        XCTAssertTrue(afterSelect.contains("onSelectTrack("),
                     "Et tout le reste de la barre ouvre la fiche du CLIP")
    }

    // MARK: - Guard 4l — préséance du BORD sur le losange qui le recouvre
    //
    // Un keyframe au tout début de son clip se dessine EXACTEMENT sur le bord
    // gauche de la barre : son rayon de tap (16 pt) tombe entier dans la zone
    // de poignée (±22 pt). Consulter les losanges en premier rendait la fiche
    // du clip inatteignable au tap sur ce bord (revue Opus, mineur 19).

    private static func barWithDiamondsAtTheEdgeAndInTheMiddle() -> Plan2DTrack {
        Plan2DTrack(id: "clip", label: "clip", plane: .fg, z: 0,
                    bar: .timed(start: 0, end: 10),
                    keyframes: [Plan2DKeyframe(id: "kf-edge", time: 0),
                                Plan2DKeyframe(id: "kf-mid", time: 5)])
    }

    func test_tapTarget_onADiamondSittingOnTheBarsEdge_opensTheClip() {
        let track = Self.barWithDiamondsAtTheEdgeAndInTheMiddle()
        XCTAssertEqual(
            Plan2DView.tapTarget(touchX: Plan2DView.labelColumnWidth, track: track,
                                 zoom: .fit, laneWidth: 300, slideDuration: 10),
            .track,
            "Le doigt posé sur le bord vise le bord — le losange qui s'y superpose ne doit pas voler la fiche du clip"
        )
    }

    func test_tapTarget_onADiamondAwayFromAnyEdge_opensThatKeyframe() {
        let track = Self.barWithDiamondsAtTheEdgeAndInTheMiddle()
        XCTAssertEqual(
            Plan2DView.tapTarget(touchX: Plan2DView.labelColumnWidth + 150, track: track,
                                 zoom: .fit, laneWidth: 300, slideDuration: 10),
            .keyframe("kf-mid"),
            "Partout ailleurs sur la barre, le losange reste la cible la plus précise"
        )
    }

    func test_tapTarget_onABareStretchOfBar_opensTheClip() {
        let track = Self.barWithDiamondsAtTheEdgeAndInTheMiddle()
        XCTAssertEqual(
            Plan2DView.tapTarget(touchX: Plan2DView.labelColumnWidth + 90, track: track,
                                 zoom: .fit, laneWidth: 300, slideDuration: 10),
            .track
        )
    }

    /// La préséance du bord est INDÉPENDANTE de la sélection (revue Opus DoD
    /// sur D6b — la version rejetée couplait les deux : sur une piste NON
    /// sélectionnée, `tapTarget` cédait alors au losange, donc un tap sur une
    /// barre entièrement couverte par le rayon d'un keyframe à t=0 n'ouvrait
    /// plus JAMAIS la fiche du clip — ni sélection ni poignées de rognage ne
    /// pouvaient plus naître d'un tap sur la barre elle-même). `isSelected`
    /// gouverne seulement si la poignée de bord se RESTITUE/glisse
    /// (`edgeHandleZones`, arbitrage 2) — pas ce que le doigt VISE ici.
    func test_tapTarget_onAnUnselectedTrack_theEdgeStillPreemptsItsKeyframe() {
        let track = Self.barWithDiamondsAtTheEdgeAndInTheMiddle()
        XCTAssertEqual(
            Plan2DView.tapTarget(touchX: Plan2DView.labelColumnWidth, track: track,
                                 zoom: .fit, laneWidth: 300, slideDuration: 10),
            .track,
            "Non sélectionnée ou pas, le bord garde la préséance — sinon la barre ne peut jamais devenir sélectionnable au tap"
        )
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
                                      isReorderArmed: false, axis: nil, startRow: 0, endRow: 0),
            .select,
            "Touch-down à ±22 pt d'un bord arme gestureEdge ; relâché sans bouger, c'est un TAP — il doit sélectionner"
        )
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: CGSize(width: Plan2DView.reorderSlop, height: 0), gestureEdge: .end,
                                      isReorderArmed: false, axis: nil, startRow: 2, endRow: 2),
            .select,
            "Micro-mouvement encore DANS le slop : toujours un tap, même avec un bord armé"
        )
    }

    func test_gestureOutcome_realEdgeDragBeyondSlop_producesNoFurtherAction() {
        // Le trim a déjà été streamé via onTrimStart/onTrimEnd à chaque
        // onChanged — handleEnded n'a plus rien à déclencher lui-même.
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: CGSize(width: Plan2DView.reorderSlop + 20, height: 0),
                                      gestureEdge: .end, isReorderArmed: false, axis: nil, startRow: 1, endRow: 1),
            .none
        )
    }

    func test_gestureOutcome_armedReorderMovedToADifferentRow_producesReorder() {
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: CGSize(width: 0, height: Plan2DView.reorderSlop + 60),
                                      gestureEdge: nil, isReorderArmed: true, axis: .vertical,
                                      startRow: 0, endRow: 2),
            .reorder(to: 2)
        )
    }

    func test_gestureOutcome_armedReorderReleasedOnTheSameRow_producesNoAction() {
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: CGSize(width: 0, height: Plan2DView.reorderSlop + 60),
                                      gestureEdge: nil, isReorderArmed: true, axis: .vertical,
                                      startRow: 1, endRow: 1),
            .none
        )
    }

    func test_gestureOutcome_unarmedDragBeyondSlop_producesNoAction() {
        // Drag jamais armé (relâché avant le délai, ou ayant dépassé le slop
        // avant l'armement) — la liste défile, `Plan2DView` ne fait rien.
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: CGSize(width: 0, height: Plan2DView.reorderSlop + 60),
                                      gestureEdge: nil, isReorderArmed: false, axis: nil,
                                      startRow: 0, endRow: 2),
            .none
        )
    }

    /// Verrou d'axe au relâchement : un déplacement TEMPOREL qui a dérivé
    /// d'une rangée ne doit pas, en plus, réordonner le plan.
    func test_gestureOutcome_anAxisLockedHorizontalDrag_neverReorders_evenAcrossRows() {
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: CGSize(width: 120, height: 60),
                                      gestureEdge: nil, isReorderArmed: true, axis: .horizontal,
                                      startRow: 0, endRow: 1),
            .none,
            "Un geste élu horizontal déplace dans le temps — il ne réordonne jamais"
        )
    }

    /// Et le cas RÉEL du réordonnancement : le doigt vertical porte toujours
    /// quelques points d'horizontal.
    func test_gestureOutcome_aVerticalDragCarryingItsWobble_stillReorders() {
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: CGSize(width: 9, height: 120),
                                      gestureEdge: nil, isReorderArmed: true, axis: .vertical,
                                      startRow: 0, endRow: 2),
            .reorder(to: 2)
        )
    }

    func test_gestureOutcome_plainTapWithinSlop_producesSelect() {
        XCTAssertEqual(
            Plan2DView.gestureOutcome(translation: .zero, gestureEdge: nil,
                                      isReorderArmed: false, axis: nil, startRow: 0, endRow: 0),
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

    // MARK: - Guard 4k — verrou d'axe, ancrage du delta et main rendue au
    // scroller : les trois décisions du geste armé vivent dans des fonctions
    // PURES, et le corps les APPELLE (une algèbre juste qu'aucune frame
    // n'exerce ne protégerait rien).

    func test_body_armsThroughThePureArmDecision() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("Self.armDecision("),
                     "L'armement doit passer par la décision PURE armDecision — jamais par un enchaînement de guards inline")
    }

    func test_body_electsTheGestureAxisOnce_andKeepsIt() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("lockedAxis"),
                     "L'axe élu doit être MÉMORISÉ pour le geste, pas recalculé à chaque frame")
        XCTAssertTrue(source.contains("Self.dominantAxis("),
                     "L'élection doit passer par la dominante |Δx| vs |Δy| au-delà de la zone morte")
    }

    func test_body_measuresTheMoveFromTheArmingPoint_neverFromTheTouchDown() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("moveAnchor"),
                     "Le delta de déplacement doit être ancré à l'ARMEMENT : sinon les points de slop parcourus avant "
                     + "l'armement sont rendus en secondes dès la première frame")
        XCTAssertTrue(source.contains("translationSinceArm:"),
                     "moveDelta doit recevoir la translation DEPUIS l'armement, pas la translation depuis le touch-down")
    }

    func test_body_handsAScrollGestureToTheScroller_andNeverTakesItBack() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("hasYieldedToScroller"),
                     "Un geste rendu au scroller ne doit jamais se réarmer en cours de route (le doigt est déjà en train de faire défiler)")
    }

    // MARK: - Guard 4m — grammaire gestuelle du module (M11, VideoClipBar:178-183)
    //
    // Le trim de bord vit dans SA poignée, en HAUTE priorité : en priorité
    // simultanée il s'appliquait pendant que le `ScrollView` de l'hôte pannait
    // sous le doigt (revue Opus, constat 5). La rangée, elle, garde son geste
    // à distance nulle — c'est lui qui porte le tap et l'armement — et se tait
    // dès que le contact a commencé dans une zone de poignée, sinon la même
    // frame produirait DEUX mutations.

    func test_theEdgeTrimIsAHighPriorityGestureAtTheModulesMinimumDistance() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains(".highPriorityGesture(trimGesture("),
                     "Le trim doit primer sur le scroller qui entoure le plan — c'est la note du module, écrite après constat")
        guard let range = source.range(of: "func trimGesture(") else {
            return XCTFail("Le trim doit vivre dans son propre geste")
        }
        XCTAssertTrue(String(source[range.upperBound...].prefix(300)).contains("DragGesture(minimumDistance: 4)"),
                     "minimumDistance: 4 laisse passer les taps, qui ne translatent pas (VideoClipBar:182-183)")
    }

    func test_theRowGestureNeverStreamsTheTrim_itsOwnHandleDoes() throws {
        let source = try Self.strippedPlan2DViewSource()
        guard let start = source.range(of: "private func handleChanged"),
              let end = source.range(of: "private func handleEnded") else {
            return XCTFail("Les deux étapes du geste de rangée doivent exister")
        }
        let rowHandler = String(source[start.upperBound..<end.lowerBound])
        XCTAssertFalse(rowHandler.contains("onTrimStart(") || rowHandler.contains("onTrimEnd("),
                       "Le geste de rangée doit se TAIRE sur un contact de bord — sinon la poignée et lui doublent la mutation")
    }

    func test_theRowGestureKeepsItsZeroDistance_forTapsAndArming() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("DragGesture(minimumDistance: 0)"),
                     "Le tap et l'armement ont besoin des frames qu'un minimumDistance non nul avale")
    }

    func test_thePlanAsksTheScrollerToStandStillWhileItHoldsTheGesture() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("onScrollLockChanged"),
                     "Le plan doit DIRE à son hôte qu'il tient le geste — sinon le contenu panne sous le doigt pendant le trim ou le déplacement")
        XCTAssertTrue(source.contains("setScrollLock(true)"),
                     "Le verrou se pose quand le plan prend le geste")
        XCTAssertTrue(source.contains("setScrollLock(false)"),
                     "Et se lève au relâchement — un verrou oublié tuerait le défilement pour de bon")
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

    // MARK: - Guard 4i — le plan expose CHAQUE piste à VoiceOver
    //
    // Un `Canvas` n'est qu'UN élément d'accessibilité : le plan entier
    // s'annoncerait comme un dessin muet. L'ancien conteneur donnait à chaque
    // rangée son propre élément (`TrackBarView` : `accessibilityElement(
    // children: .combine)` + `accessibilityComposedLabel`). Le plan le rend
    // par `accessibilityChildren` — des éléments SYNTHÉTIQUES, jamais rendus,
    // donc sans coût de dessin (budget P15 intact).

    func test_body_exposesOneAccessibilityElementPerTrack() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains(".accessibilityChildren"),
                     "Chaque piste doit avoir son propre élément d'accessibilité — sinon le plan est un dessin muet")
        XCTAssertTrue(source.contains("Self.accessibilityLabel(for:"),
                     "Chaque élément doit porter le libellé composé de SA piste (plan + nom + occupation)")
    }

    // MARK: - Guard 4j — déplacement temporel d'une piste au doigt

    func test_body_streamsTheTimeMoveWhileTheGestureIsArmed() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("Self.moveDelta("),
                     "Le déplacement temporel doit passer par la décision PURE moveDelta")
        XCTAssertTrue(source.contains("onMove("),
                     "Le déplacement doit atteindre l'appelant pendant le geste, pas seulement au relâchement")
        XCTAssertTrue(source.contains("onMoveEnded("),
                     "Le relâchement doit refermer la session de glissement côté appelant")
    }

    // MARK: - Guard 4o — sélection RENDUE et verrou RESTAURÉ (revue Opus,
    // constats 3 et 4) : `Plan2DView` n'exposait ni ne recevait aucun état
    // de sélection — un `selectedClipId` changé ne redessinait jamais le
    // Canvas — et n'avait aucune notion de verrou.

    func test_body_definesEqualityOverSelectedTrackId() throws {
        let source = try Self.strippedPlan2DViewSource()
        guard let eqRange = source.range(of: "static func == ") else {
            return XCTFail("La conformance Equatable doit être définie explicitement (closures exclues)")
        }
        let body = String(source[eqRange.upperBound...].prefix(400))
        XCTAssertTrue(body.contains("selectedTrackId"),
                     "Sans selectedTrackId dans ==, une sélection changée ne redessine jamais le Canvas (constat 4)")
    }

    func test_body_highlightsTheSelectedTrackInTheCanvas() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("track.id == selectedTrackId"),
                     "Chaque piste doit se comparer à selectedTrackId pour savoir si elle se surligne")
        XCTAssertTrue(source.contains("MeeshyColors.indigo400"),
                     "La sélection se rend avec le MÊME jeton que l'ancien conteneur (TrackBarView.laneBackground)")
    }

    func test_body_lockedTrack_drawsALockBadge() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertTrue(source.contains("lock.fill"),
                     "Une piste verrouillée doit porter le MÊME badge cadenas que l'ancien conteneur (TrackBarView)")
    }

    func test_moveDelta_aLockedTrackNeverMoves() {
        let locked = Plan2DTrack(id: "t", label: "t", plane: .fg, z: 0,
                                 bar: .timed(start: 0, end: 4), isLocked: true)
        XCTAssertNil(
            Plan2DView.moveDelta(translationSinceArm: CGSize(width: 60, height: 0), axis: .horizontal,
                                 gestureEdge: nil, isReorderArmed: true, track: locked,
                                 zoom: .fit, laneWidth: 300, slideDuration: 10),
            "NI poignées NI déplacement : un fond/synthétique verrouillé ne se déplace jamais dans le temps"
        )
    }

    /// Locale-agnostic (revue Opus DoD sur D6b) : le suffixe verrou route
    /// désormais par `String(localized:)`, donc son texte dépend de la
    /// locale du run — asserter sur un littéral français figerait le test à
    /// une seule locale (même piège que `feedback_localized_string_
    /// assertions_depend_on_simulator_locale.md`). Le comportement testable
    /// est structurel : le suffixe s'ajoute en QUEUE, et distingue verrouillé
    /// de non verrouillé.
    func test_accessibilityLabel_lockedTrack_appendsASuffixDistinctFromUnlocked() {
        let locked = Plan2DTrack(id: "t", label: "Fond", plane: .bg, z: 0, bar: .ghost, isLocked: true)
        let unlocked = Plan2DTrack(id: "t", label: "Fond", plane: .bg, z: 0, bar: .ghost, isLocked: false)
        let lockedLabel = Plan2DView.accessibilityLabel(for: locked)
        let unlockedLabel = Plan2DView.accessibilityLabel(for: unlocked)
        XCTAssertTrue(lockedLabel.hasPrefix(unlockedLabel),
                     "Le verrou s'annonce en SUFFIXE — le libellé non verrouillé reste en tête")
        XCTAssertNotEqual(lockedLabel, unlockedLabel,
                          "Une piste verrouillée doit s'annoncer différemment d'une piste libre")
    }

    /// Preuve que le suffixe n'est PAS un littéral français en dur (revue
    /// Opus DoD sur D6b) : `fr.lproj` et `en.lproj`, chargés directement
    /// (même technique que `HardcodedStringsSweepTests.localizedBundle`),
    /// portent des valeurs DIFFÉRENTES pour la même clé — un littéral figé
    /// dans le source Swift rendrait la MÊME chaîne quel que soit le
    /// `.lproj` chargé.
    func test_accessibilityLabel_lockedSuffixKey_isTranslatedNotHardcoded() throws {
        let key = "story.timeline.plan.track.locked.a11y"
        func value(in localeId: String) throws -> String {
            let path = try XCTUnwrap(Bundle.module.path(forResource: localeId, ofType: "lproj"),
                                     "Bundle.module has no '\(localeId).lproj'")
            let bundle = try XCTUnwrap(Bundle(path: path))
            return bundle.localizedString(forKey: key, value: key, table: nil)
        }
        let fr = try value(in: "fr")
        let en = try value(in: "en")
        XCTAssertNotEqual(fr, key, "Key '\(key)' missing from fr.lproj")
        XCTAssertNotEqual(en, key, "Key '\(key)' missing from en.lproj")
        XCTAssertNotEqual(fr, en,
                          "fr and en must differ — a hardcoded French literal would render identically under any .lproj")
    }

    /// Garde de SOURCE (revue Opus DoD sur D6b) : la version rejetée
    /// assignait `" (verrouillée)"` directement au ternaire — un littéral
    /// français en dur dans le chemin de PRODUCTION, alors que les DEUX
    /// autres composants de `accessibilityLabel(for:)` routaient déjà par
    /// `String(localized:bundle:)`. Les deux tests ci-dessus prouvent le
    /// COMPORTEMENT ; celui-ci fige la FORME du fix pour qu'un futur retour
    /// en arrière (retirer `String(localized:)`, garder le texte comme
    /// `defaultValue`) se voie immédiatement, plutôt que de survivre parce
    /// que le comportement observable reste correct dans la locale du run.
    func test_accessibilityLabel_lockSuffix_routesThroughTheCatalog() throws {
        let source = try Self.strippedPlan2DViewSource()
        XCTAssertFalse(source.contains("isLocked ? \" (verrouillée)\" : \"\""),
                       "Le suffixe de verrou ne doit plus être un littéral français assigné directement au ternaire")
        XCTAssertTrue(source.contains("String(localized: \"story.timeline.plan.track.locked.a11y\""),
                     "Il doit router par le catalogue, comme les deux autres composants de accessibilityLabel(for:)")
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
