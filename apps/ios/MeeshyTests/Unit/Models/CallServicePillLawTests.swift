import XCTest
@testable import Meeshy

/// #18227 · #18215 — la loi de déclenchement des pastilles de service (planche E3 « En attente »,
/// E4 « Vidéo réduite »), miroir de Android `CallServicePillLawTest` : mêmes douze vecteurs, mêmes
/// noms, mêmes entrées, mêmes sorties.
@MainActor
final class CallServicePillLawTests: XCTestCase {

    private struct Vector {
        let name: String
        let signals: CallServicePillSignals
        let hold: Bool
        let notice: CallVideoNotice
    }

    private func signals(
        isConnectedLayout: Bool = true,
        isPictureInPicture: Bool = false,
        isOnHold: Bool = false,
        isVideoCall: Bool = true,
        isCameraOn: Bool = true,
        videoNotice: CallVideoNotice = .none
    ) -> CallServicePillSignals {
        CallServicePillSignals(
            isConnectedLayout: isConnectedLayout,
            isPictureInPicture: isPictureInPicture,
            isOnHold: isOnHold,
            isVideoCall: isVideoCall,
            isCameraOn: isCameraOn,
            videoNotice: videoNotice
        )
    }

    private var vectors: [Vector] {
        [
            Vector(name: "repos", signals: signals(), hold: false, notice: .none),
            Vector(name: "attente-systeme", signals: signals(isOnHold: true), hold: true, notice: .none),
            Vector(name: "attente-appel-audio", signals: signals(isOnHold: true, isVideoCall: false, isCameraOn: false), hold: true, notice: .none),
            Vector(name: "attente-en-image-dans-l-image", signals: signals(isPictureInPicture: true, isOnHold: true), hold: true, notice: .none),
            Vector(name: "attente-pendant-la-reconnexion", signals: signals(isConnectedLayout: false, isOnHold: true), hold: true, notice: .none),
            Vector(name: "video-reduite", signals: signals(videoNotice: .reduced), hold: false, notice: .reduced),
            Vector(name: "faible-lumiere", signals: signals(videoNotice: .lowLight), hold: false, notice: .lowLight),
            Vector(name: "video-reduite-camera-coupee", signals: signals(isCameraOn: false, videoNotice: .reduced), hold: false, notice: .none),
            Vector(name: "video-reduite-appel-audio", signals: signals(isVideoCall: false, videoNotice: .reduced), hold: false, notice: .none),
            Vector(name: "video-reduite-en-image-dans-l-image", signals: signals(isPictureInPicture: true, videoNotice: .reduced), hold: false, notice: .none),
            Vector(name: "video-reduite-avant-la-connexion", signals: signals(isConnectedLayout: false, videoNotice: .reduced), hold: false, notice: .none),
            Vector(name: "attente-et-video-reduite", signals: signals(isOnHold: true, videoNotice: .reduced), hold: true, notice: .reduced),
        ]
    }

    func test_everyNamedVector_givesTheExpectedPills() {
        for vector in vectors {
            let pills = CallServicePillLaw.of(vector.signals)
            XCTAssertEqual(pills.isHoldShown, vector.hold, "\(vector.name) : En attente")
            XCTAssertEqual(pills.videoNotice, vector.notice, "\(vector.name) : Vidéo réduite")
        }
    }

    func test_vectorNames_areUnique_andAreTheAndroidNames() {
        let names = vectors.map(\.name)
        XCTAssertEqual(Set(names).count, names.count)
        XCTAssertEqual(names, [
            "repos", "attente-systeme", "attente-appel-audio", "attente-en-image-dans-l-image",
            "attente-pendant-la-reconnexion", "video-reduite", "faible-lumiere", "video-reduite-camera-coupee",
            "video-reduite-appel-audio", "video-reduite-en-image-dans-l-image", "video-reduite-avant-la-connexion",
            "attente-et-video-reduite",
        ])
    }

