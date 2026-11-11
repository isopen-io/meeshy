import XCTest
import Combine
import MeeshyUI
@testable import Meeshy

// MARK: - #8788 — un pair sans image n'est pas « en chargement »

@MainActor
final class CallRemoteVideoSurfaceTests: XCTestCase {

    func test_resolve_trackAndCameraOn_isLive() {
        XCTAssertEqual(CallRemoteVideoSurface.resolve(hasTrack: true, peerVideoEnabled: true, waitElapsed: false), .live)
    }

    func test_resolve_trackButCameraOff_isCameraOff() {
        XCTAssertEqual(CallRemoteVideoSurface.resolve(hasTrack: true, peerVideoEnabled: false, waitElapsed: false), .cameraOff)
    }

    func test_resolve_noTrackAndPeerAnnouncedCameraOff_isCameraOff() {
        XCTAssertEqual(CallRemoteVideoSurface.resolve(hasTrack: false, peerVideoEnabled: false, waitElapsed: false), .cameraOff)
    }

    func test_resolve_noTrackWithinTheWait_isConnecting() {
        XCTAssertEqual(CallRemoteVideoSurface.resolve(hasTrack: false, peerVideoEnabled: true, waitElapsed: false), .connecting)
    }

    func test_resolve_noTrackPastTheWait_isCameraOff_neverAnEndlessSpinner() {
        XCTAssertEqual(CallRemoteVideoSurface.resolve(hasTrack: false, peerVideoEnabled: true, waitElapsed: true), .cameraOff)
    }

    func test_resolve_trackArrivesAfterTheWait_isLive() {
        XCTAssertEqual(CallRemoteVideoSurface.resolve(hasTrack: true, peerVideoEnabled: true, waitElapsed: true), .live)
    }

    // MARK: - G4.6 — l'image cède la place à l'avatar en fondu

    func test_fade_isShortUnderReduceMotion_andNeverInstant() {
        XCTAssertGreaterThan(CallRemoteVideoFade.duration(reduceMotion: true), 0)
        XCTAssertLessThan(
            CallRemoteVideoFade.duration(reduceMotion: true),
            CallRemoteVideoFade.duration(reduceMotion: false)
        )
    }

