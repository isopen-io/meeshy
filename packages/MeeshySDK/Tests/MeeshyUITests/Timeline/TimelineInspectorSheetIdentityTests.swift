import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// L'inspecteur de timeline passe du survol flottant à une SHEET (item 8).
///
/// Une sheet pilotée par `item:` se re-présente dès que l'identité de l'item
/// change. Or l'inspecteur édite en continu — volume, fondu, durée. Si
/// l'identité dérivait des VALEURS, chaque cran de curseur refermerait et
/// rouvrirait la sheet sous les doigts de l'utilisateur.
///
/// L'identité ne doit donc dépendre QUE de ce qui est sélectionné.
@MainActor
final class TimelineInspectorSheetIdentityTests: XCTestCase {

    private func clip(id: String, volume: Float = 1, duration: Float = 3) -> ClipInspector.ClipSnapshot {
        ClipInspector.ClipSnapshot(id: id,
                                   displayName: "Clip",
                                   kind: .video,
                                   startTime: 0,
                                   duration: duration,
                                   volume: volume,
                                   fadeInDuration: 0,
                                   fadeOutDuration: 0,
                                   isLooping: false,
                                   isBackground: false)
    }

    // MARK: - Stabilité sous édition

    func test_identity_isStableWhileTheClipIsBeingEdited() {
        let before = TimelineInspectorHost.SelectionKind.clip(clip(id: "c1", volume: 1.0))
        let after = TimelineInspectorHost.SelectionKind.clip(clip(id: "c1", volume: 0.3, duration: 5))
        XCTAssertEqual(before.id, after.id,
                       "régler le volume ne doit pas refermer puis rouvrir la sheet")
    }

    func test_identity_isStableWhileTheKeyframeIsBeingDragged() {
        let before = TimelineInspectorHost.SelectionKind.keyframe(
            .init(id: "k1", absoluteTime: 1, x: 0, y: 0, scale: 1, opacity: 1), clipId: "c1")
        let after = TimelineInspectorHost.SelectionKind.keyframe(
            .init(id: "k1", absoluteTime: 2.5, x: 40, y: 12, scale: 1.4, opacity: 0.5), clipId: "c1")
        XCTAssertEqual(before.id, after.id)
    }

    func test_identity_isStableWhileTheTransitionDurationChanges() {
        let before = TimelineInspectorHost.SelectionKind.transition(
            .init(id: "t1", fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 0.3))
        let after = TimelineInspectorHost.SelectionKind.transition(
            .init(id: "t1", fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 1.2))
        XCTAssertEqual(before.id, after.id)
    }

    // MARK: - Distinction entre sélections

    func test_identity_differsBetweenClips() {
        XCTAssertNotEqual(TimelineInspectorHost.SelectionKind.clip(clip(id: "c1")).id,
                          TimelineInspectorHost.SelectionKind.clip(clip(id: "c2")).id)
    }

    /// Un keyframe et un clip peuvent porter le même identifiant brut — ils
    /// transitent par le même bus de sélection. Sans préfixe de catégorie, la
    /// sheet ne changerait pas en passant de l'un à l'autre.
    func test_identity_differsAcrossCategoriesSharingTheSameRawId() {
        let asClip = TimelineInspectorHost.SelectionKind.clip(clip(id: "x")).id
        let asKeyframe = TimelineInspectorHost.SelectionKind.keyframe(
            .init(id: "x", absoluteTime: 0, x: 0, y: 0, scale: 1, opacity: 1), clipId: "c1").id
        let asTransition = TimelineInspectorHost.SelectionKind.transition(
            .init(id: "x", fromClipId: "a", toClipId: "b", kind: .crossfade, duration: 0.3)).id
        XCTAssertEqual(Set([asClip, asKeyframe, asTransition]).count, 3)
    }

    /// Le même keyframe rattaché à deux clips distincts reste deux sélections
    /// différentes — l'inspecteur édite le keyframe DANS son clip.
    func test_identity_keyframeIsScopedToItsClip() {
        let onFirst = TimelineInspectorHost.SelectionKind.keyframe(
            .init(id: "k1", absoluteTime: 0, x: 0, y: 0, scale: 1, opacity: 1), clipId: "c1").id
        let onSecond = TimelineInspectorHost.SelectionKind.keyframe(
            .init(id: "k1", absoluteTime: 0, x: 0, y: 0, scale: 1, opacity: 1), clipId: "c2").id
        XCTAssertNotEqual(onFirst, onSecond)
    }
}
