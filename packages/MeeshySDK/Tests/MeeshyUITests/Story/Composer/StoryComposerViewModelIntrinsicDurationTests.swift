import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Directive user 2026-07-14 : le rognage doit être borné par la durée RÉELLE
/// du média. `setMediaDuration` fige `intrinsicDuration` (durée native de
/// l'asset) au premier appel (= import) et ne l'écrase jamais ensuite — les
/// changements de fenêtre du timeline editor n'altèrent pas la borne.
@MainActor
final class StoryComposerViewModelIntrinsicDurationTests: XCTestCase {

    func test_setMediaDuration_populatesIntrinsicDuration_onFirstSet() {
        let vm = StoryComposerViewModel()
        guard let obj = vm.addMediaObject(kind: .video) else {
            return XCTFail("addMediaObject devrait réussir sur une slide vierge")
        }
        vm.setMediaDuration(id: obj.id, duration: 10)
        let media = vm.currentEffects.mediaObjects?.first { $0.id == obj.id }
        XCTAssertEqual(media?.duration, 10)
        XCTAssertEqual(media?.intrinsicDuration, 10,
                       "intrinsicDuration figé à l'import (durée native)")
    }

    func test_setMediaDuration_doesNotOverwriteIntrinsic_onWindowChange() {
        let vm = StoryComposerViewModel()
        guard let obj = vm.addMediaObject(kind: .video) else {
            return XCTFail("addMediaObject devrait réussir")
        }
        vm.setMediaDuration(id: obj.id, duration: 10)  // import → intrinsic=10
        vm.setMediaDuration(id: obj.id, duration: 4)   // rognage fenêtre → duration=4
        let media = vm.currentEffects.mediaObjects?.first { $0.id == obj.id }
        XCTAssertEqual(media?.duration, 4)
        XCTAssertEqual(media?.intrinsicDuration, 10,
                       "la borne native ne doit pas être écrasée par un rognage")
    }
}
