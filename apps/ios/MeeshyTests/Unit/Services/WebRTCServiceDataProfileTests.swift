import XCTest
@testable import Meeshy

@MainActor
final class WebRTCServiceDataProfileTests: XCTestCase {

    private func makeSUT(faults: RecordingMediaFaults = RecordingMediaFaults()) -> (sut: WebRTCService, client: DataProfileRecordingClient, monitor: MockCallNetworkPathMonitor) {
        let client = DataProfileRecordingClient()
        let monitor = MockCallNetworkPathMonitor()
        let sut = WebRTCService(client: client, pathMonitor: monitor, mediaFaults: faults)
        return (sut, client, monitor)
    }

    private let cellular = CallNetworkPath(isExpensive: true, isConstrained: false)
    private let lowDataMode = CallNetworkPath(isExpensive: false, isConstrained: true)

    func test_configure_success_startsWatchingTheNetworkPath() {
        let (sut, _, monitor) = makeSUT()

        XCTAssertTrue(sut.configure(isVideo: true))

        XCTAssertEqual(monitor.startCallCount, 1)
    }

    func test_configure_failure_doesNotWatchThePath() {
        let (sut, client, monitor) = makeSUT()
        client.configureError = WebRTCError.noPeerConnection

        XCTAssertFalse(sut.configure(isVideo: true))

        XCTAssertEqual(monitor.startCallCount, 0)
    }

    func test_cellularPath_switchesTheClientToTheCellularProfile() {
        let (sut, client, monitor) = makeSUT()
        _ = sut.configure(isVideo: true)

        monitor.emit(cellular)

        XCTAssertEqual(sut.dataProfile, .cellular)
        XCTAssertEqual(client.appliedProfiles, [.cellular])
    }

    func test_cellularPath_capsTheLiveAudioSender() {
        let (sut, client, monitor) = makeSUT()
        _ = sut.configure(isVideo: true)

        monitor.emit(cellular)

        XCTAssertEqual(client.audioEncodings.last, CallDataProfile.cellular.budget.audio.maxAverageBitrateBps)
    }

    func test_cellularPath_capsTheLiveVideoSender() {
        let (sut, client, monitor) = makeSUT()
        _ = sut.configure(isVideo: true)

        monitor.emit(cellular)

        let budget = CallDataProfile.cellular.budget.video
        let applied = client.videoEncodings.last
        XCTAssertNotNil(applied)
        XCTAssertLessThanOrEqual(applied?.maxBitrateBps ?? .max, budget.maxBitrateBps)
        XCTAssertLessThanOrEqual(applied?.maxFramerate ?? .max, budget.maxFramerate)
        XCTAssertGreaterThanOrEqual(applied?.scaleResolutionDownBy ?? 0, budget.scaleResolutionDownBy)
    }

    /// #11292 — dans un appel de groupe, le pair principal est un encodage parmi
    /// d'autres : le plafond du maillage le borne aussi.
    func test_groupVideoCeiling_capsThePrimaryEncoding() {
        let (sut, client, _) = makeSUT()
        _ = sut.configure(isVideo: true)
        let plafond = CallVideoBudget.meshLink(encodes: 5)

        sut.setGroupVideoCeiling(plafond)

        let applied = client.videoEncodings.last
        XCTAssertLessThanOrEqual(applied?.maxBitrateBps ?? .max, plafond.maxBitrateBps)
        XCTAssertLessThanOrEqual(applied?.maxFramerate ?? .max, plafond.maxFramerate)
        XCTAssertGreaterThanOrEqual(applied?.scaleResolutionDownBy ?? 0, plafond.scaleResolutionDownBy)
    }

    func test_groupVideoCeiling_cleared_givesThePrimaryItsFullLadderBack() {
        let (sut, client, _) = makeSUT()
        _ = sut.configure(isVideo: true)
        sut.setGroupVideoCeiling(CallVideoBudget.meshLink(encodes: 5))

        sut.setGroupVideoCeiling(nil)

        XCTAssertEqual(client.videoEncodings.last?.maxFramerate, CallDataProfile.wifi.budget.video.maxFramerate)
    }

