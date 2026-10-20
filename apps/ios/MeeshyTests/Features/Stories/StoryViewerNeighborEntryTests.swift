import QuartzCore
import SwiftUI
import XCTest
@testable import MeeshySDK
@testable import Meeshy

/// `StoryViewerView.entryStory(of:)` décide de la slide d'entrée d'un groupe
/// voisin — même règle que le prefetch inter-groupes. Elle sert désormais
/// aussi de PRÉDICAT DE GATING pour les deux placeholders de transition entre
/// groupes (`neighborCubeGroup` et `presentGroupIntroIfNeeded`) : un groupe
/// dont `entryStory(of:)` retourne `nil` (toutes les stories vues+expirées, ou
/// toutes expirées) n'a RIEN à montrer — le placeholder ThumbHash ne doit
/// alors jamais apparaître pour lui (directive user : « on affiche
/// UNIQUEMENT quand le groupe suivant est l'utilisateur concerné et qu'il y a
/// effectivement des stories à afficher »).
///
/// `entryStory(of:)` est `static` (aucune dépendance à `self`/`@State`) —
/// testable directement sans instancier la View, pattern déjà établi dans ce
/// repo pour `StoryViewerView.computeLikedIds`/`viewerLanguageChain`.
final class StoryViewerNeighborEntryTests: XCTestCase {

    private let referenceNow = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeStory(
        id: String,
        isViewed: Bool,
        expiresAt: Date?
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: "story \(id)",
            media: [],
            storyEffects: nil,
            createdAt: referenceNow.addingTimeInterval(-3600),
            expiresAt: expiresAt,
            isViewed: isViewed
        )
    }

    private func makeGroup(stories: [StoryItem]) -> StoryGroup {
        StoryGroup(
            id: "author-1",
            username: "alice",
            avatarColor: "#6366F1",
            avatarURL: nil,
            stories: stories
        )
    }

    // MARK: - entryStory(of:)

    func test_entryStory_allExpired_returnsNil() {
        let expired = referenceNow.addingTimeInterval(-60)
        let group = makeGroup(stories: [
            makeStory(id: "s1", isViewed: false, expiresAt: expired),
            makeStory(id: "s2", isViewed: true, expiresAt: expired),
        ])
        XCTAssertNil(
            StoryViewerView.entryStory(of: group, now: referenceNow),
            "Un groupe dont TOUTES les stories sont expirées n'a rien à afficher — " +
            "entryStory doit retourner nil (gate pour les placeholders de transition)."
        )
    }

    func test_entryStory_hasUnviewedNonExpired_returnsFirstUnviewed() {
        let future = referenceNow.addingTimeInterval(3600)
        let group = makeGroup(stories: [
            makeStory(id: "s1", isViewed: true, expiresAt: future),
            makeStory(id: "s2", isViewed: false, expiresAt: future),
            makeStory(id: "s3", isViewed: false, expiresAt: future),
        ])
        XCTAssertEqual(
            StoryViewerView.entryStory(of: group, now: referenceNow)?.id, "s2",
            "Priorité à la première story NON-VUE non-expirée."
        )
    }

    func test_entryStory_allViewedButOneNonExpired_returnsFirstNonExpired() {
        let expired = referenceNow.addingTimeInterval(-60)
        let future = referenceNow.addingTimeInterval(3600)
        let group = makeGroup(stories: [
            makeStory(id: "s1", isViewed: true, expiresAt: expired),
            makeStory(id: "s2", isViewed: true, expiresAt: future),
        ])
        XCTAssertEqual(
            StoryViewerView.entryStory(of: group, now: referenceNow)?.id, "s2",
            "Aucune story non-vue → repli sur la première story non-expirée (même vue)."
        )
    }
}

/// Le cube entre deux groupes d'auteurs (#11192) : les deux faces tournent
/// autour de LEUR arête commune, et le glissé reste annulable jusqu'au bout.
@MainActor
final class StoryGroupCubeTests: XCTestCase {

    private let screen = CGSize(width: 390, height: 844)

    private func point(_ x: CGFloat, _ y: CGFloat, of offsetX: CGFloat) -> CGPoint {
        StoryGroupCube.project(CGPoint(x: x, y: y),
                               through: StoryGroupCube.face(offsetX: offsetX, size: screen).transform)
    }

    private func assertSame(_ a: CGPoint, _ b: CGPoint, _ message: String,
                            file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(a.x, b.x, accuracy: 0.01, message, file: file, line: line)
        XCTAssertEqual(a.y, b.y, accuracy: 0.01, message, file: file, line: line)
    }

    // MARK: - Géométrie