    func test_shownPills_areLinksOfTheBannerStack_holdBeforeVideo() {
        let both = CallServicePillLaw.of(signals(isOnHold: true, videoNotice: .lowLight))
        XCTAssertEqual(both.banners, [.hold, .videoNotice])
        XCTAssertEqual(CallTopBannerStack.ordered(both.banners), [.hold, .videoNotice])
        XCTAssertTrue(CallServicePillLaw.of(signals()).banners.isEmpty)
        XCTAssertEqual(CallServicePillLaw.of(signals(videoNotice: .reduced)).banners, [.videoNotice])
        XCTAssertEqual(CallServicePills.none, CallServicePillLaw.of(signals()))
    }

    /// E3 · E4 — ma vignette descend sous les pastilles et n'est jamais couverte, comme sous tout bandeau de la pile.
    func test_selfTile_sinksUnderBothPills() {
        let both = CallServicePillLaw.of(signals(isOnHold: true, videoNotice: .reduced))
        let counted = CallTopBannerStack.countedForSelfTile(isLocalScreenShareShown: false, isRecordingShown: false, isCaptureAlertShown: false, service: both.banners)
        XCTAssertEqual(counted, [.hold, .videoNotice])
        XCTAssertEqual(
            CallTopBannerStack.selfTileClearance(counted: counted, heights: [:]),
            2 * (CallTopBannerStack.bannerMinimumHeight + CallTopBannerStack.bannerGap)
        )
    }

    // MARK: - L'avis reçu : mêmes vecteurs que Android `CallThermalPlanTest`

    func test_videoNotice_followsTheThermalPlanVectors() {
        XCTAssertEqual(CallVideoNotice.of(thermal: .nominal, isLowLight: false), .none)
        XCTAssertEqual(CallVideoNotice.of(thermal: .fair, isLowLight: false), .none)
        XCTAssertEqual(CallVideoNotice.of(thermal: .serious, isLowLight: false), .reduced)
        XCTAssertEqual(CallVideoNotice.of(thermal: .critical, isLowLight: false), .reduced)
        XCTAssertEqual(CallVideoNotice.of(thermal: .serious, isLowLight: true), .reduced, "la chaleur passe avant la lumière")
        XCTAssertEqual(CallVideoNotice.of(thermal: .nominal, isLowLight: true), .lowLight)
    }

    // MARK: - La pile : rang, présence, grille de groupe

    func test_servicePills_sitAfterTheCapture_andBeforeTheLiveFrame() {
        XCTAssertEqual(
            CallTopBannerStack.ordered([.liveFrame, .videoNotice, .hold, .capture, .recording, .screenShare]),
            [.screenShare, .recording, .capture, .hold, .videoNotice, .liveFrame]
        )
    }

    func test_present_gathersTheServicePills_andOnlyThem() {
        XCTAssertEqual(
            CallTopBannerStack.present(isScreenShareShown: false, isRecordingShown: false, isCaptureAlertShown: false, isLiveFrameShown: true, service: [.hold, .videoNotice]),
            [.hold, .videoNotice, .liveFrame]
        )
        XCTAssertEqual(
            CallTopBannerStack.countedForSelfTile(isLocalScreenShareShown: false, isRecordingShown: false, isCaptureAlertShown: false, service: [.liveFrame, .screenShare]),
            [],
            "le paramètre ne porte que les pastilles de service"
        )
    }

    func test_groupGrid_yieldsItsPlaceToTheServicePills() {
        XCTAssertEqual(
            CallTopBannerStack.groupGridClearance(present: [.hold], heights: [:], isStageFullScreen: false),
            CallTopBannerStack.bannerMinimumHeight + CallTopBannerStack.bannerGap
        )
    }

    // MARK: - Loi 11 : les pastilles se rangent avec les autres bannières