    /// #11293 — un palier qui n'envoie plus que du 360p rechoisit le format de la
    /// caméra, UNE fois, par le chemin sérialisé du changement de caméra.
    func test_dataSaverProfile_reselectsTheCaptureFormatOnce() async {
        let (sut, client, monitor) = makeSUT()
        client.liveCameraUniqueID = "cam-front"
        _ = sut.configure(isVideo: true)

        monitor.emit(lowDataMode)
        sut.setGroupVideoCeiling(CallVideoBudget.meshLink(encodes: 5))
        for _ in 0..<200 where client.switchedCameraIDs.isEmpty { await Task.yield() }

        XCTAssertEqual(client.switchedCameraIDs, ["cam-front"], "un seul rechoix tant que la capture reste réduite")
    }

    func test_lowDataModePath_selectsTheDataSaverProfile() {
        let (sut, client, monitor) = makeSUT()
        _ = sut.configure(isVideo: true)

        monitor.emit(lowDataMode)

        XCTAssertEqual(sut.dataProfile, .dataSaver)
        XCTAssertEqual(client.videoEncodings.last?.degradationPreference, .maintainResolution)
    }

    func test_samePathTwice_appliesTheProfileOnce() {
        let (sut, client, monitor) = makeSUT()
        _ = sut.configure(isVideo: true)

        monitor.emit(cellular)
        monitor.emit(cellular)

        XCTAssertEqual(client.appliedProfiles, [.cellular])
    }

    func test_startLocalMedia_onWifi_capsAudioToTheVoiceCeiling() async throws {
        let (sut, client, _) = makeSUT()

        try await sut.startLocalMedia(isVideo: false)

        XCTAssertEqual(client.audioEncodings.last, CallDataProfile.wifi.budget.audio.maxAverageBitrateBps)
    }

    func test_createOffer_onCellular_capsTheSendersTheOfferJustCreated() async {
        let (sut, client, monitor) = makeSUT()
        _ = sut.configure(isVideo: true)
        monitor.emit(cellular)
        let videoBefore = client.videoEncodings.count

        _ = await sut.createOffer()

        let budget = CallDataProfile.cellular.budget
        XCTAssertGreaterThan(client.videoEncodings.count, videoBefore, "the offerer's transceivers only exist once the offer is built")
        XCTAssertLessThanOrEqual(client.videoEncodings.last?.maxBitrateBps ?? .max, budget.video.maxBitrateBps)
        XCTAssertEqual(client.audioEncodings.last, budget.audio.maxAverageBitrateBps)
    }

    func test_createAnswer_onDataSaver_capsTheSendersTheAnswerJustAttached() async {
        let (sut, client, monitor) = makeSUT()
        _ = sut.configure(isVideo: true)
        monitor.emit(lowDataMode)
        let videoBefore = client.videoEncodings.count

        _ = await sut.createAnswer(from: SessionDescription(type: .offer, sdp: "offer"))

        let budget = CallDataProfile.dataSaver.budget
        XCTAssertGreaterThan(client.videoEncodings.count, videoBefore, "the answerer attaches its tracks while building the answer")
        XCTAssertLessThanOrEqual(client.videoEncodings.last?.maxBitrateBps ?? .max, budget.video.maxBitrateBps)
        XCTAssertEqual(client.audioEncodings.last, budget.audio.maxAverageBitrateBps)
    }

    // MARK: - Media faults (#8698)

    func test_startLocalMedia_failure_reportsTheCaptureFault() async {
        let faults = RecordingMediaFaults()
        let (sut, client, _) = makeSUT(faults: faults)
        client.startLocalMediaError = WebRTCError.noPeerConnection

        _ = try? await sut.startLocalMedia(isVideo: true)

        XCTAssertEqual(faults.stages, ["local-media.video"])
    }

    func test_upgradeToVideo_failure_reportsTheCameraFault() async {
        let faults = RecordingMediaFaults()
        let (sut, client, _) = makeSUT(faults: faults)
        client.enableLocalVideoError = WebRTCError.cameraPermissionDenied

        _ = try? await sut.upgradeToVideo()

        XCTAssertEqual(faults.stages, ["camera"])
    }