    func test_face_atRest_isTheIdentity() {
        for corner in [CGPoint(x: 0, y: 0), CGPoint(x: screen.width, y: screen.height),
                       CGPoint(x: 120, y: 700)] {
            assertSame(point(corner.x, corner.y, of: 0), corner, "au repos la story n'est pas déformée")
        }
        XCTAssertEqual(StoryGroupCube.face(offsetX: 0, size: screen).shade, 0, accuracy: 0.0001)
    }

    /// Le défaut corrigé : `.offset` puis une rotation ancrée faisait pivoter
    /// chaque face autour du bord de l'ÉCRAN — à mi-course elles se
    /// chevauchaient sur 30 % de la largeur.
    func test_forwardSwipe_bothFacesShareTheirEdge() {
        let w = screen.width
        for progress in [0.2, 0.35, 0.5, 0.65, 0.8] as [CGFloat] {
            let current = -progress * w
            let incoming = current + w
            assertSame(point(w, 0, of: current), point(0, 0, of: incoming), "arête haute à \(progress)")
            assertSame(point(w, screen.height, of: current), point(0, screen.height, of: incoming),
                       "arête basse à \(progress)")
        }
    }

    func test_backwardSwipe_bothFacesShareTheirEdge() {
        let w = screen.width
        for progress in [0.2, 0.35, 0.5, 0.65, 0.8] as [CGFloat] {
            let current = progress * w
            let incoming = current - w
            assertSame(point(0, 0, of: current), point(w, 0, of: incoming), "arête haute à \(progress)")
            assertSame(point(0, screen.height, of: current), point(w, screen.height, of: incoming),
                       "arête basse à \(progress)")
        }
    }

    /// Le cube recule de ce dont son arête avancerait : elle reste dans le plan
    /// de l'écran, jamais plus haute que lui.
    func test_sharedEdge_staysInTheScreenPlane() {
        for progress in [0.1, 0.3, 0.5, 0.7, 0.9] as [CGFloat] {
            let current = -progress * screen.width
            XCTAssertEqual(point(screen.width, 0, of: current).y, 0, accuracy: 0.01)
            XCTAssertEqual(point(screen.width, screen.height, of: current).y, screen.height, accuracy: 0.01)
        }
    }

    func test_sharedEdge_followsTheFinger() {
        let positions = stride(from: 0.0, through: 0.8, by: 0.1).map {
            point(screen.width, screen.height / 2, of: -CGFloat($0) * screen.width).x
        }
        XCTAssertEqual(positions, positions.sorted(by: >), "l'arête part du même côté que le doigt")
        XCTAssertEqual(point(screen.width, 0, of: -screen.width / 2).x, screen.width / 2, accuracy: 0.01,
                       "à mi-course l'arête est sous le doigt")
    }

    func test_theFaceTurningAway_recedesAndDarkens() {
        let current = -0.4 * screen.width
        let farEdgeHeight = point(0, screen.height, of: current).y - point(0, 0, of: current).y
        XCTAssertLessThan(farEdgeHeight, screen.height * 0.95)
        XCTAssertGreaterThan(StoryGroupCube.face(offsetX: current, size: screen).shade, 0.1)
    }

    /// SwiftUI n'élimine pas les faces vues de dos : sans ce masque, la face
    /// entrante recouvrait en miroir le bord de la story au début du geste.
    func test_aFaceSeenFromBehind_isHidden() {
        let w = screen.width
        XCTAssertFalse(StoryGroupCube.face(offsetX: -0.02 * w + w, size: screen).isFacingViewer)
        XCTAssertFalse(StoryGroupCube.face(offsetX: 0.02 * w - w, size: screen).isFacingViewer)
        XCTAssertTrue(StoryGroupCube.face(offsetX: -0.5 * w + w, size: screen).isFacingViewer)
        XCTAssertTrue(StoryGroupCube.face(offsetX: -0.5 * w, size: screen).isFacingViewer)
        XCTAssertFalse(StoryGroupCube.face(offsetX: -0.98 * w, size: screen).isFacingViewer)
    }

    func test_aFaceIsAlwaysVisible_duringTheWholeTurn() {
        let w = screen.width
        for step in 0...50 {
            let current = -CGFloat(step) / 50 * w
            let visible = StoryGroupCube.face(offsetX: current, size: screen).isFacingViewer
                || StoryGroupCube.face(offsetX: current + w, size: screen).isFacingViewer
            XCTAssertTrue(visible, "aucune image vide à \(step * 2) %")
        }
    }

    /// #10803 — une projection singulière précédait le plantage du passage
    /// d'un auteur à l'autre.
    func test_noFaceProjection_isEverSingular() {
        let w = screen.width
        for step in -110...110 {
            let offset = CGFloat(step) / 100 * w
            for face in [offset, offset + w, offset - w] {
                let transform = ProjectionTransform(StoryGroupCube.face(offsetX: face, size: screen).transform)
                XCTAssertTrue(transform.isInvertible, "offset \(face)")
            }
        }
    }

