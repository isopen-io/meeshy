import XCTest
import AVFoundation
@testable import Meeshy

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
        var receivedBuffer: AVAudioPCMBuffer?
        sut.onCleanAudioBuffer = { buffer in
            receivedBuffer = buffer
            expectation.fulfill()
        }

        let buffer = makeBuffer()
        sut.processAudioBuffer(buffer)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertNotNil(receivedBuffer)
        XCTAssertEqual(receivedBuffer?.frameLength, buffer.frameLength)
    }

    func test_processBuffer_alwaysCopiesBufferForCallback() {
        let mock = MockCallAudioEffectsService()
        let sut = makeSUT(effectsService: mock)

        let expectation = expectation(description: "Clean buffer callback")
        var receivedBuffer: AVAudioPCMBuffer?
        sut.onCleanAudioBuffer = { buffer in
            receivedBuffer = buffer
            expectation.fulfill()
        }

        let buffer = makeBuffer()
        sut.processAudioBuffer(buffer)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertNotNil(receivedBuffer)
        XCTAssertFalse(receivedBuffer === buffer)
    }

    func test_processBuffer_cleanBufferHasOriginalSamples() throws {
        let mock = MockCallAudioEffectsService()
        try mock.setEffect(.voiceCoder(.default))
        let sut = makeSUT(effectsService: mock)

        let expectation = expectation(description: "Clean buffer callback")
        var receivedBuffer: AVAudioPCMBuffer?
        sut.onCleanAudioBuffer = { buffer in
            receivedBuffer = buffer
            expectation.fulfill()
        }

        let buffer = makeBuffer()
        let originalFirstSample = buffer.floatChannelData![0][0]

        sut.processAudioBuffer(buffer)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertNotNil(receivedBuffer)
        XCTAssertEqual(receivedBuffer?.floatChannelData![0][0], originalFirstSample, accuracy: 0.001)
    }

    // MARK: - Effects Service Integration

    func test_effectsService_isAccessible() {
        let mock = MockCallAudioEffectsService()
        let sut = makeSUT(effectsService: mock)
        XCTAssertTrue(sut.effectsService === mock)
    }
}
