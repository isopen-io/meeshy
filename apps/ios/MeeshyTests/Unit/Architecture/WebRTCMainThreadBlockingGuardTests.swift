import XCTest

/// #17039 — garde de source : les appels WebRTC qui attendent les fils internes
/// de libwebrtc (fermeture d'une `RTCPeerConnection` ou d'un canal de données,
/// détachement d'une piste d'un émetteur ou d'un rendu, `sender.parameters`)
/// ne s'exécutent plus sur le fil principal. Les rapports HangTracer de
/// l'iPhone du porteur les y mesuraient jusqu'à 6,37 s. Ces sites remettent le
/// travail à `CallEngineQueue` ; l'état Swift, lui, se vide sur place.
///
/// Comportement non jouable en test unitaire (une vraie connexion WebRTC
/// négociée est requise pour que `close()` bloque) : la garde lit la source.
final class WebRTCMainThreadBlockingGuardTests: XCTestCase {

    private static let iosRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Architecture/
        .deletingLastPathComponent()   // Unit/
        .deletingLastPathComponent()   // MeeshyTests/
        .deletingLastPathComponent()   // ios/

    private func source(_ relativePath: String, file: StaticString = #filePath, line: UInt = #line) -> String {
        let url = Self.iosRoot.appendingPathComponent(relativePath)
        guard let text = try? String(contentsOf: url, encoding: .utf8), !text.isEmpty else {
            XCTFail("Source illisible : \(relativePath)", file: file, line: line)
            return ""
        }
        return text
    }

    private func body(of relativePath: String, from startMarker: String, to endMarker: String,
                      file: StaticString = #filePath, line: UInt = #line) -> String {
        let text = source(relativePath, file: file, line: line)
        guard let start = text.range(of: startMarker) else {
            XCTFail("Marqueur de début introuvable dans \(relativePath) : \"\(startMarker)\"", file: file, line: line)
            return ""
        }
        guard let end = text.range(of: endMarker, range: start.upperBound..<text.endIndex) else {
            XCTFail("Marqueur de fin introuvable dans \(relativePath) : \"\(endMarker)\"", file: file, line: line)
            return ""
        }
        return String(text[start.lowerBound..<end.lowerBound])
    }

    private func assertHandsOffBefore(_ blockingCall: String, in fn: String, site: String,
                                      file: StaticString = #filePath, line: UInt = #line) {
        guard let hand = fn.range(of: "CallEngineQueue.run") else {
            XCTFail("\(site) doit remettre ses appels WebRTC bloquants à CallEngineQueue", file: file, line: line)
            return
        }
        guard let call = fn.range(of: blockingCall) else {
            XCTFail("\(site) : appel « \(blockingCall) » introuvable — mettre la garde à jour", file: file, line: line)
            return
        }
        XCTAssertTrue(hand.lowerBound < call.lowerBound,
                      "\(site) : « \(blockingCall) » doit s'exécuter DANS le travail remis à CallEngineQueue, jamais sur le fil principal",
                      file: file, line: line)
    }

    private func callsOnMainThread(_ statement: String, in fn: String) -> Bool {
        fn.split(separator: "\n").contains { $0.trimmingCharacters(in: .whitespaces).hasPrefix(statement) }
    }

    // MARK: - P2PWebRTCClient.disconnect (raccrocher 1:1)

    private let p2pPath = "Meeshy/Features/Call/Services/WebRTC/P2PWebRTCClient.swift"

    func test_p2pDisconnect_closesPeerConnectionOnTheCallEngineQueue() {
        let fn = body(of: p2pPath, from: "func disconnect() {", to: "func disconnectAfterFlushingPendingSend()")
        XCTAssertFalse(callsOnMainThread("peerConnection?.close()", in: fn),
                       "disconnect() fermait la RTCPeerConnection sur le fil principal (1,05 à 1,24 s mesurés)")
        XCTAssertFalse(callsOnMainThread("transcriptionDataChannel?.close()", in: fn),
                       "la fermeture du canal de données attend aussi le fil de signalisation")
        XCTAssertFalse(callsOnMainThread("audioTransceiver?.sender.track = nil", in: fn) || callsOnMainThread("videoTransceiver?.sender.track = nil", in: fn),
                       "le détachement des pistes d'émission attend aussi les fils de libwebrtc")
        assertHandsOffBefore(".close()", in: fn, site: "P2PWebRTCClient.disconnect()")
    }

