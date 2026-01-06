//
//  TranslationPreviewService.swift
//  Meeshy
//
//  Service for previewing audio translations with voice cloning
//  Allows users to hear how their message will sound in different languages
//
//  Pipeline: Audio → STT → Translation → Voice-cloned TTS
//
//  iOS 17+
//

import Foundation
import AVFoundation
import Speech

// MARK: - Translation Preview Service

/// Service that generates translated audio previews with voice cloning
@MainActor
final class TranslationPreviewService: ObservableObject {

    // MARK: - Types

    /// Preview generation state
    enum PreviewState: Equatable {
        case idle
        case extractingVoice(progress: Double)
        case transcribing(progress: Double)
        case translating(progress: Double)
        case textReady                         // Texte traduit disponible (avant synthèse)
        case synthesizing(progress: Double)
        case ready                             // Audio prêt (clonage vocal)
        case readyWithFallback                 // Audio prêt (TTS Apple fallback)
        case textOnlyReady                     // Seulement texte (pas d'audio)
        case error(String)

        var isProcessing: Bool {
            switch self {
            case .extractingVoice, .transcribing, .translating, .synthesizing:
                return true
            default:
                return false
            }
        }

        var hasText: Bool {
            switch self {
            case .textReady, .ready, .readyWithFallback, .textOnlyReady:
                return true
            default:
                return false
            }
        }

        var hasAudio: Bool {
            switch self {
            case .ready, .readyWithFallback:
                return true
            default:
                return false
            }
        }

        var progress: Double {
            switch self {
            case .idle: return 0
            case .extractingVoice(let p): return p * 0.15
            case .transcribing(let p): return 0.15 + p * 0.35
            case .translating(let p): return 0.5 + p * 0.2
            case .textReady: return 0.7
            case .synthesizing(let p): return 0.7 + p * 0.3
            case .ready, .readyWithFallback, .textOnlyReady: return 1.0
            case .error: return 0
            }
        }

        /// Display text for the current state
        var displayText: String {
            switch self {
            case .idle: return ""
            case .extractingVoice: return "Extraction voix..."
            case .transcribing: return "Transcription..."
            case .translating: return "Traduction..."
            case .textReady: return "Traduction prête"
            case .synthesizing: return "Synthèse vocale..."
            case .ready: return "Prêt (voix clonée)"
            case .readyWithFallback: return "Prêt (voix standard)"
            case .textOnlyReady: return "Texte traduit"
            case .error: return "Erreur"
            }
        }
    }

    /// A generated translation preview
    struct TranslationPreview: Identifiable {
        let id: UUID
        let targetLanguage: VoiceTranslationLanguage
        let originalText: String
        let translatedText: String
        let audioURL: URL?              // nil si pas d'audio
        let duration: TimeInterval
        let generatedAt: Date
        let usedVoiceCloning: Bool      // true = OpenVoice, false = Apple TTS

        var hasAudio: Bool { audioURL != nil }
    }

    /// Text-only translation result (before audio synthesis)
    struct TextTranslation {
        let originalText: String
        let translatedText: String
        let sourceLanguage: VoiceTranslationLanguage
        let targetLanguage: VoiceTranslationLanguage
    }

    // MARK: - Published State

    @Published private(set) var state: PreviewState = .idle
    @Published private(set) var currentPreview: TranslationPreview?
    @Published private(set) var currentTextTranslation: TextTranslation?  // Traduction texte (avant audio)
    @Published private(set) var cachedPreviews: [VoiceTranslationLanguage: TranslationPreview] = [:]
    @Published private(set) var cachedTextTranslations: [VoiceTranslationLanguage: TextTranslation] = [:]
    @Published private(set) var isPlaying = false
    @Published var selectedLanguage: VoiceTranslationLanguage = .english
    @Published var synthesisEnabled = true  // Permet de désactiver la synthèse vocale
    @Published var useBackendTTS = true     // Utiliser le backend pour TTS avec clonage vocal

    // MARK: - Private Properties

    private let openVoiceCoreMLService: OpenVoiceCoreMLService
    private let backendAudioService = BackendAudioService.shared
    private var audioPlayer: AVAudioPlayer?
    private var currentTask: Task<Void, Never>?
    private var speakerEmbedding: OpenVoiceCoreMLService.SpeakerEmbedding?
    private var originalTranscription: String?
    private var sourceLanguage: VoiceTranslationLanguage?
    private var currentUserId: String?  // For backend voice cloning

