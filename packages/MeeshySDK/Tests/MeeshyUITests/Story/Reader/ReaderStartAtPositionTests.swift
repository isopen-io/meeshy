import XCTest
import UIKit
import SwiftUI
import CoreMedia
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// **#6580 / D3 — la position voyage de la carte au détail.**
///
/// `onPlaybackTime` existait, était câblé jusqu'à `StoryCanvasUIView`, et
/// n'avait ZÉRO site d'appel (`grep "\.onPlaybackTime("` ⇒ exit 1) : une loi
/// qui calcule une valeur que personne ne lit. Ouvrir le détail d'un post en
/// lecture repartait donc de zéro — vidéo comme fond sonore.
///
/// La position sème `StoryCanvasUIView.currentTime`, la SEULE horloge que la
/// vidéo suit déjà (`alignToTimelineThenPlay` lit `slidePlayheadSeconds`,
/// poussé depuis elle) et que `captureSlideTimelineAnchor()` remet au mixer.
/// Aucune quatrième horloge n'est créée.
///
/// **D3 est inutile sans D1** : semer `currentTime` à `t > 0` sans que l'audio
/// sache entrer à `t` rejouerait le son depuis zéro pendant que la vidéo est à
/// `t`. C'est pourquoi le témoin central ici est celui de la JONCTION —
/// l'ancre remise au mixer porte bien l'écoulé.
@MainActor
final class ReaderStartAtPositionTests: XCTestCase {

    /// La mémoire de position est partagée par le processus : chaque témoin
    /// part d'une ardoise vide, sinon l'ordre d'exécution ferait la loi.
    override func setUp() {
        super.setUp()
        ScenePlaybackPositions.shared.reset()
    }

    private func slide(duration: TimeInterval = 10) -> StorySlide {
        var effects = StoryEffects()
        effects.background = "#112233"
        return StorySlide(id: "slide-start-at", effects: effects, duration: duration)
    }

    private func canvas(duration: TimeInterval = 10) -> StoryCanvasUIView {
        StoryCanvasUIView(slide: slide(duration: duration), mode: .play)
    }

    // MARK: - La position sème le playhead unifié

    func test_seedPlayhead_movesTheOneClockTheVideoFollows() {
        let view = canvas()
        view.seedPlayhead(3)
        XCTAssertEqual(view.currentTime.seconds, 3, accuracy: 0.0001,
                       "Le playhead unifié — pas une horloge de plus")
    }

    func test_seedPlayhead_reachesTheAudioAnchor() {
        // LA JONCTION avec D1 : ce que le canvas remet au mixer doit porter
        // l'écoulé, sinon chaque clip repart du début de sa fenêtre sous une
        // vidéo déjà à `t`.
        let view = canvas()
        view.seedPlayhead(3)
        XCTAssertEqual(view.captureSlideTimelineAnchor().slideElapsed, 3, accuracy: 0.0001,
                       "L'ancre audio porte l'écoulé de la slide, pas seulement une origine back-datée")
    }

    func test_seedPlayhead_clampsToTheSlideDuration() {
        let view = canvas(duration: 4)
        view.seedPlayhead(99)
        XCTAssertLessThanOrEqual(view.currentTime.seconds, view.effectiveSlideTotalDuration)
    }

    // MARK: - Le défaut, c'est zéro : toute surface existante est inchangée

    func test_seedPlayhead_zeroNegativeOrNonFinite_isANoOp() {
        for seeded in [0, -3, Double.nan, .infinity] {
            let view = canvas()
            view.seedPlayhead(seeded)
            XCTAssertEqual(view.currentTime.seconds, 0, accuracy: 0.0001,
                           "Semer \(seeded) ne doit rien changer — le défaut reste l'ouverture à zéro")
            XCTAssertEqual(view.captureSlideTimelineAnchor().slideElapsed, 0, accuracy: 0.0001)
        }
    }

    // MARK: - La valeur voyage jusqu'à l'hôte du canvas

    func test_startAt_travelsFromTheScenePlayerToItsCanvasHost() {
        let player = MeeshyScenePlayer(document: CanvasV3(scenes: []),
                                       mode: .reader,
                                       sceneIndex: .constant(0),
                                       isPlaying: .constant(true),
                                       accentColorHex: "#7C3AED",
                                       startAt: 4.5)
        XCTAssertEqual(player.host.startAt, 4.5,
                       "Le player ne garde pas la position pour lui — elle descend au canvas")
    }

    func test_startAt_defaultsToZeroOnEverySurface() {
        let player = MeeshyScenePlayer(document: CanvasV3(scenes: []),
                                       mode: .card,
                                       sceneIndex: .constant(0),
                                       isPlaying: .constant(false),
                                       accentColorHex: "#7C3AED")
        XCTAssertEqual(player.host.startAt, 0)
        XCTAssertEqual(StoryReaderRepresentable(story: StoryItem(id: "s"), mute: true).startAt, 0)
    }

    // MARK: - La position arrive APRÈS le montage — et elle est honorée

