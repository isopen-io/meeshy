//
//  AnswerWithoutVideoSourceGuardTests.swift
//  MeeshyTests
//
//  OPUS-5 — « Répondre sans vidéo » : la caméra démarrée à la sonnerie (pour
//  la vignette de l'écran entrant) ne doit JAMAIS partir au pair quand on
//  décroche sans vidéo. Le chemin passe par `RTCPeerConnection` et une vraie
//  caméra (non exerçable en test unitaire) : on garde la règle au niveau du
//  source, comme P2PWebRTCClientVideoTrackStateSourceTests.
//

import XCTest
@testable import Meeshy

final class AnswerWithoutVideoSourceGuardTests: XCTestCase {

    private static func source(_ relative: String) -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent(relative)
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }

    private static let client = source("Meeshy/Features/Call/Services/WebRTC/P2PWebRTCClient.swift")
    private static let answer = source("Meeshy/Features/Call/Services/CallManager+Answer.swift")
    private static let withholding = source("Meeshy/Features/Call/Services/CallAnswerWithoutVideo.swift")
    private static let view = source("Meeshy/Features/Call/Views/IncomingCallView.swift")

    private func slice(_ text: String, from start: String, to end: String, file: StaticString = #filePath, line: UInt = #line) -> String? {
        guard let s = text.range(of: start) else {
            XCTFail("Marqueur introuvable : \(start)", file: file, line: line); return nil
        }
        guard let e = text.range(of: end, range: s.upperBound..<text.endIndex) else {
            XCTFail("Marqueur introuvable : \(end)", file: file, line: line); return nil
        }
        return String(text[s.lowerBound..<e.lowerBound])
    }

    // MARK: - Client WebRTC

    func test_answererDoesNotReattachAWithheldCamera() {
        guard let fn = slice(Self.client, from: "private func attachAnswererTracks(on pc: RTCPeerConnection) {", to: "func forceSendRecv(") else { return }
        XCTAssertTrue(
            fn.contains("if let video = localVideoTrack_, !localVideoWithheld {"),
            "La réponse ne rattache la caméra que si elle n'a pas été retirée : sinon « Répondre sans vidéo » renverrait l'image."
        )
    }

    func test_disableWithholds_enableReleases_disconnectResets() {
        guard let disable = slice(Self.client, from: "func disableLocalVideo() async -> Bool {", to: "/// Restarts the existing capturer"),
              let enable = slice(Self.client, from: "func enableLocalVideo() async throws -> Bool {", to: "/// Mid-call video→audio downgrade.") else { return }
        XCTAssertTrue(disable.contains("localVideoWithheld = true"))
        XCTAssertTrue(enable.contains("localVideoWithheld = false"))
        XCTAssertTrue(
            Self.client.contains("localVideoTrack_ = nil\n        localVideoWithheld = false"),
            "La fin d'appel remet le retrait à zéro : l'appel suivant envoie sa caméra normalement."
        )
    }

    // MARK: - CallManager

    func test_answerWithholdsTheCameraBeforeCreatingTheAnswer() {
        guard let fn = slice(Self.answer, from: "func answerBufferedOffer(", to: "/// Who answers the caller's offer") else { return }
        guard let withhold = fn.range(of: "await CallAnswerWithoutVideo(call: self).withholdLocalVideoIfDeclined(callId: callId)"),
              let create = fn.range(of: "self.webRTCService.createAnswer(from: remoteOffer)") else {
            XCTFail("answerBufferedOffer doit retirer la caméra puis créer la réponse"); return
        }
        XCTAssertLessThan(withhold.lowerBound, create.lowerBound, "La caméra est retirée AVANT createAnswer.")
    }

    func test_withholdTellsThePeerAndCallKit() {
        guard let fn = slice(Self.withholding, from: "func withholdLocalVideoIfDeclined(", to: "\n    }\n}") else { return }
        XCTAssertTrue(fn.contains("guard !call.isVideoEnabled"), "Sans effet quand la vidéo est voulue.")
        XCTAssertTrue(fn.contains("call.webRTCService.downgradeFromVideo()"))
        XCTAssertTrue(fn.contains("emitCallToggleVideo(callId: callId, enabled: false)"), "Le pair affiche notre avatar.")
        XCTAssertTrue(fn.contains("update.hasVideo = false"), "CallKit range l'appel en audio.")
    }

    func test_answerWithoutVideo_dropsTheIntentThenAnswers() {
        guard let fn = slice(Self.withholding, from: "func answer() {", to: "func withholdLocalVideoIfDeclined(") else { return }
        guard let intent = fn.range(of: "call.isVideoEnabled = false"), let answer = fn.range(of: "call.answerCall()") else {
            XCTFail("answerCallWithoutVideo pose l'intention puis répond"); return
        }
        XCTAssertLessThan(intent.lowerBound, answer.lowerBound)
    }

    // MARK: - Écran entrant

    func test_incomingView_wiresTheNewButtonAndThePreview() {
        XCTAssertTrue(Self.view.contains("IncomingCallChoices.actions(isVideoCall:"))
        XCTAssertTrue(Self.view.contains("CallAnswerWithoutVideo(call: callManager).answer()"))
        XCTAssertTrue(Self.view.contains("call.incoming.answerNoVideo.label"))
        XCTAssertTrue(Self.view.contains("LocalCameraVideoView("), "La vignette lit la piste locale déjà ouverte à la sonnerie.")
    }

    // MARK: - Avant de décrocher (P17, #16945)

    func test_accept_followsThePreAnswerRoute_thenAppliesTheMicrophoneChoice() {
        guard let fn = slice(Self.view, from: "private func acceptCall() {", to: "private func acceptCallWithoutVideo() {") else { return }
        guard let route = fn.range(of: "preAnswer.route(isVideoCall: callManager.isVideoEnabled)"),
              let mute = fn.range(of: "applyMicrophoneChoice()") else {
            XCTFail("Répondre suit la caméra choisie, puis pose le micro choisi"); return
        }
        XCTAssertLessThan(route.lowerBound, mute.lowerBound, "Le micro se coupe APRÈS la réponse, jamais avant.")
        XCTAssertTrue(fn.contains("CallAnswerWithoutVideo(call: callManager).answer()"), "Caméra coupée ⇒ « Répondre sans vidéo ».")
    }

    func test_answerWithoutVideo_keepsTheMicrophoneChoice() {
        guard let fn = slice(Self.view, from: "private func acceptCallWithoutVideo() {", to: "var body: some View") else { return }
        XCTAssertTrue(fn.contains("applyMicrophoneChoice()"))
    }

    func test_microphoneChoice_mutesOnlyAnAnsweredCall_throughTheSharedToggle() {
        guard let fn = slice(Self.view, from: "private func applyMicrophoneChoice() {", to: "/// Tranche les permissions") else { return }
        XCTAssertTrue(fn.contains("callManager.callState == .connecting"), "Rien ne se coupe si la réponse n'est pas partie.")
        XCTAssertTrue(fn.contains("callManager.toggleMute()"), "Le même chemin que la pilule : CallKit, pair et piste naissante suivent.")
    }

    func test_incomingView_wiresThePreAnswerBar_andMyColor() {
        XCTAssertTrue(Self.view.contains("IncomingPreAnswerBar("))
        XCTAssertTrue(Self.view.contains("cameraChosen: preAnswer.cameraOn"), "Caméra coupée ⇒ ma vignette s'efface.")
        XCTAssertTrue(Self.view.contains("CallSpeakerColor.color(for: key)"), "Le liseré de ma vignette porte MA couleur (loi 4).")
    }

    func test_answerWithoutVideo_alsoGuardsTheMicrophone() {
        guard let fn = slice(Self.view, from: "private func acceptCallWithoutVideo() {", to: "var body: some View") else { return }
        XCTAssertTrue(fn.contains("MediaPermissionCoordinator.ensureMicrophone()"))
        XCTAssertTrue(fn.contains("callManager.endCall()"))
        XCTAssertFalse(fn.contains("ensureCamera"), "Répondre sans vidéo ne demande jamais la caméra.")
    }
}
