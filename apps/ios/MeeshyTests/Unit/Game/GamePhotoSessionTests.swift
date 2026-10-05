import XCTest
@testable import Meeshy
import MeeshySDK

/// Le déroulé d'une photo (#9382) : la caméra, la composition, le carnet, la
/// photothèque et le haptique sont INJECTÉS — le déroulé se teste sans objectif ni disque.
@MainActor
final class GamePhotoSessionTests: XCTestCase {

    private struct Rig {
        let sut: GamePhotoSession
        let camera: MockGamePhotoCamera
        let composer: MockGamePhotoComposer
        let notebook: InMemoryPhotoNotebook
        let library: MockPhotoLibrarySaver
        let haptics: MockGameHaptics
    }

    private let moment = GamePhotoMoments.rank(.voix, division: .ii)

    private func makeRig(cameraFailure: CameraFailure? = nil) -> Rig {
        let camera = MockGamePhotoCamera()
        camera.startResult = cameraFailure
        let composer = MockGamePhotoComposer()
        let notebook = InMemoryPhotoNotebook()
        let library = MockPhotoLibrarySaver()
        let haptics = MockGameHaptics()
        let sut = GamePhotoSession(
            moment: moment, camera: camera, composer: composer, notebook: notebook,
            library: library, haptics: haptics, now: { Date(timeIntervalSince1970: 1_790_000_000) }, strikeDuration: 0
        )
        return Rig(sut: sut, camera: camera, composer: composer, notebook: notebook, library: library, haptics: haptics)
    }

    func test_initial_isTheOffer() {
        XCTAssertEqual(makeRig().sut.state, .offer)
    }

    func test_chooseCard_composesWithoutAPhoto() async {
        let rig = makeRig()
        await rig.sut.chooseCard()
        XCTAssertEqual(rig.sut.state, .result(.card, kept: nil))
        XCTAssertEqual(rig.composer.composed.first?.hadSource, false)
        XCTAssertEqual(rig.composer.composed.first?.mode, .card)
        XCTAssertNotNil(rig.sut.composed)
    }

    func test_chooseSelfie_thenShutter_composesTheShotAsASelfie() async {
        let rig = makeRig()
        await rig.sut.chooseSelfie()
        XCTAssertEqual(rig.sut.state, .camera(.live))
        await rig.sut.shutter()
        XCTAssertEqual(rig.sut.state, .result(.selfie, kept: nil))
        XCTAssertEqual(rig.composer.composed.first?.hadSource, true)
        XCTAssertEqual(rig.composer.composed.first?.mode, .selfie)
        XCTAssertEqual(rig.camera.captureCount, 1)
    }

    func test_shutter_strikesInPlaceWithTheHapticShock() async {
        let rig = makeRig()
        await rig.sut.chooseSelfie()
        await rig.sut.shutter()
        XCTAssertEqual(rig.haptics.played, [GameHapticPattern.strikeInPlace])
    }

    func test_shutter_beforeTheCameraIsLive_doesNothing() async {
        let rig = makeRig()
        await rig.sut.shutter()
        XCTAssertEqual(rig.sut.state, .offer)
        XCTAssertEqual(rig.camera.captureCount, 0)
    }

    func test_aDeniedCamera_isNamed_andTheGalleryStillWorks() async {
        let rig = makeRig(cameraFailure: .denied)
        await rig.sut.chooseSelfie()
        XCTAssertEqual(rig.sut.state, .camera(.failed(.denied)))
        let png = MockGamePhotoCamera.pixel().pngData() ?? Data()
        await rig.sut.useGalleryPhoto(png)
        XCTAssertEqual(rig.sut.state, .result(.gallery, kept: nil))
        XCTAssertEqual(rig.composer.composed.first?.mode, .gallery)
    }

    func test_aDeniedCamera_theCardOnlyStaysPossible() async {
        let rig = makeRig(cameraFailure: .unsupported)
        await rig.sut.chooseSelfie()
        await rig.sut.chooseCard()
        XCTAssertEqual(rig.sut.state, .result(.card, kept: nil))
    }

    func test_aShotThatTheLensDoesNotRender_isACameraFailureNotACrash() async {
        let rig = makeRig()
        await rig.sut.chooseSelfie()
        rig.camera.shot = nil
        await rig.sut.shutter()
        XCTAssertEqual(rig.sut.state, .camera(.failed(.unavailable)))
    }

    func test_unreadableGalleryBytes_areIgnored() async {
        let rig = makeRig()
        await rig.sut.chooseSelfie()
        await rig.sut.useGalleryPhoto(Data("pas une image".utf8))
        XCTAssertEqual(rig.sut.state, .camera(.live))
    }

    func test_later_postponesTheMomentSevenDays_andClosesAsDeferred() async {
        let rig = makeRig()
        await rig.sut.later()
        XCTAssertEqual(rig.sut.state, .done(deferred: true))
        XCTAssertEqual(rig.notebook.postponed.map(\.id), [moment.id])
        XCTAssertTrue(rig.sut.wasDeferred)
    }

    func test_closing_stopsTheCamera() async {
        let rig = makeRig()
        await rig.sut.chooseSelfie()
        rig.sut.close()
        XCTAssertEqual(rig.sut.state, .done(deferred: false))
        XCTAssertGreaterThan(rig.camera.stopCount, 0)
    }

    func test_compositionFailure_endsInFailed() async {
        let rig = makeRig()
        rig.composer.succeeds = false
        await rig.sut.chooseCard()
        XCTAssertEqual(rig.sut.state, .failed)
    }

    func test_keep_putsThePhotoInTheNotebook_andSaysSo() async {
        let rig = makeRig()
        await rig.sut.chooseCard()
        await rig.sut.keep()
        XCTAssertEqual(rig.sut.state, .result(.card, kept: true))
        XCTAssertEqual(rig.notebook.kept.map { $0.moment.id }, [moment.id])
        XCTAssertEqual(rig.sut.notice?.tone, .good)
    }

    func test_keep_aNotebookThatRefuses_saysThePhotoWasNotKept() async {
        let rig = makeRig()
        rig.notebook.keepSucceeds = false
        await rig.sut.chooseCard()
        await rig.sut.keep()
        XCTAssertEqual(rig.sut.state, .result(.card, kept: false))
        XCTAssertEqual(rig.sut.notice?.tone, .error)
    }

    func test_save_writesTheChosenFormatToThePhotoLibrary() async {
        let rig = makeRig()
        await rig.sut.chooseCard()
        await rig.sut.save(square: false)
        await rig.sut.save(square: true)
        XCTAssertEqual(rig.library.savedImages, [Data("story".utf8), Data("square".utf8)])
        XCTAssertEqual(rig.sut.notice?.tone, .good)
    }

    func test_save_aRefusedLibrary_isAnErrorNotice() async {
        let rig = makeRig()
        rig.library.fails = true
        await rig.sut.chooseCard()
        await rig.sut.save(square: false)
        XCTAssertEqual(rig.sut.notice?.tone, .error)
    }

    func test_share_onlyAnAchievedShareIsCelebrated() async {
        let rig = makeRig()
        await rig.sut.chooseCard()
        rig.sut.shared(completed: false)
        XCTAssertNil(rig.sut.notice)
        rig.sut.shared(completed: true)
        XCTAssertEqual(rig.sut.notice?.tone, .good)
    }
}
