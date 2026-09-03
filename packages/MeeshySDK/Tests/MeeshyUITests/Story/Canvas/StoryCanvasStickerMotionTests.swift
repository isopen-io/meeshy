import XCTest
import QuartzCore
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #4999 — **une décoration animée bouge PENDANT qu'on compose**, directive
/// porteur 2026-09-03 (« sur la scène les stickers doivent être vivants tout
/// comme les vidéos et audios »).
///
/// Ce que ces témoins gardent, et que `StoryRendererStickerAnimationTests` ne
/// pouvait pas garder : la même pose, appliquée en `.edit`, sur des couches
/// DÉJÀ montées, par l'horloge d'édition — sans playhead et sans
/// reconstruction. Le témoin s'écrit donc sur le canvas, jamais sur le
/// renderer : c'est exactement là que le mouvement manquait.
@MainActor
final class StoryCanvasStickerMotionTests: XCTestCase {

    private func canvas(animation: StickerAnimation?,
                        rotation: Double = 0,
                        joue: Bool = true) -> StoryCanvasUIView {
        var effects = StoryEffects()
        effects.stickerObjects = [
            StorySticker(id: "st", emoji: "\u{1F389}", animation: animation, rotation: rotation),
        ]
        let vue = StoryCanvasUIView(slide: StorySlide(id: "s", effects: effects), mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        vue.layoutIfNeeded()
        vue.playsStickerMotionInEditMode = joue
        return vue
    }

    private func couche(_ vue: StoryCanvasUIView) throws -> CALayer {
        try XCTUnwrap(vue.itemsContainer.sublayers?.first { $0.name == "st" },
                      "la couche de la décoration doit être montée en édition")
    }

    /// Fait avancer l'horloge par pas de 100 ms — sous `maximumStep`, donc
    /// chaque pas compte.
    private func joue(_ vue: StoryCanvasUIView, pendant secondes: Double) {
        let pas = Int((secondes / 0.1).rounded())
        for tick in 0...pas {
            vue._refreshStickerMotionForTesting(now: Double(tick) / 10)
        }
    }

    // MARK: - Le mouvement

    func test_atFirstTick_theStickerHoldsTheAuthorPose() throws {
        let vue = canvas(animation: .spin)
        vue._refreshStickerMotionForTesting(now: 0)
        XCTAssertTrue(CATransform3DIsIdentity(try couche(vue).transform))
    }

    /// `spin` fait un tour par période (4 s) : à 1 s, un quart de tour. Le
    /// même nombre que le témoin du lecteur — c'est le point : une seule
    /// fonction de mouvement, deux horloges.
    func test_afterOneSecond_theStickerHasMoved() throws {
        let vue = canvas(animation: .spin)
        joue(vue, pendant: 1.0)
        let transform = try couche(vue).transform
        XCTAssertFalse(CATransform3DIsIdentity(transform))
        XCTAssertEqual(Double(transform.m12), 1, accuracy: 1e-3, "sin 90°")
        XCTAssertEqual(Double(transform.m11), 0, accuracy: 1e-3, "cos 90°")
    }

    /// La rotation de l'AUTEUR et celle de l'animation s'additionnent — en
    /// composition comme à la lecture.
    func test_authorRotation_addsToTheMotion() throws {
        let vue = canvas(animation: .spin, rotation: 30)
        joue(vue, pendant: 1.0)
        XCTAssertEqual(Double(try couche(vue).transform.m11),
                       cos(120 * Double.pi / 180), accuracy: 1e-3)
    }

    func test_blink_drivesOpacity() throws {
        let vue = canvas(animation: .blink)
        joue(vue, pendant: StickerAnimation.blink.period / 2)
        XCTAssertEqual(Double(try couche(vue).opacity), 0.4, accuracy: 1e-2)
    }

    // MARK: - Ce qui ne bouge PAS

    func test_aStillSticker_neverMoves() throws {
        let vue = canvas(animation: nil)
        joue(vue, pendant: 1.0)
        XCTAssertTrue(CATransform3DIsIdentity(try couche(vue).transform))
    }

    /// L'opt-in est ce qui sépare le canvas COMPOSER du prefetcher hors-écran,
    /// lui aussi en `.edit`. Sans lui, rien ne bouge.
    func test_withoutTheOptIn_nothingMoves() throws {
        let vue = canvas(animation: .spin, joue: false)
        joue(vue, pendant: 1.0)
        XCTAssertTrue(CATransform3DIsIdentity(try couche(vue).transform))
    }

    /// Le témoin de la reprise : un trou d'écran au repos ne se rattrape pas.
    /// Sans lui, revenir sur le composer après une minute ferait sauter la
    /// décoration de quinze périodes d'un coup.
    func test_anIdleGap_doesNotFastForwardTheSticker() throws {
        let vue = canvas(animation: .spin)
        joue(vue, pendant: 1.0)
        let apresUneSeconde = try couche(vue).transform
        // Soixante secondes d'écran au repos, puis un tick.
        vue._refreshStickerMotionForTesting(now: 61)
        let apresLeTrou = try couche(vue).transform
        XCTAssertEqual(Double(apresLeTrou.m11), Double(apresUneSeconde.m11), accuracy: 1e-6)
        XCTAssertEqual(Double(apresLeTrou.m12), Double(apresUneSeconde.m12), accuracy: 1e-6)
    }

    /// Éteindre l'opt-in en cours de route rend à la décoration la pose de
    /// l'auteur : l'abandonner à sa dernière image la laisserait figée de
    /// travers, ce qui est pire que de la laisser bouger.
    func test_turningTheOptInOff_givesTheAuthorPoseBack() throws {
        let vue = canvas(animation: .spin)
        joue(vue, pendant: 1.0)
        XCTAssertFalse(CATransform3DIsIdentity(try couche(vue).transform))
        vue.playsStickerMotionInEditMode = false
        XCTAssertTrue(CATransform3DIsIdentity(try couche(vue).transform))
    }
}
