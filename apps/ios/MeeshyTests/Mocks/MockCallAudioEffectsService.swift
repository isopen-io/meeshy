import AVFoundation
@testable import Meeshy

final class MockCallAudioEffectsService: CallAudioEffectsServiceProviding {
    // MARK: - State

    var activeVoiceEffect: AudioEffectType?
    var isBackSoundActive = false
    var isAutoDegraded = false
    var isEffectsActive: Bool { activeVoiceEffect != nil || isBackSoundActive }

    // MARK: - Call Tracking

    var setEffectCallCount = 0
    var lastSetEffect: AudioEffectConfig?
    var setEffectResult: Result<Void, Error> = .success(())

    var updateParamsCallCount = 0
    var lastUpdateParams: AudioEffectConfig?
    var updateParamsResult: Result<Void, Error> = .success(())

    var processBufferCallCount = 0
    var resetCallCount = 0

    // MARK: - Protocol

    func setEffect(_ effect: AudioEffectConfig?) throws {
        setEffectCallCount += 1
        lastSetEffect = effect

        if let effect {
            if effect.isVoiceEffect {
                activeVoiceEffect = effect.effectType
            } else {
                isBackSoundActive = true
            }
        } else {
            activeVoiceEffect = nil
            isBackSoundActive = false
        }

        try setEffectResult.get()
    }

    func updateParams(_ config: AudioEffectConfig) throws {
        updateParamsCallCount += 1
        lastUpdateParams = config
        try updateParamsResult.get()
    }

    func processAudioBuffer(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer {
        processBufferCallCount += 1
        return buffer
    }

    func reset() {
        resetCallCount += 1
        activeVoiceEffect = nil
        isBackSoundActive = false
        isAutoDegraded = false
    }
}