    func test_remoteSurfaceSwitch_fadesOnOpacityAlone_neverAHardSwap() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        let start = try XCTUnwrap(source.range(of: "switch remoteVideoSurface {"))
        let stage = String(source[start.lowerBound...].prefix(1200))
        XCTAssertEqual(stage.components(separatedBy: ".transition(.opacity)").count - 1, 3, "chaque face entre et sort en fondu")
        XCTAssertTrue(stage.contains("CallRemoteVideoFade.duration(reduceMotion: reduceMotion)"))
        XCTAssertTrue(stage.contains("value: remoteVideoSurface"), "le fondu suit la face, sans animer le reste de la scène")
    }

    // MARK: - G4.2 — l'anneau de parole de la caméra coupée

    func test_peerSpeech_atRest_hasNoRing() {
        XCTAssertFalse(CallPeerSpeech().isSpeaking)
        XCTAssertFalse(CallPeerSpeech().recording(level: 0.01, at: Date()).isSpeaking)
        XCTAssertFalse(CallPeerSpeech().recording(level: nil, at: Date()).isSpeaking)
    }

    func test_peerSpeech_aboveTheThreshold_ringsUp() {
        XCTAssertTrue(CallPeerSpeech().recording(level: 0.3, at: Date()).isSpeaking)
    }

    func test_peerSpeech_holdsBetweenSyllables_thenFallsSilent() {
        let t0 = Date(timeIntervalSince1970: 1_000)
        let speaking = CallPeerSpeech().recording(level: 0.3, at: t0)
        XCTAssertTrue(speaking.recording(level: 0.0, at: t0.addingTimeInterval(0.4)).isSpeaking)
        XCTAssertTrue(speaking.recording(level: nil, at: t0.addingTimeInterval(0.4)).isSpeaking)
        XCTAssertFalse(speaking.recording(level: 0.0, at: t0.addingTimeInterval(2)).isSpeaking)
    }

    func test_peerSpeech_ringColor_isThePersonsOwn_theSameAsTheirCaptions() {
        XCTAssertEqual(CallPeerSpeech.colorHex(forPeer: "karim"), CallSpeakerColor.hex(for: "karim"))
        XCTAssertNotEqual(CallPeerSpeech.colorHex(forPeer: "karim"), CallPeerSpeech.colorHex(forPeer: "amina"))
        XCTAssertEqual(CallPeerSpeech.colorHex(forPeer: nil), MeeshyColors.brandPrimaryHex)
    }

    func test_cameraOffPlaceholder_ringAppearsOnlyWhileSpeaking_aboveTheKeptProfileDecor() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        let start = try XCTUnwrap(source.range(of: "struct CallRemoteCameraOffPlaceholder<Avatar: View>: View {"))
        let body = String(source[start.lowerBound...].prefix(2400))
        XCTAssertEqual(body.components(separatedBy: ".opacity(isSpeaking ? 1 : 0)").count - 1, 2, "halo et anneau, absents au repos")
        XCTAssertTrue(body.contains("CallPeerSpeech.colorHex(forPeer: peerUserId)"))
        XCTAssertTrue(try AppSourceGuard.callViewSource().contains(".avatarRingWithin(ProfileDecorResolver.ring("), "la décoration de profil reste dans le visage")
    }

    // MARK: - G4.2 — un seul relevé du niveau reçu par appel

    func test_peerSpeech_inADuo_isSampledHere() {
        XCTAssertNil(CallPeerSpeech.relayed(meshActive: false, speakers: ["karim"], peer: "karim"))
    }

    func test_peerSpeech_inAGroupStillShownAsADuo_isRelayedFromTheMesh_neverSampledTwice() {
        XCTAssertEqual(CallPeerSpeech.relayed(meshActive: true, speakers: ["karim"], peer: "karim"), true)
        XCTAssertEqual(CallPeerSpeech.relayed(meshActive: true, speakers: ["amina"], peer: "karim"), false)
        XCTAssertEqual(CallPeerSpeech.relayed(meshActive: true, speakers: ["karim"], peer: nil), false)
    }

    func test_cameraOffPlaceholder_samplesOnlyWhenTheMeshDoesNot() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        let mount = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private var remoteCameraOffPlaceholder: some View", in: source))
        XCTAssertTrue(mount.contains("CallPeerSpeech.relayed(meshActive: mesh.isGroupCallActive, speakers: mesh.speakingUserIds"))
        let placeholder = try XCTUnwrap(DeclarationBodyScanner.body(containing: "struct CallRemoteCameraOffPlaceholder<Avatar: View>: View", in: source))
        XCTAssertTrue(placeholder.contains(".task(id: relayedSpeaking == nil)"), "le relevé local s'arrête dès que le maillage relaie")
        XCTAssertTrue(placeholder.contains("relayedSpeaking ?? sampledSpeaking"))
    }
}

@MainActor
final class CallVideoFallbackTests: XCTestCase {

    func test_classify_simulator_continuesAudioOnly() {
        XCTAssertEqual(CallVideoFallback.classify(WebRTCError.simulatorVideoUnsupported), .simulator)
    }

    func test_classify_cameraRefused_continuesAudioOnly() {
        XCTAssertEqual(CallVideoFallback.classify(WebRTCError.cameraPermissionDenied), .cameraPermissionDenied)
    }

    func test_classify_macWithoutCamera_continuesAudioOnly_insteadOfEndingTheCall() {
        XCTAssertEqual(CallVideoFallback.classify(WebRTCError.noCameraAvailable), .noCamera)
        XCTAssertEqual(CallVideoFallback.classify(WebRTCError.noCameraFormatAvailable), .noCamera)
    }

    func test_classify_otherFailure_endsTheCall() {
        XCTAssertNil(CallVideoFallback.classify(WebRTCError.failedToCreatePeerConnection))
        XCTAssertNil(CallVideoFallback.classify(CancellationError()))
    }

