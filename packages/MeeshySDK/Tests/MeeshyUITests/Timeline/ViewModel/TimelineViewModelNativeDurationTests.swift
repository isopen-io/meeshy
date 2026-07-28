import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Un clip ne peut pas durer plus longtemps que son média source.
///
/// `trimClipEnd` acceptait un paramètre `mediaDurationLimit` qu'AUCUN appelant
/// de production ne passait : une vidéo de 3 s pouvait être étirée à 30 s, soit
/// 27 s de dernière image figée à la lecture comme à l'export. La limite est
/// désormais résolue par le view model lui-même depuis
/// `StoryMediaObject.intrinsicDuration`, que le composer fige à l'import — donc
/// TOUS les chemins (poignée de piste, stepper, champ saisi, barre tactile) en
/// héritent d'un coup.
@MainActor
final class TimelineViewModelNativeDurationTests: XCTestCase {

    private func makeSUT(intrinsicDuration: Double?) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        var media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78,
                                     startTime: 0, duration: 3)
        media.intrinsicDuration = intrinsicDuration
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 6,
                                              mediaObjects: [media], audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    private func duration(_ vm: TimelineViewModel) -> Float {
        Float(vm.project.mediaObjects.first { $0.id == "m1" }?.duration ?? -1)
    }

    func test_setClipDuration_cannotExceedTheSourceMedia() async {
        let sut = await makeSUT(intrinsicDuration: 3)
        sut.setClipDuration(id: "m1", to: 30)
        XCTAssertEqual(duration(sut), 3, accuracy: 0.001,
                       "Au-delà de 3 s, il n'y a plus d'image à montrer que la dernière, figée.")
    }

    func test_setClipEnd_cannotExceedTheSourceMedia() async {
        let sut = await makeSUT(intrinsicDuration: 3)
        sut.setClipEnd(id: "m1", to: 25)
        XCTAssertEqual(duration(sut), 3, accuracy: 0.001)
    }

    func test_trimClipEnd_cannotExceedTheSourceMedia() async {
        let sut = await makeSUT(intrinsicDuration: 3)
        sut.trimClipEnd(id: "m1", deltaTimeSeconds: 20)
        XCTAssertEqual(duration(sut), 3, accuracy: 0.001)
    }

    /// Raccourcir reste évidemment libre — c'est du montage, pas de l'invention
    /// d'images.
    func test_shorteningStaysFree() async {
        let sut = await makeSUT(intrinsicDuration: 3)
        sut.setClipDuration(id: "m1", to: 1.2)
        XCTAssertEqual(duration(sut), 1.2, accuracy: 0.001)
    }

    /// Déplacer n'est pas allonger : la fenêtre garde sa durée, elle glisse.
    func test_movingIsUnaffectedByTheNativeLimit() async {
        let sut = await makeSUT(intrinsicDuration: 3)
        sut.setClipStart(id: "m1", to: 4)
        XCTAssertEqual(duration(sut), 3, accuracy: 0.001)
        XCTAssertEqual(Float(sut.project.mediaObjects.first { $0.id == "m1" }?.startTime ?? -1),
                       4, accuracy: 0.001)
    }

    /// Story ancienne ou restaurée : `intrinsicDuration` est `nil`, aucune
    /// limite connue. Le comportement d'avant demeure — mieux vaut laisser
    /// étirer que bloquer sur une valeur qu'on n'a pas.
    func test_withoutIntrinsicDuration_noLimitApplies() async {
        let sut = await makeSUT(intrinsicDuration: nil)
        sut.setClipDuration(id: "m1", to: 30)
        XCTAssertEqual(duration(sut), 30, accuracy: 0.001)
    }
}
