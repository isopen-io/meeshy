import AVFoundation
import os

// MARK: - Call Audio Effects Service

final class CallAudioEffectsService: CallAudioEffectsServiceProviding {

    // MARK: - State

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
    private var backSoundAudioFile: AVAudioFile?

    // MARK: - Current Config

    private var currentVoiceConfig: AudioEffectConfig?
    private var currentBackSoundConfig: BackSoundParams?

    // MARK: - Thread Safety

    private let lock = NSLock()

    // MARK: - Performance Monitoring

    private var consecutiveOverBudgetFrames = 0
    private var consecutiveUnderBudgetFrames = 0
    private(set) var lastProcessingTimeMs: Double?

    // MARK: - Set Effect

    func setEffect(_ effect: AudioEffectConfig?) throws {
        lock.lock()
        defer { lock.unlock() }

        guard let effect else {
            clearAllEffectsLocked()
            return
        }

        if effect.isVoiceEffect {
            try setVoiceEffectLocked(effect)
        } else if case .backSound(let params) = effect {
            try setBackSoundLocked(params)
        }
    }

    func clearVoiceEffect() {
        lock.lock()
        defer { lock.unlock() }
        stopEngineLocked()
        tearDownVoiceNodesLocked()
        currentVoiceConfig = nil
        activeVoiceEffect = nil
        restartEngineIfNeededLocked()
        Logger.audioEffects.info("Voice effect cleared")
    }

    func clearBackSound() {
        lock.lock()
        defer { lock.unlock() }
        stopEngineLocked()
        tearDownBackSoundNodesLocked()
        currentBackSoundConfig = nil
        isBackSoundActive = false
        backSoundAudioFile = nil
        restartEngineIfNeededLocked()
        Logger.audioEffects.info("BackSound cleared")
    }

    // MARK: - Update Params

    func updateParams(_ config: AudioEffectConfig) throws {
        lock.lock()
        defer { lock.unlock() }

        guard config.isVoiceEffect else {
            if case .backSound(let params) = config, isBackSoundActive {
                updateBackSoundParamsLocked(params)
                return
            }
            throw AudioEffectsError.invalidParams("No matching effect active for update")
        }

        guard let active = activeVoiceEffect, active == config.effectType else {
            throw AudioEffectsError.invalidParams(
                "Cannot update \(config.effectType.rawValue): no matching voice effect active"
            )
        }

        applyVoiceParamsLocked(config)
        currentVoiceConfig = config
        Logger.audioEffects.info("Updated params for \(config.effectType.rawValue)")
    }

    // MARK: - Process Audio Buffer

