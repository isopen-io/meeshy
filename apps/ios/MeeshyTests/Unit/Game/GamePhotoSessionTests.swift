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
        let notebook: MockGamePhotoNotebook
        let library: MockGamePhotoLibrary
        let haptics: MockGameHaptics
        let links: MockReferralLink
    }

    private let moment = GamePhotoMoments.rank(.voix, division: .ii)

    private func makeRig(cameraFailure: CameraFailure? = nil, link: String? = nil,
                         flame: ReferralCard.Flame? = nil) -> Rig {
        let camera = MockGamePhotoCamera()
        camera.startResult = cameraFailure
        let composer = MockGamePhotoComposer()
        let notebook = MockGamePhotoNotebook()
        let library = MockGamePhotoLibrary()
        let haptics = MockGameHaptics()
        let links = MockReferralLink(link: link)
        let sut = GamePhotoSession(
            moment: moment, camera: camera, composer: composer, notebook: notebook,
            library: library, haptics: haptics, now: { Date(timeIntervalSince1970: 1_790_000_000) }, strikeDuration: 0,
            flame: flame, referralLinks: links
        )
        return Rig(sut: sut, camera: camera, composer: composer, notebook: notebook, library: library, haptics: haptics, links: links)
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

    /// La feuille plein écran peut se refermer SANS passer par la croix (l'écran
    /// Progression qui part, la liaison qui retombe à `nil`) : la caméra s'arrête quand
    /// même, et le déroulé est clos — jamais un capteur laissé allumé derrière l'écran.
    func test_closingTheCoordinator_stopsTheCameraOfTheOpenFlow() async {
        let rig = makeRig()
        let coordinator = GamePhotoCoordinator(notebook: rig.notebook) { _ in rig.sut }
        coordinator.start(moment)
        await rig.sut.chooseSelfie()
        XCTAssertEqual(rig.sut.state, .camera(.live))

        coordinator.close()

        XCTAssertNil(coordinator.active)
        XCTAssertGreaterThanOrEqual(rig.camera.stopCount, 1, "la caméra du déroulé refermé s'arrête")
        XCTAssertEqual(rig.sut.state, .done(deferred: false))
    }

    // MARK: - Le lien de parrainage et la Flamme (#7742)

    private static let link = "https://meeshy.me/signup/affiliate/AMANI7"
    private static let flame = ReferralCard.Flame(form: .braise, days: 23)

    func test_withoutALink_theCardIsComposedWithoutABanner_andNothingTravelsAsText() async {
        let rig = makeRig(link: nil)
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        XCTAssertNil(rig.composer.composed.first?.referral)
        XCTAssertNil(rig.sut.shareText)
        XCTAssertEqual(rig.sut.shareItems(square: false).count, 1)
    }

    func test_aLinkReadBeforeTheShot_isOnTheComposedCard() async {
        let rig = makeRig(link: Self.link, flame: Self.flame)
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        XCTAssertEqual(rig.composer.composed.first?.referral, ReferralCard(link: Self.link, flame: Self.flame))
    }

    func test_aLinkThatArrivesAfterTheComposition_recomposesTheCard() async {
        let rig = makeRig(link: Self.link)
        await rig.sut.chooseCard()
        XCTAssertNil(rig.composer.composed.last?.referral)
        await rig.sut.prepareReferral()
        XCTAssertEqual(rig.composer.composed.count, 2)
        XCTAssertEqual(rig.composer.composed.last?.referral?.link, Self.link)
    }

    func test_theLinkIsReadOnce_howeverManyTimesTheFlowAsks() async {
        let rig = makeRig(link: Self.link)
        await rig.sut.prepareReferral()
        await rig.sut.prepareReferral()
        XCTAssertEqual(rig.links.calls, 1)
    }

    func test_theShareCarriesTheImage_thenTheLinkAsText() async {
        let rig = makeRig(link: Self.link)
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        let items = rig.sut.shareItems(square: true)
        XCTAssertEqual(items.count, 2)
        XCTAssertTrue(items[0] is UIImage)
        XCTAssertTrue((items[1] as? String)?.contains(Self.link) == true)
    }

    func test_theFlameCanBeTakenOffTheCard_andTheCardIsRecomposed() async {
        let rig = makeRig(link: Self.link, flame: Self.flame)
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        XCTAssertTrue(rig.sut.hasFlame)
        rig.sut.setFlameOnCard(false)
        XCTAssertNil(rig.sut.referral?.flame)
        XCTAssertNil(rig.composer.composed.last?.referral?.flame)
        XCTAssertEqual(rig.composer.composed.last?.referral?.link, Self.link)
        rig.sut.setFlameOnCard(true)
        XCTAssertEqual(rig.sut.referral?.flame, Self.flame)
    }

    func test_withoutAFlame_theBannerCarriesTheLinkAlone() async {
        let rig = makeRig(link: Self.link, flame: nil)
        await rig.sut.prepareReferral()
        XCTAssertFalse(rig.sut.hasFlame)
        XCTAssertNil(rig.sut.referral?.flame)
    }
}
