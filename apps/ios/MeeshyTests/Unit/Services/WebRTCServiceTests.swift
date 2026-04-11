import XCTest
@testable import Meeshy

final class WebRTCServiceTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT() -> (sut: WebRTCService, client: TestableWebRTCClient) {
        let client = TestableWebRTCClient()
        let sut = WebRTCService(client: client)
        return (sut, client)
    }

    // MARK: - Initial State

    func test_init_connectionStateIsNew() {
        let (sut, _) = makeSUT()
        XCTAssertEqual(sut.connectionState, .new)
    }

    func test_init_defaultBitrateIsSet() {
        let (sut, _) = makeSUT()
        XCTAssertEqual(sut.currentBitrate, QualityThresholds.defaultBitrate)
    }

    func test_init_qualityLevelIsExcellent() {
        let (sut, _) = makeSUT()
        XCTAssertEqual(sut.currentQualityLevel, .excellent)
    }

    // MARK: - ICE Candidate Buffering

    func test_addICECandidate_beforeRemoteDescription_buffersCandidate() {
        let (sut, client) = makeSUT()
        let candidate = IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:test")
        sut.addICECandidate(candidate)
        XCTAssertEqual(client.addIceCandidateCallCount, 0)
    }

    func test_addICECandidate_afterSetRemoteDescription_forwardsToClient() async {
        let (sut, client) = makeSUT()
        let desc = SessionDescription(type: .answer, sdp: "v=0\r\n")
        await sut.setRemoteDescription(desc)

        let candidate = IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:test")
        sut.addICECandidate(candidate)

        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertGreaterThanOrEqual(client.addIceCandidateCallCount, 1)
    }

    // MARK: - Create Offer

    func test_createOffer_success_returnsSessionDescription() async {
        let (sut, client) = makeSUT()
        client.createOfferResult = .success(SessionDescription(type: .offer, sdp: "offer-sdp"))

        let result = await sut.createOffer()

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.type, .offer)
        XCTAssertEqual(result?.sdp, "offer-sdp")
    }

    func test_createOffer_failure_returnsNil() async {
        let (sut, client) = makeSUT()
        client.createOfferResult = .failure(WebRTCError.noPeerConnection)

        let result = await sut.createOffer()

        XCTAssertNil(result)
    }

    // MARK: - Create Answer

    func test_createAnswer_success_returnsSessionDescription() async {
        let (sut, client) = makeSUT()
        client.createAnswerResult = .success(SessionDescription(type: .answer, sdp: "answer-sdp"))

        let offer = SessionDescription(type: .offer, sdp: "offer-sdp")
        let result = await sut.createAnswer(from: offer)

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.type, .answer)
    }

    func test_createAnswer_failure_returnsNil() async {
        let (sut, client) = makeSUT()
        client.createAnswerResult = .failure(WebRTCError.failedToCreateSDP)

        let offer = SessionDescription(type: .offer, sdp: "offer-sdp")
        let result = await sut.createAnswer(from: offer)

        XCTAssertNil(result)
    }

    // MARK: - Media Controls

    func test_muteAudio_true_callsToggleAudioWithFalse() {
        let (sut, client) = makeSUT()
        sut.muteAudio(true)
        XCTAssertEqual(client.lastAudioEnabled, false)
    }

    func test_muteAudio_false_callsToggleAudioWithTrue() {
        let (sut, client) = makeSUT()
        sut.muteAudio(false)
        XCTAssertEqual(client.lastAudioEnabled, true)
    }

    func test_enableVideo_callsToggleVideo() {
        let (sut, client) = makeSUT()
        sut.enableVideo(true)
        XCTAssertEqual(client.lastVideoEnabled, true)
    }

    // MARK: - Close

    func test_close_setsConnectionStateToClosed() {
        let (sut, client) = makeSUT()
        sut.close()
        XCTAssertEqual(sut.connectionState, .closed)
        XCTAssertEqual(client.disconnectCallCount, 1)
    }

    // MARK: - ICE Restart

    func test_performICERestart_returnsNewOffer() async {
        let (sut, client) = makeSUT()
        client.createOfferResult = .success(SessionDescription(type: .offer, sdp: "restart-offer"))

        let result = await sut.performICERestart()

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.sdp, "restart-offer")
    }

    // MARK: - Transcription Channel

    func test_createTranscriptionChannel_delegatesToClient() {
        let (sut, client) = makeSUT()
        client.createDataChannelResult = true
        let result = sut.createTranscriptionChannel()
        XCTAssertTrue(result)
        XCTAssertEqual(client.lastDataChannelLabel, "transcription")
    }

    // MARK: - Connection State Delegate

    func test_connectionStateChange_updatesConnectionState() {
        let (sut, client) = makeSUT()
        client.delegate?.webRTCClient(client, didChangeConnectionState: .connected)
        XCTAssertEqual(sut.connectionState, .connected)
    }
}

// MARK: - Testable WebRTC Client

private final class TestableWebRTCClient: WebRTCClientProviding {
    weak var delegate: (any WebRTCClientDelegate)?
    var isConnected: Bool = false
    var localVideoTrack: Any? = nil
    var remoteVideoTrack: Any? = nil

    var configureCallCount = 0
    var createOfferResult: Result<SessionDescription, Error> = .success(SessionDescription(type: .offer, sdp: "mock"))
    var createAnswerResult: Result<SessionDescription, Error> = .success(SessionDescription(type: .answer, sdp: "mock"))
    var addIceCandidateCallCount = 0
    var disconnectCallCount = 0
    var lastAudioEnabled: Bool?
    var lastVideoEnabled: Bool?
    var createDataChannelResult = false
    var lastDataChannelLabel: String?
    var lastSentData: Data?

    var audioEffectsService: CallAudioEffectsServiceProviding? = nil
    let videoFilterPipeline = VideoFilterPipeline()

    func configure(iceServers: [IceServer]) throws { configureCallCount += 1 }
    func createOffer() async throws -> SessionDescription { try createOfferResult.get() }
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription { try createAnswerResult.get() }
    func setRemoteAnswer(_ answer: SessionDescription) async throws {}
    func addIceCandidate(_ candidate: IceCandidate) async throws { addIceCandidateCallCount += 1 }
    func startLocalMedia(type: CallMediaType) async throws {}
    func toggleAudio(_ enabled: Bool) { lastAudioEnabled = enabled }
    func toggleVideo(_ enabled: Bool) { lastVideoEnabled = enabled }
    func switchCamera() async throws {}
    func getStats() async -> CallStats? { nil }
    func createDataChannel(label: String) -> Bool {
        lastDataChannelLabel = label
        return createDataChannelResult
    }
    func sendDataChannelMessage(_ data: Data) { lastSentData = data }
    func disconnect() { disconnectCallCount += 1; isConnected = false }
    func setAudioEffect(_ effect: AudioEffectConfig?) throws {}
    func updateAudioEffectParams(_ config: AudioEffectConfig) throws {}
}
