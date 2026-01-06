//
//  OpenVoiceCoreMLService.swift
//  Meeshy
//
//  On-device voice cloning using OpenVoice V2 with CoreML
//  Native Apple Neural Engine acceleration for optimal iOS performance.
//
//  Architecture (Real Pretrained Weights from OpenVoice V2):
//  1. SpeakerEmbeddingExtractor: Extracts 256-dim voice embedding from full spectrogram [1, T, 513]
//  2. VoiceConverterForward: spec + g_src → z_p (encoder + flow forward)
//  3. VoiceConverterReverse: z_p + g_tgt → audio (flow reverse + decoder)
//  4. HiFiGANVocoder: Fallback vocoder for mel-to-waveform conversion
//
//  Pipeline: TTS → spectrogram → Forward(src_emb) → z_p → Reverse(tgt_emb) → audio
//
//  Performance: ~100ms per second of audio on Neural Engine
//
//  iOS 16+
//

import Foundation
import AVFoundation
import Accelerate
import CoreML

// MARK: - OpenVoice CoreML Service

/// On-device voice cloning service using CoreML for native iOS performance
@MainActor
final class OpenVoiceCoreMLService: ObservableObject {
    
    // MARK: - Types
    
    /// Speaker embedding extracted from reference audio
    struct SpeakerEmbedding: Codable, Equatable {
        let id: UUID
        let embedding: [Float]
        let sourceLanguage: VoiceTranslationLanguage?
        let duration: TimeInterval
        let createdAt: Date
        
        static let dimension = 256
    }
    
    /// Voice generation result
    struct VoiceGenerationResult {
        let audioData: Data
        let audioURL: URL
        let duration: TimeInterval
        let latencyMs: Double
        let speakerEmbedding: SpeakerEmbedding
    }
    
    /// Model loading state
    enum ModelState: Equatable {
        case notLoaded
        case loading(progress: Double)
        case loaded
        case error(String)
    }
    
    // MARK: - Configuration

    struct Configuration {
        var sampleRate: Double = 22050
        var numMels: Int = 80
        var fftSize: Int = 1024
        var hopLength: Int = 256
        var fMin: Double = 0
        var fMax: Double = 8000

        // Full spectrogram configuration (for real OpenVoice V2 models)
        var specChannels: Int = 513  // fftSize / 2 + 1

        static let `default` = Configuration()
    }
    
    // MARK: - Published State

    @Published private(set) var modelState: ModelState = .notLoaded
    @Published private(set) var isProcessing = false
    @Published private(set) var currentEmbedding: SpeakerEmbedding?
    @Published private(set) var lastLatencyMs: Double = 0

    // MARK: - Debug State (for floating debug component)

    @Published private(set) var debugInfo = VoiceCloningDebugInfo()

    struct VoiceCloningDebugInfo {
        var embeddingExtractorLoaded = false
        var voiceConverterPipelineLoaded = false
        var vocoderLoaded = false

        var lastEmbeddingShape: String = "-"
        var lastSpecShape: String = "-"
        var lastWaveformShape: String = "-"

        var lastEmbeddingStats: String = "-"
        var lastSpecStats: String = "-"
        var lastWaveformStats: String = "-"

        var lastAudioType: String = "-"
        var lastProcessingSteps: [String] = []
        var lastError: String? = nil

        var embeddingExtractionMs: Double = 0
        var voiceConversionMs: Double = 0
        var totalMs: Double = 0
    }
    
    // MARK: - CoreML Models

    private var embeddingExtractor: MLModel?
    private var voiceConverterForward: MLModel?   // spec + g_src → z_p (encoder + flow forward)
    private var voiceConverterReverse: MLModel?   // z_p + g_tgt → audio (flow reverse + decoder)
    private var vocoder: MLModel?                  // Fallback vocoder
    
    // MARK: - Configuration
    
    private let configuration: Configuration
    
    // MARK: - Audio Processing

    private var fftSetup: FFTSetup?
    private var log2n: vDSP_Length = 0

    // MARK: - Cache

    private var embeddingCache: [UUID: SpeakerEmbedding] = [:]

    // MARK: - TTS Synthesizer (persistent to avoid daemon reconnection issues)

    private var ttsSynthesizer: AVSpeechSynthesizer?
    private var isTTSWarmedUp = false

    // MARK: - Initialization

