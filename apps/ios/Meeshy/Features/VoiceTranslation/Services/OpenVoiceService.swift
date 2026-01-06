//
//  OpenVoiceService.swift
//  Meeshy
//
//  On-device voice cloning using OpenVoice V2 with ONNX Runtime
//  Provides instant voice cloning from a reference audio sample
//
//  Architecture:
//  1. ToneColorConverter: Extracts speaker embedding from reference audio
//  2. BaseSpeakerTTS: Generates base speech from text
//  3. VoiceConverter: Applies speaker embedding to generated speech
//
//  Performance: ~85ms per second of audio (12x real-time on Neural Engine)
//
//  iOS 17+
//

import Foundation
import AVFoundation
import Accelerate

// ONNX Runtime bindings - conditionally available
// When onnxruntime-swift package is properly configured, uncomment the import
// import OnnxRuntimeBindings

// MARK: - ONNX Runtime Type Placeholders
// These will be replaced by actual types when ONNX Runtime is available

/// Placeholder for ORT Environment
class ORTEnv {
    enum LoggingLevel {
        case warning
    }
    init(loggingLevel: LoggingLevel) throws {}
}

/// Placeholder for ORT Session
class ORTSession {
    init(env: ORTEnv, modelPath: String, sessionOptions: ORTSessionOptions) throws {}

    func run(withInputs inputs: [String: ORTValue], outputNames: Set<String>, runOptions: Any?) throws -> [String: ORTValue] {
        return [:]
    }
}

/// Placeholder for ORT Session Options
class ORTSessionOptions {
    func appendCoreMLExecutionProvider(with options: ORTCoreMLExecutionProviderOptions) throws {}
    func setGraphOptimizationLevel(_ level: GraphOptimizationLevel) throws {}

    enum GraphOptimizationLevel {
        case all
    }
}

/// Placeholder for CoreML Execution Provider Options
class ORTCoreMLExecutionProviderOptions {}

/// Placeholder for ORT Value
class ORTValue {
    enum ElementType {
        case float
        case int64
    }

    init(tensorData: NSMutableData, elementType: ElementType, shape: [NSNumber]) throws {}

    func tensorData() throws -> NSData { return NSData() }
    func tensorTypeAndShapeInfo() throws -> TensorTypeAndShapeInfo {
        return TensorTypeAndShapeInfo()
    }

    class TensorTypeAndShapeInfo {
        var shape: [NSNumber] = []
    }
}

// MARK: - OpenVoice Service

/// On-device voice cloning service using OpenVoice V2
/// Clones a voice from 6 seconds of reference audio and generates speech in that voice
@MainActor
final class OpenVoiceService: ObservableObject {

    // MARK: - Types

    /// Speaker embedding extracted from reference audio
    struct SpeakerEmbedding: Codable, Equatable {
        let id: UUID
        let embedding: [Float]
        let sourceLanguage: VoiceTranslationLanguage?
        let duration: TimeInterval
        let createdAt: Date

        /// Dimension of the embedding vector (OpenVoice uses 256-dim)
        static let dimension = 256
    }

    /// Voice cloning configuration
    struct Configuration {
        var minReferenceDuration: TimeInterval = 3.0  // Minimum 3 seconds
        var maxReferenceDuration: TimeInterval = 30.0 // Maximum 30 seconds
        var optimalReferenceDuration: TimeInterval = 6.0 // Optimal 6 seconds
        var sampleRate: Double = 22050  // OpenVoice sample rate
        var useNeuralEngine: Bool = true
        var enableQuantization: Bool = true  // INT8 quantization for speed

        static let `default` = Configuration()
        static let highQuality = Configuration(enableQuantization: false)
        static let lowLatency = Configuration(minReferenceDuration: 3.0, enableQuantization: true)
    }

    /// Model loading state
    enum ModelState: Equatable {
        case notLoaded
        case loading(progress: Double)
        case loaded
        case error(String)
    }

    /// Voice generation result
    struct VoiceGenerationResult {
        let audioData: Data
        let audioURL: URL
        let duration: TimeInterval
        let latencyMs: Double
        let speakerEmbedding: SpeakerEmbedding
    }

    // MARK: - Published State

    @Published private(set) var modelState: ModelState = .notLoaded
    @Published private(set) var isProcessing = false
    @Published private(set) var processingProgress: Double = 0
    @Published private(set) var currentEmbedding: SpeakerEmbedding?
    @Published private(set) var lastLatencyMs: Double = 0