    func test_performLocalMediaStart_routesEveryCameraFailureThroughTheAudioFallback() throws {
        let unit = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallManager.swift")
        )
        let start = try XCTUnwrap(
            DeclarationBodyScanner.body(containing: "func performLocalMediaStart(", in: unit)
        )
        XCTAssertTrue(start.contains("CallVideoFallback.classify(error)"))
        XCTAssertTrue(start.contains("continueAudioOnly(after:"))

        let fallback = try XCTUnwrap(
            DeclarationBodyScanner.body(containing: "func continueAudioOnly(", in: unit)
        )
        XCTAssertTrue(
            fallback.contains("emitCallToggleVideo(callId: callId, enabled: false)"),
            "le pair apprend la caméra coupée : son écran montre l'avatar au lieu d'attendre une image"
        )
        XCTAssertTrue(fallback.contains("isVideoEnabled = false"))
    }
}

// MARK: - #8787 — le micro coupé du correspondant se voit en vidéo

@MainActor
final class CallVideoBadgeAccessibilityTests: XCTestCase {

    private var muted: String {
        String(localized: "call.status.peer.muted", defaultValue: "Contact en sourdine", bundle: .main)
    }

    func test_label_peerMuted_saysTheContactIsMuted() {
        let label = CallVideoBadgeAccessibility.label(signalDegraded: nil, peerMuted: true, peerNetworkWeak: false, reconnecting: false)

        XCTAssertTrue(label.contains(muted))
        XCTAssertTrue(label.hasPrefix(String(localized: "call.duration.a11y.label")))
    }

    func test_label_peerSpeaking_saysNothingAboutMute() {
        let label = CallVideoBadgeAccessibility.label(signalDegraded: nil, peerMuted: false, peerNetworkWeak: false, reconnecting: false)

        XCTAssertFalse(label.contains(muted))
        XCTAssertEqual(label, String(localized: "call.duration.a11y.label"))
    }

    func test_label_everyState_keepsTheVisualOrder() {
        let label = CallVideoBadgeAccessibility.label(signalDegraded: "Signal faible", peerMuted: true, peerNetworkWeak: true, reconnecting: true)
        let parts = label.components(separatedBy: ", ")

        XCTAssertEqual(parts.count, 5)
        XCTAssertEqual(parts[1], "Signal faible")
        XCTAssertEqual(parts[2], muted)
    }

    func test_videoLayout_showsThePeerMutedBadgeOutsideTheFadingChrome() throws {
        let connected = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        let layout = try XCTUnwrap(DeclarationBodyScanner.body(containing: "var videoCallLayout: some View", in: connected))
        XCTAssertTrue(layout.contains("CallPeerMutedBadge(compact: false)"))
        XCTAssertFalse(layout.contains("callChromeVisibility"), "le glyphe reste quand le chrome s'efface")

        let label = try XCTUnwrap(DeclarationBodyScanner.body(containing: "var videoDurationBadgeAccessibilityLabel: String", in: connected))
        XCTAssertTrue(label.contains("peerMuted: !callManager.isRemoteAudioEnabled"))
    }
}

// MARK: - #8410 — en hauteur compacte, la pilule ne recouvre plus la grille

@MainActor
final class CallGroupStageSizingTests: XCTestCase {

    private let families = [
        CallActionFamilyRow(family: .myImage, actions: [.camera, .effects]),
        CallActionFamilyRow(family: .theCall, actions: [.captions, .journal, .addPeople]),
    ]

    func test_rows_compactHeight_foldIntoOneUntitledScrollingRow() {
        let rows = CallGroupStageSizing.rows(families, isCompactHeight: true)

        XCTAssertEqual(rows.count, 1)
        XCTAssertNil(rows[0].family)
        XCTAssertEqual(rows[0].actions, [.camera, .effects, .captions, .journal, .addPeople])
    }

    func test_rows_regularHeight_keepOneTitledRowPerFamily() {
        let rows = CallGroupStageSizing.rows(families, isCompactHeight: false)

        XCTAssertEqual(rows.map(\.family), [.myImage, .theCall])
        XCTAssertEqual(rows.map(\.actions), families.map(\.actions))
    }