    func test_faceDegrees_atAndBeyondTheEdge_staysShortOfNinetyDegrees() {
        let width: CGFloat = 1024
        for offset in [width, -width, width * 1.08, -width * 1.08] {
            let degrees = StoryGroupCube.faceDegrees(offsetX: offset, width: width)
            XCTAssertLessThan(abs(degrees), 90, "offset \(offset)")
            XCTAssertGreaterThan(abs(degrees), 89, "offset \(offset)")
        }
        XCTAssertEqual(StoryGroupCube.faceDegrees(offsetX: 512, width: 1024), 45, accuracy: 0.0001)
        XCTAssertEqual(StoryGroupCube.faceDegrees(offsetX: 0, width: 0), 0)
    }

    /// La face entrante est à plat quand la vraie carte la remplace.
    func test_commitCurve_endsBeforeTheContentSwap() {
        XCTAssertLessThan(StoryGroupCube.commitDuration, StoryGroupCube.swapDelay)
        XCTAssertLessThan(StoryGroupIntroPolicy.revealOverlap, StoryGroupCube.swapDelay)
    }

    // MARK: - Relâchement

    private func decide(_ translation: CGFloat, _ predicted: CGFloat,
                        hasNext: Bool = true, hasPrevious: Bool = true) -> StoryGroupSwipeOutcome {
        StoryGroupSwipeDecision.decide(translation: translation * screen.width,
                                       predictedEnd: predicted * screen.width,
                                       width: screen.width, hasNext: hasNext, hasPrevious: hasPrevious)
    }

    func test_release_pastHalfTheCourse_turnsTheCube() {
        XCTAssertEqual(decide(-0.6, -0.6), .next)
        XCTAssertEqual(decide(0.6, 0.6), .previous)
    }

    func test_release_beforeHalfTheCourse_cancels() {
        XCTAssertEqual(decide(-0.3, -0.3), .cancel)
        XCTAssertEqual(decide(0.3, 0.3), .cancel)
    }

    func test_release_aQuickFlick_turnsTheCube() {
        XCTAssertEqual(decide(-0.1, -0.7), .next)
        XCTAssertEqual(decide(0.1, 0.7), .previous)
    }

    /// L'ancien seuil `dx < -60` validait dès 15 % de la largeur, même quand le
    /// doigt revenait en arrière.
    func test_release_movingBackTowardTheStart_cancels_evenNearTheEnd() {
        XCTAssertEqual(decide(-0.3, -0.25), .cancel)
        XCTAssertEqual(decide(-0.8, -0.6), .cancel)
        XCTAssertEqual(decide(-0.95, -0.85), .cancel)
        XCTAssertEqual(decide(0.9, 0.75), .cancel)
    }

    func test_release_aTremblingFinger_isNotAReversal() {
        XCTAssertEqual(decide(-0.7, -0.69), .next)
    }

    func test_release_aFlickBackAcrossTheStart_cancels() {
        XCTAssertEqual(decide(-0.3, 0.6), .cancel)
        XCTAssertEqual(decide(0.3, -0.6), .cancel)
    }

    func test_release_withoutAGroupInThatDirection_cancels() {
        XCTAssertEqual(decide(-0.8, -0.9, hasNext: false), .cancel)
        XCTAssertEqual(decide(0.8, 0.9, hasPrevious: false), .cancel)
    }

    // MARK: - Résistance aux bords

    func test_withANeighbor_theCardFollowsTheFinger() {
        XCTAssertEqual(StoryGroupSwipeDecision.displayedTranslation(-150, width: screen.width, hasNeighbor: true), -150)
    }

    func test_withoutANeighbor_theCardResists() {
        let limit = screen.width * StoryGroupSwipeDecision.edgeResistanceInWidths
        let drags: [CGFloat] = [10, 60, 150, 300, 390]
        let shown = drags.map {
            StoryGroupSwipeDecision.displayedTranslation(-$0, width: screen.width, hasNeighbor: false)
        }
        for (drag, value) in zip(drags, shown) {
            XCTAssertLessThan(value, 0, "le sens du doigt est conservé")
            XCTAssertLessThan(abs(value), drag)
            XCTAssertLessThan(abs(value), limit)
        }
        XCTAssertEqual(shown, shown.sorted(by: >), "la résistance reste monotone")
        XCTAssertEqual(StoryGroupSwipeDecision.displayedTranslation(0, width: screen.width, hasNeighbor: false), 0)
        XCTAssertGreaterThan(StoryGroupSwipeDecision.displayedTranslation(80, width: screen.width, hasNeighbor: false), 0)
    }
}