    // MARK: - Initialization

    init(openVoiceCoreMLService: OpenVoiceCoreMLService? = nil) {
        self.openVoiceCoreMLService = openVoiceCoreMLService ?? OpenVoiceCoreMLService()
    }

    // MARK: - Preview Generation

    /// Generate a translation preview for the given audio
    /// Pipeline: Transcription → Translation → (Optional) Voice Synthesis
    /// - Parameters:
    ///   - audioURL: Source audio URL
    ///   - targetLanguage: Language to translate to
    ///   - sourceLanguage: Optional source language hint
    func generatePreview(
        audioURL: URL,
        targetLanguage: VoiceTranslationLanguage,
        sourceLanguage: VoiceTranslationLanguage? = nil
    ) async {
        // Cancel any existing task
        currentTask?.cancel()

        // Check cache first (full preview with audio)
        if let cached = cachedPreviews[targetLanguage] {
            currentPreview = cached
            currentTextTranslation = TextTranslation(
                originalText: cached.originalText,
                translatedText: cached.translatedText,
                sourceLanguage: self.sourceLanguage ?? .french,
                targetLanguage: targetLanguage
            )
            state = cached.usedVoiceCloning ? .ready : .readyWithFallback
            return
        }

        // Check text-only cache
        if let cachedText = cachedTextTranslations[targetLanguage] {
            currentTextTranslation = cachedText
        }

        currentTask = Task {
            do {
                // ========================================
                // PHASE 1: TRANSCRIPTION (ON-DEVICE ONLY)
                // Uses Apple's SFSpeechRecognizer - no backend fallback
                // ========================================
                if originalTranscription == nil {
                    state = .transcribing(progress: 0)
                    mediaLogger.info("[TranslationPreview] Starting ON-DEVICE transcription (edge)")
                    let transcription = try await transcribeAudio(url: audioURL, language: sourceLanguage)
                    originalTranscription = transcription.text
                    self.sourceLanguage = transcription.language
                    state = .transcribing(progress: 1.0)
                }

                guard let originalText = originalTranscription,
                      let srcLang = self.sourceLanguage else {
                    throw TranslationPreviewError.transcriptionFailed
                }

                // ========================================
                // PHASE 2: TRANSLATION (ON-DEVICE via Apple Translation)
                // Uses iOS 17+ Translation framework - no backend fallback
                // ========================================
                state = .translating(progress: 0)
                mediaLogger.info("[TranslationPreview] Starting ON-DEVICE translation (edge)")
                let translatedText = try await translateText(
                    originalText,
                    from: srcLang,
                    to: targetLanguage
                )
                state = .translating(progress: 1.0)

                // ✅ Texte traduit disponible immédiatement
                let textTranslation = TextTranslation(
                    originalText: originalText,
                    translatedText: translatedText,
                    sourceLanguage: srcLang,
                    targetLanguage: targetLanguage
                )
                currentTextTranslation = textTranslation
                cachedTextTranslations[targetLanguage] = textTranslation
                state = .textReady

                mediaLogger.info("[TranslationPreview] Text ready: \(translatedText.prefix(50))...")

                // ========================================
                // PHASE 3: SYNTHÈSE VOCALE (optionnelle)
                // ========================================
                guard synthesisEnabled else {
                    // Mode texte uniquement
                    let preview = TranslationPreview(
                        id: UUID(),
                        targetLanguage: targetLanguage,
                        originalText: originalText,
                        translatedText: translatedText,
                        audioURL: nil,
                        duration: 0,
                        generatedAt: Date(),
                        usedVoiceCloning: false
                    )
                    cachedPreviews[targetLanguage] = preview
                    currentPreview = preview
                    state = .textOnlyReady
                    return
                }

                // TTS Priority: OpenVoice CoreML (on-device) > Apple TTS (fallback)
                // 100% Edge - No backend required for voice cloning!
                var audioResult: (url: URL, duration: TimeInterval, usedCloning: Bool)?

                // 3a. PRIMARY: OpenVoice CoreML on-device voice cloning
                if audioResult == nil {
                    do {
                        state = .extractingVoice(progress: 0)

                        // Charger les modèles CoreML si nécessaire
                        if openVoiceCoreMLService.modelState != .loaded {
                            mediaLogger.info("[TranslationPreview] Loading OpenVoice CoreML models...")
                            try await openVoiceCoreMLService.loadModels { progress in
                                Task { @MainActor in
                                    self.state = .extractingVoice(progress: progress * 0.5)
                                }
                            }
                        }

                        // Extraire l'empreinte vocale
                        if speakerEmbedding == nil {
                            state = .extractingVoice(progress: 0.5)
                            mediaLogger.info("[TranslationPreview] Extracting speaker embedding...")
                            speakerEmbedding = try await openVoiceCoreMLService.extractSpeakerEmbedding(
                                from: audioURL,
                                language: sourceLanguage
                            )
                        }
                        state = .extractingVoice(progress: 1.0)

                        if let embedding = speakerEmbedding {
                            // Générer la voix clonée
                            state = .synthesizing(progress: 0)
                            mediaLogger.info("[TranslationPreview] Generating cloned speech with CoreML...")
                            let result = try await openVoiceCoreMLService.generateSpeech(
                                text: translatedText,
                                embedding: embedding,
                                language: targetLanguage
                            )
                            state = .synthesizing(progress: 1.0)
                            audioResult = (result.audioURL, result.duration, true)
                            mediaLogger.info("[TranslationPreview] OpenVoice CoreML succeeded: \(String(format: "%.1f", result.duration))s audio")
                        }
                    } catch {
                        mediaLogger.info("[TranslationPreview] OpenVoice CoreML failed: \(error)")
                    }
                }

                // 3c. Fallback final: Apple TTS si tout échoue
                if audioResult == nil {
                    state = .synthesizing(progress: 0.5)
                    mediaLogger.info("[TranslationPreview] Attempting Apple TTS fallback...")

                    // Reset audio session for fallback TTS (may have been modified by OpenVoice)
                    do {
                        try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                        try await Task.sleep(nanoseconds: 100_000_000)  // 100ms pause
                    } catch {
                        mediaLogger.info("[TranslationPreview] Audio session reset warning: \(error)")
                    }

                    if let fallbackResult = try? await generateAppleTTS(
                        text: translatedText,
                        language: targetLanguage
                    ) {
                        audioResult = (fallbackResult.url, fallbackResult.duration, false)
                        mediaLogger.info("[TranslationPreview] Apple TTS fallback succeeded: \(String(format: "%.1f", fallbackResult.duration))s")
                    } else {
                        mediaLogger.error("[TranslationPreview] ❌ Apple TTS fallback also failed")
                        if isSimulator {
                            mediaLogger.error("[TranslationPreview]    Voice synthesis is limited on Simulator")
                            mediaLogger.error("[TranslationPreview]    Please test on a real device for full audio")
                        }
                    }
                    state = .synthesizing(progress: 1.0)
                }

                // Créer le preview
                let preview = TranslationPreview(
                    id: UUID(),
                    targetLanguage: targetLanguage,
                    originalText: originalText,
                    translatedText: translatedText,
                    audioURL: audioResult?.url,
                    duration: audioResult?.duration ?? 0,
                    generatedAt: Date(),
                    usedVoiceCloning: audioResult?.usedCloning ?? false
                )

                // Cache and set current
                cachedPreviews[targetLanguage] = preview
                currentPreview = preview

                // Définir l'état final selon le résultat
                if preview.hasAudio {
                    state = preview.usedVoiceCloning ? .ready : .readyWithFallback
                } else {
                    state = .textOnlyReady
                }

                mediaLogger.info("[TranslationPreview] Generated preview for \(targetLanguage.rawValue) (audio: \(preview.hasAudio), cloning: \(preview.usedVoiceCloning))")

            } catch {
                if Task.isCancelled { return }
                state = .error(error.localizedDescription)
                mediaLogger.error("[TranslationPreview] Failed: \(error)")
            }
        }
    }

