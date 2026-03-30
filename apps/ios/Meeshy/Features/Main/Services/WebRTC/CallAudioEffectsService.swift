import AVFoundation
import os

// MARK: - Call Audio Effects Service

final class CallAudioEffectsService: CallAudioEffectsServiceProviding {

    // MARK: - State (atomic reads via os_unfair_lock for real-time safety)

    private(set) var activeVoiceEffect: AudioEffectType?
    private(set) var isBackSoundActive = false
    private(set) var isAutoDegraded = false

    var isEffectsActive: Bool {
        os_unfair_lock_lock(&stateLock)
        let result = activeVoiceEffect != nil || isBackSoundActive
        os_unfair_lock_unlock(&stateLock)
        return result
    }

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
    //
    // Two-lock strategy:
    // - `configLock`: protects graph mutations (setEffect, tearDown, rebuild).
    //   Taken on a background queue, NEVER on main thread or audio thread.
    // - `stateLock`: os_unfair_lock for fast reads of state flags from any thread
    //   (audio thread checks isEffectsActive/isAutoDegraded).
    //
    // processAudioBuffer uses NO lock — it snapshots the render block array
    // which is swapped atomically by the config queue.

    private let configQueue = DispatchQueue(label: "me.meeshy.audioeffects.config")
    private var stateLock = os_unfair_lock()

    // MARK: - Render Pipeline (lock-free for audio thread)
    //
    // The audio thread reads `activeRenderBlocks` without locking.
    // The config queue replaces the entire array atomically (pointer swap).
    // Swift Array is a value type — the audio thread's reference to the old array
    // remains valid even after the config queue replaces it.

    private var activeRenderBlocks: [(AURenderBlock, AVAudioFormat)] = []
    private var renderBufferPool: [AVAudioPCMBuffer] = []
    private var renderBufferFormat: AVAudioFormat?