    func test_p2pDisconnect_clearsSwiftStateSynchronously() {
        let fn = body(of: p2pPath, from: "func disconnect() {", to: "func disconnectAfterFlushingPendingSend()")
        XCTAssertTrue(fn.contains("sessionGeneration += 1"), "la génération de session doit avancer sur place")
        XCTAssertTrue(fn.contains("peerConnection = nil"),
                      "peerConnection doit tomber à nil SUR PLACE : les rappels de l'ancienne connexion sont écartés par identité, et un nouvel appel peut configurer aussitôt")
    }

    // MARK: - WebRTCGroupPeerLink.close (quitter un appel de groupe, aperçu)

    func test_groupLinkClose_closesPeerConnectionOnTheCallEngineQueue() {
        let fn = body(of: "Meeshy/Features/Call/Services/WebRTC/WebRTCGroupPeerLink.swift",
                      from: "func close() {", to: "// MARK: - Négociation")
        XCTAssertFalse(callsOnMainThread("peerConnection?.close()", in: fn),
                       "WebRTCGroupPeerLink.close() fermait la RTCPeerConnection sur le fil principal (0,74 à 1,02 s mesurés)")
        XCTAssertFalse(callsOnMainThread("controlChannel?.close()", in: fn))
        XCTAssertTrue(fn.contains("peerConnection = nil"))
        assertHandsOffBefore(".close()", in: fn, site: "WebRTCGroupPeerLink.close()")
    }

    // MARK: - WebRTCSenderEncoding (changer de profil réseau, budget du maillage)

    private let encodingPath = "Meeshy/Features/Call/Services/WebRTC/P2PWebRTCClient+SenderEncoding.swift"

    func test_applyVideo_setsSenderParametersOnTheCallEngineQueue() {
        let fn = body(of: encodingPath, from: "static func applyVideo(", to: "static func applyAudio(")
        assertHandsOffBefore("sender.parameters", in: fn, site: "WebRTCSenderEncoding.applyVideo")
    }

    func test_applyAudio_setsSenderParametersOnTheCallEngineQueue() {
        let fn = body(of: encodingPath, from: "static func applyAudio(", to: "// MARK: - VideoDegradationPreference")
        assertHandsOffBefore("sender.parameters", in: fn, site: "WebRTCSenderEncoding.applyAudio")
    }

    // MARK: - WebRTCVideoView (démontage d'une vue vidéo)

    private let videoViewPath = "Meeshy/Features/Main/Views/WebRTCVideoView.swift"

    func test_videoView_neverAttachesOrDetachesTheTrackOnTheMainThread() {
        let text = source(videoViewPath)
        XCTAssertFalse(text.contains(".remove(uiView)"), "RTCVideoTrack.remove attend le fil de travail de libwebrtc (1,02 s mesurés au démontage)")
        XCTAssertFalse(text.contains(".add(uiView)"))
        XCTAssertFalse(text.contains("track.add(view)"))
    }

    func test_videoViewDismantle_detachesThroughTheGate() {
        let fn = body(of: videoViewPath, from: "static func dismantleUIView(", to: "func makeCoordinator()")
        XCTAssertTrue(fn.contains("coordinator.detach()"), "dismantleUIView doit détacher la piste par la porte de rendu")
        XCTAssertFalse(fn.contains(".remove("))
        let detach = body(of: videoViewPath, from: "func detach() {", to: "\n        }\n")
        XCTAssertTrue(detach.contains("gate?.detach()"), "le coordinateur détache par la porte, jamais par track.remove")
    }

    func test_gateDetach_closesSynchronouslyThenHandsTheRemovalOff() {
        let fn = body(of: "Meeshy/Features/Call/Services/WebRTC/CallVideoRendererGate.swift",
                      from: "func detach() {", to: "// MARK: - RTCVideoRenderer")
        guard let close = fn.range(of: "close()") else {
            return XCTFail("detach() doit fermer la porte SUR PLACE : une vue démontée ne reçoit plus d'image")
        }
        assertHandsOffBefore(".remove(", in: fn, site: "CallVideoRendererGate.detach()")
        if let hand = fn.range(of: "CallEngineQueue.run") {
            XCTAssertTrue(close.lowerBound < hand.lowerBound, "fermer la porte AVANT de remettre le détachement")
        }
    }

    func test_gateAttach_addsTheRendererOnTheCallEngineQueue() {
        let fn = body(of: "Meeshy/Features/Call/Services/WebRTC/CallVideoRendererGate.swift",
                      from: "static func attach(", to: "func detach() {")
        assertHandsOffBefore(".add(", in: fn, site: "CallVideoRendererGate.attach")
    }
}
