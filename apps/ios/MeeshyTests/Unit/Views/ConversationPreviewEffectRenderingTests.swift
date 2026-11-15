import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// #16975 — la ligne 2 APPLIQUE l'effet du dernier message, sous une loi
/// d'énergie : rendu figé, entrée jouée une fois à l'arrivée d'un message.
@MainActor
final class ConversationPreviewEffectRenderingTests: XCTestCase {

    private func shouldPlay(
        previous: String?, current: String?, visible: Bool = true, reduceMotion: Bool = false, lowPower: Bool = false
    ) -> Bool {
        ConversationPreviewEntrancePolicy.shouldPlay(
            previousId: previous, currentId: current, isVisible: visible, reduceMotion: reduceMotion, lowPower: lowPower
        )
    }

    // MARK: - Quand l'entrée se joue

    func test_shouldPlay_firstAppearance_doesNotPlay() {
        XCTAssertFalse(shouldPlay(previous: nil, current: "m1"))
    }

    func test_shouldPlay_sameMessage_doesNotPlay() {
        XCTAssertFalse(shouldPlay(previous: "m1", current: "m1"))
    }

    func test_shouldPlay_newMessageOnVisibleRow_plays() {
        XCTAssertTrue(shouldPlay(previous: "m1", current: "m2"))
    }

    func test_shouldPlay_newMessageOffScreen_doesNotPlay() {
        XCTAssertFalse(shouldPlay(previous: "m1", current: "m2", visible: false))
    }

    func test_shouldPlay_reduceMotion_doesNotPlay() {
        XCTAssertFalse(shouldPlay(previous: "m1", current: "m2", reduceMotion: true))
    }

    func test_shouldPlay_lowPowerMode_doesNotPlay() {
        XCTAssertFalse(shouldPlay(previous: "m1", current: "m2", lowPower: true))
    }

    func test_shouldPlay_lastMessageCleared_doesNotPlay() {
        XCTAssertFalse(shouldPlay(previous: "m1", current: nil))
        XCTAssertFalse(shouldPlay(previous: "m1", current: ""))
    }

    func test_entranceDuration_staysUnderTheSharedCeiling() {
        for entrance in [ConversationPreviewEffect.Entrance.shake, .pop] {
            XCTAssertLessThanOrEqual(
                ConversationPreviewEntrancePolicy.milliseconds(of: entrance),
                ConversationPreviewEffect.entranceMaxMilliseconds
            )
        }
    }

    // MARK: - La transformation revient à l'identité

    func test_entranceEffect_isIdentityAtRestAndAfterEachPlay() {
        let size = CGSize(width: 200, height: 20)
        for entrance in [ConversationPreviewEffect.Entrance.shake, .pop] {
            for rest in [CGFloat(0), 1, 2] {
                let transform = ConversationPreviewEntranceEffect(entrance: entrance, animatableData: rest)
                    .effectValue(size: size)
                XCTAssertEqual(transform.m11, 1, accuracy: 1e-9, "\(entrance) à \(rest)")
                XCTAssertEqual(transform.m22, 1, accuracy: 1e-9, "\(entrance) à \(rest)")
                XCTAssertEqual(transform.m31, 0, accuracy: 1e-9, "\(entrance) à \(rest)")
                XCTAssertEqual(transform.m32, 0, accuracy: 1e-9, "\(entrance) à \(rest)")
            }
        }
    }

    func test_entranceEffect_shakeStaysWithinThreePoints() {
        let size = CGSize(width: 200, height: 20)
        let travels = stride(from: CGFloat(0), through: 1, by: 0.01).map {
            ConversationPreviewEntranceEffect(entrance: .shake, animatableData: $0).effectValue(size: size).m31
        }
        XCTAssertLessThanOrEqual(travels.map(abs).max() ?? 0, 3 + 1e-9)
        XCTAssertGreaterThan(travels.map(abs).max() ?? 0, 2.9)
    }

    func test_entranceEffect_popPeaksAtSixPercent() {
        let peak = ConversationPreviewEntranceEffect(entrance: .pop, animatableData: 0.5)
            .effectValue(size: CGSize(width: 200, height: 20))
        XCTAssertEqual(peak.m11, 1.06, accuracy: 1e-9)
    }

    // MARK: - Le rendu figé

    func test_finishStyle_followsTheComposedEffect() {
        XCTAssertEqual(ConversationPreviewFinishStyle(effect: nil), .plain)
        XCTAssertEqual(ConversationPreviewFinishStyle(effect: .veiled), .veiled)
        XCTAssertEqual(ConversationPreviewFinishStyle(effect: .init(veil: false, finish: .glow, entrance: .shake)), .glow)
        XCTAssertEqual(ConversationPreviewFinishStyle(effect: .init(veil: false, finish: .rainbow, entrance: nil)), .rainbow)
        XCTAssertEqual(ConversationPreviewFinishStyle(effect: .init(veil: false, finish: .pulse, entrance: .pop)), .plain,
                       "pulse se peint sur l'icône, le corps reste nu")
        XCTAssertEqual(ConversationPreviewFinishStyle(effect: .init(veil: false, finish: nil, entrance: .pop)), .plain)
    }
}
