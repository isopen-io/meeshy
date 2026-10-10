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

    private func makeRig(cameraFailure: CameraFailure? = nil, link: String? = nil, createdLink: String? = nil,
                         flame: ReferralCard.Flame? = nil) -> Rig {
        let camera = MockGamePhotoCamera()
        camera.startResult = cameraFailure
        let composer = MockGamePhotoComposer()
        let notebook = MockGamePhotoNotebook()
        let library = MockGamePhotoLibrary()
        let haptics = MockGameHaptics()
        let links = MockReferralLink(link: link, createdLink: createdLink)
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

    func test_withoutAToken_thePreviewCarriesThePlaceholder_andNothingTravelsAsText() async {
        let rig = makeRig(link: nil)
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        XCTAssertEqual(rig.composer.composed.first?.referral?.isPlaceholder, true)
        XCTAssertNil(rig.composer.composed.first?.referral?.qrLink, "l'emplacement n'encode aucun lien")
        XCTAssertNil(rig.sut.shareText, "l'emplacement n'est pas un lien : il ne part pas en texte")
        XCTAssertEqual(rig.sut.shareItems(square: false).count, 1)
    }

    // MARK: - Aucun jeton sans geste (#7742)

    func test_openingTheFlow_readsTheExistingToken_butNeverCreatesOne() async {
        let rig = makeRig(link: nil, createdLink: Self.link)
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        XCTAssertEqual(rig.links.existingCalls, 1)
        XCTAssertEqual(rig.links.shareableCalls, 0, "ouvrir le déroulé ne crée aucun jeton")
        XCTAssertFalse(rig.sut.hasReferralLink)
        XCTAssertTrue(rig.sut.offersLinkChoice, "l'emplacement peut se retirer d'un geste")
    }

    func test_sharing_createsTheToken_andRecomposesTheCardWithTheRealLinkBeforeItLeaves() async {
        let rig = makeRig(link: nil, createdLink: Self.link, flame: Self.flame)
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        XCTAssertEqual(rig.composer.composed.last?.referral?.isPlaceholder, true)

        await rig.sut.prepareShare()

        XCTAssertEqual(rig.links.shareableCalls, 1)
        XCTAssertEqual(rig.composer.composed.last?.referral, ReferralCard(link: Self.link, flame: Self.flame))
        XCTAssertEqual(rig.sut.referral?.link, Self.link)
        let items = rig.sut.shareItems(square: false)
        XCTAssertEqual(items.count, 2)
        XCTAssertTrue((items[1] as? String)?.contains(Self.link) == true)
    }

    /// « Partager » n'a aucun retour pendant que le jeton se crée : un second toucher est probable. Il ne doit ni
    /// recréer de jeton, ni ouvrir la feuille avec une carte SANS le lien que le premier toucher est en train
    /// d'obtenir — il attend la même création.
    func test_aSecondTapOnShare_waitsForTheLinkTheFirstTapIsCreating() async {
        let rig = makeRig(link: nil, createdLink: Self.link)
        rig.links.shareableDelay = 50_000_000
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        let sut = rig.sut

        let firstTap = Task { await sut.prepareShare() }
        while rig.links.shareableCalls == 0 { await Task.yield() }
        await sut.prepareShare()

        XCTAssertEqual(sut.referral?.link, Self.link, "le second toucher ouvre la feuille avec le vrai lien")
        XCTAssertEqual(sut.shareItems(square: false).count, 2)
        await firstTap.value
        XCTAssertEqual(rig.links.shareableCalls, 1, "un seul jeton, quel que soit le nombre de touchers")
    }

    func test_sharing_withAnExistingToken_createsNothingMore() async {
        let rig = makeRig(link: Self.link)
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        await rig.sut.prepareShare()
        XCTAssertEqual(rig.links.shareableCalls, 0, "le lien existait : rien à créer")
    }

    func test_sharing_withTheLinkTakenOffTheCard_createsNothing() async {
        let rig = makeRig(link: nil, createdLink: Self.link)
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        rig.sut.setLinkOnCard(false)
        await rig.sut.prepareShare()
        XCTAssertEqual(rig.links.shareableCalls, 0)
        XCTAssertNil(rig.sut.referral)
        XCTAssertEqual(rig.sut.shareItems(square: false).count, 1)
    }

    func test_sharing_whenNoTokenCouldBeObtained_theCardLeavesWithoutABanner() async {
        let rig = makeRig(link: nil, createdLink: nil)
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        await rig.sut.prepareShare()
        XCTAssertEqual(rig.links.shareableCalls, 1)
        XCTAssertNil(rig.sut.referral)
        XCTAssertNil(rig.composer.composed.last?.referral)
        XCTAssertFalse(rig.sut.offersLinkChoice)
        await rig.sut.prepareShare()
        XCTAssertEqual(rig.links.shareableCalls, 1, "un refus n'est pas redemandé à chaque toucher")
    }

    func test_savingAndKeeping_neverCarryThePlaceholder() async {
        let rig = makeRig(link: nil)
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        XCTAssertEqual(rig.sut.referral?.isPlaceholder, true)

        await rig.sut.save(square: false)
        XCTAssertNil(rig.composer.composed.last?.referral, "l'image enregistrée est recomposée sans l'emplacement")
        XCTAssertEqual(rig.library.savedImages.count, 1)

        await rig.sut.keep()
        XCTAssertNil(rig.composer.composed.last?.referral)
        XCTAssertEqual(rig.notebook.kept.count, 1)
        XCTAssertEqual(rig.links.shareableCalls, 0, "enregistrer ou garder ne crée aucun jeton")
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
        XCTAssertEqual(rig.links.existingCalls, 1)
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

    func test_theLinkCanBeTakenOffTheCard_andNothingOfItTravels() async {
        let rig = makeRig(link: Self.link, flame: Self.flame)
        await rig.sut.prepareReferral()
        await rig.sut.chooseCard()
        XCTAssertTrue(rig.sut.hasReferralLink)

        rig.sut.setLinkOnCard(false)

        XCTAssertFalse(rig.sut.linkOnCard)
        XCTAssertNil(rig.sut.referral, "sans lien, le bandeau n'existe plus — la Flamme part avec lui")
        XCTAssertNil(rig.composer.composed.last?.referral, "la carte est recomposée sans bandeau")
        XCTAssertNil(rig.sut.shareText)
        XCTAssertEqual(rig.sut.shareItems(square: false).count, 1, "le lien ne part pas non plus en texte")
        XCTAssertTrue(rig.sut.hasReferralLink, "le lien reste lu : le remettre ne rappelle pas le réseau")

        rig.sut.setLinkOnCard(true)

        XCTAssertEqual(rig.sut.referral, ReferralCard(link: Self.link, flame: Self.flame))
        XCTAssertEqual(rig.composer.composed.last?.referral?.link, Self.link)
        XCTAssertEqual(rig.links.existingCalls, 1)
    }
}
