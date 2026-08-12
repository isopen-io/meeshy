import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// « +10 s » avait été retiré le 2026-07-27 parce qu'il écrivait la durée dans
/// `project.slideDuration`, que le premier recalcul depuis le contenu effaçait.
/// Ces tests portent sur ce qui manquait : une durée d'AUTEUR distincte, que le
/// recalcul respecte.
@MainActor
final class TimelineExtendDurationTests: XCTestCase {

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let vm = TimelineViewModel(
            engine: MockStoryTimelineEngine(),
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    private func projectWithVideo(duration: Double) -> TimelineProject {
        TimelineProject(
            slideId: "s1",
            slideDuration: Float(duration),
            mediaObjects: [StoryMediaObject(id: "v1", postMediaId: "m1", kind: .video,
                                            aspectRatio: 1.0,
                                            startTime: 0, duration: duration)]
        )
    }

    func test_extend_addsTheStep() {
        let vm = makeViewModel(project: projectWithVideo(duration: 7))
        let before = vm.project.slideDuration

        vm.extendSlideDuration()

        XCTAssertEqual(vm.project.slideDuration,
                       before + TimelineOperationsBar.extendStepSeconds, accuracy: 0.01)
    }

    /// LE test de non-régression : c'est exactement ce qui faisait disparaître
    /// la valeur, et qui a coûté son retrait au bouton.
    func test_extendedDurationSurvivesTheNextEdit() {
        let vm = makeViewModel(project: projectWithVideo(duration: 7))
        vm.extendSlideDuration()
        let extended = vm.project.slideDuration

        // N'importe quelle édition de contenu déclenche le recalcul.
        vm.recomputeSlideDuration()

        XCTAssertEqual(vm.project.slideDuration, extended, accuracy: 0.01,
                       "la durée demandée par l'auteur a été effacée par le recalcul")
    }

    /// La demande d'auteur est un PLANCHER : un contenu plus long l'emporte.
    /// « +10 s » allonge, il n'a jamais servi à rogner.
    func test_longerContentStillWinsOverTheAuthoredFloor() {
        let vm = makeViewModel(project: projectWithVideo(duration: 7))
        vm.extendSlideDuration()   // plancher à 17 s

        vm.project.mediaObjects[0].duration = 40
        vm.recomputeSlideDuration()

        XCTAssertEqual(vm.project.slideDuration, 40, accuracy: 0.5)
    }

    /// Raccourcir le contenu ne reprend pas la place demandée par l'auteur.
    func test_shorterContentDoesNotShrinkBelowTheAuthoredFloor() {
        let vm = makeViewModel(project: projectWithVideo(duration: 7))
        vm.extendSlideDuration()
        let floor = vm.project.slideDuration

        vm.project.mediaObjects[0].duration = 2
        vm.recomputeSlideDuration()

        XCTAssertEqual(vm.project.slideDuration, floor, accuracy: 0.01)
    }

    func test_extend_isCappedAtTheMaximumEnd() {
        let vm = makeViewModel(project: projectWithVideo(duration: 7))
        for _ in 0..<80 { vm.extendSlideDuration() }

        XCTAssertEqual(vm.project.slideDuration, ClipWindowResolver.maximumEnd, accuracy: 0.01)
    }

    /// En butée, le bouton ne doit plus rien écrire — sinon il émettrait des
    /// reconfigurations de moteur pour rien.
    func test_extend_atTheCapIsANoOp() {
        let vm = makeViewModel(project: projectWithVideo(duration: 7))
        for _ in 0..<80 { vm.extendSlideDuration() }
        let capped = vm.project.slideDuration

        vm.extendSlideDuration()
        XCTAssertEqual(vm.project.slideDuration, capped, accuracy: 0.001)
    }

    // MARK: - Reprise d'une durée déjà épinglée

    /// Une slide rouverte porte déjà sa durée d'auteur : la perdre au bootstrap
    /// ferait retomber la timeline sur le contenu à la première édition.
    func test_bootstrapAdoptsAnAlreadyPinnedDuration() {
        var project = projectWithVideo(duration: 7)
        project.slideDuration = 25          // pin venu de `effects.timelineDuration`
        let vm = makeViewModel(project: project)

        vm.recomputeSlideDuration()

        XCTAssertEqual(vm.project.slideDuration, 25, accuracy: 0.01)
    }

    /// Une slide sans pin garde le comportement dérivé, intact.
    func test_bootstrapWithoutPinKeepsDerivingFromContent() {
        let vm = makeViewModel(project: projectWithVideo(duration: 7))
        XCTAssertNil(vm.authoredSlideDuration)

        vm.project.mediaObjects[0].duration = 12
        vm.recomputeSlideDuration()

        XCTAssertEqual(vm.project.slideDuration, 12, accuracy: 0.5)
    }
}
