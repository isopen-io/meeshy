import XCTest
import AVFoundation
@testable import Meeshy

final class CallAudioEffectsServiceTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT() -> CallAudioEffectsService {
        CallAudioEffectsService()
    }

    private func makeBuffer(
        frameCount: AVAudioFrameCount = 1024,
        sampleRate: Double = 48000,
        channels: UInt32 = 1
    ) -> AVAudioPCMBuffer {
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: channels)!
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
        buffer.frameLength = frameCount
        if let channelData = buffer.floatChannelData {
            for ch in 0..<Int(channels) {
                for i in 0..<Int(frameCount) {
                    channelData[ch][i] = Float.random(in: -1...1)
                }
            }
        }
        return buffer
    }

    // MARK: - Initial State

    func test_init_hasNoActiveEffect() {
        let sut = makeSUT()
        XCTAssertNil(sut.activeVoiceEffect)
        XCTAssertFalse(sut.isBackSoundActive)
        XCTAssertFalse(sut.isAutoDegraded)
        XCTAssertFalse(sut.isEffectsActive)
    }

    // MARK: - Set Effect

    func test_setEffect_voiceCoder_activatesVoiceEffect() throws {
        let sut = makeSUT()
        try sut.setEffect(.voiceCoder(.default))
        XCTAssertEqual(sut.activeVoiceEffect, .voiceCoder)
        XCTAssertTrue(sut.isEffectsActive)
    }

    func test_setEffect_babyVoice_activatesVoiceEffect() throws {
        let sut = makeSUT()
        try sut.setEffect(.babyVoice(.default))
        XCTAssertEqual(sut.activeVoiceEffect, .babyVoice)
    }

    func test_setEffect_demonVoice_activatesVoiceEffect() throws {
        let sut = makeSUT()
        try sut.setEffect(.demonVoice(.default))
        XCTAssertEqual(sut.activeVoiceEffect, .demonVoice)
    }

    func test_setEffect_nil_clearsAllEffects() throws {
        let sut = makeSUT()
        try sut.setEffect(.voiceCoder(.default))
        try sut.setEffect(nil)
        XCTAssertNil(sut.activeVoiceEffect)
        XCTAssertFalse(sut.isEffectsActive)
    }

    // MARK: - Mutual Exclusivity

    func test_mutualExclusivity_settingBabyVoiceReplacesVoiceCoder() throws {
        let sut = makeSUT()
        try sut.setEffect(.voiceCoder(.default))
        try sut.setEffect(.babyVoice(.default))
        XCTAssertEqual(sut.activeVoiceEffect, .babyVoice)
    }

    func test_mutualExclusivity_settingDemonVoiceReplacesBabyVoice() throws {
        let sut = makeSUT()
        try sut.setEffect(.babyVoice(.default))
        try sut.setEffect(.demonVoice(.default))
        XCTAssertEqual(sut.activeVoiceEffect, .demonVoice)
    }

    func test_mutualExclusivity_settingVoiceCoderReplacesDemonVoice() throws {
        let sut = makeSUT()
        try sut.setEffect(.demonVoice(.default))
        try sut.setEffect(.voiceCoder(.default))
        XCTAssertEqual(sut.activeVoiceEffect, .voiceCoder)
    }

    // MARK: - BackSound Combination

    func test_backSound_combinesWithVoiceEffect() throws {
        let sut = makeSUT()
        try sut.setEffect(.voiceCoder(.default))
        try sut.setEffect(.backSound(.default))
        XCTAssertEqual(sut.activeVoiceEffect, .voiceCoder)
        XCTAssertTrue(sut.isBackSoundActive)
    }

    func test_backSound_canBeActiveAlone() throws {
        let sut = makeSUT()
        try sut.setEffect(.backSound(.default))
        XCTAssertNil(sut.activeVoiceEffect)
        XCTAssertTrue(sut.isBackSoundActive)
        XCTAssertTrue(sut.isEffectsActive)
    }

    func test_settingVoiceEffect_doesNotClearBackSound() throws {
        let sut = makeSUT()
        try sut.setEffect(.backSound(.default))
        try sut.setEffect(.voiceCoder(.default))
        XCTAssertEqual(sut.activeVoiceEffect, .voiceCoder)
        XCTAssertTrue(sut.isBackSoundActive)
    }

    func test_clearingVoiceEffect_doesNotClearBackSound() throws {
        let sut = makeSUT()
        try sut.setEffect(.voiceCoder(.default))
        try sut.setEffect(.backSound(.default))
        sut.clearVoiceEffect()
        XCTAssertNil(sut.activeVoiceEffect)
        XCTAssertTrue(sut.isBackSoundActive)
    }

    func test_clearingBackSound_doesNotClearVoiceEffect() throws {
        let sut = makeSUT()
        try sut.setEffect(.voiceCoder(.default))
        try sut.setEffect(.backSound(.default))
        sut.clearBackSound()
        XCTAssertEqual(sut.activeVoiceEffect, .voiceCoder)
        XCTAssertFalse(sut.isBackSoundActive)
    }

    // MARK: - Update Params

    func test_updateParams_voiceCoder_updatesPitch() throws {
        let sut = makeSUT()
        try sut.setEffect(.voiceCoder(.default))
        var updated = VoiceCoderParams.default
        updated.pitch = 5.0
        try sut.updateParams(.voiceCoder(updated))
        XCTAssertEqual(sut.activeVoiceEffect, .voiceCoder)
    }

    func test_updateParams_withoutActiveEffect_throws() {
        let sut = makeSUT()
        XCTAssertThrowsError(try sut.updateParams(.voiceCoder(.default)))
    }

    func test_updateParams_mismatchedType_throws() throws {
        let sut = makeSUT()
        try sut.setEffect(.voiceCoder(.default))
        XCTAssertThrowsError(try sut.updateParams(.babyVoice(.default)))
    }

    // MARK: - Process Audio Buffer

    func test_processBuffer_withoutEffect_returnsSameBuffer() {
        let sut = makeSUT()
        let buffer = makeBuffer()
        let result = sut.processAudioBuffer(buffer)
        XCTAssertEqual(result.frameLength, buffer.frameLength)
        XCTAssertEqual(result.format, buffer.format)
    }

    func test_processBuffer_withEffect_returnsBufferWithSameFormat() throws {
        let sut = makeSUT()
        try sut.setEffect(.voiceCoder(VoiceCoderParams(
            pitch: 4, harmonization: false, strength: 80,
            retuneSpeed: 50, scale: .major, key: .C, naturalVibrato: 50
        )))
        let buffer = makeBuffer()
        let result = sut.processAudioBuffer(buffer)
        XCTAssertEqual(result.format.sampleRate, buffer.format.sampleRate)
        XCTAssertEqual(result.format.channelCount, buffer.format.channelCount)
    }

    // MARK: - Auto-Degradation

    func test_autoDegradation_triggersAfterConsecutiveOverBudget() throws {
        let sut = makeSUT()
        try sut.setEffect(.demonVoice(.default))

        for _ in 0..<AudioEffectsConstants.overBudgetThreshold {
            sut.reportProcessingTime(ms: AudioEffectsConstants.maxProcessingTimeMs + 1)
        }

        XCTAssertTrue(sut.isAutoDegraded)
    }

    func test_autoDegradation_doesNotTriggerBelowThreshold() throws {
        let sut = makeSUT()
        try sut.setEffect(.demonVoice(.default))

        for _ in 0..<(AudioEffectsConstants.overBudgetThreshold - 1) {
            sut.reportProcessingTime(ms: AudioEffectsConstants.maxProcessingTimeMs + 1)
        }

        XCTAssertFalse(sut.isAutoDegraded)
    }

    func test_autoDegradation_restoresAfterConsecutiveUnderBudget() throws {
        let sut = makeSUT()
        try sut.setEffect(.demonVoice(.default))

        for _ in 0..<AudioEffectsConstants.overBudgetThreshold {
            sut.reportProcessingTime(ms: AudioEffectsConstants.maxProcessingTimeMs + 1)
        }
        XCTAssertTrue(sut.isAutoDegraded)

        for _ in 0..<AudioEffectsConstants.underBudgetThreshold {
            sut.reportProcessingTime(ms: AudioEffectsConstants.restoreBudgetMs - 0.5)
        }
        XCTAssertFalse(sut.isAutoDegraded)
    }

    // MARK: - Reset

    func test_reset_clearsAllState() throws {
        let sut = makeSUT()
        try sut.setEffect(.voiceCoder(.default))
        try sut.setEffect(.backSound(.default))
        sut.reset()
        XCTAssertNil(sut.activeVoiceEffect)
        XCTAssertFalse(sut.isBackSoundActive)
        XCTAssertFalse(sut.isAutoDegraded)
        XCTAssertFalse(sut.isEffectsActive)
    }

    // MARK: - Node Chain Verification

    func test_voiceCoder_nodeChain_containsTimePitch() throws {
        let sut = makeSUT()
        try sut.setEffect(.voiceCoder(.default))
        XCTAssertTrue(sut.activeNodeChain.contains(where: { $0 is AVAudioUnitTimePitch }))
    }

    func test_babyVoice_nodeChain_containsTimePitch() throws {
        let sut = makeSUT()
        try sut.setEffect(.babyVoice(.default))
        XCTAssertTrue(sut.activeNodeChain.contains(where: { $0 is AVAudioUnitTimePitch }))
    }

    func test_demonVoice_nodeChain_containsDistortionAndReverb() throws {
        let sut = makeSUT()
        try sut.setEffect(.demonVoice(.default))
        XCTAssertTrue(sut.activeNodeChain.contains(where: { $0 is AVAudioUnitTimePitch }))
        XCTAssertTrue(sut.activeNodeChain.contains(where: { $0 is AVAudioUnitDistortion }))
        XCTAssertTrue(sut.activeNodeChain.contains(where: { $0 is AVAudioUnitReverb }))
    }

    func test_voiceCoder_setsCorrectPitch() throws {
        let sut = makeSUT()
        let params = VoiceCoderParams(
            pitch: 5, harmonization: false, strength: 50,
            retuneSpeed: 50, scale: .chromatic, key: .C, naturalVibrato: 50
        )
        try sut.setEffect(.voiceCoder(params))
        let timePitch = sut.activeNodeChain.first(where: { $0 is AVAudioUnitTimePitch }) as? AVAudioUnitTimePitch
        XCTAssertEqual(timePitch?.pitch, 5 * 100, accuracy: 0.01)
    }

    func test_demonVoice_setsNegativePitch() throws {
        let sut = makeSUT()
        try sut.setEffect(.demonVoice(DemonVoiceParams(pitch: -10, distortion: 50, reverb: 50)))
        let timePitch = sut.activeNodeChain.first(where: { $0 is AVAudioUnitTimePitch }) as? AVAudioUnitTimePitch
        XCTAssertEqual(Float(timePitch?.pitch ?? 0), Float(-10 * 100), accuracy: 0.01)
    }
}
