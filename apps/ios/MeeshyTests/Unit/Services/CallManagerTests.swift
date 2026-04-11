import XCTest
@testable import Meeshy

// MARK: - CallState Tests

final class CallStateTests: XCTestCase {

    func test_idle_isNotActive() {
        XCTAssertFalse(CallState.idle.isActive)
    }

    func test_ringing_isActive() {
        XCTAssertTrue(CallState.ringing(isOutgoing: true).isActive)
        XCTAssertTrue(CallState.ringing(isOutgoing: false).isActive)
    }

    func test_connecting_isActive() {
        XCTAssertTrue(CallState.connecting.isActive)
    }

    func test_connected_isActive() {
        XCTAssertTrue(CallState.connected.isActive)
    }

    func test_ended_isNotActive() {
        XCTAssertFalse(CallState.ended(reason: .local).isActive)
        XCTAssertFalse(CallState.ended(reason: .remote).isActive)
        XCTAssertFalse(CallState.ended(reason: .rejected).isActive)
        XCTAssertFalse(CallState.ended(reason: .missed).isActive)
        XCTAssertFalse(CallState.ended(reason: .failed("error")).isActive)
    }

    func test_equatable() {
        XCTAssertEqual(CallState.idle, CallState.idle)
        XCTAssertEqual(CallState.connecting, CallState.connecting)
        XCTAssertEqual(CallState.connected, CallState.connected)
        XCTAssertEqual(CallState.ringing(isOutgoing: true), CallState.ringing(isOutgoing: true))
        XCTAssertNotEqual(CallState.ringing(isOutgoing: true), CallState.ringing(isOutgoing: false))
        XCTAssertNotEqual(CallState.idle, CallState.connecting)
    }
}

// MARK: - WebRTC Types Tests

final class WebRTCTypesTests: XCTestCase {

    func test_sessionDescription_codable() throws {
        let desc = SessionDescription(type: .offer, sdp: "v=0\r\n...")
        let data = try JSONEncoder().encode(desc)
        let decoded = try JSONDecoder().decode(SessionDescription.self, from: data)
        XCTAssertEqual(decoded.type, .offer)
        XCTAssertEqual(decoded.sdp, "v=0\r\n...")
    }

    func test_iceCandidate_codable() throws {
        let candidate = IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:...")
        let data = try JSONEncoder().encode(candidate)
        let decoded = try JSONDecoder().decode(IceCandidate.self, from: data)
        XCTAssertEqual(decoded.sdpMid, "0")
        XCTAssertEqual(decoded.sdpMLineIndex, 0)
        XCTAssertEqual(decoded.candidate, "candidate:...")
    }

    func test_iceCandidate_nilSdpMid() throws {
        let candidate = IceCandidate(sdpMid: nil, sdpMLineIndex: 1, candidate: "candidate:...")
        let data = try JSONEncoder().encode(candidate)
        let decoded = try JSONDecoder().decode(IceCandidate.self, from: data)
        XCTAssertNil(decoded.sdpMid)
    }

    func test_sdpType_rawValues() {
        XCTAssertEqual(SDPType.offer.rawValue, "offer")
        XCTAssertEqual(SDPType.answer.rawValue, "answer")
        XCTAssertEqual(SDPType.prAnswer.rawValue, "pranswer")
    }

    func test_defaultIceServers_hasGoogleStun() {
        let servers = IceServer.defaultServers
        XCTAssertEqual(servers.count, 3)
        XCTAssertTrue(servers[0].urls.first?.contains("stun.l.google.com") ?? false)
    }

    func test_callMediaType_cases() {
        let audio = CallMediaType.audioOnly
        let video = CallMediaType.audioVideo
        XCTAssertNotNil(audio)
        XCTAssertNotNil(video)
    }

    func test_peerConnectionState_allCases() {
        let states: [PeerConnectionState] = [.new, .connecting, .connected, .disconnected, .failed, .closed]
        XCTAssertEqual(states.count, 6)
        XCTAssertEqual(PeerConnectionState.new.rawValue, "new")
        XCTAssertEqual(PeerConnectionState.connected.rawValue, "connected")
    }

    func test_webRTCError_descriptions() {
        let errors: [WebRTCError] = [
            .noPeerConnection,
            .failedToCreatePeerConnection,
            .failedToCreateSDP,
            .noCameraAvailable,
            .noCameraFormatAvailable,
            .notSupported
        ]
        for error in errors {
            XCTAssertNotNil(error.errorDescription)
            XCTAssertFalse(error.errorDescription!.isEmpty)
        }
    }
}

// MARK: - Mock WebRTC Client

final class MockWebRTCClient: WebRTCClientProviding {
    weak var delegate: (any WebRTCClientDelegate)?
    var isConnected: Bool = false
    var localVideoTrack: Any? = nil
    var remoteVideoTrack: Any? = nil

    var configureCallCount = 0
    var createOfferResult: Result<SessionDescription, Error> = .success(SessionDescription(type: .offer, sdp: "mock"))
    var createAnswerResult: Result<SessionDescription, Error> = .success(SessionDescription(type: .answer, sdp: "mock"))
    var disconnectCallCount = 0
    var toggleAudioCallCount = 0
    var toggleVideoCallCount = 0
    var lastAudioEnabled: Bool?
    var lastVideoEnabled: Bool?

    var audioEffectsService: CallAudioEffectsServiceProviding? = nil
    let videoFilterPipeline = VideoFilterPipeline()

    func configure(iceServers: [IceServer]) throws { configureCallCount += 1 }
    func createOffer() async throws -> SessionDescription { try createOfferResult.get() }
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription { try createAnswerResult.get() }
    func setRemoteAnswer(_ answer: SessionDescription) async throws {}
    func addIceCandidate(_ candidate: IceCandidate) async throws {}
    func startLocalMedia(type: CallMediaType) async throws {}
    func toggleAudio(_ enabled: Bool) { toggleAudioCallCount += 1; lastAudioEnabled = enabled }
    func toggleVideo(_ enabled: Bool) { toggleVideoCallCount += 1; lastVideoEnabled = enabled }
    func switchCamera() async throws {}
    func getStats() async -> CallStats? { nil }
    func createDataChannel(label: String) -> Bool { false }
    func sendDataChannelMessage(_ data: Data) {}
    func disconnect() { disconnectCallCount += 1; isConnected = false }
    func setAudioEffect(_ effect: AudioEffectConfig?) throws {}
    func updateAudioEffectParams(_ config: AudioEffectConfig) throws {}
}

final class MockWebRTCClientTests: XCTestCase {

    func test_mockCreateOffer_returnsConfiguredResult() async throws {
        let mock = MockWebRTCClient()
        mock.createOfferResult = .success(SessionDescription(type: .offer, sdp: "test-sdp"))
        let result = try await mock.createOffer()
        XCTAssertEqual(result.sdp, "test-sdp")
    }

    func test_mockToggleAudio_tracksCallCount() {
        let mock = MockWebRTCClient()
        mock.toggleAudio(false)
        XCTAssertEqual(mock.toggleAudioCallCount, 1)
        XCTAssertEqual(mock.lastAudioEnabled, false)
    }

    func test_mockDisconnect_updatesState() {
        let mock = MockWebRTCClient()
        mock.isConnected = true
        mock.disconnect()
        XCTAssertFalse(mock.isConnected)
        XCTAssertEqual(mock.disconnectCallCount, 1)
    }
}