    /// **Le défaut que ce témoin ferme.** `makeUIView` ne s'exécute qu'UNE fois,
    /// et la position d'ouverture vient de la carte : elle est ASYNCHRONE. Un
    /// hôte monté avant de la connaître restait à zéro pour toujours — la
    /// moitié « ouvrir à la bonne seconde » n'était servie qu'aux hôtes assez
    /// chanceux pour la tenir avant leur premier rendu.
    ///
    /// Le témoin passe par la VRAIE passe de mise à jour SwiftUI (changement de
    /// `rootView` sur un `UIHostingController` monté dans une fenêtre), pas par
    /// un appel direct : c'est `updateUIView` qui doit re-semer, et personne
    /// d'autre.
    func test_startAtArrivingAfterMount_reseedsThePlayheadThroughUpdateUIView() {
        let stage = Stage(startAt: 0)
        defer { stage.tearDown() }
        let canvas = stage.canvas()
        XCTAssertNotNil(canvas, "Le canvas doit être monté après la mise en page")
        XCTAssertGreaterThan(canvas?.effectiveSlideTotalDuration ?? 0, 4,
                             "Fixture : la slide doit être assez longue pour accueillir 3,2 s")
        XCTAssertEqual(canvas?.currentTime.seconds ?? -1, 0, accuracy: 0.0001,
                       "Au montage, la position n'est pas encore connue")

        stage.publish(startAt: 3.2)

        XCTAssertEqual(canvas?.currentTime.seconds ?? -1, 3.2, accuracy: 0.01,
                       "La position publiée après le montage est HONORÉE — sans elle, "
                       + "ouvrir le détail d'une carte en lecture repart de zéro")
    }

    func test_theSamePositionRepublished_doesNotPullThePlaybackBack() {
        let stage = Stage(startAt: 0)
        defer { stage.tearDown() }
        let canvas = stage.canvas()
        stage.publish(startAt: 3.2)

        // La lecture avance (ce que fait le display-link en vrai), puis l'hôte
        // se re-rend avec la MÊME position d'ouverture.
        canvas?.seedPlayhead(6)
        stage.publish(startAt: 3.2)

        XCTAssertEqual(canvas?.currentTime.seconds ?? -1, 6, accuracy: 0.01,
                       "Une position déjà semée ne recale rien — sinon chaque rendu "
                       + "ferait reculer la lecture")
    }

    // MARK: - La carte LÈGUE, le détail REPREND

    private static let cle = ScenePlaybackPositions.key(carrierId: "story-start-at",
                                                        sceneIndex: 0)

    func test_aPlayingSurface_leavesItsPositionForTheNextOne() {
        let carte = Stage(startAt: 0, positionKey: Self.cle)
        defer { carte.tearDown() }

        carte.canvas()?.simulateTickAt(seconds: 4.2)

        XCTAssertEqual(ScenePlaybackPositions.shared.position(for: Self.cle) ?? -1, 4.2,
                       accuracy: 0.001,
                       "La carte joue et LÈGUE — c'est la moitié qui manquait à startAt")
    }

    /// **Le témoin de bout en bout du porteur** : la carte joue, la surface
    /// suivante ouvre AU MÊME ENDROIT. Sans le legs, la seconde surface
    /// recommence tout — vidéo comme fond sonore.
    func test_theNextSurfaceOpensExactlyWhereTheCardLeftOff() {
        let carte = Stage(startAt: 0, positionKey: Self.cle)
        carte.canvas()?.simulateTickAt(seconds: 4.2)
        carte.tearDown()

        // Ce que fait l'hôte du détail (`SocialSceneFullscreenView`) à son
        // apparition : il lit la mémoire et la passe en `startAt`.
        let detail = Stage(startAt: 0, positionKey: Self.cle)
        defer { detail.tearDown() }
        detail.publish(startAt: ScenePlaybackPositions.shared.position(for: Self.cle) ?? 0,
                       positionKey: Self.cle)

        XCTAssertEqual(detail.canvas()?.currentTime.seconds ?? -1, 4.2, accuracy: 0.01,
                       "« ouverture en détail on joue le son directement aligné » — "
                       + "le détail reprend la seconde où la carte en était")
    }

    func test_aSurfaceWithoutAKey_leavesNothing() {
        let anonyme = Stage(startAt: 0)
        defer { anonyme.tearDown() }

        anonyme.canvas()?.simulateTickAt(seconds: 4.2)

        XCTAssertNil(ScenePlaybackPositions.shared.position(for: Self.cle),
                     "Sans clé, une surface ne lègue rien — le défaut reste l'ouverture à zéro")
    }

    // MARK: - La mémoire elle-même : fraîcheur, capacité, zéro

    func test_thePositionMemory_forgetsWhatIsNoLongerAResumption() {
        var maintenant = Date(timeIntervalSince1970: 1_000)
        let memoire = ScenePlaybackPositions(clock: { maintenant })
        memoire.publish(4.2, for: "k")

        maintenant = maintenant.addingTimeInterval(ScenePlaybackPositions.freshness - 0.1)
        XCTAssertEqual(memoire.position(for: "k") ?? -1, 4.2, accuracy: 0.001)

        maintenant = maintenant.addingTimeInterval(1)
        XCTAssertNil(memoire.position(for: "k"),
                     "Passé la fraîcheur, reprendre là n'est plus une reprise : c'est un saut")
    }