    /// Generate previews for multiple languages
    func generatePreviews(
        audioURL: URL,
        languages: [VoiceTranslationLanguage],
        sourceLanguage: VoiceTranslationLanguage? = nil
    ) async {
        for language in languages {
            if Task.isCancelled { break }
            await generatePreview(
                audioURL: audioURL,
                targetLanguage: language,
                sourceLanguage: sourceLanguage
            )
        }
    }

    // MARK: - Playback

    /// Play the current preview
    func playPreview() {
        guard let preview = currentPreview else { return }
        playPreview(preview)
    }

    /// Play a specific preview
    func playPreview(_ preview: TranslationPreview) {
        guard let audioURL = preview.audioURL else {
            mediaLogger.info("[TranslationPreview] No audio available for this preview")
            return
        }

        // Validate audio file before playing
        guard FileManager.default.fileExists(atPath: audioURL.path) else {
            mediaLogger.error("[TranslationPreview] Audio file doesn't exist: \(audioURL.path)")
            return
        }

        let fileSize = (try? FileManager.default.attributesOfItem(atPath: audioURL.path)[.size] as? Int) ?? 0
        mediaLogger.info("[TranslationPreview] Playing audio: \(audioURL.lastPathComponent), size=\(fileSize) bytes")

        guard fileSize > 100 else {
            mediaLogger.error("[TranslationPreview] Audio file too small: \(fileSize) bytes")
            return
        }

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)

