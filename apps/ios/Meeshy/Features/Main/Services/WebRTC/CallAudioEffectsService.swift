import AVFoundation
import os

// MARK: - Call Audio Effects Service

final class CallAudioEffectsService: CallAudioEffectsServiceProviding {

    // MARK: - Published State

    private(set) var activeVoiceEffect: AudioEffectType?
    private(set) var isBackSoundActive = false
    private(set) var isAutoDegraded = false

    var isEffectsActive: Bool { activeVoiceEffect != nil || isBackSoundActive }

    // MARK: - Node Chain (exposed for testing)

    private(set) var activeNodeChain: [AVAudioNode] = []

    // MARK: - Engine & Nodes

    private let engine = AVAudioEngine()
    private var voiceEffectNodes: [AVAudioNode] = []
    private var backSoundPlayerNode: AVAudioPlayerNode?
    private var backSoundMixerNode: AVAudioMixerNode?
    private var mainMixerNode: AVAudioMixerNode?

    // MARK: - Current Config

    private var currentVoiceConfig: AudioEffectConfig?
    private var currentBackSoundConfig: BackSoundParams?

    // MARK: - Performance Monitoring

    private var consecutiveOverBudgetFrames = 0
    private var consecutiveUnderBudgetFrames = 0
    private(set) var lastProcessingTimeMs: Double?

    // MARK: - Set Effect

    func setEffect(_ effect: AudioEffectConfig?) throws {
        guard let effect else {
            clearAllEffects()
            return
        }

        if effect.isVoiceEffect {
            try setVoiceEffect(effect)
        } else if case .backSound(let params) = effect {
            try setBackSound(params)
        }
    }

    func clearVoiceEffect() {
        tearDownVoiceNodes()
        currentVoiceConfig = nil
        activeVoiceEffect = nil
        activeNodeChain = voiceEffectNodes
        Logger.audioEffects.info("Voice effect cleared")
    }

    func clearBackSound() {
        tearDownBackSoundNodes()
        currentBackSoundConfig = nil
        isBackSoundActive = false
        Logger.audioEffects.info("BackSound cleared")
    }

    // MARK: - Update Params

    func updateParams(_ config: AudioEffectConfig) throws {
        guard config.isVoiceEffect else {
            if case .backSound(let params) = config, isBackSoundActive {
                updateBackSoundParams(params)
                return
            }
            throw AudioEffectsError.invalidParams("No matching effect active for update")
        }

        guard let active = activeVoiceEffect, active == config.effectType else {
            throw AudioEffectsError.invalidParams(
                "Cannot update \(config.effectType.rawValue): no matching voice effect active"
            )
        }

        applyVoiceParams(config)
        currentVoiceConfig = config
        Logger.audioEffects.info("Updated params for \(config.effectType.rawValue)")
    }

    // MARK: - Process Audio Buffer

