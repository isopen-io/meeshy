import AVFoundation
import os

// MARK: - Call Audio Effects Service

final class CallAudioEffectsService: CallAudioEffectsServiceProviding {

    // MARK: - Dependencies

    private let backSoundFileProvider: BackSoundFileProviding

    // MARK: - Init

    init(backSoundFileProvider: BackSoundFileProviding = BundleBackSoundFileProvider()) {
        self.backSoundFileProvider = backSoundFileProvider
    }

    // MARK: - State (atomic reads via OSAllocatedUnfairLock for real-time safety)

    private struct LockedState {
        var activeVoiceEffect: AudioEffectType?
        var isBackSoundActive: Bool = false
        var isAutoDegraded: Bool = false
        var consecutiveOverBudgetFrames: Int = 0
        var consecutiveUnderBudgetFrames: Int = 0
        var lastProcessingTimeMs: Double?
    }

    private let stateLock = OSAllocatedUnfairLock(initialState: LockedState())

    var activeVoiceEffect: AudioEffectType? { stateLock.withLock { $0.activeVoiceEffect } }
    var isBackSoundActive: Bool { stateLock.withLock { $0.isBackSoundActive } }
    var isAutoDegraded: Bool { stateLock.withLock { $0.isAutoDegraded } }
    var lastProcessingTimeMs: Double? { stateLock.withLock { $0.lastProcessingTimeMs } }

    var isEffectsActive: Bool {
        stateLock.withLock { $0.activeVoiceEffect != nil || $0.isBackSoundActive }
    }

    // MARK: - Node Chain (exposed for testing)

    private(set) var activeNodeChain: [AVAudioNode] = []

    // MARK: - Engine & Nodes

    // Audit 2026-07-02 (bug 4) — lazy: the render pipeline has no production
    // feed (UI entry points removed), so the engine must not be built at
    // CallManager.shared startup. First touch happens on configQueue when an
    // effect is actually activated (all engine accesses are configQueue-serial).
    private lazy var engine = AVAudioEngine()
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
    // - `configQueue` (serial): serialises graph mutations (setEffect, tearDown,
    //   rebuild). Never held on the main thread or the audio thread.
    // - `stateLock` (OSAllocatedUnfairLock): protects the three state flags so any
    //   thread — including the real-time audio thread — can read them atomically
    //   without allocation. `withLock` ensures balanced lock/unlock even on throw.

    private let configQueue = DispatchQueue(label: "me.meeshy.audioeffects.config")

    // MARK: - Render Pipeline (lock-free for audio thread)
    //
    // The audio thread reads `activeRenderBlocks` without locking.
    // The config queue replaces the entire array atomically (pointer swap).
    // Swift Array is a value type — the audio thread's reference to the old array
    // remains valid even after the config queue replaces it.

    private var activeRenderBlocks: [(AURenderBlock, AVAudioFormat)] = []
    private var renderBufferPool: [AVAudioPCMBuffer] = []
    private var renderBufferFormat: AVAudioFormat?

    // MARK: - Performance Monitoring
    //
    // consecutiveOverBudgetFrames/consecutiveUnderBudgetFrames/lastProcessingTimeMs
    // live in LockedState (guarded by stateLock) because they are written from
    // the audio thread (processAudioBuffer) and can be reset concurrently from
    // any other thread (reset()) — an unsynchronized mutation from two threads
    // is a data race even though it rarely crashes.

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

        let active = stateLock.withLock { $0.activeVoiceEffect }

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
        let (active, degraded) = stateLock.withLock {
            ($0.activeVoiceEffect != nil || $0.isBackSoundActive, $0.isAutoDegraded)
        }

        guard active, !degraded else { return buffer }

        let blocks = activeRenderBlocks
        guard !blocks.isEmpty else { return buffer }