            audioPlayer = try AVAudioPlayer(contentsOf: audioURL)
            audioPlayer?.prepareToPlay()

            // Log audio file info
            if let player = audioPlayer {
                mediaLogger.info("[TranslationPreview] AVAudioPlayer ready: duration=\(String(format: "%.1f", player.duration))s, channels=\(player.numberOfChannels)")
            }

            audioPlayer?.delegate = AudioPlayerDelegate { [weak self] in
                Task { @MainActor in
                    self?.isPlaying = false
                    mediaLogger.info("[TranslationPreview] Playback finished")
                }
            }

            let playStarted = audioPlayer?.play() ?? false
            isPlaying = playStarted
            mediaLogger.info("[TranslationPreview] Playback started: \(playStarted)")

        } catch {
            mediaLogger.error("[TranslationPreview] Playback failed: \(error)")
        }
    }

    /// Stop playback
    func stopPlayback() {
        audioPlayer?.stop()
        audioPlayer = nil
        isPlaying = false
    }

    /// Toggle play/pause
    func togglePlayback() {
        if isPlaying {
            stopPlayback()
        } else {
            playPreview()
        }
    }

    // MARK: - Transcription

    private func transcribeAudio(
        url: URL,
        language: VoiceTranslationLanguage?
    ) async throws -> (text: String, language: VoiceTranslationLanguage) {
        // Request speech recognition authorization
        let status = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }

        guard status == .authorized else {
            throw TranslationPreviewError.speechRecognitionNotAuthorized
        }

        // Use specified language or detect
        let locale = language?.locale ?? Locale.current

        guard let recognizer = SFSpeechRecognizer(locale: locale),
              recognizer.isAvailable else {
            throw TranslationPreviewError.recognizerNotAvailable
        }

        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = false

        if #available(iOS 16.0, *) {
            request.addsPunctuation = true
        }

        return try await withCheckedThrowingContinuation { continuation in
            recognizer.recognitionTask(with: request) { result, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                guard let result = result, result.isFinal else { return }

                let detectedLanguage = language ?? self.detectLanguage(from: result.bestTranscription.formattedString)
                continuation.resume(returning: (result.bestTranscription.formattedString, detectedLanguage))
            }
        }
    }

    private func detectLanguage(from text: String) -> VoiceTranslationLanguage {
        // Use NLLanguageRecognizer to detect language
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)

        guard let dominantLanguage = recognizer.dominantLanguage?.rawValue else {
            return .english
        }

        // Map to VoiceTranslationLanguage
        let languageCode = String(dominantLanguage.prefix(2))
        return VoiceTranslationLanguage(rawValue: languageCode) ?? .english
    }

    // MARK: - Translation

    private let translationService = OnDeviceTranslationService()

    private func translateText(
        _ text: String,
        from sourceLanguage: VoiceTranslationLanguage,
        to targetLanguage: VoiceTranslationLanguage
    ) async throws -> String {
        // If same language, return original
        if sourceLanguage == targetLanguage {
            return text
        }

        // Use the OnDeviceTranslationService which handles iOS 17/18 compatibility
        let result = try await translationService.translate(
            text,
            from: sourceLanguage,
            to: targetLanguage
        )

        return result.translatedText
    }

    // MARK: - Apple TTS Fallback

    /// Persistent TTS delegate to capture speech events
    private var ttsDelegate: TTSSpeechDelegate?
    private var ttsSynthesizer: AVSpeechSynthesizer?

    /// Check if running on simulator
    private var isSimulator: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }

    /// Generate speech using Apple's AVSpeechSynthesizer as fallback
    /// Uses speak() with AVAudioEngine recording instead of write() which has known issues
    private func generateAppleTTS(
        text: String,
        language: VoiceTranslationLanguage
    ) async throws -> (url: URL, duration: TimeInterval) {
        mediaLogger.info("[AppleTTS] Starting TTS for: '\(text.prefix(30))...' in \(language.rawValue)")

        // On simulator, skip write() method which is known to be broken
        if !isSimulator {
            // Try the write() method with proper pre-warming (works on real devices)
            if let result = try? await generateAppleTTSWithWrite(text: text, language: language) {
                return result
            }
            mediaLogger.info("[AppleTTS] write() failed, trying speak() with recording")
        } else {
            mediaLogger.info("[AppleTTS] Simulator detected, skipping write() method")
        }

        // Fallback: Use speak() with recording
        // This plays audio through speakers and records it
        return try await generateAppleTTSWithRecording(text: text, language: language)
    }

    /// Try using write() method with proper pre-warming and audio session config
    private func generateAppleTTSWithWrite(
        text: String,
        language: VoiceTranslationLanguage
    ) async throws -> (url: URL, duration: TimeInterval) {
        // Create synthesizer and pre-warm it
        let synthesizer = AVSpeechSynthesizer()
        ttsSynthesizer = synthesizer

        // Find and validate voice
        guard let voice = findBestVoice(for: language) else {
            throw TranslationPreviewError.synthesisError("No voice available for \(language.rawValue)")
        }
        mediaLogger.info("[AppleTTS] Using voice: \(voice.language) (\(voice.name)) quality=\(voice.quality.rawValue)")

        // Pre-warm by speaking an empty/silent utterance (known workaround)
        let warmupUtterance = AVSpeechUtterance(string: " ")
        warmupUtterance.voice = voice
        warmupUtterance.volume = 0  // Silent
        synthesizer.speak(warmupUtterance)

        // Wait for warmup to complete
        try await Task.sleep(nanoseconds: 500_000_000)  // 500ms

        // Stop the warmup
        synthesizer.stopSpeaking(at: .immediate)

        // Small delay after stopping
        try await Task.sleep(nanoseconds: 100_000_000)  // 100ms

        // Now configure for write()
        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        try audioSession.setCategory(.playback, mode: .default, options: [.duckOthers])
        try audioSession.setActive(true)

        // Create the actual utterance
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        utterance.pitchMultiplier = 1.0
        utterance.volume = 1.0

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("tts_\(UUID().uuidString).wav")

        return try await withCheckedThrowingContinuation { continuation in
            var audioFile: AVAudioFile?
            var hasResumed = false
            var totalFrames: AVAudioFrameCount = 0
            var bufferCount = 0

            synthesizer.write(utterance) { buffer in
                guard !hasResumed else { return }
                bufferCount += 1

                guard let pcmBuffer = buffer as? AVAudioPCMBuffer else {
                    // Synthesis complete - verify file is valid
                    hasResumed = true

                    // Close file handle before validation
                    audioFile = nil

                    // Verify file exists and has valid audio
                    let fileSize = (try? FileManager.default.attributesOfItem(atPath: outputURL.path)[.size] as? Int) ?? 0

                    // Try to actually open the file and verify it has audio
                    do {
                        let verifyFile = try AVAudioFile(forReading: outputURL)
                        let actualDuration = Double(verifyFile.length) / verifyFile.fileFormat.sampleRate

                        if actualDuration > 0.1 { // At least 100ms of audio
                            mediaLogger.info("[AppleTTS] write() success: \(totalFrames) frames, \(bufferCount) buffers, \(fileSize) bytes, verified duration=\(String(format: "%.1f", actualDuration))s")
                            continuation.resume(returning: (outputURL, actualDuration))
                        } else {
                            mediaLogger.error("[AppleTTS] write() produced file with no audio: duration=\(actualDuration)s")
                            continuation.resume(throwing: TranslationPreviewError.synthesisError("write() no audio"))
                        }
                    } catch {
                        mediaLogger.error("[AppleTTS] write() produced invalid file: \(error)")
                        continuation.resume(throwing: TranslationPreviewError.synthesisError("write() invalid file"))
                    }
                    return
                }

                guard pcmBuffer.frameLength > 0 else { return }

                do {
                    if audioFile == nil {
                        let format = pcmBuffer.format
                        let settings: [String: Any] = [
                            AVFormatIDKey: kAudioFormatLinearPCM,
                            AVSampleRateKey: format.sampleRate,
                            AVNumberOfChannelsKey: format.channelCount,
                            AVLinearPCMBitDepthKey: 16,
                            AVLinearPCMIsFloatKey: false,
                            AVLinearPCMIsBigEndianKey: false,
                            AVLinearPCMIsNonInterleaved: false
                        ]
                        audioFile = try AVAudioFile(forWriting: outputURL, settings: settings)
                        mediaLogger.info("[AppleTTS] Created file: \(format.sampleRate)Hz, \(format.channelCount)ch")
                    }
                    try audioFile?.write(from: pcmBuffer)
                    totalFrames += pcmBuffer.frameLength
                } catch {
                    guard !hasResumed else { return }
                    hasResumed = true
                    mediaLogger.error("[AppleTTS] Write error: \(error)")
                    continuation.resume(throwing: error)
                }
            }

            // Timeout after 15 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
                guard !hasResumed else { return }
                hasResumed = true

                // Close file handle
                audioFile = nil

                // Verify file has actual audio by opening it
                do {
                    let verifyFile = try AVAudioFile(forReading: outputURL)
                    let actualDuration = Double(verifyFile.length) / verifyFile.fileFormat.sampleRate

                    if actualDuration > 0.1 {
                        mediaLogger.info("[AppleTTS] write() timeout but valid: verified duration=\(String(format: "%.1f", actualDuration))s")
                        continuation.resume(returning: (outputURL, actualDuration))
                    } else {
                        mediaLogger.error("[AppleTTS] write() timeout with empty audio")
                        continuation.resume(throwing: TranslationPreviewError.synthesisError("write() timeout empty"))
                    }
                } catch {
                    mediaLogger.error("[AppleTTS] write() timeout with invalid file: \(error)")
                    continuation.resume(throwing: TranslationPreviewError.synthesisError("write() timeout invalid"))
                }
            }
        }
    }

    /// Validate that an audio file is playable
    private func validateAudioFile(_ url: URL) -> Bool {
        guard FileManager.default.fileExists(atPath: url.path) else { return false }
        guard let fileSize = try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int else { return false }
        guard fileSize > 1000 else { return false } // At least 1KB

        // Try to load it as audio
        do {
            let file = try AVAudioFile(forReading: url)
            return file.length > 0
        } catch {
            return false
        }
    }

    /// Fallback: Use speak() and record the audio output
    private func generateAppleTTSWithRecording(
        text: String,
        language: VoiceTranslationLanguage
    ) async throws -> (url: URL, duration: TimeInterval) {
        guard let voice = findBestVoice(for: language) else {
            throw TranslationPreviewError.synthesisError("No voice available")
        }

        let synthesizer = AVSpeechSynthesizer()
        ttsSynthesizer = synthesizer

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate

        // Set up audio engine to capture output
        let audioEngine = AVAudioEngine()
        let outputNode = audioEngine.outputNode
        let format = outputNode.outputFormat(forBus: 0)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("tts_\(UUID().uuidString).caf")

        // Configure audio session for recording
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
        try audioSession.setActive(true)

        // Create audio file
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: format.channelCount,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false
        ]
        let audioFile = try AVAudioFile(forWriting: outputURL, settings: settings)
        var totalFrames: AVAudioFrameCount = 0

        // Install tap on the main mixer to capture all audio output
        let mixerNode = audioEngine.mainMixerNode
        let mixerFormat = mixerNode.outputFormat(forBus: 0)

        mixerNode.installTap(onBus: 0, bufferSize: 4096, format: mixerFormat) { buffer, _ in
            do {
                try audioFile.write(from: buffer)
                totalFrames += buffer.frameLength
            } catch {
                mediaLogger.error("[AppleTTS] Recording write error: \(error)")
            }
        }

        // Start audio engine
        try audioEngine.start()

        // Create delegate to track speech completion
        return try await withCheckedThrowingContinuation { continuation in
            var hasResumed = false

            let delegate = TTSSpeechDelegate(
                onStart: {
                    mediaLogger.info("[AppleTTS] Recording: Speech started")
                },
                onFinish: {
                    guard !hasResumed else { return }
                    hasResumed = true

                    // Stop recording after a small delay to capture any trailing audio
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        mixerNode.removeTap(onBus: 0)
                        audioEngine.stop()

                        let duration = Double(totalFrames) / mixerFormat.sampleRate
                        mediaLogger.info("[AppleTTS] Recording complete: \(totalFrames) frames, \(String(format: "%.1f", duration))s")

                        if totalFrames > 0 {
                            continuation.resume(returning: (outputURL, duration))
                        } else {
                            continuation.resume(throwing: TranslationPreviewError.synthesisError("No audio recorded"))
                        }
                    }
                },
                onError: { error in
                    guard !hasResumed else { return }
                    hasResumed = true
                    mixerNode.removeTap(onBus: 0)
                    audioEngine.stop()
                    continuation.resume(throwing: TranslationPreviewError.synthesisError(error))
                }
            )

            self.ttsDelegate = delegate
            synthesizer.delegate = delegate

            // Start speaking
            synthesizer.speak(utterance)

            // Timeout after 30 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
                guard !hasResumed else { return }
                hasResumed = true
                mixerNode.removeTap(onBus: 0)
                audioEngine.stop()
                synthesizer.stopSpeaking(at: .immediate)

                if totalFrames > 0 {
                    let duration = Double(totalFrames) / mixerFormat.sampleRate
                    continuation.resume(returning: (outputURL, duration))
                } else {
                    continuation.resume(throwing: TranslationPreviewError.synthesisError("Recording timeout"))
                }
            }
        }
    }

    /// Find the best available voice for a language
    private func findBestVoice(for language: VoiceTranslationLanguage) -> AVSpeechSynthesisVoice? {
        let allVoices = AVSpeechSynthesisVoice.speechVoices()

        // Log all available voices for this language
        let matchingVoices = allVoices.filter {
            $0.language.starts(with: language.rawValue) ||
            $0.language.starts(with: String(language.localeIdentifier.prefix(2)))
        }

        if matchingVoices.isEmpty {
            mediaLogger.info("[AppleTTS] ⚠️ No voices found for \(language.rawValue)")
            mediaLogger.info("[AppleTTS] Available language codes: \(Set(allVoices.map { $0.language.prefix(2) }))")
        } else {
            mediaLogger.info("[AppleTTS] Found \(matchingVoices.count) voices for \(language.rawValue)")
            for v in matchingVoices.prefix(3) {
                mediaLogger.info("[AppleTTS]   - \(v.name) (\(v.language)) q=\(v.quality.rawValue)")
            }
        }

        // Prefer premium/enhanced voices
        let premiumVoices = matchingVoices.filter { $0.quality == .premium || $0.quality == .enhanced }
        if let premium = premiumVoices.first {
            return premium
        }

        // Try exact match
        if let voice = AVSpeechSynthesisVoice(language: language.localeIdentifier) {
            return voice
        }

        // Try base language code
        if let voice = AVSpeechSynthesisVoice(language: language.rawValue) {
            return voice
        }

        // Any matching voice
        if let voice = matchingVoices.first {
            return voice
        }

        // Absolute fallback to English
        return AVSpeechSynthesisVoice(language: "en-US")
    }

    // MARK: - Backend TTS with Voice Cloning

    /// Generate speech using backend TTS service with voice cloning
    /// This uses the translator service at /v1/tts
    private func generateBackendTTS(
        text: String,
        language: VoiceTranslationLanguage,
        sourceAudioURL: URL
    ) async throws -> (url: URL, duration: TimeInterval, usedCloning: Bool) {
        mediaLogger.info("[BackendTTS] Starting for: '\(text.prefix(30))...' in \(language.rawValue)")

        // Check backend availability
        let isAvailable = await backendAudioService.checkHealth()
        guard isAvailable else {
            mediaLogger.info("[BackendTTS] Backend service unavailable")
            throw BackendAudioService.BackendAudioError.serviceUnavailable
        }

        // Get or register voice for cloning
        var voiceId: String?
        if let userId = currentUserId {
            voiceId = await backendAudioService.getVoiceEmbeddingId(for: userId)

            // Register voice if not already registered
            if voiceId == nil {
                mediaLogger.info("[BackendTTS] Registering voice for user: \(userId)")
                do {
                    let registration = try await backendAudioService.registerVoice(
                        audioURL: sourceAudioURL,
                        userId: userId
                    )
                    voiceId = registration.voiceEmbeddingId
                    mediaLogger.info("[BackendTTS] Voice registered: \(registration.status)")
                } catch {
                    mediaLogger.info("[BackendTTS] Voice registration failed: \(error)")
                    // Continue without voice cloning
                }
            }
        }

        // Generate TTS with optional voice cloning
        let ttsResult = try await backendAudioService.synthesize(
            text: text,
            language: language,
            voiceId: voiceId
        )

        mediaLogger.info("[BackendTTS] Success: \(ttsResult.duration)s, cloning: \(ttsResult.usedVoiceCloning)")

        return (ttsResult.audioURL, ttsResult.duration, ttsResult.usedVoiceCloning)
    }

    /// Set the current user ID for voice cloning
    func setUserId(_ userId: String?) {
        currentUserId = userId
    }

    /// Register user's voice for cloning
    func registerVoiceForCloning(audioURL: URL, userId: String) async throws {
        currentUserId = userId
        _ = try await backendAudioService.registerVoice(audioURL: audioURL, userId: userId)
        mediaLogger.info("[TranslationPreview] Voice registered for user: \(userId)")
    }

    // MARK: - Cache Management

    /// Clear all cached previews
    func clearCache() {
        // Delete cached audio files
        for preview in cachedPreviews.values {
            if let audioURL = preview.audioURL {
                try? FileManager.default.removeItem(at: audioURL)
            }
        }
        cachedPreviews.removeAll()
        cachedTextTranslations.removeAll()
        currentPreview = nil
        currentTextTranslation = nil
    }

    /// Clear voice embedding (forces re-extraction)
    func clearVoiceEmbedding() {
        speakerEmbedding = nil
        originalTranscription = nil
        sourceLanguage = nil
        clearCache()
    }

    /// Cancel current operation
    func cancel() {
        currentTask?.cancel()
        currentTask = nil
        state = .idle
    }

    // MARK: - Cleanup

    func cleanup() {
        cancel()
        stopPlayback()
        clearCache()
    }
}