    func test_rows_compactHeightWithoutActions_drawNoRow() {
        XCTAssertTrue(CallGroupStageSizing.rows([], isCompactHeight: true).isEmpty)
    }

    func test_isCompactHeight_landscapePhoneIsCompact_portraitAndIpadAreNot() {
        XCTAssertTrue(CallGroupStageSizing.isCompactHeight(393))
        XCTAssertFalse(CallGroupStageSizing.isCompactHeight(852))
        XCTAssertFalse(CallGroupStageSizing.isCompactHeight(820))
        XCTAssertFalse(CallGroupStageSizing.isCompactHeight(0), "pas encore mesurée : rien ne se replie")
    }

    /// 852×393 (#8410) : en-tête, grille au minimum, pilule repliée (rangée de
    /// base + une ligne d'actions) et marges tiennent dans la hauteur.
    func test_compactLandscape_gridMinimumAndFoldedPill_fitWithoutOverlap() {
        let height: CGFloat = 393
        let header: CGFloat = 8 + 52
        let foldedPill: CGFloat = 64 + 72
        let bottom: CGFloat = 12 + 21

        XCTAssertLessThanOrEqual(header + CallGroupStageSizing.minimumGridHeight + foldedPill + bottom, height)
    }

    func test_groupStage_keepsTheGridMinimumAndMeasuresItsHeightByPreference() throws {
        let connected = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        let stage = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private var groupStageLayout: some View", in: connected))
        XCTAssertTrue(stage.contains(".frame(minHeight: CallGroupStageSizing.minimumGridHeight)"))
        XCTAssertTrue(stage.contains(".onPreferenceChange(CallGroupStageHeightKey.self)"))
        XCTAssertFalse(stage.contains("safeAreaInsets"), "jamais lire la fenêtre depuis la vue")
    }
}

// MARK: - #8989 — l'écran d'appel n'est plus recalculé par le chronomètre

@MainActor
final class CallScreenTickTests: XCTestCase {

    func test_callDuration_tick_doesNotRecomputeWhatObservesTheManager() {
        let manager = CallManager.shared
        let previous = manager.callDuration
        var notifications = 0
        let subscription = manager.objectWillChange.sink { _ in notifications += 1 }
        defer {
            subscription.cancel()
            manager.callDuration = previous
        }

        manager.callDuration = previous + 1
        manager.callDuration = previous + 2

        XCTAssertEqual(notifications, 0, "un tick du chrono ne doit réévaluer ni l'écran d'appel ni la pilule")
    }

    func test_durationDisplays_redrawThemselvesUnderTheClock() throws {
        let sites = [
            "Meeshy/Features/Call/Views/CallView+Header.swift",
            "Meeshy/Features/Call/Views/FloatingCallPillView.swift",
            "Meeshy/Features/Main/Views/ConversationLayers/ConversationHeaderCallButton.swift",
        ]
        for site in sites {
            let source = try AppSourceGuard.unit(site)
            XCTAssertTrue(source.contains("CallDurationClock {"), "\(site) lit la durée sous `CallDurationClock`")
        }
        let connected = try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Connected.swift")
        XCTAssertEqual(connected.components(separatedBy: "CallDurationClock {").count - 1, 2,
                       "la disposition audio et son en-tête compact")
    }

    func test_audioRoute_isReadAndChangedOffTheMainThread() throws {
        let service = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallAudioRouteService.swift")
        )
        XCTAssertTrue(service.contains("@concurrent nonisolated static func readRoute() async"))
        XCTAssertTrue(service.contains("@concurrent nonisolated static func applyPreferredInput(id: String) async throws"))
    }

    func test_transcriptionEngineTeardown_leavesTheMainThread() throws {
        let source = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallTranscriptionService.swift")
        )
        let stop = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private func stopLocalCapture()", in: source))
        XCTAssertTrue(stop.contains("Self.engineTeardownQueue.async(execute: teardown)"))
        XCTAssertFalse(stop.contains("audioEngine.stop()"), "plus de démontage synchrone au geste")

        let start = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private func startLocalCapture()", in: source))
        XCTAssertTrue(start.contains("awaitEngineTeardown()"), "jamais d'installTap sur un bus encore équipé")
    }
}
