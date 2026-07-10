import XCTest
import AVFoundation
@testable import Meeshy

/// Thread-safe value holder for capturing results from `@Sendable` closures in XCTest.
/// `@unchecked Sendable` is safe here because `XCTestExpectation.wait` provides the
/// happens-before ordering between the background write and the main-thread assertion.
private final class Captured<T>: @unchecked Sendable {
    var value: T?
}

@MainActor
final class MeeshyAudioProcessingModuleTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        effectsService: CallAudioEffectsServiceProviding? = nil
    ) -> MeeshyAudioProcessingModule {
        MeeshyAudioProcessingModule(
            effectsService: effectsService ?? MockCallAudioEffectsService()
        )
    }

    private func makeBuffer(
        frameCount: AVAudioFrameCount = 1024,
        sampleRate: Double = 48000,
        channels: UInt32 = 1
    ) -> AVAudioPCMBuffer {
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: channels)!
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
        buffer.frameLength = frameCount
        if let data = buffer.floatChannelData {
            for ch in 0..<Int(channels) {
                for i in 0..<Int(frameCount) {
                    data[ch][i] = sin(Float(i) * 0.1)
                }
            }
        }
        return buffer
    }

    // MARK: - Initial State

    func test_init_hasNoEffectsActive() {
        let sut = makeSUT()
        XCTAssertFalse(sut.isEffectsActive)
    }

    // MARK: - Pass-Through

    func test_processBuffer_withoutEffects_passesThrough() {
        let mock = MockCallAudioEffectsService()
        let sut = makeSUT(effectsService: mock)

        let buffer = makeBuffer()
        let originalFirstSample = buffer.floatChannelData![0][0]

        sut.processAudioBuffer(buffer)

        XCTAssertEqual(mock.processBufferCallCount, 0)
        XCTAssertEqual(buffer.floatChannelData![0][0], originalFirstSample)
    }

    // MARK: - Effects Active

    func test_processBuffer_withEffects_routesThroughEffectChain() throws {
        let mock = MockCallAudioEffectsService()
        try mock.setEffect(.voiceCoder(.default))
        let sut = makeSUT(effectsService: mock)

        let buffer = makeBuffer()
        sut.processAudioBuffer(buffer)

        XCTAssertEqual(mock.processBufferCallCount, 1)
    }

    // MARK: - Clean Buffer Callback

    func test_processBuffer_feedsCleanBufferToCallback() {
        let mock = MockCallAudioEffectsService()
        let sut = makeSUT(effectsService: mock)

        let expectation = expectation(description: "Clean buffer callback")
        let received = Captured<AVAudioPCMBuffer>()
        sut.onCleanAudioBuffer = { buffer in
            received.value = buffer
            expectation.fulfill()
        }

        let buffer = makeBuffer()
        sut.processAudioBuffer(buffer)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertNotNil(received.value)
        XCTAssertEqual(received.value?.frameLength, buffer.frameLength)
    }

    func test_processBuffer_alwaysCopiesBufferForCallback() {
        let mock = MockCallAudioEffectsService()
        let sut = makeSUT(effectsService: mock)

        let expectation = expectation(description: "Clean buffer callback")
        let received = Captured<AVAudioPCMBuffer>()
        sut.onCleanAudioBuffer = { buffer in
            received.value = buffer
            expectation.fulfill()
        }

        let buffer = makeBuffer()
        sut.processAudioBuffer(buffer)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertNotNil(received.value)
        XCTAssertFalse(received.value === buffer)
    }

    func test_processBuffer_cleanBufferHasOriginalSamples() throws {
        let mock = MockCallAudioEffectsService()
        try mock.setEffect(.voiceCoder(.default))
        let sut = makeSUT(effectsService: mock)

        let expectation = expectation(description: "Clean buffer callback")
        let received = Captured<AVAudioPCMBuffer>()
        sut.onCleanAudioBuffer = { buffer in
            received.value = buffer
            expectation.fulfill()
        }

        let buffer = makeBuffer()
        let originalFirstSample = buffer.floatChannelData![0][0]

        sut.processAudioBuffer(buffer)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertNotNil(received.value)
        XCTAssertEqual(received.value?.floatChannelData![0][0] ?? 0, originalFirstSample, accuracy: 0.001)
    }

    // MARK: - Effects Service Integration

    func test_effectsService_isAccessible() {
        let mock = MockCallAudioEffectsService()
        let sut = makeSUT(effectsService: mock)
        XCTAssertTrue(sut.effectsService === mock)
    }

    // MARK: - Multi-Channel Buffer

    func test_processBuffer_stereoBuffer_copiesAllChannels() {
        let mock = MockCallAudioEffectsService()
        let sut = makeSUT(effectsService: mock)

        let expectation = expectation(description: "Clean buffer callback")
        let received = Captured<AVAudioPCMBuffer>()
        sut.onCleanAudioBuffer = { buffer in
            received.value = buffer
            expectation.fulfill()
        }

        let stereoBuffer = makeBuffer(channels: 2)
        sut.processAudioBuffer(stereoBuffer)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertNotNil(received.value)
        XCTAssertEqual(received.value?.format.channelCount, 2)
    }

    // MARK: - No Callback

    func test_processBuffer_withoutCallback_doesNotCrash() {
        let mock = MockCallAudioEffectsService()
        let sut = makeSUT(effectsService: mock)
        sut.onCleanAudioBuffer = nil

        let buffer = makeBuffer()
        sut.processAudioBuffer(buffer)

        XCTAssertEqual(mock.processBufferCallCount, 0)
    }

    // MARK: - Effects Active State

    func test_isEffectsActive_reflectsEffectsService() throws {
        let mock = MockCallAudioEffectsService()
        let sut = makeSUT(effectsService: mock)

        XCTAssertFalse(sut.isEffectsActive)

        try mock.setEffect(.voiceCoder(.default))
        XCTAssertTrue(sut.isEffectsActive)

        mock.reset()
        XCTAssertFalse(sut.isEffectsActive)
    }

    // MARK: - Effects With Clean Buffer Copy

    func test_processBuffer_withEffectsAndCallback_copiesThenProcesses() throws {
        let mock = MockCallAudioEffectsService()
        try mock.setEffect(.voiceCoder(.default))
        let sut = makeSUT(effectsService: mock)

        let expectation = expectation(description: "Clean buffer callback")
        sut.onCleanAudioBuffer = { _ in
            expectation.fulfill()
        }

        let buffer = makeBuffer()
        sut.processAudioBuffer(buffer)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertEqual(mock.processBufferCallCount, 1)
    }
}