// MARK: - Audio Player Delegate

private class AudioPlayerDelegate: NSObject, AVAudioPlayerDelegate {
    let onFinished: () -> Void

    init(onFinished: @escaping () -> Void) {
        self.onFinished = onFinished
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        onFinished()
    }
}

// MARK: - TTS Speech Delegate

/// Delegate for tracking AVSpeechSynthesizer events
private class TTSSpeechDelegate: NSObject, AVSpeechSynthesizerDelegate {
    private let onStart: () -> Void
    private let onFinish: () -> Void
    private let onError: (String) -> Void

    init(
        onStart: @escaping () -> Void,
        onFinish: @escaping () -> Void,
        onError: @escaping (String) -> Void
    ) {
        self.onStart = onStart
        self.onFinish = onFinish
        self.onError = onError
        super.init()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        onStart()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        onFinish()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        onError("Speech cancelled")
    }
}

// MARK: - Translation Preview Errors

enum TranslationPreviewError: Error, LocalizedError {
    case voiceExtractionFailed
    case transcriptionFailed
    case speechRecognitionNotAuthorized
    case recognizerNotAvailable
    case translationNotSupported(from: VoiceTranslationLanguage, to: VoiceTranslationLanguage)
    case translationModelNeedsDownload
    case synthesisError(String)

    var errorDescription: String? {
        switch self {
        case .voiceExtractionFailed:
            return "Impossible d'extraire l'empreinte vocale"
        case .transcriptionFailed:
            return "La transcription a échoué"
        case .speechRecognitionNotAuthorized:
            return "Reconnaissance vocale non autorisée"
        case .recognizerNotAvailable:
            return "Reconnaissance vocale non disponible"
        case .translationNotSupported(let from, let to):
            return "Traduction de \(from.nativeName) vers \(to.nativeName) non supportée"
        case .translationModelNeedsDownload:
            return "Le modèle de traduction doit être téléchargé"
        case .synthesisError(let message):
            return "Erreur de synthèse: \(message)"
        }
    }
}

// MARK: - Import NaturalLanguage for language detection

import NaturalLanguage