        let start = CACurrentMediaTime()
        let processed = renderThroughBlocks(buffer, blocks: blocks)
        let elapsed = (CACurrentMediaTime() - start) * 1000
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
        stateLock.withLock {
            $0.isAutoDegraded = false
            $0.consecutiveOverBudgetFrames = 0
            $0.consecutiveUnderBudgetFrames = 0
            $0.lastProcessingTimeMs = nil
        }
        Logger.audioEffects.info("Audio effects service reset")
    }

    // MARK: - Performance Monitoring (called from audio thread only)

    func reportProcessingTime(ms: Double) {
        updatePerformanceCounters(ms: ms)
    }

    private enum PerformanceTransition {
        case degraded
        case restored
        case none
    }

    private func updatePerformanceCounters(ms: Double) {
        // Read the (MainActor-isolated-by-default) constants into local
        // Sendable values *before* entering the lock: stateLock.withLock's
        // closure is @Sendable and cannot reference main-actor-isolated
        // static properties directly, even though this function itself
        // runs on the same actor as AudioEffectsConstants.
        let maxProcessingTimeMs = AudioEffectsConstants.maxProcessingTimeMs
        let overBudgetThreshold = AudioEffectsConstants.overBudgetThreshold
        let restoreBudgetMs = AudioEffectsConstants.restoreBudgetMs
        let underBudgetThreshold = AudioEffectsConstants.underBudgetThreshold

        let transition = stateLock.withLock { state -> PerformanceTransition in
            state.lastProcessingTimeMs = ms
            if ms > maxProcessingTimeMs {
                state.consecutiveOverBudgetFrames += 1
                state.consecutiveUnderBudgetFrames = 0
                guard state.consecutiveOverBudgetFrames >= overBudgetThreshold,
                      !state.isAutoDegraded else { return .none }
                state.isAutoDegraded = true
                return .degraded
            } else if ms < restoreBudgetMs {
                state.consecutiveUnderBudgetFrames += 1
                guard state.consecutiveUnderBudgetFrames >= underBudgetThreshold,
                      state.isAutoDegraded else { return .none }
                state.isAutoDegraded = false
                state.consecutiveOverBudgetFrames = 0
                return .restored
            } else {
                state.consecutiveUnderBudgetFrames = 0
                return .none
            }
        }

        switch transition {
        case .degraded:
            Logger.audioEffects.warning(
                "Audio effects auto-degraded: \(ms, privacy: .public)ms exceeds budget"
            )
        case .restored:
            Logger.audioEffects.info("Audio effects restored from auto-degradation")
        case .none:
            break
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
        let audioFile = try backSoundFileProvider.audioFile(for: params.soundFile)

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

    // MARK: - Private — State Helpers (protected by stateLock)

    private func setActiveVoiceEffect(_ effect: AudioEffectType?) {
        stateLock.withLock { $0.activeVoiceEffect = effect }
    }

    private func setBackSoundActive(_ active: Bool) {
        stateLock.withLock { $0.isBackSoundActive = active }
    }

    // MARK: - Private — Engine Graph (config queue)

    private func rebuildEngineGraphOnConfigQueue() {
        // Garde-fou pour le simulateur (ou tout device sans mic configurée
        // par AVAudioSession). `engine.inputNode` peut retourner un node
        // avec un format invalide (sampleRate=0 ou channelCount=0). Dans
        // ce cas, `engine.connect(_:to:format:)` lève une NSException
        // (NSInvalidArgumentException) Objective-C non-rattrapable par
        // Swift `try`, ce qui crashe l'app au lancement de l'appel
        // (cf. crash report 2026-05-09 11:48 — AVAudioIONodeImpl::
        // SetOutputFormat trap pendant rebuildEngineGraphOnConfigQueue).
        let inputFormat = engine.inputNode.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
            Logger.audioEffects.warning("Skipping engine graph rebuild — inputNode invalid (sr=\(inputFormat.sampleRate), ch=\(inputFormat.channelCount)). Audio effects disabled for this session (likely simulator without mic).")
            return
        }

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

        // Première connection (inputNode → premier voice node) avec le
        // format natif de l'inputNode — `connect` exige que le format
        // passé matche l'outputFormat du source node, sinon NSException.
        // AVAudioEngine convertit automatiquement vers le format aval.
        var previousNode: AVAudioNode = engine.inputNode
        var previousFormat: AVAudioFormat = inputFormat
        for node in voiceEffectNodes {
            engine.connect(previousNode, to: node, format: previousFormat)
            previousNode = node
            previousFormat = format
        }
        engine.connect(previousNode, to: engine.mainMixerNode, format: previousFormat)

        if let player = backSoundPlayerNode, let mixer = backSoundMixerNode,
           let file = backSoundAudioFile {
            engine.connect(player, to: mixer, format: file.processingFormat)
            engine.connect(mixer, to: engine.mainMixerNode, format: format)
        }

        do {
            try engine.start()
            Logger.audioEffects.info("Audio engine started (inputFormat sr=\(inputFormat.sampleRate), ch=\(inputFormat.channelCount))")
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
        let active = stateLock.withLock { $0.activeVoiceEffect != nil || $0.isBackSoundActive }
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
        // Cleanup is driven by explicit reset() calls on the service owner;
        // deinit is nonisolated under Swift 6.2 MainActor default and cannot
        // call MainActor-bound helpers. ARC handles per-node deallocation.
    }
}