    func test_servicePills_stowWithTheBanners() {
        let start = CallChromeVisibility()
        XCTAssertTrue(start.isVisible(.servicePill))
        XCTAssertFalse(start.toggled().isVisible(.servicePill), "le premier toucher la range")
        XCTAssertTrue(start.toggled().toggled().isVisible(.servicePill), "le second la rend")
        for state in [start, start.toggled(), CallChromeVisibility(isStageFullScreen: true), CallChromeVisibility(isModeActive: true)] {
            XCTAssertEqual(state.isVisible(.servicePill), state.isVisible(.captureAlert), "\(state)")
        }
    }

    // MARK: - Témoins de source : l'écran lit la loi en UN site, la pile dessine les deux maillons

    func test_stackView_drawsBothPillsAsLinksOfTheStack() throws {
        let stack = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift"))
        XCTAssertTrue(stack.contains("case .hold:"))
        XCTAssertTrue(stack.contains("case .videoNotice:"))
        XCTAssertTrue(stack.contains("CallHoldPill()"))
        XCTAssertTrue(stack.contains("CallVideoNoticePill(notice: servicePills.videoNotice)"))
        XCTAssertTrue(stack.contains("service: servicePills.banners"), "la présence de la pile compte les pastilles montrées")
        XCTAssertTrue(stack.contains("chrome.isVisible(.servicePill)"), "elles se rangent avec les bannières (loi 11)")
    }

    func test_pills_useTheSharedBannerGlass_reportTheirHeight_andAnnouncePolitely() throws {
        let pills = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallServicePillViews.swift"))
        XCTAssertTrue(pills.contains(".modifier(CallBannerGlass(shape: Capsule()))"), "le verre partagé des bandeaux de la pile")
        XCTAssertTrue(pills.contains(".modifier(CallTopBannerHeightReporter(banner: banner))"), "ma vignette descend de sa hauteur mesurée")
        XCTAssertTrue(pills.contains("AdaptiveAccessibility.announce(text, priority: .low)"), "annonce polie, à la suite de ce que lit VoiceOver")
        XCTAssertTrue(pills.contains(".frame(minHeight: CallTopBannerStack.bannerMinimumHeight)"))
        XCTAssertTrue(pills.contains("\"liveActivity.call.onHold\""), "« En attente » : le mot de l'îlot")
        XCTAssertTrue(pills.contains("\"call.video.notice.reduced\""))
        XCTAssertTrue(pills.contains("\"call.video.notice.lowLight\""))
        XCTAssertFalse(pills.contains(".font(.system(size:"))
        XCTAssertFalse(pills.contains("withAnimation"))
    }

    func test_callView_readsTheLawInOneSite_andMySelfTileAndTheGridYield() throws {
        let view = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView.swift"))
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "CallServicePills.live", in: view), 1, "UN site lit la loi pour l'écran")
        XCTAssertTrue(view.contains("servicePills: servicePills"), "la pile reçoit les pastilles")
        XCTAssertTrue(view.contains("isCaptureAlertShown: transcriptionService.captureJournal.alert != nil, service: servicePills.banners"), "ma vignette descend sous elles")
        XCTAssertTrue(view.contains("reduceMotion: reduceMotion, service: servicePills.banners"), "la grille de groupe leur cède sa place")
        let reader = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallServicePillViews.swift"))
        for signal in ["manager.isOnHold", "manager.isSystemPiPActive", "manager.isVideoUIActive", "manager.isVideoEnabled", "manager.thermalMonitor.currentState"] {
            XCTAssertTrue(reader.contains(signal), "le lecteur de la loi lit \(signal)")
        }
    }

    /// Le changement de chaleur republie l'appel : l'écran relit la loi sans attendre un autre événement.
    func test_thermalChange_republishesTheCall() throws {
        let src = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallCollaborators/CallVideoSuspension.swift"))
        let start = try XCTUnwrap(src.range(of: "nonisolated func thermalStateDidChange(to state: ProcessInfo.ThermalState) {"))
        let body = String(src[start.upperBound...].prefix(400))
        XCTAssertTrue(body.contains("self?.call?.objectWillChange.send()"))
    }
}