    func processAudioBuffer(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer {
        guard isEffectsActive, !isAutoDegraded else { return buffer }

        let start = CACurrentMediaTime()
        let processed = renderThroughEffectChain(buffer)
        let elapsed = (CACurrentMediaTime() - start) * 1000
        lastProcessingTimeMs = elapsed
        reportProcessingTime(ms: elapsed)

        return processed
    }

    // MARK: - Reset

    func reset() {
        clearAllEffects()
        consecutiveOverBudgetFrames = 0
        consecutiveUnderBudgetFrames = 0
        isAutoDegraded = false
        lastProcessingTimeMs = nil
        Logger.audioEffects.info("Audio effects service reset")
    }

    // MARK: - Performance Monitoring

    func reportProcessingTime(ms: Double) {
        if ms > AudioEffectsConstants.maxProcessingTimeMs {
            consecutiveOverBudgetFrames += 1
            consecutiveUnderBudgetFrames = 0
            if consecutiveOverBudgetFrames >= AudioEffectsConstants.overBudgetThreshold && !isAutoDegraded {
                isAutoDegraded = true
                Logger.audioEffects.warning(
                    "Audio effects auto-degraded: \(ms, privacy: .public)ms exceeds \(AudioEffectsConstants.maxProcessingTimeMs)ms budget"
                )
            }
        } else if ms < AudioEffectsConstants.restoreBudgetMs {
            consecutiveUnderBudgetFrames += 1
            if consecutiveUnderBudgetFrames >= AudioEffectsConstants.underBudgetThreshold && isAutoDegraded {
                isAutoDegraded = false
                consecutiveOverBudgetFrames = 0
                Logger.audioEffects.info("Audio effects restored from auto-degradation")
            }
        } else {
            consecutiveUnderBudgetFrames = 0
        }
    }

    // MARK: - Private — Voice Effect Setup

    private func setVoiceEffect(_ config: AudioEffectConfig) throws {
        tearDownVoiceNodes()

        let nodes: [AVAudioNode]
        switch config {
        case .voiceCoder(let params):
            nodes = buildVoiceCoderChain(params)
        case .babyVoice(let params):
            nodes = buildBabyVoiceChain(params)
        case .demonVoice(let params):
            nodes = buildDemonVoiceChain(params)
        case .backSound:
            return
        }

        voiceEffectNodes = nodes
        activeNodeChain = nodes
        currentVoiceConfig = config
        activeVoiceEffect = config.effectType

        connectVoiceNodes()
        Logger.audioEffects.info("Voice effect set: \(config.effectType.rawValue)")
    }

    private func buildVoiceCoderChain(_ params: VoiceCoderParams) -> [AVAudioNode] {
        let timePitch = AVAudioUnitTimePitch()
        timePitch.pitch = params.pitch * 100  // semitones → cents

        var nodes: [AVAudioNode] = [timePitch]

        if params.harmonization {
            let delay = AVAudioUnitDelay()
            delay.delayTime = 0.030  // 30ms chorus
            delay.feedback = 0
            delay.wetDryMix = Float(params.strength)
            nodes.append(delay)
        }

        return nodes
    }

    private func buildBabyVoiceChain(_ params: BabyVoiceParams) -> [AVAudioNode] {
        let timePitch = AVAudioUnitTimePitch()
        timePitch.pitch = params.pitch * 100

        let eq = AVAudioUnitEQ(numberOfBands: 1)
        let band = eq.bands[0]
        band.filterType = .highPass
        band.frequency = 800 * params.formant
        band.bypass = false

        return [timePitch, eq]
    }

    private func buildDemonVoiceChain(_ params: DemonVoiceParams) -> [AVAudioNode] {
        let timePitch = AVAudioUnitTimePitch()
        timePitch.pitch = params.pitch * 100

        let distortion = AVAudioUnitDistortion()
        distortion.loadFactoryPreset(.speechAlienChatter)
        distortion.wetDryMix = params.distortion

        let reverb = AVAudioUnitReverb()
        reverb.loadFactoryPreset(.cathedral)
        let reverbDecay = 3.0 + (params.reverb / 100.0) * 5.0  // 3-8s range
        reverb.wetDryMix = Float(min(reverbDecay / 8.0 * 100, 100))

        let eq = AVAudioUnitEQ(numberOfBands: 1)
        let band = eq.bands[0]
        band.filterType = .lowPass
        band.frequency = 2000
        band.bypass = false

        return [timePitch, distortion, reverb, eq]
    }

    // MARK: - Private — BackSound Setup

    private func setBackSound(_ params: BackSoundParams) throws {
        tearDownBackSoundNodes()

        let playerNode = AVAudioPlayerNode()
        let mixerNode = AVAudioMixerNode()

        backSoundPlayerNode = playerNode
        backSoundMixerNode = mixerNode
        currentBackSoundConfig = params
        isBackSoundActive = true

        updateBackSoundParams(params)
        Logger.audioEffects.info("BackSound activated: \(params.soundFile)")
    }

    private func updateBackSoundParams(_ params: BackSoundParams) {
        backSoundMixerNode?.outputVolume = params.volume / 100.0
        currentBackSoundConfig = params
    }

    // MARK: - Private — Apply Params (real-time, no rebuild)

    private func applyVoiceParams(_ config: AudioEffectConfig) {
        switch config {
        case .voiceCoder(let params):
            if let timePitch = voiceEffectNodes.first(where: { $0 is AVAudioUnitTimePitch }) as? AVAudioUnitTimePitch {
                timePitch.pitch = params.pitch * 100
            }
            if let delay = voiceEffectNodes.first(where: { $0 is AVAudioUnitDelay }) as? AVAudioUnitDelay {
                delay.wetDryMix = Float(params.strength)
            }

        case .babyVoice(let params):
            if let timePitch = voiceEffectNodes.first(where: { $0 is AVAudioUnitTimePitch }) as? AVAudioUnitTimePitch {
                timePitch.pitch = params.pitch * 100
            }
            if let eq = voiceEffectNodes.first(where: { $0 is AVAudioUnitEQ }) as? AVAudioUnitEQ {
                eq.bands[0].frequency = 800 * params.formant
            }

        case .demonVoice(let params):
            if let timePitch = voiceEffectNodes.first(where: { $0 is AVAudioUnitTimePitch }) as? AVAudioUnitTimePitch {
                timePitch.pitch = params.pitch * 100
            }
            if let distortion = voiceEffectNodes.first(where: { $0 is AVAudioUnitDistortion }) as? AVAudioUnitDistortion {
                distortion.wetDryMix = params.distortion
            }
            if let reverb = voiceEffectNodes.first(where: { $0 is AVAudioUnitReverb }) as? AVAudioUnitReverb {
                let reverbDecay = 3.0 + (params.reverb / 100.0) * 5.0
                reverb.wetDryMix = Float(min(reverbDecay / 8.0 * 100, 100))
            }

        case .backSound:
            break
        }
    }

    // MARK: - Private — Engine Graph

    private func connectVoiceNodes() {
        for node in voiceEffectNodes {
            engine.attach(node)
        }
    }

    private func tearDownVoiceNodes() {
        for node in voiceEffectNodes {
            engine.detach(node)
        }
        voiceEffectNodes = []
        activeNodeChain = []
    }

    private func tearDownBackSoundNodes() {
        if let player = backSoundPlayerNode {
            player.stop()
            engine.detach(player)
        }
        if let mixer = backSoundMixerNode {
            engine.detach(mixer)
        }
        backSoundPlayerNode = nil
        backSoundMixerNode = nil
    }

    private func clearAllEffects() {
        tearDownVoiceNodes()
        tearDownBackSoundNodes()
        currentVoiceConfig = nil
        currentBackSoundConfig = nil
        activeVoiceEffect = nil
        isBackSoundActive = false
        activeNodeChain = []
        Logger.audioEffects.info("All effects cleared")
    }

    // MARK: - Private — Offline Render

    private func renderThroughEffectChain(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer {
        guard !voiceEffectNodes.isEmpty else { return buffer }

        let format = buffer.format

        for node in voiceEffectNodes {
            if node.engine == nil {
                engine.attach(node)
            }
        }

        var previousNode: AVAudioNode = engine.inputNode
        for node in voiceEffectNodes {
            engine.connect(previousNode, to: node, format: format)
            previousNode = node
        }
        engine.connect(previousNode, to: engine.mainMixerNode, format: format)

        return buffer
    }

    deinit {
        reset()
    }
}