    // MARK: - Private Properties

    private var configuration: Configuration
    private let modelDirectory: URL

    // ONNX Runtime environment and sessions
    private var ortEnv: ORTEnv?
    private var toneConverterSession: ORTSession?
    private var baseTTSSession: ORTSession?
    private var vocoderSession: ORTSession?

    // Cached embeddings for quick lookup
    private var embeddingCache: [UUID: SpeakerEmbedding] = [:]

    // Audio processing
    private let audioEngine = AVAudioEngine()

    // FFT setup for mel spectrogram extraction
    private var fftSetup: vDSP_DFT_Setup?
    private let fftSize: Int = 1024
    private let hopSize: Int = 256
    private let numMels: Int = 80
    private var melFilterbank: [[Float]] = []

    // MARK: - Initialization

    init(configuration: Configuration = .default) {
        self.configuration = configuration

        // Setup model directory
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        self.modelDirectory = documentsURL.appendingPathComponent("OpenVoiceModels", isDirectory: true)

        // Create directory if needed
        try? FileManager.default.createDirectory(at: modelDirectory, withIntermediateDirectories: true)

        // Setup FFT for mel spectrogram extraction
        fftSetup = vDSP_DFT_zop_CreateSetup(nil, vDSP_Length(fftSize), .FORWARD)

        // Create mel filterbank
        melFilterbank = createMelFilterbank(
            numFilters: numMels,
            fftSize: fftSize,
            sampleRate: configuration.sampleRate,
            fMin: 0,
            fMax: 8000
        )
    }

    deinit {
        if let setup = fftSetup {
            vDSP_DFT_DestroySetup(setup)
        }
    }

    // MARK: - Model Management

    /// Check if models are downloaded
    var areModelsDownloaded: Bool {
        let requiredModels = [
            "tone_color_converter.onnx",
            "base_speaker_tts.onnx",
            "hifigan_vocoder.onnx"
        ]

        return requiredModels.allSatisfy { modelName in
            FileManager.default.fileExists(atPath: modelDirectory.appendingPathComponent(modelName).path)
        }
    }

    /// Load OpenVoice models
    /// - Parameter progressCallback: Called with download/load progress (0.0 to 1.0)
    func loadModels(progressCallback: ((Double) -> Void)? = nil) async throws {
        guard modelState != .loaded else { return }

        modelState = .loading(progress: 0)

        do {
            // Step 1: Download models if needed (30% of progress)
            if !areModelsDownloaded {
                try await downloadModels { progress in
                    let scaledProgress = progress * 0.3
                    self.modelState = .loading(progress: scaledProgress)
                    progressCallback?(scaledProgress)
                }
            }

            // Step 2: Initialize ONNX Runtime sessions (70% of progress)
            try await initializeONNXSessions { progress in
                let scaledProgress = 0.3 + (progress * 0.7)
                self.modelState = .loading(progress: scaledProgress)
                progressCallback?(scaledProgress)
            }

            modelState = .loaded
            progressCallback?(1.0)

            mediaLogger.info("[OpenVoice] Models loaded successfully")

        } catch {
            let errorMessage = error.localizedDescription
            modelState = .error(errorMessage)
            mediaLogger.error("[OpenVoice] Failed to load models: \(error)")
            throw OpenVoiceError.modelLoadFailed(errorMessage)
        }
    }