    func processAudioBuffer(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer {
        lock.lock()
        let hasEffects = isEffectsActive && !isAutoDegraded
        let nodes = voiceEffectNodes
        lock.unlock()

        guard hasEffects, !nodes.isEmpty else { return buffer }

        let start = CACurrentMediaTime()
        let processed = renderThroughNodes(buffer, nodes: nodes)
        let elapsed = (CACurrentMediaTime() - start) * 1000
        lastProcessingTimeMs = elapsed
        reportProcessingTime(ms: elapsed)

        return processed
    }

    // MARK: - Reset

    func reset() {
        lock.lock()
        defer { lock.unlock() }
        stopEngineLocked()
        clearAllEffectsLocked()
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

    // MARK: - Private — Voice Effect Setup (must hold lock)

    private func setVoiceEffectLocked(_ config: AudioEffectConfig) throws {
        stopEngineLocked()
        tearDownVoiceNodesLocked()

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

        rebuildEngineGraphLocked()
        Logger.audioEffects.info("Voice effect set: \(config.effectType.rawValue)")
    }

    private func buildVoiceCoderChain(_ params: VoiceCoderParams) -> [AVAudioNode] {
        let timePitch = AVAudioUnitTimePitch()
        timePitch.pitch = params.pitch * 100  // semitones -> cents

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
        distortion.loadFactoryPreset(.drumsBitBrush)
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

    // MARK: - Private — BackSound Setup (must hold lock)

    private func setBackSoundLocked(_ params: BackSoundParams) throws {
        stopEngineLocked()
        tearDownBackSoundNodesLocked()

        guard !params.soundFile.isEmpty else {
            throw AudioEffectsError.soundFileNotFound(params.soundFile)
        }

        guard let url = Bundle.main.url(forResource: params.soundFile, withExtension: nil) else {
            throw AudioEffectsError.soundFileNotFound(params.soundFile)
        }

        let audioFile: AVAudioFile
        do {
            audioFile = try AVAudioFile(forReading: url)
        } catch {
            throw AudioEffectsError.soundFileNotFound(params.soundFile)
        }

        let playerNode = AVAudioPlayerNode()
        let mixerNode = AVAudioMixerNode()

        backSoundPlayerNode = playerNode
        backSoundMixerNode = mixerNode
        backSoundAudioFile = audioFile
        currentBackSoundConfig = params
        isBackSoundActive = true

        updateBackSoundParamsLocked(params)
        rebuildEngineGraphLocked()
        scheduleBackSoundPlaybackLocked()
        Logger.audioEffects.info("BackSound activated: \(params.soundFile)")
    }

    private func updateBackSoundParamsLocked(_ params: BackSoundParams) {
        backSoundMixerNode?.outputVolume = params.volume / 100.0
        currentBackSoundConfig = params
    }

    private func scheduleBackSoundPlaybackLocked() {
        guard let player = backSoundPlayerNode,
              let file = backSoundAudioFile else { return }

        let loopCount: Int
        if let config = currentBackSoundConfig {
            switch config.loopMode {
            case .nTimes:
                loopCount = max(config.loopValue, 1)
            case .nMinutes:
                let fileDuration = Double(file.length) / file.processingFormat.sampleRate
                loopCount = fileDuration > 0 ? max(Int(Double(config.loopValue * 60) / fileDuration), 1) : 1
            }
        } else {
            loopCount = 1
        }

        for _ in 0..<loopCount {
            player.scheduleFile(file, at: nil)
        }
        player.play()
    }

    // MARK: - Private — Apply Params (real-time, no rebuild; must hold lock)

    private func applyVoiceParamsLocked(_ config: AudioEffectConfig) {
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

    // MARK: - Private — Engine Graph (must hold lock)

    private func rebuildEngineGraphLocked() {
        let format = AVAudioFormat(
            standardFormatWithSampleRate: AudioEffectsConstants.defaultSampleRate,
            channels: 1
        )!

        // Attach voice effect nodes
        for node in voiceEffectNodes {
            engine.attach(node)
        }

        // Attach BackSound nodes
        if let player = backSoundPlayerNode {
            engine.attach(player)
        }
        if let mixer = backSoundMixerNode {
            engine.attach(mixer)
        }

        // Connect voice chain: inputNode -> [effects] -> mainMixerNode
        var previousNode: AVAudioNode = engine.inputNode
        for node in voiceEffectNodes {
            engine.connect(previousNode, to: node, format: format)
            previousNode = node
        }
        engine.connect(previousNode, to: engine.mainMixerNode, format: format)

        // Connect BackSound chain: playerNode -> backSoundMixer -> mainMixerNode
        if let player = backSoundPlayerNode, let mixer = backSoundMixerNode,
           let file = backSoundAudioFile {
            engine.connect(player, to: mixer, format: file.processingFormat)
            engine.connect(mixer, to: engine.mainMixerNode, format: format)
        }

        do {
            try engine.start()
            Logger.audioEffects.info("Audio engine started")
        } catch {
            Logger.audioEffects.error("Failed to start audio engine: \(error.localizedDescription)")
        }
    }

    private func stopEngineLocked() {
        if engine.isRunning {
            engine.stop()
        }
    }

    private func restartEngineIfNeededLocked() {
        guard isEffectsActive else { return }
        rebuildEngineGraphLocked()
    }

    private func tearDownVoiceNodesLocked() {
        for node in voiceEffectNodes {
            if node.engine != nil {
                engine.detach(node)
            }
        }
        voiceEffectNodes = []
        activeNodeChain = []
    }

    private func tearDownBackSoundNodesLocked() {
        if let player = backSoundPlayerNode {
            player.stop()
            if player.engine != nil {
                engine.detach(player)
            }
        }
        if let mixer = backSoundMixerNode {
            if mixer.engine != nil {
                engine.detach(mixer)
            }
        }
        backSoundPlayerNode = nil
        backSoundMixerNode = nil
    }

    private func clearAllEffectsLocked() {
        tearDownVoiceNodesLocked()
        tearDownBackSoundNodesLocked()
        currentVoiceConfig = nil
        currentBackSoundConfig = nil
        activeVoiceEffect = nil
        isBackSoundActive = false
        backSoundAudioFile = nil
        activeNodeChain = []
        Logger.audioEffects.info("All effects cleared")
    }

    // MARK: - Private — Render Through Nodes

    private func renderThroughNodes(_ buffer: AVAudioPCMBuffer, nodes: [AVAudioNode]) -> AVAudioPCMBuffer {
        guard !nodes.isEmpty else { return buffer }

        var currentBuffer = buffer

        for node in nodes {
            guard let audioUnit = (node as? AVAudioUnit)?.auAudioUnit else { continue }

            let renderBlock = audioUnit.renderBlock
            let frameCount = currentBuffer.frameLength
            let format = currentBuffer.format

            guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
                continue
            }
            outputBuffer.frameLength = frameCount

            let outputBufferList = outputBuffer.mutableAudioBufferList
            var flags = AudioUnitRenderActionFlags()

            var timestamp = AudioTimeStamp()
            timestamp.mSampleTime = 0
            timestamp.mFlags = .sampleTimeValid

            // Provide the input buffer to the audio unit
            let inputBlock: AURenderPullInputBlock = { _, inTimestamp, inFrameCount, inputBusNumber, inputBufferList -> AUAudioUnitStatus in
                let srcBL = UnsafeMutableAudioBufferListPointer(currentBuffer.mutableAudioBufferList)
                let dstBL = UnsafeMutableAudioBufferListPointer(inputBufferList)

                for i in 0..<min(srcBL.count, dstBL.count) {
                    dstBL[i].mDataByteSize = srcBL[i].mDataByteSize
                    dstBL[i].mNumberChannels = srcBL[i].mNumberChannels
                    if let srcData = srcBL[i].mData, let dstData = dstBL[i].mData {
                        dstData.copyMemory(from: srcData, byteCount: Int(srcBL[i].mDataByteSize))
                    }
                }
                return noErr
            }

            let status = renderBlock(&flags, &timestamp, frameCount, 0, outputBufferList, inputBlock)

            if status == noErr {
                currentBuffer = outputBuffer
            } else {
                Logger.audioEffects.error("Audio unit render failed with status: \(status)")
            }
        }

        return currentBuffer
    }

    deinit {
        lock.lock()
        stopEngineLocked()
        clearAllEffectsLocked()
        lock.unlock()
    }
}