    func test_thePositionMemory_staysBounded() {
        let memoire = ScenePlaybackPositions()
        (0...ScenePlaybackPositions.capacity).forEach { memoire.publish(1, for: "k\($0)") }

        XCTAssertNil(memoire.position(for: "k0"),
                     "Un fil défile : la plus ancienne entrée cède sa place")
        XCTAssertNotNil(memoire.position(for: "k\(ScenePlaybackPositions.capacity)"))
    }

    func test_thePositionMemory_treatsZeroAsNothingToResume() {
        let memoire = ScenePlaybackPositions()
        memoire.publish(0, for: "k")
        XCTAssertNil(memoire.position(for: "k"),
                     "Reprendre à zéro et ouvrir à zéro sont le même geste")
    }

    // MARK: - La garde d'idempotence, seuil DÉCLARÉ

    func test_shouldReseed_onlyBeyondTheDeclaredThreshold() {
        let seuil = StoryReaderRepresentable.startAtReseedThreshold
        XCTAssertTrue(StoryReaderRepresentable.shouldReseed(requested: seuil + 0.01, seeded: 0))
        XCTAssertFalse(StoryReaderRepresentable.shouldReseed(requested: seuil, seeded: 0),
                       "À l'égalité, on ne recale pas : le seuil est un écart à DÉPASSER")
        XCTAssertFalse(StoryReaderRepresentable.shouldReseed(requested: 3.2, seeded: 3.2))
        XCTAssertTrue(StoryReaderRepresentable.shouldReseed(requested: 3.2, seeded: 0))
    }

    func test_shouldReseed_zeroNegativeOrNonFinite_neverReseeds() {
        for demandee in [0, -4, Double.nan, .infinity] {
            XCTAssertFalse(StoryReaderRepresentable.shouldReseed(requested: demandee, seeded: 9),
                           "Semer \(demandee) ne doit rien changer")
        }
    }

    // MARK: - Fixtures

    /// Un hôte SwiftUI réel : `rootView` change, SwiftUI appelle `updateUIView`.
    /// Le type de `rootView` est le MÊME des deux côtés — sans quoi SwiftUI
    /// remplacerait l'identité de la vue et ferait un `makeUIView` de plus,
    /// ce qui ne prouverait rien du re-semis.
    @MainActor
    private final class Stage {
        private let window: UIWindow
        private let host: UIHostingController<StageView>

        init(startAt: Double, positionKey: String? = nil) {
            host = UIHostingController(rootView: StageView(startAt: startAt,
                                                           positionKey: positionKey))
            window = UIWindow(frame: CGRect(x: 0, y: 0, width: 360, height: 640))
            window.rootViewController = host
            window.makeKeyAndVisible()
            host.view.layoutIfNeeded()
        }

        func publish(startAt: Double, positionKey: String? = nil) {
            host.rootView = StageView(startAt: startAt, positionKey: positionKey)
            host.view.setNeedsLayout()
            host.view.layoutIfNeeded()
        }

        func canvas() -> StoryCanvasUIView? { Stage.firstCanvas(in: host.view) }

        func tearDown() {
            window.isHidden = true
            window.rootViewController = nil
        }

        private static func firstCanvas(in view: UIView) -> StoryCanvasUIView? {
            if let canvas = view as? StoryCanvasUIView { return canvas }
            return view.subviews.compactMap { firstCanvas(in: $0) }.first
        }
    }

    /// Un type NOMMÉ : `UIHostingController.rootView` doit se réaffecter avec
    /// le MÊME type concret, sinon SwiftUI remplace l'identité de la vue et
    /// refait un `makeUIView` — ce qui ne prouverait rien du re-semis.
    private struct StageView: View {
        let startAt: Double
        let positionKey: String?

        var body: some View {
            StoryReaderRepresentable(story: StageView.story(), mute: true,
                                     startAt: startAt, positionKey: positionKey)
                .frame(width: 360, height: 640)
        }

        /// Un fond sonore de 12 s : c'est lui qui donne sa durée à la slide, et
        /// c'est exactement le cas du porteur (« lorsqu'on a un son de fond »).
        /// L'id de la story est STABLE — un id neuf ferait changer l'identité
        /// de la slide, et `updateUIView` remettrait la timeline à zéro par son
        /// propre chemin.
        static func story() -> StoryItem {
            let audio = StoryAudioPlayerObject(id: "bg", postMediaId: "bg",
                                               isBackground: true,
                                               startTime: 0, duration: 12, loop: true)
            return StoryItem(id: "story-start-at",
                             media: [FeedMedia(id: "bg", type: .audio,
                                               url: "https://cdn.example.test/bg.m4a",
                                               duration: 12)],
                             storyEffects: StoryEffects(audioPlayerObjects: [audio]),
                             createdAt: Date())
        }
    }
}