    // MARK: - Performance Monitoring (accessed from audio thread only)

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
        configQueue.sync { [self] in
            tearDownVoiceNodesOnConfigQueue()
            currentVoiceConfig = nil
            setActiveVoiceEffect(nil)
        }
        Logger.audioEffects.info("Voice effect cleared")
    }

    func clearBackSound() {
        configQueue.sync { [self] in
            stopEngineOnConfigQueue()
            tearDownBackSoundNodesOnConfigQueue()
            currentBackSoundConfig = nil
            setBackSoundActive(false)
            backSoundAudioFile = nil
            rebuildRenderBlocksOnConfigQueue()
            restartEngineIfNeededOnConfigQueue()
        }
        Logger.audioEffects.info("BackSound cleared")
    }

    // MARK: - Update Params

    func updateParams(_ config: AudioEffectConfig) throws {
        guard config.isVoiceEffect else {
            if case .backSound(let params) = config, isBackSoundActive {
                configQueue.sync { [self] in
                    updateBackSoundParamsOnConfigQueue(params)
                }
                return
            }
            throw AudioEffectsError.invalidParams("No matching effect active for update")
        }

        os_unfair_lock_lock(&stateLock)
        let active = activeVoiceEffect
        os_unfair_lock_unlock(&stateLock)

        guard let active, active == config.effectType else {
            throw AudioEffectsError.invalidParams(
                "Cannot update \(config.effectType.rawValue): no matching voice effect active"
            )
        }

        configQueue.sync { [self] in
            applyVoiceParamsOnConfigQueue(config)
            currentVoiceConfig = config
        }
        Logger.audioEffects.info("Updated params for \(config.effectType.rawValue)")
    }

    // MARK: - Process Audio Buffer (AUDIO THREAD — no locks, no allocations)

    func processAudioBuffer(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer {
        os_unfair_lock_lock(&stateLock)
        let degraded = isAutoDegraded
        let active = activeVoiceEffect != nil || isBackSoundActive
        os_unfair_lock_unlock(&stateLock)

        guard active, !degraded else { return buffer }

        let blocks = activeRenderBlocks
        guard !blocks.isEmpty else { return buffer }

        let start = CACurrentMediaTime()
        let processed = renderThroughBlocks(buffer, blocks: blocks)
        let elapsed = (CACurrentMediaTime() - start) * 1000
        lastProcessingTimeMs = elapsed
        updatePerformanceCounters(ms: elapsed)

        return processed
    }

    // MARK: - Reset

    func reset() {
        configQueue.sync { [self] in
            stopEngineOnConfigQueue()
            clearAllEffectsOnConfigQueue()
            activeRenderBlocks = []
            renderBufferPool = []
            renderBufferFormat = nil
        }
        consecutiveOverBudgetFrames = 0
        consecutiveUnderBudgetFrames = 0
        os_unfair_lock_lock(&stateLock)
        isAutoDegraded = false
        os_unfair_lock_unlock(&stateLock)
        lastProcessingTimeMs = nil
        Logger.audioEffects.info("Audio effects service reset")
    }

    // MARK: - Performance Monitoring (called from audio thread only)

    func reportProcessingTime(ms: Double) {
        updatePerformanceCounters(ms: ms)
    }

    private func updatePerformanceCounters(ms: Double) {
        if ms > AudioEffectsConstants.maxProcessingTimeMs {
            consecutiveOverBudgetFrames += 1
            consecutiveUnderBudgetFrames = 0
            if consecutiveOverBudgetFrames >= AudioEffectsConstants.overBudgetThreshold {
                os_unfair_lock_lock(&stateLock)
                if !isAutoDegraded {
                    isAutoDegraded = true
                    os_unfair_lock_unlock(&stateLock)
                    Logger.audioEffects.warning(
                        "Audio effects auto-degraded: \(ms, privacy: .public)ms exceeds budget"
                    )
                } else {
                    os_unfair_lock_unlock(&stateLock)
                }
            }
        } else if ms < AudioEffectsConstants.restoreBudgetMs {
            consecutiveUnderBudgetFrames += 1
            if consecutiveUnderBudgetFrames >= AudioEffectsConstants.underBudgetThreshold {
                os_unfair_lock_lock(&stateLock)
                if isAutoDegraded {
                    isAutoDegraded = false
                    os_unfair_lock_unlock(&stateLock)
                    consecutiveOverBudgetFrames = 0
                    Logger.audioEffects.info("Audio effects restored from auto-degradation")
                } else {
                    os_unfair_lock_unlock(&stateLock)
                }
            }
        } else {
            consecutiveUnderBudgetFrames = 0
        }
    }

    // MARK: - Private — Voice Effect Setup (config queue)

    private func setVoiceEffect(_ config: AudioEffectConfig) throws {
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

        // Node construction is cheap (no I/O). Swap on config queue.
        configQueue.sync { [self] in
            tearDownVoiceNodesOnConfigQueue()
            voiceEffectNodes = nodes
            activeNodeChain = nodes
            currentVoiceConfig = config
            setActiveVoiceEffect(config.effectType)
            rebuildRenderBlocksOnConfigQueue()
        }
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

    // MARK: - Private — BackSound Setup (config queue)

    private func setBackSound(_ params: BackSoundParams) throws {
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

        configQueue.sync { [self] in
            stopEngineOnConfigQueue()
            tearDownBackSoundNodesOnConfigQueue()

            let playerNode = AVAudioPlayerNode()
            let mixerNode = AVAudioMixerNode()

            backSoundPlayerNode = playerNode
            backSoundMixerNode = mixerNode
            backSoundAudioFile = audioFile
            currentBackSoundConfig = params
            setBackSoundActive(true)

            updateBackSoundParamsOnConfigQueue(params)
            rebuildEngineGraphOnConfigQueue()
            rebuildRenderBlocksOnConfigQueue()
            scheduleBackSoundPlaybackOnConfigQueue()
        }
        Logger.audioEffects.info("BackSound activated: \(params.soundFile)")
    }

    private func updateBackSoundParamsOnConfigQueue(_ params: BackSoundParams) {
        backSoundMixerNode?.outputVolume = params.volume / 100.0
        currentBackSoundConfig = params
    }

    private func scheduleBackSoundPlaybackOnConfigQueue() {
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

    // MARK: - Private — Apply Params (real-time safe, config queue)

    private func applyVoiceParamsOnConfigQueue(_ config: AudioEffectConfig) {
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

    // MARK: - Private — State Helpers (use stateLock)

    private func setActiveVoiceEffect(_ effect: AudioEffectType?) {
        os_unfair_lock_lock(&stateLock)
        activeVoiceEffect = effect
        os_unfair_lock_unlock(&stateLock)
    }

    private func setBackSoundActive(_ active: Bool) {
        os_unfair_lock_lock(&stateLock)
        isBackSoundActive = active
        os_unfair_lock_unlock(&stateLock)
    }

    // MARK: - Private — Engine Graph (config queue)

    private func rebuildEngineGraphOnConfigQueue() {
        let format = AVAudioFormat(
            standardFormatWithSampleRate: AudioEffectsConstants.defaultSampleRate,
            channels: 1
        )!

        for node in voiceEffectNodes {
            engine.attach(node)
        }

        if let player = backSoundPlayerNode {
            engine.attach(player)
        }
        if let mixer = backSoundMixerNode {
            engine.attach(mixer)
        }

        var previousNode: AVAudioNode = engine.inputNode
        for node in voiceEffectNodes {
            engine.connect(previousNode, to: node, format: format)
            previousNode = node
        }
        engine.connect(previousNode, to: engine.mainMixerNode, format: format)

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

    private func rebuildRenderBlocksOnConfigQueue() {
        var blocks: [(AURenderBlock, AVAudioFormat)] = []
        let format = AVAudioFormat(
            standardFormatWithSampleRate: AudioEffectsConstants.defaultSampleRate,
            channels: 1
        )!

        for node in voiceEffectNodes {
            if let unit = node as? AVAudioUnit {
                // Allocate the AU's internal resources so renderBlock works standalone
                do {
                    unit.auAudioUnit.maximumFramesToRender = AudioEffectsConstants.defaultBufferSize
                    try unit.auAudioUnit.allocateRenderResources()
                } catch {
                    Logger.audioEffects.error("Failed to allocate AU resources: \(error.localizedDescription)")
                    continue
                }
                blocks.append((unit.auAudioUnit.renderBlock, format))
            }
        }

        // Pre-allocate buffer pool for the audio thread (zero malloc on render path)
        var pool: [AVAudioPCMBuffer] = []
        for _ in 0..<max(blocks.count, 1) {
            if let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AudioEffectsConstants.defaultBufferSize) {
                buf.frameLength = AudioEffectsConstants.defaultBufferSize
                pool.append(buf)
            }
        }

        // Atomic swap — audio thread picks up new blocks on next iteration
        renderBufferPool = pool
        renderBufferFormat = format
        activeRenderBlocks = blocks
    }

    private func stopEngineOnConfigQueue() {
        if engine.isRunning {
            engine.stop()
        }
    }

    private func restartEngineIfNeededOnConfigQueue() {
        os_unfair_lock_lock(&stateLock)
        let active = activeVoiceEffect != nil || isBackSoundActive
        os_unfair_lock_unlock(&stateLock)
        guard active else { return }
        rebuildEngineGraphOnConfigQueue()
    }

    private func tearDownVoiceNodesOnConfigQueue() {
        // Clear render blocks first so audio thread stops using the nodes
        activeRenderBlocks = []

        for node in voiceEffectNodes {
            if let unit = node as? AVAudioUnit {
                unit.auAudioUnit.deallocateRenderResources()
            }
            if node.engine != nil {
                engine.detach(node)
            }
        }
        voiceEffectNodes = []
        activeNodeChain = []
    }

    private func tearDownBackSoundNodesOnConfigQueue() {
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

    private func clearAllEffectsOnConfigQueue() {
        tearDownVoiceNodesOnConfigQueue()
        tearDownBackSoundNodesOnConfigQueue()
        currentVoiceConfig = nil
        currentBackSoundConfig = nil
        setActiveVoiceEffect(nil)
        setBackSoundActive(false)
        backSoundAudioFile = nil
        activeNodeChain = []
    }

    private func clearAllEffects() {
        configQueue.sync { [self] in
            stopEngineOnConfigQueue()
            clearAllEffectsOnConfigQueue()
            activeRenderBlocks = []
            renderBufferPool = []
        }
    }

    // MARK: - Private — Render Through Blocks (AUDIO THREAD — zero allocation)

    private func renderThroughBlocks(
        _ buffer: AVAudioPCMBuffer,
        blocks: [(AURenderBlock, AVAudioFormat)]
    ) -> AVAudioPCMBuffer {
        guard !blocks.isEmpty else { return buffer }

        let pool = renderBufferPool
        var currentBuffer = buffer

        for (index, (renderBlock, _)) in blocks.enumerated() {
            guard index < pool.count else { break }

            let outputBuffer = pool[index]
            let frameCount = currentBuffer.frameLength
            outputBuffer.frameLength = frameCount

            let outputBufferList = outputBuffer.mutableAudioBufferList
            var flags = AudioUnitRenderActionFlags()

            var timestamp = AudioTimeStamp()
            timestamp.mSampleTime = 0
            timestamp.mFlags = .sampleTimeValid

            let inputBuffer = currentBuffer
            let inputBlock: AURenderPullInputBlock = { _, _, _, _, inputBufferList -> AUAudioUnitStatus in
                let srcBL = UnsafeMutableAudioBufferListPointer(inputBuffer.mutableAudioBufferList)
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
                Logger.audioEffects.error("Audio unit render failed: \(status)")
                break
            }
        }

        return currentBuffer
    }

    deinit {
        configQueue.sync { [self] in
            stopEngineOnConfigQueue()
            clearAllEffectsOnConfigQueue()
        }
    }
}