    func test_switchCamera_failure_reportsTheCameraSwitchFault() async {
        let faults = RecordingMediaFaults()
        let (sut, client, _) = makeSUT(faults: faults)
        client.switchCameraError = WebRTCError.notSupported
        let switched = expectation(description: "switch resolved")
        let outcome = SwitchOutcome()

        sut.switchCamera { succeeded in
            outcome.succeeded = succeeded
            switched.fulfill()
        }
        await fulfillment(of: [switched], timeout: 1)

        XCTAssertEqual(outcome.succeeded, false)
        XCTAssertEqual(faults.stages, ["camera-switch"])
    }

    func test_switchCamera_success_reportsNothing() async {
        let faults = RecordingMediaFaults()
        let (sut, _, _) = makeSUT(faults: faults)
        let switched = expectation(description: "switch resolved")

        sut.switchCamera { _ in switched.fulfill() }
        await fulfillment(of: [switched], timeout: 1)

        XCTAssertTrue(faults.stages.isEmpty)
    }

    func test_close_stopsWatchingAndResetsToWifi() {
        let (sut, client, monitor) = makeSUT()
        _ = sut.configure(isVideo: true)
        monitor.emit(cellular)

        sut.close()

        XCTAssertEqual(monitor.stopCallCount, 1)
        XCTAssertEqual(sut.dataProfile, .wifi)
        XCTAssertEqual(sut.networkPath, .unrestricted)
        XCTAssertEqual(client.appliedProfiles.last, .wifi)
    }
}

// MARK: - Doubles

private final class SwitchOutcome: @unchecked Sendable {
    var succeeded: Bool?
}

private final class RecordingMediaFaults: CallMediaFaultReporting {
    private(set) var stages: [String] = []

    func report(stage: String, error: Error) {
        stages.append(stage)
    }
}

private final class MockCallNetworkPathMonitor: CallNetworkPathProviding {
    private(set) var startCallCount = 0
    private(set) var stopCallCount = 0
    private var onChange: (@MainActor @Sendable (CallNetworkPath) -> Void)?

    func start(onChange: @escaping @MainActor @Sendable (CallNetworkPath) -> Void) {
        startCallCount += 1
        self.onChange = onChange
    }

    func stop() {
        stopCallCount += 1
        onChange = nil
    }

    @MainActor
    func emit(_ path: CallNetworkPath) {
        onChange?(path)
    }
}

private struct RecordedVideoEncoding {
    let maxBitrateBps: Int
    let maxFramerate: Int
    let scaleResolutionDownBy: Double
    let degradationPreference: VideoDegradationPreference
}

// MARK: - #11468 — une offre arrivée après le décroché, ou rejouée

/// La passerelle rejoue l'offre et les candidats ICE à chaque (re)jonction d'un
/// appareil (#11468) : le client ne dépend d'aucun ordre entre eux, et un rejeu
/// exact ne relance pas la négociation.
@MainActor
final class WebRTCServiceLateOfferTests: XCTestCase {

    private func makeSUT() -> (sut: WebRTCService, client: DataProfileRecordingClient) {
        let client = DataProfileRecordingClient()
        let sut = WebRTCService(client: client, pathMonitor: MockCallNetworkPathMonitor(), mediaFaults: RecordingMediaFaults())
        return (sut, client)
    }

    private func settle(until condition: () -> Bool) async {
        for _ in 0..<200 where !condition() { await Task.yield() }
    }