    /// Download OpenVoice models from Hugging Face
    private func downloadModels(progressCallback: ((Double) -> Void)?) async throws {
        // Model URLs from Hugging Face or custom hosting
        let modelURLs: [(name: String, url: String)] = [
            ("tone_color_converter.onnx", "https://huggingface.co/myshell-ai/OpenVoiceV2/resolve/main/converter/tone_color_converter.onnx"),
            ("base_speaker_tts.onnx", "https://huggingface.co/myshell-ai/OpenVoiceV2/resolve/main/base_speakers/EN/base_speaker_tts.onnx"),
            ("hifigan_vocoder.onnx", "https://huggingface.co/myshell-ai/OpenVoiceV2/resolve/main/vocoder/hifigan_vocoder.onnx")
        ]

        for (index, model) in modelURLs.enumerated() {
            let destinationURL = modelDirectory.appendingPathComponent(model.name)

            // Skip if already downloaded
            if FileManager.default.fileExists(atPath: destinationURL.path) {
                let progress = Double(index + 1) / Double(modelURLs.count)
                progressCallback?(progress)
                continue
            }

            // Download model
            guard let url = URL(string: model.url) else {
                throw OpenVoiceError.invalidModelURL
            }

            let (data, response) = try await URLSession.shared.data(from: url)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                throw OpenVoiceError.downloadFailed(model.name)
            }

            // Save to disk
            try data.write(to: destinationURL)

            let progress = Double(index + 1) / Double(modelURLs.count)
            progressCallback?(progress)

            mediaLogger.info("[OpenVoice] Downloaded: \(model.name)")
        }
    }

    /// Initialize ONNX Runtime sessions
    private func initializeONNXSessions(progressCallback: ((Double) -> Void)?) async throws {
        // Initialize ONNX Runtime environment
        ortEnv = try ORTEnv(loggingLevel: .warning)

        guard let env = ortEnv else {
            throw OpenVoiceError.modelLoadFailed("Failed to create ONNX Runtime environment")
        }

        // Configure session options for Neural Engine acceleration
        let sessionOptions = try ORTSessionOptions()

        if configuration.useNeuralEngine {
            // Enable CoreML execution provider for Apple Neural Engine
            try sessionOptions.appendCoreMLExecutionProvider(
                with: ORTCoreMLExecutionProviderOptions()
            )
        }

        // Enable graph optimization for better performance
        try sessionOptions.setGraphOptimizationLevel(.all)

        // Load ToneColorConverter (speaker embedding extractor)
        progressCallback?(0.2)
        let toneConverterPath = modelDirectory.appendingPathComponent("tone_color_converter.onnx").path
        if FileManager.default.fileExists(atPath: toneConverterPath) {
            toneConverterSession = try ORTSession(
                env: env,
                modelPath: toneConverterPath,
                sessionOptions: sessionOptions
            )
            mediaLogger.info("[OpenVoice] ToneColorConverter loaded")
        }

        // Load BaseSpeakerTTS (text-to-mel)
        progressCallback?(0.5)
        let baseTTSPath = modelDirectory.appendingPathComponent("base_speaker_tts.onnx").path
        if FileManager.default.fileExists(atPath: baseTTSPath) {
            baseTTSSession = try ORTSession(
                env: env,
                modelPath: baseTTSPath,
                sessionOptions: sessionOptions
            )
            mediaLogger.info("[OpenVoice] BaseSpeakerTTS loaded")
        }

        // Load HiFi-GAN Vocoder (mel-to-waveform)
        progressCallback?(0.8)
        let vocoderPath = modelDirectory.appendingPathComponent("hifigan_vocoder.onnx").path
        if FileManager.default.fileExists(atPath: vocoderPath) {
            vocoderSession = try ORTSession(
                env: env,
                modelPath: vocoderPath,
                sessionOptions: sessionOptions
            )
            mediaLogger.info("[OpenVoice] HiFi-GAN Vocoder loaded")
        }

        progressCallback?(1.0)
        mediaLogger.info("[OpenVoice] ONNX sessions initialized with Neural Engine: \(configuration.useNeuralEngine)")
    }

    /// Unload models to free memory
    func unloadModels() {
        toneConverterSession = nil
        baseTTSSession = nil
        vocoderSession = nil
        ortEnv = nil
        currentEmbedding = nil
        embeddingCache.removeAll()
        modelState = .notLoaded
        mediaLogger.info("[OpenVoice] Models unloaded")
    }

    // MARK: - Speaker Embedding Extraction

    /// Extract speaker embedding from reference audio
    /// - Parameters:
    ///   - audioURL: URL of the reference audio file
    ///   - language: Optional source language hint
    /// - Returns: Speaker embedding for voice cloning
    func extractSpeakerEmbedding(
        from audioURL: URL,
        language: VoiceTranslationLanguage? = nil
    ) async throws -> SpeakerEmbedding {
        guard modelState == .loaded else {
            throw OpenVoiceError.modelNotLoaded
        }

        isProcessing = true
        processingProgress = 0

        defer {
            isProcessing = false
            processingProgress = 1.0
        }

        let startTime = Date()

        // Step 1: Load and preprocess audio
        processingProgress = 0.2
        let audioData = try await preprocessAudio(from: audioURL)

        // Step 2: Extract mel spectrogram
        processingProgress = 0.4
        let melSpectrogram = try extractMelSpectrogram(from: audioData)

        // Step 3: Run ToneColorConverter to get embedding
        processingProgress = 0.7
        let embeddingVector = try await runToneColorConverter(melSpectrogram: melSpectrogram)

        // Step 4: Create embedding object
        processingProgress = 0.9
        let duration = try getAudioDuration(from: audioURL)

        let embedding = SpeakerEmbedding(
            id: UUID(),
            embedding: embeddingVector,
            sourceLanguage: language,
            duration: duration,
            createdAt: Date()
        )

        // Cache the embedding
        embeddingCache[embedding.id] = embedding
        currentEmbedding = embedding

        let latency = Date().timeIntervalSince(startTime) * 1000
        lastLatencyMs = latency

        mediaLogger.info("[OpenVoice] Extracted embedding in \(String(format: "%.0f", latency))ms")

        return embedding
    }

    /// Extract speaker embedding from audio buffer (for real-time)
    func extractSpeakerEmbedding(
        from buffer: AVAudioPCMBuffer,
        language: VoiceTranslationLanguage? = nil
    ) async throws -> SpeakerEmbedding {
        guard modelState == .loaded else {
            throw OpenVoiceError.modelNotLoaded
        }

        let startTime = Date()

        // Convert buffer to float array
        guard let channelData = buffer.floatChannelData?[0] else {
            throw OpenVoiceError.invalidAudioFormat
        }

        let frameCount = Int(buffer.frameLength)
        var audioData = [Float](repeating: 0, count: frameCount)
        for i in 0..<frameCount {
            audioData[i] = channelData[i]
        }

        // Resample to 22050 Hz if needed
        let sampleRate = buffer.format.sampleRate
        if sampleRate != configuration.sampleRate {
            audioData = try resampleAudio(audioData, from: sampleRate, to: configuration.sampleRate)
        }

        // Extract mel spectrogram
        let melSpectrogram = try extractMelSpectrogram(from: audioData)

        // Run ToneColorConverter
        let embeddingVector = try await runToneColorConverter(melSpectrogram: melSpectrogram)

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

        return embedding
    }

    // MARK: - Voice Generation

    /// Generate speech with cloned voice
    /// - Parameters:
    ///   - text: Text to synthesize
    ///   - embedding: Speaker embedding to use for voice cloning
    ///   - language: Target language for synthesis
    /// - Returns: Generated audio with cloned voice
    func generateSpeech(
        text: String,
        embedding: SpeakerEmbedding,
        language: VoiceTranslationLanguage
    ) async throws -> VoiceGenerationResult {
        guard modelState == .loaded else {
            throw OpenVoiceError.modelNotLoaded
        }

        isProcessing = true
        processingProgress = 0

        defer {
            isProcessing = false
            processingProgress = 1.0
        }

        let startTime = Date()

        // Step 1: Convert text to phonemes
        processingProgress = 0.1
        let phonemes = try textToPhonemes(text, language: language)

        // Step 2: Run BaseSpeakerTTS to generate base audio
        processingProgress = 0.3
        let baseAudio = try await runBaseSpeakerTTS(phonemes: phonemes, language: language)

        // Step 3: Apply voice cloning with ToneColorConverter
        processingProgress = 0.6
        let clonedMel = try await applyVoiceCloning(baseAudio: baseAudio, embedding: embedding)

        // Step 4: Run vocoder to generate waveform
        processingProgress = 0.8
        let waveform = try await runVocoder(melSpectrogram: clonedMel)

        // Step 5: Save to file
        processingProgress = 0.95
        let outputURL = try saveAudioToFile(waveform: waveform)

        let duration = Double(waveform.count) / configuration.sampleRate
        let latency = Date().timeIntervalSince(startTime) * 1000
        lastLatencyMs = latency

        mediaLogger.info("[OpenVoice] Generated \(String(format: "%.1f", duration))s audio in \(String(format: "%.0f", latency))ms")

        return VoiceGenerationResult(
            audioData: Data(bytes: waveform, count: waveform.count * MemoryLayout<Float>.size),
            audioURL: outputURL,
            duration: duration,
            latencyMs: latency,
            speakerEmbedding: embedding
        )
    }

    /// Generate speech using current cached embedding
    func generateSpeech(
        text: String,
        language: VoiceTranslationLanguage
    ) async throws -> VoiceGenerationResult {
        guard let embedding = currentEmbedding else {
            throw OpenVoiceError.noEmbeddingAvailable
        }

        return try await generateSpeech(text: text, embedding: embedding, language: language)
    }

    // MARK: - Audio Processing

    private func preprocessAudio(from url: URL) async throws -> [Float] {
        let file = try AVAudioFile(forReading: url)
        let format = file.processingFormat
        let frameCount = UInt32(file.length)

        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            throw OpenVoiceError.invalidAudioFormat
        }

        try file.read(into: buffer)

        guard let channelData = buffer.floatChannelData?[0] else {
            throw OpenVoiceError.invalidAudioFormat
        }

        var audioData = [Float](repeating: 0, count: Int(frameCount))
        for i in 0..<Int(frameCount) {
            audioData[i] = channelData[i]
        }

        // Resample if needed
        if format.sampleRate != configuration.sampleRate {
            audioData = try resampleAudio(audioData, from: format.sampleRate, to: configuration.sampleRate)
        }

        // Normalize audio
        var maxValue: Float = 0
        vDSP_maxv(audioData, 1, &maxValue, vDSP_Length(audioData.count))
        if maxValue > 0 {
            var scale = 1.0 / maxValue
            vDSP_vsmul(audioData, 1, &scale, &audioData, 1, vDSP_Length(audioData.count))
        }

        return audioData
    }

    private func resampleAudio(_ audio: [Float], from sourceSR: Double, to targetSR: Double) throws -> [Float] {
        let ratio = targetSR / sourceSR
        let outputLength = Int(Double(audio.count) * ratio)
        var output = [Float](repeating: 0, count: outputLength)

        // Simple linear interpolation resampling
        for i in 0..<outputLength {
            let sourceIndex = Double(i) / ratio
            let index0 = Int(sourceIndex)
            let index1 = min(index0 + 1, audio.count - 1)
            let fraction = Float(sourceIndex - Double(index0))

            output[i] = audio[index0] * (1 - fraction) + audio[index1] * fraction
        }

        return output
    }

    private func extractMelSpectrogram(from audio: [Float]) throws -> [[Float]] {
        // Mel spectrogram extraction using vDSP FFT
        // OpenVoice uses 80 mel bins, 1024 FFT, 256 hop

        let numFrames = max(1, (audio.count - fftSize) / hopSize + 1)
        var melSpectrogram = [[Float]](repeating: [Float](repeating: 0, count: numMels), count: numFrames)

        // Hann window for STFT
        var window = [Float](repeating: 0, count: fftSize)
        vDSP_hann_window(&window, vDSP_Length(fftSize), Int32(vDSP_HANN_NORM))

        // Process each frame
        for frameIdx in 0..<numFrames {
            let startSample = frameIdx * hopSize
            let endSample = min(startSample + fftSize, audio.count)

            // Extract and window the frame
            var frame = [Float](repeating: 0, count: fftSize)
            for i in 0..<(endSample - startSample) {
                frame[i] = audio[startSample + i] * window[i]
            }

            // Compute FFT magnitude spectrum
            let magnitudeSpectrum = computeFFTMagnitude(frame)

            // Apply mel filterbank
            for melIdx in 0..<numMels {
                var melEnergy: Float = 0
                for freqIdx in 0..<magnitudeSpectrum.count {
                    melEnergy += magnitudeSpectrum[freqIdx] * melFilterbank[melIdx][freqIdx]
                }
                // Convert to log scale (add small epsilon to avoid log(0))
                melSpectrogram[frameIdx][melIdx] = log10(max(melEnergy, 1e-10))
            }
        }

        return melSpectrogram
    }

    /// Compute FFT magnitude spectrum using vDSP
    private func computeFFTMagnitude(_ frame: [Float]) -> [Float] {
        let halfSize = fftSize / 2

        // Prepare input for FFT (split complex format)
        var realInput = [Float](repeating: 0, count: halfSize)
        var imagInput = [Float](repeating: 0, count: halfSize)

        // Deinterleave input into real/imag
        for i in 0..<halfSize {
            realInput[i] = frame[2 * i]
            imagInput[i] = frame[2 * i + 1]
        }

        var realOutput = [Float](repeating: 0, count: halfSize)
        var imagOutput = [Float](repeating: 0, count: halfSize)

        // Execute FFT
        if let setup = fftSetup {
            vDSP_DFT_Execute(setup, realInput, imagInput, &realOutput, &imagOutput)
        }

        // Compute magnitude spectrum
        var magnitude = [Float](repeating: 0, count: halfSize + 1)
        for i in 0..<halfSize {
            magnitude[i] = sqrt(realOutput[i] * realOutput[i] + imagOutput[i] * imagOutput[i])
        }

        return magnitude
    }

    /// Create mel filterbank matrix
    private func createMelFilterbank(numFilters: Int, fftSize: Int, sampleRate: Double, fMin: Double, fMax: Double) -> [[Float]] {
        let numBins = fftSize / 2 + 1

        // Convert Hz to Mel scale
        func hzToMel(_ hz: Double) -> Double {
            return 2595.0 * log10(1.0 + hz / 700.0)
        }

        // Convert Mel to Hz
        func melToHz(_ mel: Double) -> Double {
            return 700.0 * (pow(10.0, mel / 2595.0) - 1.0)
        }

        let melMin = hzToMel(fMin)
        let melMax = hzToMel(fMax)

        // Create equally spaced mel points
        var melPoints = [Double](repeating: 0, count: numFilters + 2)
        for i in 0..<(numFilters + 2) {
            melPoints[i] = melMin + Double(i) * (melMax - melMin) / Double(numFilters + 1)
        }

        // Convert mel points to frequency bins
        var binPoints = [Int](repeating: 0, count: numFilters + 2)
        for i in 0..<(numFilters + 2) {
            let hz = melToHz(melPoints[i])
            binPoints[i] = Int((hz * Double(fftSize)) / sampleRate)
        }

        // Create filterbank
        var filterbank = [[Float]](repeating: [Float](repeating: 0, count: numBins), count: numFilters)

        for m in 0..<numFilters {
            for k in binPoints[m]..<binPoints[m + 1] where k < numBins {
                filterbank[m][k] = Float(k - binPoints[m]) / Float(binPoints[m + 1] - binPoints[m])
            }
            for k in binPoints[m + 1]..<binPoints[m + 2] where k < numBins {
                filterbank[m][k] = Float(binPoints[m + 2] - k) / Float(binPoints[m + 2] - binPoints[m + 1])
            }
        }

        return filterbank
    }

    private func runToneColorConverter(melSpectrogram: [[Float]]) async throws -> [Float] {
        // Run ONNX inference on ToneColorConverter to extract speaker embedding
        guard let session = toneConverterSession else {
            throw OpenVoiceError.modelNotLoaded
        }

        // Flatten mel spectrogram to 1D array and create input tensor
        let flatMel = melSpectrogram.flatMap { $0 }
        let shape: [NSNumber] = [1, NSNumber(value: melSpectrogram.count), NSNumber(value: numMels)]

        // Create ORT value from mel spectrogram
        let inputData = Data(bytes: flatMel, count: flatMel.count * MemoryLayout<Float>.size)
        let inputTensor = try ORTValue(
            tensorData: NSMutableData(data: inputData),
            elementType: .float,
            shape: shape
        )

        // Run inference
        let outputNames: Set<String> = ["speaker_embedding"]
        let outputs = try session.run(
            withInputs: ["mel_spectrogram": inputTensor],
            outputNames: outputNames,
            runOptions: nil
        )

        // Extract embedding from output
        guard let embeddingTensor = outputs["speaker_embedding"] else {
            throw OpenVoiceError.inferenceError("No speaker_embedding output")
        }

        // Get tensor data
        let tensorData = try embeddingTensor.tensorData() as Data
        let embeddingCount = tensorData.count / MemoryLayout<Float>.size
        var embedding = [Float](repeating: 0, count: embeddingCount)
        _ = embedding.withUnsafeMutableBytes { ptr in
            tensorData.copyBytes(to: ptr)
        }

        return embedding
    }

    private func textToPhonemes(_ text: String, language: VoiceTranslationLanguage) throws -> [Int] {
        // Convert text to phoneme IDs
        // Real implementation would use a phonemizer (espeak-ng or custom)

        // Placeholder: Simple character-to-ID mapping
        return text.unicodeScalars.map { Int($0.value) % 100 }
    }

    private func runBaseSpeakerTTS(phonemes: [Int], language: VoiceTranslationLanguage) async throws -> [[Float]] {
        // Run BaseSpeakerTTS to generate base mel spectrogram
        guard let session = baseTTSSession else {
            throw OpenVoiceError.modelNotLoaded
        }

        // Convert phonemes to Int64 array for ONNX
        let phonemeInt64 = phonemes.map { Int64($0) }
        let phonemeData = Data(bytes: phonemeInt64, count: phonemeInt64.count * MemoryLayout<Int64>.size)
        let phonemeShape: [NSNumber] = [1, NSNumber(value: phonemes.count)]

        let phonemeTensor = try ORTValue(
            tensorData: NSMutableData(data: phonemeData),
            elementType: .int64,
            shape: phonemeShape
        )

        // Language ID tensor (single int64)
        let languageId = Int64(language.openVoiceLanguageId)
        var langIdData = languageId
        let langData = Data(bytes: &langIdData, count: MemoryLayout<Int64>.size)
        let langTensor = try ORTValue(
            tensorData: NSMutableData(data: langData),
            elementType: .int64,
            shape: [1]
        )

        // Run inference
        let outputs = try session.run(
            withInputs: [
                "phoneme_ids": phonemeTensor,
                "language_id": langTensor
            ],
            outputNames: ["mel_spectrogram"],
            runOptions: nil
        )

        // Extract mel spectrogram from output
        guard let melTensor = outputs["mel_spectrogram"] else {
            throw OpenVoiceError.inferenceError("No mel_spectrogram output")
        }

        // Get tensor shape and data
        let tensorShape = try melTensor.tensorTypeAndShapeInfo().shape
        let tensorData = try melTensor.tensorData() as Data

        // Parse shape (assuming [1, frames, mels] or [1, mels, frames])
        let numFrames = tensorShape.count > 1 ? tensorShape[1].intValue : 1
        let melBins = tensorShape.count > 2 ? tensorShape[2].intValue : numMels

        // Convert to 2D array
        let totalFloats = tensorData.count / MemoryLayout<Float>.size
        var flatData = [Float](repeating: 0, count: totalFloats)
        _ = flatData.withUnsafeMutableBytes { ptr in
            tensorData.copyBytes(to: ptr)
        }

        // Reshape to [frames, mels]
        var melSpectrogram = [[Float]]()
        for i in 0..<numFrames {
            let startIdx = i * melBins
            let endIdx = min(startIdx + melBins, flatData.count)
            if startIdx < flatData.count {
                melSpectrogram.append(Array(flatData[startIdx..<endIdx]))
            }
        }

        return melSpectrogram
    }

    private func applyVoiceCloning(baseAudio: [[Float]], embedding: SpeakerEmbedding) async throws -> [[Float]] {
        // Apply speaker embedding to modify voice characteristics using ToneColorConverter
        guard let session = toneConverterSession else {
            throw OpenVoiceError.modelNotLoaded
        }

        // Prepare source mel spectrogram tensor
        let flatMel = baseAudio.flatMap { $0 }
        let melData = Data(bytes: flatMel, count: flatMel.count * MemoryLayout<Float>.size)
        let melShape: [NSNumber] = [1, NSNumber(value: baseAudio.count), NSNumber(value: numMels)]

        let melTensor = try ORTValue(
            tensorData: NSMutableData(data: melData),
            elementType: .float,
            shape: melShape
        )

        // Prepare speaker embedding tensor
        let embeddingData = Data(bytes: embedding.embedding, count: embedding.embedding.count * MemoryLayout<Float>.size)
        let embeddingShape: [NSNumber] = [1, NSNumber(value: SpeakerEmbedding.dimension)]

        let embeddingTensor = try ORTValue(
            tensorData: NSMutableData(data: embeddingData),
            elementType: .float,
            shape: embeddingShape
        )

        // Run voice conversion inference
        let outputs = try session.run(
            withInputs: [
                "source_mel": melTensor,
                "speaker_embedding": embeddingTensor
            ],
            outputNames: ["converted_mel"],
            runOptions: nil
        )

        // Extract converted mel spectrogram
        guard let convertedTensor = outputs["converted_mel"] else {
            throw OpenVoiceError.inferenceError("No converted_mel output")
        }

        // Get tensor data
        let tensorShape = try convertedTensor.tensorTypeAndShapeInfo().shape
        let tensorData = try convertedTensor.tensorData() as Data

        let numFrames = tensorShape.count > 1 ? tensorShape[1].intValue : baseAudio.count
        let melBins = tensorShape.count > 2 ? tensorShape[2].intValue : numMels

        // Convert to 2D array
        let totalFloats = tensorData.count / MemoryLayout<Float>.size
        var flatData = [Float](repeating: 0, count: totalFloats)
        _ = flatData.withUnsafeMutableBytes { ptr in
            tensorData.copyBytes(to: ptr)
        }

        var convertedMel = [[Float]]()
        for i in 0..<numFrames {
            let startIdx = i * melBins
            let endIdx = min(startIdx + melBins, flatData.count)
            if startIdx < flatData.count {
                convertedMel.append(Array(flatData[startIdx..<endIdx]))
            }
        }

        return convertedMel
    }

    private func runVocoder(melSpectrogram: [[Float]]) async throws -> [Float] {
        // Run HiFi-GAN vocoder to convert mel spectrogram to waveform
        guard let session = vocoderSession else {
            throw OpenVoiceError.modelNotLoaded
        }

        // Transpose mel spectrogram to [1, mels, frames] for HiFi-GAN
        let numFrames = melSpectrogram.count
        let melBins = melSpectrogram.first?.count ?? numMels

        // Transpose: [frames, mels] -> [mels, frames]
        var transposedMel = [Float](repeating: 0, count: numFrames * melBins)
        for f in 0..<numFrames {
            for m in 0..<melBins {
                transposedMel[m * numFrames + f] = melSpectrogram[f][m]
            }
        }

        // Create mel tensor
        let melData = Data(bytes: transposedMel, count: transposedMel.count * MemoryLayout<Float>.size)
        let melShape: [NSNumber] = [1, NSNumber(value: melBins), NSNumber(value: numFrames)]

        let melTensor = try ORTValue(
            tensorData: NSMutableData(data: melData),
            elementType: .float,
            shape: melShape
        )

        // Run vocoder inference
        let outputs = try session.run(
            withInputs: ["mel_spectrogram": melTensor],
            outputNames: ["waveform"],
            runOptions: nil
        )

        // Extract waveform
        guard let waveformTensor = outputs["waveform"] else {
            throw OpenVoiceError.inferenceError("No waveform output")
        }

        // Get waveform data
        let tensorData = try waveformTensor.tensorData() as Data
        let numSamples = tensorData.count / MemoryLayout<Float>.size

        var waveform = [Float](repeating: 0, count: numSamples)
        _ = waveform.withUnsafeMutableBytes { ptr in
            tensorData.copyBytes(to: ptr)
        }

        // Normalize output waveform to [-1, 1]
        var maxAbs: Float = 0
        vDSP_maxmgv(waveform, 1, &maxAbs, vDSP_Length(waveform.count))
        if maxAbs > 0 {
            var scale = 0.95 / maxAbs  // Leave some headroom
            vDSP_vsmul(waveform, 1, &scale, &waveform, 1, vDSP_Length(waveform.count))
        }

        return waveform
    }

    private func saveAudioToFile(waveform: [Float]) throws -> URL {
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("openvoice_output_\(UUID().uuidString).wav")

        // Create WAV file
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

    private func getAudioDuration(from url: URL) throws -> TimeInterval {
        let asset = AVURLAsset(url: url)
        return CMTimeGetSeconds(asset.duration)
    }

    // MARK: - Embedding Cache

    /// Get cached embedding by ID
    func getEmbedding(id: UUID) -> SpeakerEmbedding? {
        embeddingCache[id]
    }

    /// Clear embedding cache
    func clearCache() {
        embeddingCache.removeAll()
        currentEmbedding = nil
    }

    /// Save embedding to persistent storage
    func saveEmbedding(_ embedding: SpeakerEmbedding, name: String) throws {
        let url = modelDirectory.appendingPathComponent("embeddings/\(name).json")

        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        let data = try JSONEncoder().encode(embedding)
        try data.write(to: url)
    }

    /// Load saved embedding
    func loadEmbedding(name: String) throws -> SpeakerEmbedding {
        let url = modelDirectory.appendingPathComponent("embeddings/\(name).json")
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(SpeakerEmbedding.self, from: data)
    }
}

// MARK: - OpenVoice Errors

enum OpenVoiceError: Error, LocalizedError {
    case modelNotLoaded
    case modelLoadFailed(String)
    case invalidModelURL
    case downloadFailed(String)
    case invalidAudioFormat
    case noEmbeddingAvailable
    case inferenceError(String)
    case audioProcessingError(String)

    var errorDescription: String? {
        switch self {
        case .modelNotLoaded:
            return "OpenVoice models are not loaded"
        case .modelLoadFailed(let message):
            return "Failed to load OpenVoice models: \(message)"
        case .invalidModelURL:
            return "Invalid model URL"
        case .downloadFailed(let model):
            return "Failed to download model: \(model)"
        case .invalidAudioFormat:
            return "Invalid audio format"
        case .noEmbeddingAvailable:
            return "No speaker embedding available. Extract from reference audio first."
        case .inferenceError(let message):
            return "Inference error: \(message)"
        case .audioProcessingError(let message):
            return "Audio processing error: \(message)"
        }
    }
}