    init(configuration: Configuration = .default) {
        self.configuration = configuration

        // Setup FFT for real signals
        // log2n = log2(fftSize) for power-of-2 FFT
        log2n = vDSP_Length(log2(Double(configuration.fftSize)))
        fftSetup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))
    }

    deinit {
        if let setup = fftSetup {
            vDSP_destroy_fftsetup(setup)
        }
    }
    
    // MARK: - Model Loading

    /// Load CoreML models
    func loadModels(progressCallback: ((Double) -> Void)? = nil) async throws {
        guard modelState != .loaded else {
            mediaLogger.info("[OpenVoice-CoreML] Models already loaded")
            return
        }

        modelState = .loading(progress: 0)

        // Log bundle contents for debugging - search deeply
        mediaLogger.info("[OpenVoice-CoreML] Searching for models in bundle...")
        logBundleContents()

        do {
            // Load SpeakerEmbeddingExtractor (real weights - expects full spectrogram [1, T, 513])
            progressCallback?(0.2)
            modelState = .loading(progress: 0.2)

            guard let extractorURL = findModelURL(named: "SpeakerEmbeddingExtractor") else {
                let error = "SpeakerEmbeddingExtractor not found in bundle"
                mediaLogger.error("[OpenVoice-CoreML] ❌ \(error)")
                throw OpenVoiceCoreMLError.modelLoadFailed(error)
            }

            mediaLogger.info("[OpenVoice-CoreML] Loading SpeakerEmbeddingExtractor from: \(extractorURL.path)")
            embeddingExtractor = try await loadMLModel(at: extractorURL)
            debugInfo.embeddingExtractorLoaded = true
            mediaLogger.info("[OpenVoice-CoreML] SpeakerEmbeddingExtractor loaded ✓ (expects spectrogram [1, T, 513])")

            // Load VoiceConverterForward (encoder + flow forward: spec + g_src → z_p)
            progressCallback?(0.4)
            modelState = .loading(progress: 0.4)

            guard let forwardURL = findModelURL(named: "VoiceConverterForward") else {
                let error = "VoiceConverterForward not found in bundle"
                mediaLogger.error("[OpenVoice-CoreML] ❌ \(error)")
                throw OpenVoiceCoreMLError.modelLoadFailed(error)
            }

            mediaLogger.info("[OpenVoice-CoreML] Loading VoiceConverterForward from: \(forwardURL.path)")
            voiceConverterForward = try await loadMLModel(at: forwardURL)
            mediaLogger.info("[OpenVoice-CoreML] VoiceConverterForward loaded ✓ (spec + g_src → z_p)")

            // Load VoiceConverterReverse (flow reverse + decoder: z_p + g_tgt → audio)
            progressCallback?(0.6)
            modelState = .loading(progress: 0.6)

            guard let reverseURL = findModelURL(named: "VoiceConverterReverse") else {
                let error = "VoiceConverterReverse not found in bundle"
                mediaLogger.error("[OpenVoice-CoreML] ❌ \(error)")
                throw OpenVoiceCoreMLError.modelLoadFailed(error)
            }

            mediaLogger.info("[OpenVoice-CoreML] Loading VoiceConverterReverse from: \(reverseURL.path)")
            voiceConverterReverse = try await loadMLModel(at: reverseURL)
            debugInfo.voiceConverterPipelineLoaded = true
            mediaLogger.info("[OpenVoice-CoreML] VoiceConverterReverse loaded ✓ (z_p + g_tgt → audio)")

            // Load HiFiGANVocoder as fallback
            progressCallback?(0.8)
            modelState = .loading(progress: 0.8)

            if let vocoderURL = findModelURL(named: "HiFiGANVocoder") {
                mediaLogger.info("[OpenVoice-CoreML] Loading HiFiGANVocoder from: \(vocoderURL.path)")
                vocoder = try await loadMLModel(at: vocoderURL)
                debugInfo.vocoderLoaded = true
                mediaLogger.info("[OpenVoice-CoreML] HiFiGANVocoder loaded ✓ (fallback)")
            } else {
                mediaLogger.info("[OpenVoice-CoreML] HiFiGANVocoder not found - not required with VoiceConverterPipeline")
            }

            // ToneColorConverter is legacy - not loading it
            mediaLogger.info("[OpenVoice-CoreML] ToneColorConverter skipped (using split Forward+Reverse models)")

            progressCallback?(1.0)
            modelState = .loaded

            mediaLogger.info("[OpenVoice-CoreML] ✅ All models loaded successfully (Embedding + Forward + Reverse)")

        } catch {
            let message = error.localizedDescription
            mediaLogger.error("[OpenVoice-CoreML] Model loading failed: \(message)")
            modelState = .error(message)
            throw error
        }
    }

    /// Log bundle contents to help debug model location
    private func logBundleContents() {
        guard let resourcePath = Bundle.main.resourcePath else {
            mediaLogger.error("[OpenVoice-CoreML] No resource path in bundle")
            return
        }

        // List top-level items
        let fm = FileManager.default
        if let contents = try? fm.contentsOfDirectory(atPath: resourcePath) {
            let mlModels = contents.filter { $0.contains("mlmodel") || $0.contains("mlpackage") || $0.contains("ML") }
            if mlModels.isEmpty {
                mediaLogger.info("[OpenVoice-CoreML] No ML files at top level. Total items: \(contents.count)")
                // List first 20 items to see what's there
                let sample = contents.prefix(20).joined(separator: ", ")
                mediaLogger.info("[OpenVoice-CoreML] Bundle sample: \(sample)")
            } else {
                mediaLogger.info("[OpenVoice-CoreML] ML files found: \(mlModels.joined(separator: ", "))")
            }
        }

        // Also check common subdirectories
        let subdirs = ["MLModels", "Models", "Resources", "Resources/MLModels"]
        for subdir in subdirs {
            let path = (resourcePath as NSString).appendingPathComponent(subdir)
            if let contents = try? fm.contentsOfDirectory(atPath: path) {
                let mlFiles = contents.filter { $0.contains("mlmodel") || $0.contains("ML") }
                if !mlFiles.isEmpty {
                    mediaLogger.info("[OpenVoice-CoreML] Found in \(subdir)/: \(mlFiles.joined(separator: ", "))")
                }
            }
        }
    }

    /// Find model URL trying different extensions and locations
    private func findModelURL(named name: String) -> URL? {
        let fm = FileManager.default

        // 1. Try Bundle.main.url (standard location)
        if let url = Bundle.main.url(forResource: name, withExtension: "mlmodelc") {
            mediaLogger.info("[OpenVoice-CoreML] Found \(name).mlmodelc via Bundle.main.url")
            return url
        }
        if let url = Bundle.main.url(forResource: name, withExtension: "mlpackage") {
            mediaLogger.info("[OpenVoice-CoreML] Found \(name).mlpackage via Bundle.main.url")
            return url
        }

        // 2. Try direct path in resource path
        if let resourcePath = Bundle.main.resourcePath {
            let extensions = ["mlmodelc", "mlpackage"]
            for ext in extensions {
                let path = (resourcePath as NSString).appendingPathComponent("\(name).\(ext)")
                if fm.fileExists(atPath: path) {
                    mediaLogger.info("[OpenVoice-CoreML] Found \(name).\(ext) at direct path")
                    return URL(fileURLWithPath: path)
                }
            }

            // 3. Check common subdirectories
            let subdirs = ["MLModels", "Models", "Resources", "OpenVoiceModels"]
            for subdir in subdirs {
                for ext in extensions {
                    let path = (resourcePath as NSString)
                        .appendingPathComponent(subdir)
                        .appending("/\(name).\(ext)")
                    if fm.fileExists(atPath: path) {
                        mediaLogger.info("[OpenVoice-CoreML] Found \(name).\(ext) in \(subdir)/")
                        return URL(fileURLWithPath: path)
                    }
                }
            }

            // 4. Deep search as last resort
            if let url = searchRecursively(for: name, in: resourcePath) {
                return url
            }
        }

        mediaLogger.error("[OpenVoice-CoreML] Could not find \(name) anywhere in bundle")
        return nil
    }

    /// Recursively search for a model file
    private func searchRecursively(for name: String, in path: String) -> URL? {
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(atPath: path) else { return nil }

        let targetNames = ["\(name).mlmodelc", "\(name).mlpackage"]

        while let item = enumerator.nextObject() as? String {
            for targetName in targetNames {
                if item.hasSuffix(targetName) {
                    let fullPath = (path as NSString).appendingPathComponent(item)
                    mediaLogger.info("[OpenVoice-CoreML] Found \(targetName) via recursive search at: \(item)")
                    return URL(fileURLWithPath: fullPath)
                }
            }
        }

        return nil
    }
    
    private func loadMLModel(at url: URL) async throws -> MLModel {
        let config = MLModelConfiguration()
        config.computeUnits = .all // Use Neural Engine when available
        
        return try await Task.detached {
            try MLModel(contentsOf: url, configuration: config)
        }.value
    }
    
    /// Unload models to free memory
    func unloadModels() {
        embeddingExtractor = nil
        voiceConverterForward = nil
        voiceConverterReverse = nil
        vocoder = nil
        currentEmbedding = nil
        embeddingCache.removeAll()
        modelState = .notLoaded
        debugInfo = VoiceCloningDebugInfo()

        // Reset TTS state
        ttsSynthesizer?.stopSpeaking(at: .immediate)
        ttsSynthesizer = nil
        isTTSWarmedUp = false
    }
    
    // MARK: - Speaker Embedding Extraction
    
    /// Extract speaker embedding from audio file
    /// Uses FULL spectrogram [1, T, 513] for real OpenVoice V2 pretrained weights
    func extractSpeakerEmbedding(
        from audioURL: URL,
        language: VoiceTranslationLanguage? = nil
    ) async throws -> SpeakerEmbedding {
        guard modelState == .loaded else {
            throw OpenVoiceCoreMLError.modelNotLoaded
        }

        isProcessing = true
        defer { isProcessing = false }

        let startTime = Date()
        mediaLogger.info("[VOICE-CLONE-DEBUG-START] extractSpeakerEmbedding from file")

        // Load and preprocess audio
        var audioData = try await preprocessAudio(from: audioURL)
        mediaLogger.info("[OpenVoice-CoreML] Loaded audio: \(audioData.count) samples (\(String(format: "%.2f", Double(audioData.count) / configuration.sampleRate))s)")

        // Limit audio length to fit model constraints (50-500 frames)
        // With hopLength=256 and sampleRate=22050: 500 frames ≈ 5.8 seconds
        let maxFrames = 450 // Leave some margin below 500
        let maxSamples = (maxFrames - 1) * configuration.hopLength + configuration.fftSize
        if audioData.count > maxSamples {
            // Take a representative sample from the middle of the audio
            let startOffset = (audioData.count - maxSamples) / 2
            audioData = Array(audioData[startOffset..<(startOffset + maxSamples)])
            mediaLogger.info("[OpenVoice-CoreML] Audio truncated to \(maxSamples) samples for embedding extraction")
        }

        // Ensure minimum length (50 frames minimum)
        let minFrames = 60 // Above 50 minimum
        let minSamples = (minFrames - 1) * configuration.hopLength + configuration.fftSize
        guard audioData.count >= minSamples else {
            mediaLogger.error("[OpenVoice-CoreML] Audio too short: \(audioData.count) samples, need \(minSamples)")
            throw OpenVoiceCoreMLError.invalidAudioFormat
        }

        // Extract FULL spectrogram (513 bins) for real OpenVoice V2 weights
        let spectrogram = extractFullSpectrogram(from: audioData)
        debugInfo.lastSpecShape = "[\(spectrogram.count) x \(configuration.specChannels)]"
        mediaLogger.info("[OpenVoice-CoreML] Full spectrogram: \(spectrogram.count) frames x \(configuration.specChannels) bins")

        // Run embedding extraction with full spectrogram
        let embeddingVector = try await runEmbeddingExtraction(spectrogram: spectrogram)
        debugInfo.lastEmbeddingShape = "[1 x 256]"
        debugInfo.lastEmbeddingStats = computeEmbeddingStats(embeddingVector)

        // Get duration
        let duration = Double(audioData.count) / configuration.sampleRate

        let embedding = SpeakerEmbedding(
            id: UUID(),
            embedding: embeddingVector,
            sourceLanguage: language,
            duration: duration,
            createdAt: Date()
        )

        embeddingCache[embedding.id] = embedding
        currentEmbedding = embedding

        let latency = Date().timeIntervalSince(startTime) * 1000
        lastLatencyMs = latency

        mediaLogger.info("[OpenVoice-CoreML] ✅ Extracted embedding in \(String(format: "%.0f", latency))ms")
        mediaLogger.info("[VOICE-CLONE-DEBUG-END] extractSpeakerEmbedding success")

        return embedding
    }
    
    /// Extract speaker embedding from audio buffer
    /// Uses FULL spectrogram [1, T, 513] for real OpenVoice V2 pretrained weights
    func extractSpeakerEmbedding(
        from buffer: AVAudioPCMBuffer,
        language: VoiceTranslationLanguage? = nil
    ) async throws -> SpeakerEmbedding {
        guard modelState == .loaded else {
            throw OpenVoiceCoreMLError.modelNotLoaded
        }

        guard let channelData = buffer.floatChannelData?[0] else {
            throw OpenVoiceCoreMLError.invalidAudioFormat
        }

        let startTime = Date()
        mediaLogger.info("[VOICE-CLONE-DEBUG-START] extractSpeakerEmbedding from buffer")

        let frameCount = Int(buffer.frameLength)
        var audioData = [Float](repeating: 0, count: frameCount)
        for i in 0..<frameCount {
            audioData[i] = channelData[i]
        }

        // Resample if needed
        let sampleRate = buffer.format.sampleRate
        if sampleRate != configuration.sampleRate {
            audioData = resampleAudio(audioData, from: sampleRate, to: configuration.sampleRate)
            mediaLogger.info("[OpenVoice-CoreML] Resampled from \(Int(sampleRate))Hz to \(Int(configuration.sampleRate))Hz")
        }

        // Limit audio length to fit model constraints (50-500 frames)
        let maxFrames = 450
        let maxSamples = (maxFrames - 1) * configuration.hopLength + configuration.fftSize
        if audioData.count > maxSamples {
            let startOffset = (audioData.count - maxSamples) / 2
            audioData = Array(audioData[startOffset..<(startOffset + maxSamples)])
            mediaLogger.info("[OpenVoice-CoreML] Audio truncated to \(maxSamples) samples")
        }

        // Ensure minimum length
        let minFrames = 60
        let minSamples = (minFrames - 1) * configuration.hopLength + configuration.fftSize
        guard audioData.count >= minSamples else {
            mediaLogger.error("[OpenVoice-CoreML] Audio too short: \(audioData.count) samples, need \(minSamples)")
            throw OpenVoiceCoreMLError.invalidAudioFormat
        }

        // Extract FULL spectrogram (513 bins) for real OpenVoice V2 weights
        let spectrogram = extractFullSpectrogram(from: audioData)
        debugInfo.lastSpecShape = "[\(spectrogram.count) x \(configuration.specChannels)]"

        // Run embedding extraction with full spectrogram
        let embeddingVector = try await runEmbeddingExtraction(spectrogram: spectrogram)
        debugInfo.lastEmbeddingShape = "[1 x 256]"
        debugInfo.lastEmbeddingStats = computeEmbeddingStats(embeddingVector)

        let duration = Double(frameCount) / sampleRate

        let embedding = SpeakerEmbedding(
            id: UUID(),
            embedding: embeddingVector,
            sourceLanguage: language,
            duration: duration,
            createdAt: Date()
        )

        embeddingCache[embedding.id] = embedding
        currentEmbedding = embedding

        let latency = Date().timeIntervalSince(startTime) * 1000
        lastLatencyMs = latency

        mediaLogger.info("[OpenVoice-CoreML] ✅ Extracted embedding from buffer in \(String(format: "%.0f", latency))ms")
        mediaLogger.info("[VOICE-CLONE-DEBUG-END] extractSpeakerEmbedding success")

        return embedding
    }
    
    // MARK: - Voice Generation
    
    /// Generate speech with cloned voice using VoiceConverterPipeline (real pretrained weights)
    /// Pipeline: TTS → full spectrogram → VoiceConverterPipeline(src_embedding, tgt_embedding) → audio
    func generateSpeech(
        text: String,
        embedding: SpeakerEmbedding,
        language: VoiceTranslationLanguage
    ) async throws -> VoiceGenerationResult {
        guard modelState == .loaded else {
            debugInfo.lastError = "Models not loaded"
            throw OpenVoiceCoreMLError.modelNotLoaded
        }

        isProcessing = true
        debugInfo.lastProcessingSteps = []
        debugInfo.lastError = nil

        defer { isProcessing = false }

        let startTime = Date()
        mediaLogger.info("[VOICE-CLONE-DEBUG-START] generateSpeech with VoiceConverterPipeline")

        do {
            // Step 1: Synthesize base speech using Apple TTS
            debugInfo.lastProcessingSteps.append("1. Synthesizing base speech (TTS)...")
            let baseAudio = try await synthesizeBaseSpeech(text: text, language: language)
            mediaLogger.info("[OpenVoice-CoreML] 🎤 Step 1: Got \(baseAudio.count) audio samples from TTS (\(String(format: "%.2f", Double(baseAudio.count) / configuration.sampleRate))s)")
            debugInfo.lastProcessingSteps.append("   ✓ Got \(baseAudio.count) samples (\(String(format: "%.2f", Double(baseAudio.count) / configuration.sampleRate))s)")

            // Step 2: Extract FULL spectrogram from base audio (513 bins, not mel)
            debugInfo.lastProcessingSteps.append("2. Extracting full spectrogram (513 bins)...")
            var baseSpec = extractFullSpectrogram(from: baseAudio)
            debugInfo.lastSpecShape = "[\(baseSpec.count) x \(configuration.specChannels)]"
            debugInfo.lastSpecStats = computeSpecStats(baseSpec)
            mediaLogger.info("[OpenVoice-CoreML] 📊 Step 2: Extracted full spectrogram: \(baseSpec.count) frames x \(configuration.specChannels) bins")
            mediaLogger.info("[OpenVoice-CoreML]    Spec stats: \(debugInfo.lastSpecStats)")
            debugInfo.lastProcessingSteps.append("   ✓ Shape: \(debugInfo.lastSpecShape)")

            // Limit spectrogram frames for models (10-500 frames)
            let maxFrames = 480
            let minFrames = 15

            if baseSpec.count > maxFrames {
                baseSpec = Array(baseSpec.prefix(maxFrames))
                mediaLogger.info("[OpenVoice-CoreML]    Truncated to \(baseSpec.count) frames")
                debugInfo.lastProcessingSteps.append("   Truncated to \(baseSpec.count) frames")
            } else if baseSpec.count < minFrames {
                let lastFrame = baseSpec.last ?? [Float](repeating: -10, count: configuration.specChannels)
                while baseSpec.count < minFrames {
                    baseSpec.append(lastFrame)
                }
                mediaLogger.info("[OpenVoice-CoreML]    Padded to \(baseSpec.count) frames")
                debugInfo.lastProcessingSteps.append("   Padded to \(baseSpec.count) frames")
            }

            // Step 3: Extract source speaker embedding from TTS audio
            debugInfo.lastProcessingSteps.append("3. Extracting source speaker embedding...")
            let srcEmbeddingStart = Date()
            let srcEmbedding = try await runEmbeddingExtraction(spectrogram: baseSpec)
            let srcEmbeddingMs = Date().timeIntervalSince(srcEmbeddingStart) * 1000
            mediaLogger.info("[OpenVoice-CoreML] 🎯 Step 3: Extracted source embedding in \(String(format: "%.1f", srcEmbeddingMs))ms")
            debugInfo.lastProcessingSteps.append("   ✓ Source embedding in \(String(format: "%.0f", srcEmbeddingMs))ms")

            // Step 4: Run VoiceConverterPipeline (full voice conversion with real weights)
            debugInfo.lastProcessingSteps.append("4. Running VoiceConverterPipeline (enc_q + flow + dec)...")
            debugInfo.lastEmbeddingShape = "[1 x 256]"
            debugInfo.lastEmbeddingStats = computeEmbeddingStats(embedding.embedding)
            mediaLogger.info("[OpenVoice-CoreML] 🎭 Step 4: Running VoiceConverterPipeline")
            mediaLogger.info("[OpenVoice-CoreML]    Target embedding stats: \(debugInfo.lastEmbeddingStats)")

            let conversionStart = Date()
            let waveform = try await runVoiceConverterPipeline(
                spectrogram: baseSpec,
                sourceEmbedding: srcEmbedding,
                targetEmbedding: embedding.embedding
            )
            debugInfo.voiceConversionMs = Date().timeIntervalSince(conversionStart) * 1000

            debugInfo.lastWaveformShape = "[\(waveform.count)]"
            debugInfo.lastWaveformStats = computeWaveformStats(waveform)
            mediaLogger.info("[OpenVoice-CoreML] 🔊 Step 4: VoiceConverterPipeline generated \(waveform.count) samples")
            mediaLogger.info("[OpenVoice-CoreML]    Waveform stats: \(debugInfo.lastWaveformStats)")
            mediaLogger.info("[OpenVoice-CoreML]    Voice conversion time: \(String(format: "%.1f", debugInfo.voiceConversionMs))ms")
            debugInfo.lastProcessingSteps.append("   ✓ Waveform: \(waveform.count) samples in \(String(format: "%.0f", debugInfo.voiceConversionMs))ms")

            // Step 5: Save to file
            debugInfo.lastProcessingSteps.append("5. Saving audio file...")
            let outputURL = try saveAudioToFile(waveform: waveform)

            let duration = Double(waveform.count) / configuration.sampleRate
            let latency = Date().timeIntervalSince(startTime) * 1000
            lastLatencyMs = latency
            debugInfo.totalMs = latency

            mediaLogger.info("[OpenVoice-CoreML] ✅ Generated \(String(format: "%.2f", duration))s audio in \(String(format: "%.0f", latency))ms")
            mediaLogger.info("[OpenVoice-CoreML]    Audio file: \(outputURL.lastPathComponent)")
            debugInfo.lastProcessingSteps.append("   ✓ Saved: \(String(format: "%.2f", duration))s audio")
            debugInfo.lastProcessingSteps.append("   📁 File: \(outputURL.lastPathComponent)")
            debugInfo.lastProcessingSteps.append("✅ Total: \(String(format: "%.0f", latency))ms")
            mediaLogger.info("[VOICE-CLONE-DEBUG-END] generateSpeech success")

            return VoiceGenerationResult(
                audioData: Data(bytes: waveform, count: waveform.count * MemoryLayout<Float>.size),
                audioURL: outputURL,
                duration: duration,
                latencyMs: latency,
                speakerEmbedding: embedding
            )
        } catch {
            debugInfo.lastError = error.localizedDescription
            debugInfo.lastProcessingSteps.append("❌ Error: \(error.localizedDescription)")
            mediaLogger.error("[OpenVoice-CoreML] ❌ Generation failed: \(error)")
            mediaLogger.info("[VOICE-CLONE-DEBUG-END] generateSpeech FAILED")
            throw error
        }
    }

    /// Compute spectrogram statistics
    private func computeSpecStats(_ spec: [[Float]]) -> String {
        guard !spec.isEmpty else { return "empty" }
        let flat = spec.flatMap { $0 }
        var minVal: Float = 0, maxVal: Float = 0, mean: Float = 0
        vDSP_minv(flat, 1, &minVal, vDSP_Length(flat.count))
        vDSP_maxv(flat, 1, &maxVal, vDSP_Length(flat.count))
        vDSP_meanv(flat, 1, &mean, vDSP_Length(flat.count))
        return "min=\(String(format: "%.2f", minVal)) max=\(String(format: "%.2f", maxVal)) mean=\(String(format: "%.2f", mean))"
    }

    // MARK: - Voice Conversion Pipeline

    /// Run split voice conversion: Forward (spec + g_src → z_p) then Reverse (z_p + g_tgt → audio)
    /// This split approach handles the flow direction control flow properly
    private func runVoiceConverterPipeline(
        spectrogram: [[Float]],
        sourceEmbedding: [Float],
        targetEmbedding: [Float]
    ) async throws -> [Float] {
        guard let forwardModel = voiceConverterForward else {
            let error = "VoiceConverterForward not loaded"
            mediaLogger.error("[OpenVoice-CoreML] ❌ \(error)")
            debugInfo.lastError = error
            throw OpenVoiceCoreMLError.modelNotLoaded
        }
        guard let reverseModel = voiceConverterReverse else {
            let error = "VoiceConverterReverse not loaded"
            mediaLogger.error("[OpenVoice-CoreML] ❌ \(error)")
            debugInfo.lastError = error
            throw OpenVoiceCoreMLError.modelNotLoaded
        }

        let originalFrames = spectrogram.count
        let bins = configuration.specChannels  // 513

        // Fixed size for deterministic CoreML models
        let fixedFrames = 512
        let zpChannels = 192  // Intermediate latent size from conversion script

        mediaLogger.info("[OpenVoice-CoreML] runVoiceConverterPipeline (split): \(originalFrames) frames → padded to \(fixedFrames) frames")

        // ========================================
        // STEP 1: Forward Model (spec + g_src → z_p)
        // ========================================

        // Prepare spectrogram input: [1, 513, 512] - transposed (channels first)
        var flatSpec = [Float](repeating: 0, count: bins * fixedFrames)
        let framesToCopy = min(originalFrames, fixedFrames)
        for f in 0..<framesToCopy {
            for b in 0..<bins {
                flatSpec[b * fixedFrames + f] = spectrogram[f][b]
            }
        }

        let specArray = try MLMultiArray(shape: [1, NSNumber(value: bins), NSNumber(value: fixedFrames)], dataType: .float16)
        let specPointer = specArray.dataPointer.assumingMemoryBound(to: Float16.self)
        for i in 0..<flatSpec.count {
            specPointer[i] = Float16(flatSpec[i])
        }

        // Prepare source embedding: [1, 256, 1]
        let srcEmbArray = try MLMultiArray(shape: [1, 256, 1], dataType: .float16)
        let srcPointer = srcEmbArray.dataPointer.assumingMemoryBound(to: Float16.self)
        for i in 0..<min(256, sourceEmbedding.count) {
            srcPointer[i] = Float16(sourceEmbedding[i])
        }

        mediaLogger.info("[OpenVoice-CoreML] 🔄 Running Forward model (spec + g_src → z_p)...")
        let forwardProvider = try MLDictionaryFeatureProvider(dictionary: [
            "spectrogram": specArray,
            "source_embedding": srcEmbArray
        ])

        let forwardOutput = try await forwardModel.prediction(from: forwardProvider)

        guard let zpOutput = forwardOutput.featureValue(for: "z_p")?.multiArrayValue else {
            let availableOutputs = forwardOutput.featureNames.joined(separator: ", ")
            mediaLogger.error("[OpenVoice-CoreML] No 'z_p' output from Forward. Available: [\(availableOutputs)]")
            throw OpenVoiceCoreMLError.inferenceError("No z_p output from Forward model")
        }

        mediaLogger.info("[OpenVoice-CoreML] ✅ Forward complete: z_p shape \(zpOutput.shape)")

        // ========================================
        // STEP 2: Reverse Model (z_p + g_tgt → audio)
        // ========================================

        // Prepare target embedding: [1, 256, 1]
        let tgtEmbArray = try MLMultiArray(shape: [1, 256, 1], dataType: .float16)
        let tgtPointer = tgtEmbArray.dataPointer.assumingMemoryBound(to: Float16.self)
        for i in 0..<min(256, targetEmbedding.count) {
            tgtPointer[i] = Float16(targetEmbedding[i])
        }

        mediaLogger.info("[OpenVoice-CoreML] 🔄 Running Reverse model (z_p + g_tgt → audio)...")
        let reverseProvider = try MLDictionaryFeatureProvider(dictionary: [
            "z_p": zpOutput,
            "target_embedding": tgtEmbArray
        ])

        let reverseOutput = try await reverseModel.prediction(from: reverseProvider)

        guard let waveformOutput = reverseOutput.featureValue(for: "waveform")?.multiArrayValue else {
            let availableOutputs = reverseOutput.featureNames.joined(separator: ", ")
            mediaLogger.error("[OpenVoice-CoreML] No 'waveform' output from Reverse. Available: [\(availableOutputs)]")
            throw OpenVoiceCoreMLError.inferenceError("No waveform output from Reverse model")
        }

        mediaLogger.info("[OpenVoice-CoreML] ✅ Reverse complete: waveform shape \(waveformOutput.shape), count: \(waveformOutput.count)")

        // ========================================
        // Extract and process waveform
        // ========================================

        // Trim to original content length
        let totalSamples = waveformOutput.count
        let expectedSamples = originalFrames * configuration.hopLength
        let samplesToKeep = min(expectedSamples, totalSamples)

        mediaLogger.info("[OpenVoice-CoreML] Trimming: \(totalSamples) → \(samplesToKeep) samples")

        var waveform = [Float](repeating: 0, count: samplesToKeep)
        for i in 0..<samplesToKeep {
            waveform[i] = waveformOutput[i].floatValue
        }
        let samples = samplesToKeep

        // Log waveform statistics
        var minVal: Float = 0, maxVal: Float = 0, rms: Float = 0
        vDSP_minv(waveform, 1, &minVal, vDSP_Length(samples))
        vDSP_maxv(waveform, 1, &maxVal, vDSP_Length(samples))
        var sumSq: Float = 0
        vDSP_svesq(waveform, 1, &sumSq, vDSP_Length(samples))
        rms = sqrt(sumSq / Float(samples))

        mediaLogger.info("[OpenVoice-CoreML] 📊 Output stats:")
        mediaLogger.info("[OpenVoice-CoreML]   - Samples: \(samples) (\(String(format: "%.2f", Double(samples) / configuration.sampleRate))s)")
        mediaLogger.info("[OpenVoice-CoreML]   - Min: \(String(format: "%.6f", minVal)), Max: \(String(format: "%.6f", maxVal)), RMS: \(String(format: "%.6f", rms))")

        // Count zero crossings
        var zeroCrossings = 0
        for i in 1..<samples {
            if (waveform[i-1] >= 0 && waveform[i] < 0) || (waveform[i-1] < 0 && waveform[i] >= 0) {
                zeroCrossings += 1
            }
        }
        let zcRate = Double(zeroCrossings) / (Double(samples) / configuration.sampleRate)
        mediaLogger.info("[OpenVoice-CoreML]   - Zero Crossings: \(zeroCrossings) (\(String(format: "%.1f", zcRate))/s)")

        // Validate output
        if maxVal - minVal < 0.001 {
            mediaLogger.error("[OpenVoice-CoreML] ⚠️ Output is nearly constant!")
        } else if rms < 0.0001 {
            mediaLogger.error("[OpenVoice-CoreML] ⚠️ Output is nearly silent!")
        } else if zeroCrossings < 100 {
            mediaLogger.error("[OpenVoice-CoreML] ⚠️ Very low zero crossing rate!")
        } else {
            mediaLogger.info("[OpenVoice-CoreML] ✅ Output appears valid")
        }

        // Normalize amplitude
        let peak = max(abs(minVal), abs(maxVal))
        let targetPeak: Float = 0.9

        if peak > 0.001 {
            let scale = targetPeak / peak
            vDSP_vsmul(waveform, 1, [scale], &waveform, 1, vDSP_Length(samples))
            mediaLogger.info("[OpenVoice-CoreML] 🔊 Normalized: \(String(format: "%.2f", scale))x (peak \(String(format: "%.4f", peak)) → \(String(format: "%.2f", targetPeak)))")
        } else {
            mediaLogger.error("[OpenVoice-CoreML] ⚠️ Peak too low (\(peak)) - audio is nearly silent!")
        }

        return waveform
    }

    // MARK: - Debug Helpers

    private func computeEmbeddingStats(_ emb: [Float]) -> String {
        guard !emb.isEmpty else { return "empty" }
        var minVal: Float = 0, maxVal: Float = 0, mean: Float = 0
        vDSP_minv(emb, 1, &minVal, vDSP_Length(emb.count))
        vDSP_maxv(emb, 1, &maxVal, vDSP_Length(emb.count))
        vDSP_meanv(emb, 1, &mean, vDSP_Length(emb.count))
        var norm: Float = 0
        vDSP_svesq(emb, 1, &norm, vDSP_Length(emb.count))
        norm = sqrt(norm)
        return "min=\(String(format: "%.3f", minVal)) max=\(String(format: "%.3f", maxVal)) norm=\(String(format: "%.3f", norm))"
    }

    private func computeWaveformStats(_ wav: [Float]) -> String {
        guard !wav.isEmpty else { return "empty" }
        var minVal: Float = 0, maxVal: Float = 0, rms: Float = 0
        vDSP_minv(wav, 1, &minVal, vDSP_Length(wav.count))
        vDSP_maxv(wav, 1, &maxVal, vDSP_Length(wav.count))
        var sumSq: Float = 0
        vDSP_svesq(wav, 1, &sumSq, vDSP_Length(wav.count))
        rms = sqrt(sumSq / Float(wav.count))
        return "min=\(String(format: "%.3f", minVal)) max=\(String(format: "%.3f", maxVal)) rms=\(String(format: "%.4f", rms))"
    }
    
    /// Generate speech using current cached embedding
    func generateSpeech(
        text: String,
        language: VoiceTranslationLanguage
    ) async throws -> VoiceGenerationResult {
        guard let embedding = currentEmbedding else {
            throw OpenVoiceCoreMLError.noEmbeddingAvailable
        }
        return try await generateSpeech(text: text, embedding: embedding, language: language)
    }
    
    // MARK: - CoreML Inference
    
    /// Run embedding extraction using FULL spectrogram (for real OpenVoice V2 weights)
    /// Input: spectrogram [frames, 513] -> Model input: [1, T, 513] -> Output: [1, 256]
    private func runEmbeddingExtraction(spectrogram: [[Float]]) async throws -> [Float] {
        // CRITICAL: No fallback - embedding extractor must be loaded
        guard let model = embeddingExtractor else {
            let error = "SpeakerEmbeddingExtractor not loaded - cannot extract voice embedding"
            mediaLogger.error("[OpenVoice-CoreML] ❌ \(error)")
            debugInfo.lastError = error
            throw OpenVoiceCoreMLError.modelNotLoaded
        }

        let frames = spectrogram.count
        let bins = configuration.specChannels  // 513

        mediaLogger.info("[OpenVoice-CoreML] runEmbeddingExtraction: \(frames) frames x \(bins) bins (full spectrogram)")

        // Log model input/output specification
        let modelDesc = model.modelDescription
        let inputNames = modelDesc.inputDescriptionsByName.keys.joined(separator: ", ")
        let outputNames = modelDesc.outputDescriptionsByName.keys.joined(separator: ", ")
        mediaLogger.info("[OpenVoice-CoreML] Embedding model - inputs: [\(inputNames)], outputs: [\(outputNames)]")

        // Prepare input: [1, frames, 513] - NOT transposed, frames first
        // The ReferenceEncoder expects [batch, time, channels]
        var flatInput = [Float](repeating: 0, count: frames * bins)
        for f in 0..<frames {
            for b in 0..<bins {
                flatInput[f * bins + b] = spectrogram[f][b]
            }
        }

        // Create MLMultiArray with Float16 for efficiency
        let inputArray = try MLMultiArray(shape: [1, NSNumber(value: frames), NSNumber(value: bins)], dataType: .float16)
        let inputPointer = inputArray.dataPointer.assumingMemoryBound(to: Float16.self)
        for i in 0..<flatInput.count {
            inputPointer[i] = Float16(flatInput[i])
        }

        // The real OpenVoice V2 model uses "spectrogram" as input name (not "mel_spectrogram")
        let inputName = "spectrogram"
        mediaLogger.info("[OpenVoice-CoreML] Using input name: '\(inputName)', shape: [1, \(frames), \(bins)]")

        // Run inference
        let provider = try MLDictionaryFeatureProvider(dictionary: [inputName: inputArray])
        let startTime = Date()
        mediaLogger.info("[OpenVoice-CoreML] Running embedding extraction inference...")
        let output = try await model.prediction(from: provider)
        let extractionMs = Date().timeIntervalSince(startTime) * 1000
        debugInfo.embeddingExtractionMs = extractionMs
        mediaLogger.info("[OpenVoice-CoreML] Embedding extraction complete in \(String(format: "%.1f", extractionMs))ms")

        // Use the exact output name from model metadata: "speaker_embedding"
        let outputName = "speaker_embedding"

        // Extract embedding
        guard let embeddingOutput = output.featureValue(for: outputName)?.multiArrayValue else {
            let availableOutputs = output.featureNames.joined(separator: ", ")
            mediaLogger.error("[OpenVoice-CoreML] No '\(outputName)' output. Available: [\(availableOutputs)]")
            throw OpenVoiceCoreMLError.inferenceError("No \(outputName) output")
        }

        mediaLogger.info("[OpenVoice-CoreML] Embedding output shape: \(embeddingOutput.shape), count: \(embeddingOutput.count)")

        var embedding = [Float](repeating: 0, count: 256)
        for i in 0..<min(256, embeddingOutput.count) {
            embedding[i] = embeddingOutput[i].floatValue
        }

        // Log embedding stats
        var minVal: Float = 0, maxVal: Float = 0, norm: Float = 0
        vDSP_minv(embedding, 1, &minVal, vDSP_Length(256))
        vDSP_maxv(embedding, 1, &maxVal, vDSP_Length(256))
        vDSP_svesq(embedding, 1, &norm, vDSP_Length(256))
        norm = sqrt(norm)
        mediaLogger.info("[OpenVoice-CoreML] Embedding stats: min=\(String(format: "%.3f", minVal)) max=\(String(format: "%.3f", maxVal)) norm=\(String(format: "%.3f", norm))")

        return embedding
    }

    private func runVocoder(melSpectrogram: [[Float]]) async throws -> [Float] {
        // CRITICAL: No fallback - vocoder must be loaded
        guard let model = vocoder else {
            let error = "HiFiGAN Vocoder not loaded - cannot generate audio"
            mediaLogger.error("[OpenVoice-CoreML] ❌ \(error)")
            debugInfo.lastError = error
            throw OpenVoiceCoreMLError.modelNotLoaded
        }

        mediaLogger.info("[OpenVoice-CoreML] runVocoder: \(melSpectrogram.count) frames")

        // Log model input/output specification
        let modelDesc = model.modelDescription
        let inputNames = modelDesc.inputDescriptionsByName.keys.joined(separator: ", ")
        let outputNames = modelDesc.outputDescriptionsByName.keys.joined(separator: ", ")
        mediaLogger.info("[OpenVoice-CoreML] Vocoder model - inputs: [\(inputNames)], outputs: [\(outputNames)]")

        // Prepare input: [1, 80, frames]
        let frames = melSpectrogram.count
        let mels = configuration.numMels

        // Transpose: [frames, mels] -> [mels, frames]
        var flatInput = [Float](repeating: 0, count: mels * frames)
        for f in 0..<frames {
            for m in 0..<mels {
                flatInput[m * frames + f] = melSpectrogram[f][m]
            }
        }

        // Create MLMultiArray with Float16 (matching model's expected type)
        let inputArray = try MLMultiArray(shape: [1, NSNumber(value: mels), NSNumber(value: frames)], dataType: .float16)
        let inputPointer = inputArray.dataPointer.assumingMemoryBound(to: Float16.self)
        for i in 0..<flatInput.count {
            inputPointer[i] = Float16(flatInput[i])
        }

        // Use the exact input name from model metadata: "mel_spectrogram"
        let inputName = "mel_spectrogram"
        mediaLogger.info("[OpenVoice-CoreML] Using input name: '\(inputName)', shape: [1, \(mels), \(frames)]")

        // Run vocoder
        let provider = try MLDictionaryFeatureProvider(dictionary: [inputName: inputArray])
        mediaLogger.info("[OpenVoice-CoreML] Running vocoder inference...")
        let output = try await model.prediction(from: provider)
        mediaLogger.info("[OpenVoice-CoreML] Vocoder inference complete")

        // Use the exact output name from model metadata: "waveform"
        let outputName = "waveform"

        guard let waveformOutput = output.featureValue(for: outputName)?.multiArrayValue else {
            // List available outputs for debugging
            let availableOutputs = output.featureNames.joined(separator: ", ")
            mediaLogger.error("[OpenVoice-CoreML] No '\(outputName)' output. Available: [\(availableOutputs)]")
            throw OpenVoiceCoreMLError.inferenceError("No \(outputName) output")
        }

        let samples = waveformOutput.count
        mediaLogger.info("[OpenVoice-CoreML] Vocoder output: \(samples) samples")

        var waveform = [Float](repeating: 0, count: samples)
        for i in 0..<samples {
            waveform[i] = waveformOutput[i].floatValue
        }

        // Log sample statistics to debug vocoder output quality
        var minVal: Float = 0, maxVal: Float = 0
        vDSP_minv(waveform, 1, &minVal, vDSP_Length(samples))
        vDSP_maxv(waveform, 1, &maxVal, vDSP_Length(samples))

        // Calculate mean and std
        var mean: Float = 0
        vDSP_meanv(waveform, 1, &mean, vDSP_Length(samples))

        var sumSq: Float = 0
        vDSP_svesq(waveform, 1, &sumSq, vDSP_Length(samples))
        let rms = sqrt(sumSq / Float(samples))

        mediaLogger.info("[OpenVoice-CoreML] 📊 Vocoder raw output stats:")
        mediaLogger.info("[OpenVoice-CoreML]   - Min: \(String(format: "%.6f", minVal)), Max: \(String(format: "%.6f", maxVal))")
        mediaLogger.info("[OpenVoice-CoreML]   - Mean: \(String(format: "%.6f", mean)), RMS: \(String(format: "%.6f", rms))")

        // Show first 10 samples to see pattern
        let firstSamples = waveform.prefix(10).map { String(format: "%.4f", $0) }.joined(separator: ", ")
        mediaLogger.info("[OpenVoice-CoreML]   - First 10 samples: [\(firstSamples)]")

        // Check if output looks valid
        if maxVal - minVal < 0.001 {
            mediaLogger.error("[OpenVoice-CoreML] ⚠️ Vocoder output is nearly constant (no variation)!")
        } else if rms < 0.0001 {
            mediaLogger.error("[OpenVoice-CoreML] ⚠️ Vocoder output is nearly silent!")
        } else if maxVal > 10 || minVal < -10 {
            mediaLogger.error("[OpenVoice-CoreML] ⚠️ Vocoder output has extreme values - may need normalization!")
            // Normalize if needed
            let scale = 0.9 / max(abs(minVal), abs(maxVal))
            for i in 0..<samples {
                waveform[i] *= scale
            }
            mediaLogger.info("[OpenVoice-CoreML] Applied normalization scale: \(scale)")
        }

        return waveform
    }
    
    // MARK: - Audio Processing
    
    private func preprocessAudio(from url: URL) async throws -> [Float] {
        let file = try AVAudioFile(forReading: url)
        let format = file.processingFormat
        let frameCount = UInt32(file.length)
        
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            throw OpenVoiceCoreMLError.invalidAudioFormat
        }
        
        try file.read(into: buffer)
        
        guard let channelData = buffer.floatChannelData?[0] else {
            throw OpenVoiceCoreMLError.invalidAudioFormat
        }
        
        var audioData = [Float](repeating: 0, count: Int(frameCount))
        for i in 0..<Int(frameCount) {
            audioData[i] = channelData[i]
        }
        
        // Resample if needed
        if format.sampleRate != configuration.sampleRate {
            audioData = resampleAudio(audioData, from: format.sampleRate, to: configuration.sampleRate)
        }
        
        // Normalize
        var maxValue: Float = 0
        vDSP_maxv(audioData, 1, &maxValue, vDSP_Length(audioData.count))
        if maxValue > 0 {
            var scale = 1.0 / maxValue
            vDSP_vsmul(audioData, 1, &scale, &audioData, 1, vDSP_Length(audioData.count))
        }
        
        return audioData
    }
    
    private func resampleAudio(_ audio: [Float], from sourceSR: Double, to targetSR: Double) -> [Float] {
        let ratio = targetSR / sourceSR
        let outputLength = Int(Double(audio.count) * ratio)
        var output = [Float](repeating: 0, count: outputLength)
        
        for i in 0..<outputLength {
            let sourceIndex = Double(i) / ratio
            let index0 = Int(sourceIndex)
            let index1 = min(index0 + 1, audio.count - 1)
            let fraction = Float(sourceIndex - Double(index0))
            output[i] = audio[index0] * (1 - fraction) + audio[index1] * fraction
        }
        
        return output
    }

    /// Extract full STFT magnitude spectrogram (513 channels) for OpenVoice V2 real weights
    /// Matches librosa.stft behavior with center=True, pad_mode='reflect'
    /// Output format: [frames, 513] - each frame has 513 frequency bins
    private func extractFullSpectrogram(from audio: [Float]) -> [[Float]] {
        let fftSize = configuration.fftSize
        let hopLength = configuration.hopLength
        let numBins = configuration.specChannels  // 513 = fftSize/2 + 1

        // CRITICAL: Match librosa center=True by padding the audio with reflect mode
        // librosa pads n_fft // 2 on each side
        let padAmount = fftSize / 2
        var paddedAudio = [Float](repeating: 0, count: audio.count + 2 * padAmount)

        // Reflect padding at start (reverse the first padAmount samples)
        for i in 0..<padAmount {
            let sourceIdx = min(padAmount - 1 - i, audio.count - 1)
            paddedAudio[i] = audio[max(0, sourceIdx)]
        }

        // Copy original audio
        for i in 0..<audio.count {
            paddedAudio[padAmount + i] = audio[i]
        }

        // Reflect padding at end (reverse the last padAmount samples)
        for i in 0..<padAmount {
            let sourceIdx = max(0, audio.count - 1 - i)
            paddedAudio[padAmount + audio.count + i] = audio[sourceIdx]
        }

        // Calculate number of frames with centered STFT
        let numFrames = max(1, (paddedAudio.count - fftSize) / hopLength + 1)
        var spectrogram = [[Float]](repeating: [Float](repeating: 0, count: numBins), count: numFrames)

        // Hann window - use vDSP_HANN_NORM for normalized Hann window (matches librosa)
        var window = [Float](repeating: 0, count: fftSize)
        vDSP_hann_window(&window, vDSP_Length(fftSize), Int32(vDSP_HANN_NORM))

        for frameIdx in 0..<numFrames {
            let startSample = frameIdx * hopLength
            let endSample = min(startSample + fftSize, paddedAudio.count)

            // Apply window to frame
            var frame = [Float](repeating: 0, count: fftSize)
            for i in 0..<(endSample - startSample) {
                frame[i] = paddedAudio[startSample + i] * window[i]
            }

            let magnitudeSpectrum = computeFFTMagnitude(frame)

            // CRITICAL: Store RAW magnitude spectrum (NOT log!)
            // OpenVoice expects raw magnitude, not log-scaled
            for binIdx in 0..<min(numBins, magnitudeSpectrum.count) {
                spectrogram[frameIdx][binIdx] = magnitudeSpectrum[binIdx]
            }
        }

        mediaLogger.info("[OpenVoice-CoreML] Extracted full spectrogram: \(numFrames) frames x \(numBins) bins (centered, raw magnitude)")
        return spectrogram
    }
    
    private func computeFFTMagnitude(_ frame: [Float]) -> [Float] {
        guard let setup = fftSetup else {
            // Return zeros if no FFT setup
            return [Float](repeating: 0, count: configuration.fftSize / 2 + 1)
        }

        let fftSize = configuration.fftSize
        let halfSize = fftSize / 2

        // Prepare split complex format for vDSP_fft_zrip
        // The real input is packed into even/odd pairs
        var realPart = [Float](repeating: 0, count: halfSize)
        var imagPart = [Float](repeating: 0, count: halfSize)

        // Pack the real signal into split complex format
        // Even indices go to real, odd indices go to imaginary
        for i in 0..<halfSize {
            realPart[i] = frame[2 * i]
            imagPart[i] = frame[2 * i + 1]
        }

        // Create DSPSplitComplex for in-place FFT
        var splitComplex = DSPSplitComplex(realp: &realPart, imagp: &imagPart)

        // Perform real-to-complex FFT in-place
        vDSP_fft_zrip(setup, &splitComplex, 1, log2n, FFTDirection(FFT_FORWARD))

        // CRITICAL: vDSP FFT returns results scaled by 2.0 compared to standard FFT
        // We need to divide by 2.0 to match numpy/librosa convention
        let scale: Float = 0.5  // = 1/2 to correct vDSP scaling

        // Calculate magnitude spectrum
        // The output is N/2+1 unique values for a real signal
        var magnitude = [Float](repeating: 0, count: halfSize + 1)

        // DC component (index 0) - realPart[0] contains the real DC value
        magnitude[0] = abs(realPart[0]) * scale

        // Positive frequencies (indices 1 to N/2-1)
        for i in 1..<halfSize {
            let real = realPart[i] * scale
            let imag = imagPart[i] * scale
            magnitude[i] = sqrt(real * real + imag * imag)
        }

        // Nyquist frequency (index N/2) - stored in imagPart[0] for packed format
        magnitude[halfSize] = abs(imagPart[0]) * scale

        return magnitude
    }

    /// Check if running on simulator
    private var isSimulator: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }

    /// Get or create the TTS synthesizer (reusing to avoid daemon issues)
    private func getOrCreateSynthesizer() -> AVSpeechSynthesizer {
        if let existing = ttsSynthesizer {
            return existing
        }
        let synth = AVSpeechSynthesizer()
        ttsSynthesizer = synth
        return synth
    }

    /// Pre-warm the TTS synthesizer (known workaround for write() issues)
    private func warmUpTTSIfNeeded(synthesizer: AVSpeechSynthesizer, voice: AVSpeechSynthesisVoice?) async {
        guard !isTTSWarmedUp else { return }

        mediaLogger.info("[OpenVoice-CoreML] Pre-warming TTS synthesizer...")

        // Speak a silent utterance to wake up the TTS daemon
        let warmupUtterance = AVSpeechUtterance(string: " ")
        warmupUtterance.voice = voice
        warmupUtterance.volume = 0  // Silent
        synthesizer.speak(warmupUtterance)

        // Wait for warmup
        try? await Task.sleep(nanoseconds: 500_000_000)  // 500ms

        // Stop warmup
        synthesizer.stopSpeaking(at: .immediate)

        // Small delay after stopping
        try? await Task.sleep(nanoseconds: 100_000_000)  // 100ms

        isTTSWarmedUp = true
        mediaLogger.info("[OpenVoice-CoreML] TTS synthesizer warmed up")
    }

    private func synthesizeBaseSpeech(text: String, language: VoiceTranslationLanguage) async throws -> [Float] {
        mediaLogger.info("[OpenVoice-CoreML] synthesizeBaseSpeech starting for: '\(text.prefix(30))...'")

        // CRITICAL: Check if running on simulator - write() doesn't work there
        if isSimulator {
            mediaLogger.error("[OpenVoice-CoreML] ❌ AVSpeechSynthesizer.write() does not work on Simulator!")
            mediaLogger.error("[OpenVoice-CoreML]    Please test on a real device for voice cloning")
            throw OpenVoiceCoreMLError.audioProcessingError
        }

        // Configure audio session for TTS synthesis
        // Use .playback category for write() - it's more reliable than .playAndRecord
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default, options: [.duckOthers])
            try audioSession.setActive(true)
            mediaLogger.info("[OpenVoice-CoreML] Audio session configured for TTS (.playback)")
        } catch {
            mediaLogger.error("[OpenVoice-CoreML] Failed to configure audio session: \(error)")
            // Continue anyway - TTS might still work
        }

        // Use persistent synthesizer to avoid daemon reconnection issues
        let synthesizer = getOrCreateSynthesizer()

        // Find and validate voice
        let voice = AVSpeechSynthesisVoice(language: language.localeIdentifier)
            ?? AVSpeechSynthesisVoice(language: String(language.localeIdentifier.prefix(2)))

        // Log voice info
        if let voice = voice {
            mediaLogger.info("[OpenVoice-CoreML] Using voice: \(voice.identifier) (\(voice.language))")
        } else {
            mediaLogger.info("[OpenVoice-CoreML] No specific voice found for \(language.localeIdentifier), using default")
        }

        // Pre-warm synthesizer (known workaround for write() issues)
        await warmUpTTSIfNeeded(synthesizer: synthesizer, voice: voice)

        // Create utterance
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        utterance.pitchMultiplier = 1.0
        utterance.volume = 1.0

        return try await withCheckedThrowingContinuation { continuation in
            var audioSamples: [Float] = []
            var hasResumed = false
            var bufferCount = 0
            let startTime = Date()

            synthesizer.write(utterance) { buffer in
                guard !hasResumed else { return }
                bufferCount += 1

                if let pcmBuffer = buffer as? AVAudioPCMBuffer {
                    // Accumulate audio samples
                    if pcmBuffer.frameLength > 0, let data = pcmBuffer.floatChannelData?[0] {
                        let count = Int(pcmBuffer.frameLength)
                        for i in 0..<count {
                            audioSamples.append(data[i])
                        }
                        if bufferCount == 1 {
                            mediaLogger.info("[OpenVoice-CoreML] First TTS buffer received: \(count) samples, format: \(pcmBuffer.format.sampleRate)Hz")
                        }
                    }
                } else {
                    // End of synthesis (nil buffer)
                    hasResumed = true
                    let elapsed = Date().timeIntervalSince(startTime) * 1000

                    if audioSamples.count > 1000 {
                        mediaLogger.info("[OpenVoice-CoreML] ✅ synthesizeBaseSpeech success: \(audioSamples.count) samples from \(bufferCount) buffers in \(String(format: "%.0f", elapsed))ms")
                        continuation.resume(returning: audioSamples)
                    } else {
                        mediaLogger.error("[OpenVoice-CoreML] ❌ synthesizeBaseSpeech failed: only \(audioSamples.count) samples after \(bufferCount) buffers")
                        mediaLogger.error("[OpenVoice-CoreML]    This usually means TTS daemon connection failed")
                        mediaLogger.error("[OpenVoice-CoreML]    Try restarting the app or device")
                        continuation.resume(throwing: OpenVoiceCoreMLError.audioProcessingError)
                    }
                }
            }

            // Timeout after 15 seconds - write() is known to hang on some devices
            DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
                guard !hasResumed else { return }
                hasResumed = true
                let elapsed = Date().timeIntervalSince(startTime) * 1000

                if audioSamples.count > 1000 {
                    mediaLogger.info("[OpenVoice-CoreML] synthesizeBaseSpeech timeout but got \(audioSamples.count) samples from \(bufferCount) buffers in \(String(format: "%.0f", elapsed))ms")
                    continuation.resume(returning: audioSamples)
                } else {
                    mediaLogger.error("[OpenVoice-CoreML] ❌ synthesizeBaseSpeech timeout: only \(audioSamples.count) samples after \(bufferCount) buffers")
                    mediaLogger.error("[OpenVoice-CoreML]    AVSpeechSynthesizer.write() timed out - TTS daemon may be unresponsive")
                    continuation.resume(throwing: OpenVoiceCoreMLError.audioProcessingError)
                }
            }
        }
    }
    
    private func saveAudioToFile(waveform: [Float]) throws -> URL {
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("openvoice_coreml_\(UUID().uuidString).wav")

        // Analyze audio quality before saving
        let analysis = analyzeAudioQuality(waveform)
        mediaLogger.info("[OpenVoice-CoreML] 🔊 Audio Analysis:")
        mediaLogger.info("[OpenVoice-CoreML]   - Duration: \(String(format: "%.2f", analysis.duration))s")
        mediaLogger.info("[OpenVoice-CoreML]   - RMS Energy: \(String(format: "%.4f", analysis.rmsEnergy))")
        mediaLogger.info("[OpenVoice-CoreML]   - Peak: \(String(format: "%.4f", analysis.peakAmplitude))")
        mediaLogger.info("[OpenVoice-CoreML]   - Zero Crossings: \(analysis.zeroCrossings) (\(String(format: "%.1f", analysis.zeroCrossingRate))/s)")
        mediaLogger.info("[OpenVoice-CoreML]   - Dynamic Range: \(String(format: "%.2f", analysis.dynamicRangeDb)) dB")
        mediaLogger.info("[OpenVoice-CoreML]   - Silence Ratio: \(String(format: "%.1f", analysis.silenceRatio * 100))%")
        mediaLogger.info("[OpenVoice-CoreML]   - Type: \(analysis.audioType)")

        if analysis.audioType == .silence {
            mediaLogger.error("[OpenVoice-CoreML] ⚠️ WARNING: Audio appears to be mostly silence!")
        } else if analysis.audioType == .continuousTone {
            mediaLogger.error("[OpenVoice-CoreML] ⚠️ WARNING: Audio appears to be a continuous tone (sine wave)!")
        } else if analysis.audioType == .noise {
            mediaLogger.error("[OpenVoice-CoreML] ⚠️ WARNING: Audio appears to be random noise!")
        }

        let format = AVAudioFormat(standardFormatWithSampleRate: configuration.sampleRate, channels: 1)!
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: UInt32(waveform.count))!
        buffer.frameLength = UInt32(waveform.count)

        let channelData = buffer.floatChannelData![0]
        for i in 0..<waveform.count {
            channelData[i] = waveform[i]
        }

        let file = try AVAudioFile(forWriting: outputURL, settings: format.settings)
        try file.write(from: buffer)

        return outputURL
    }

    // MARK: - Audio Quality Analysis

    struct AudioAnalysis {
        let duration: Double
        let rmsEnergy: Float
        let peakAmplitude: Float
        let zeroCrossings: Int
        let zeroCrossingRate: Double
        let dynamicRangeDb: Float
        let silenceRatio: Float
        let audioType: AudioType

        enum AudioType: String {
            case speech = "SPEECH (variable amplitude, moderate ZCR)"
            case continuousTone = "CONTINUOUS TONE (stable frequency)"
            case noise = "NOISE (high ZCR, random)"
            case silence = "SILENCE (very low energy)"
            case unknown = "UNKNOWN"
        }
    }

    private func analyzeAudioQuality(_ samples: [Float]) -> AudioAnalysis {
        guard !samples.isEmpty else {
            return AudioAnalysis(
                duration: 0, rmsEnergy: 0, peakAmplitude: 0,
                zeroCrossings: 0, zeroCrossingRate: 0,
                dynamicRangeDb: 0, silenceRatio: 1,
                audioType: .silence
            )
        }

        let duration = Double(samples.count) / configuration.sampleRate

        // RMS Energy
        var sumSquares: Float = 0
        vDSP_svesq(samples, 1, &sumSquares, vDSP_Length(samples.count))
        let rmsEnergy = sqrt(sumSquares / Float(samples.count))

        // Peak amplitude
        var peak: Float = 0
        vDSP_maxmgv(samples, 1, &peak, vDSP_Length(samples.count))

        // Zero crossing count
        var zeroCrossings = 0
        for i in 1..<samples.count {
            if (samples[i-1] >= 0 && samples[i] < 0) || (samples[i-1] < 0 && samples[i] >= 0) {
                zeroCrossings += 1
            }
        }
        let zeroCrossingRate = Double(zeroCrossings) / duration

        // Dynamic range (analyze amplitude envelope)
        let frameSize = Int(configuration.sampleRate * 0.02) // 20ms frames
        var frameEnergies: [Float] = []
        for i in stride(from: 0, to: samples.count - frameSize, by: frameSize) {
            var frameSum: Float = 0
            for j in 0..<frameSize {
                frameSum += samples[i + j] * samples[i + j]
            }
            frameEnergies.append(sqrt(frameSum / Float(frameSize)))
        }

        var dynamicRangeDb: Float = 0
        var silenceRatio: Float = 0

        if !frameEnergies.isEmpty {
            let sortedEnergies = frameEnergies.sorted()
            let p10 = sortedEnergies[Int(Double(sortedEnergies.count) * 0.1)]
            let p90 = sortedEnergies[Int(Double(sortedEnergies.count) * 0.9)]

            if p10 > 0.0001 {
                dynamicRangeDb = 20 * log10(p90 / p10)
            }

            // Count silent frames (energy < 0.01)
            let silentFrames = frameEnergies.filter { $0 < 0.01 }.count
            silenceRatio = Float(silentFrames) / Float(frameEnergies.count)
        }

        // Determine audio type
        let audioType: AudioAnalysis.AudioType
        if rmsEnergy < 0.001 {
            audioType = .silence
        } else if zeroCrossingRate > 8000 {
            // Very high ZCR = noise
            audioType = .noise
        } else if dynamicRangeDb < 3 && zeroCrossingRate > 100 && zeroCrossingRate < 2000 {
            // Low dynamic range + moderate ZCR = continuous tone (like sine wave)
            audioType = .continuousTone
        } else if dynamicRangeDb > 6 && silenceRatio < 0.8 {
            // Good dynamic range + not mostly silent = likely speech
            audioType = .speech
        } else {
            audioType = .unknown
        }

        return AudioAnalysis(
            duration: duration,
            rmsEnergy: rmsEnergy,
            peakAmplitude: peak,
            zeroCrossings: zeroCrossings,
            zeroCrossingRate: zeroCrossingRate,
            dynamicRangeDb: dynamicRangeDb,
            silenceRatio: silenceRatio,
            audioType: audioType
        )
    }
    
    // MARK: - Cache
    
    func getEmbedding(id: UUID) -> SpeakerEmbedding? {
        embeddingCache[id]
    }
    
    func clearCache() {
        embeddingCache.removeAll()
        currentEmbedding = nil
    }
}

// MARK: - Errors

enum OpenVoiceCoreMLError: Error, LocalizedError {
    case modelNotLoaded
    case modelLoadFailed(String)
    case invalidAudioFormat
    case noEmbeddingAvailable
    case inferenceError(String)
    case audioProcessingError
    
    var errorDescription: String? {
        switch self {
        case .modelNotLoaded:
            return "CoreML models are not loaded"
        case .modelLoadFailed(let message):
            return "Failed to load CoreML models: \(message)"
        case .invalidAudioFormat:
            return "Invalid audio format"
        case .noEmbeddingAvailable:
            return "No speaker embedding available"
        case .inferenceError(let message):
            return "Inference error: \(message)"
        case .audioProcessingError:
            return "Audio processing failed (TTS synthesis error)"
        }
    }
}