    func test_candidatesReceivedBeforeTheLateOffer_reachTheLinkOnceItIsAnswered() async {
        let (sut, client) = makeSUT()
        sut.configure(isVideo: false)
        sut.addICECandidate(IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:early"))
        XCTAssertTrue(client.addedCandidateDescriptions.map(\.candidate).isEmpty, "sans description distante, un candidat attend")

        let answer = await sut.createAnswer(from: SessionDescription(type: .offer, sdp: "offer-v1"))

        XCTAssertNotNil(answer)
        await settle { !client.addedCandidateDescriptions.map(\.candidate).isEmpty }
        XCTAssertEqual(client.addedCandidateDescriptions.map(\.candidate), ["candidate:early"])
    }

    func test_replayedOffer_getsTheSameAnswer_withoutRenegotiating() async {
        let (sut, client) = makeSUT()
        let offer = SessionDescription(type: .offer, sdp: "offer-v1")

        let first = await sut.createAnswer(from: offer)
        let replayed = await sut.createAnswer(from: offer)

        XCTAssertEqual(client.answeredOfferDescriptions.map(\.sdp), ["offer-v1"])
        XCTAssertEqual(replayed?.sdp, first?.sdp)
    }

    func test_newOffer_isAnswered_evenAfterAnEarlierOne() async {
        let (sut, client) = makeSUT()
        _ = await sut.createAnswer(from: SessionDescription(type: .offer, sdp: "offer-v1"))
        _ = await sut.createAnswer(from: SessionDescription(type: .offer, sdp: "offer-v2"))
        XCTAssertEqual(client.answeredOfferDescriptions.map(\.sdp), ["offer-v1", "offer-v2"])
    }

    func test_closedLink_forgetsTheAnsweredOffer() async {
        let (sut, client) = makeSUT()
        let offer = SessionDescription(type: .offer, sdp: "offer-v1")
        _ = await sut.createAnswer(from: offer)
        sut.close()
        _ = await sut.createAnswer(from: offer)
        XCTAssertEqual(client.answeredOfferDescriptions.map(\.sdp), ["offer-v1", "offer-v1"])
    }
}

private nonisolated final class DataProfileRecordingClient: WebRTCClientProviding, CallDataProfileApplying {
    weak var delegate: (any WebRTCClientDelegate)?
    var localVideoTrack: Any?
    var remoteVideoTrack: Any?
    let videoFilterPipeline = VideoFilterPipeline()
    var hasLocalVideoTrack = false

    var configureError: Error?
    var startLocalMediaError: Error?
    var enableLocalVideoError: Error?
    var switchCameraError: Error?
    var liveCameraUniqueID: String?
    private(set) var switchedCameraIDs: [String] = []
    private(set) var appliedProfiles: [CallDataProfile] = []
    private(set) var audioEncodings: [Int] = []
    private(set) var videoEncodings: [RecordedVideoEncoding] = []

    func applyDataProfile(_ profile: CallDataProfile) {
        appliedProfiles.append(profile)
    }

    func configure(iceServers: [IceServer]) throws {
        if let configureError { throw configureError }
    }

    func updateIceServers(_ iceServers: [IceServer]) {}
    func setNegotiationRole(isPolite: Bool) {}
    func createOffer() async throws -> SessionDescription { SessionDescription(type: .offer, sdp: "offer") }
    func restartIce() {}
    private(set) var answeredOfferDescriptions: [SessionDescription] = []
    private(set) var addedCandidateDescriptions: [IceCandidate] = []
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription {
        answeredOfferDescriptions.append(offer)
        return SessionDescription(type: .answer, sdp: "answer-\(answeredOfferDescriptions.count)")
    }
    func setRemoteAnswer(_ answer: SessionDescription) async throws {}
    func addIceCandidate(_ candidate: IceCandidate) async throws { addedCandidateDescriptions.append(candidate) }
    func startLocalMedia(type: CallMediaType) async throws {
        if let startLocalMediaError { throw startLocalMediaError }
    }
    func toggleAudio(_ enabled: Bool) {}
    func toggleVideo(_ enabled: Bool) {}

    func applyVideoEncoding(maxBitrateBps: Int, maxFramerate: Int, scaleResolutionDownBy: Double, degradationPreference: VideoDegradationPreference) {
        videoEncodings.append(RecordedVideoEncoding(
            maxBitrateBps: maxBitrateBps,
            maxFramerate: maxFramerate,
            scaleResolutionDownBy: scaleResolutionDownBy,
            degradationPreference: degradationPreference
        ))
    }

    func applyAudioEncoding(maxBitrateBps: Int) {
        audioEncodings.append(maxBitrateBps)
    }

    func enableLocalVideo() async throws -> Bool {
        if let enableLocalVideoError { throw enableLocalVideoError }
        return false
    }
    func disableLocalVideo() async -> Bool { false }
    func switchCamera() async throws {
        if let switchCameraError { throw switchCameraError }
    }
    func availableCameras() -> [CameraDeviceOption] { [] }
    func switchToCamera(uniqueID: String) async throws { switchedCameraIDs.append(uniqueID) }
    func getStats() async -> CallStats? { nil }
    func createDataChannel(label: String) -> Bool { true }
    func sendDataChannelMessage(_ data: Data) {}
    func sendDTMF(digits: String) {}
    func disconnect() {}
    func disconnectAfterFlushingPendingSend() {}
}
