//
//  VoiceCloningDebugOverlay.swift
//  Meeshy
//
//  Complete debug overlay for testing the voice cloning pipeline via Backend XTTS API:
//  Record → Upload → Transcribe → Translate → Clone Voice (XTTS-v2) → Play
//
//  Uses BackendXTTSService for server-side XTTS-v2 voice cloning.
//  Supports voice analysis and comparison.
//
//  Logs use tags [VOICE-CLONE-DEBUG-START] and [VOICE-CLONE-DEBUG-END]
//  for easy analysis.
//
//  iOS 16+
//

import SwiftUI
import AVFoundation
import Speech

// MARK: - Debug Overlay View

struct VoiceCloningDebugOverlay: View {
    @StateObject private var viewModel = VoiceCloningDebugViewModel()
    @State private var isExpanded = false
    @State private var isVisible = false
    @State private var dragOffset: CGSize = .zero
    @State private var position: CGPoint = CGPoint(x: UIScreen.main.bounds.width - 60, y: 150)

    var body: some View {
        ZStack {
            if isVisible {
                if isExpanded {
                    expandedView
                        .transition(.scale.combined(with: .opacity))
                } else {
                    collapsedView
                        .position(x: position.x + dragOffset.width, y: position.y + dragOffset.height)
                        .gesture(dragGesture)
                        .transition(.scale.combined(with: .opacity))
                }
            }
        }
        .animation(.spring(response: 0.3), value: isExpanded)
        .animation(.easeInOut(duration: 0.2), value: isVisible)
        .onAppear {
            #if DEBUG
            isVisible = true
            #endif
        }
    }

    // MARK: - Collapsed View

    private var collapsedView: some View {
        Button {
            withAnimation { isExpanded = true }
        } label: {
            ZStack {
                Circle()
                    .fill(statusColor)
                    .frame(width: 50, height: 50)
                    .shadow(color: statusColor.opacity(0.5), radius: 8)

                Image(systemName: statusIcon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
    }

    // MARK: - Expanded View

    private var expandedView: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Image(systemName: "waveform.circle.fill")
                    .font(.title2)
                    .foregroundColor(.meeshyPrimary)

                Text("Voice Clone Debug")
                    .font(.headline)

                Spacer()

                Button { withAnimation { isExpanded = false } } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
            .background(Color(uiColor: .systemBackground))

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Pipeline Test Section
                    pipelineTestSection

                    Divider()

                    // Results Section
                    resultsSection

                    Divider()

                    // Logs Section
                    logsSection

                    Divider()

                    // Actions
                    actionsSection
                }
                .padding()
            }
        }
        .frame(width: 360, height: 600)
        .background(Color(uiColor: .secondarySystemBackground))
        .cornerRadius(20)
        .shadow(color: .black.opacity(0.2), radius: 20)
    }

    // MARK: - Pipeline Test Section

    private var pipelineTestSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Cloud Voice Cloning")
                    .font(.subheadline.bold())
                    .foregroundColor(.secondary)

                Spacer()

                // Backend status indicator
                HStack(spacing: 4) {
                    Circle()
                        .fill(viewModel.backendAvailable ? Color.green : Color.red)
                        .frame(width: 8, height: 8)
                    Text(viewModel.backendAvailable ? "Connected" : "Offline")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }

            // Status
            HStack(spacing: 6) {
                StatusDot(isActive: viewModel.backendAvailable, label: "API")
                StatusDot(isActive: viewModel.isRecording, label: "Rec", color: .red)
                StatusDot(isActive: viewModel.isUploading, label: "Upload", color: .orange)
                StatusDot(isActive: viewModel.isTranslating, label: "Clone", color: .purple)
                StatusDot(isActive: viewModel.isVerifying, label: "Verify", color: .cyan)
            }

            // Record Button
            HStack(spacing: 12) {
                Button {
                    Task { await viewModel.toggleRecording() }
                } label: {
                    HStack {
                        Image(systemName: viewModel.isRecording ? "stop.circle.fill" : "mic.circle.fill")
                        Text(viewModel.isRecording ? "Stop" : "Record")
                    }
                    .font(.headline)
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(viewModel.isRecording ? Color.red : Color.meeshyPrimary)
                    .cornerRadius(25)
                }

                if viewModel.hasRecording {
                    Button {
                        Task { await viewModel.runFullPipeline() }
                    } label: {
                        HStack {
                            Image(systemName: "play.circle.fill")
                            Text("Run Pipeline")
                        }
                        .font(.headline)
                        .foregroundColor(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .background(Color.green)
                        .cornerRadius(25)
                    }
                    .disabled(viewModel.isProcessing)
                }
            }

            // Progress
            if viewModel.isProcessing {
                VStack(alignment: .leading, spacing: 4) {
                    Text(viewModel.currentStep)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    ProgressView(value: viewModel.progress)
                        .tint(.meeshyPrimary)
                }
            }
        }
    }

    // MARK: - Results Section

    private var resultsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Results")
                .font(.subheadline.bold())
                .foregroundColor(.secondary)

            // Voice Analysis (if available)
            if let analysis = viewModel.voiceAnalysis {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Image(systemName: "waveform.path.ecg")
                            .foregroundColor(.purple)
                        Text("Voice Analysis")
                            .font(.caption.bold())
                        Spacer()
                    }

                    HStack(spacing: 16) {
                        VStack(alignment: .leading) {
                            Text("Pitch")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                            Text("\(String(format: "%.0f", analysis.pitchHz)) Hz")
                                .font(.caption.monospacedDigit())
                        }

                        VStack(alignment: .leading) {
                            Text("Type")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                            Text(analysis.voiceType)
                                .font(.caption)
                        }

                        VStack(alignment: .leading) {
                            Text("Brightness")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                            Text("\(String(format: "%.0f", analysis.brightness))")
                                .font(.caption.monospacedDigit())
                        }
                    }
                }
                .padding(8)
                .background(Color.purple.opacity(0.1))
                .cornerRadius(8)
            }

            // Transcription
            ResultRow(
                icon: "text.bubble",
                label: "Transcription",
                value: viewModel.transcribedText.isEmpty ? "-" : viewModel.transcribedText,
                timing: viewModel.transcriptionTime
            )

            // Translation
            ResultRow(
                icon: "globe",
                label: "Translation (\(viewModel.targetLanguage.uppercased()))",
                value: viewModel.translatedText.isEmpty ? "-" : viewModel.translatedText,
                timing: viewModel.translationTime
            )

            // Cloned Audio
            if viewModel.hasClonedAudio {
                HStack {
                    Image(systemName: "waveform")
                        .foregroundColor(.purple)

                    Text("Cloned Audio")
                        .font(.caption)

                    Spacer()

                    Button {
                        viewModel.playClonedAudio()
                    } label: {
                        Image(systemName: viewModel.isPlaying ? "stop.fill" : "play.fill")
                            .foregroundColor(.white)
                            .padding(8)
                            .background(Color.purple)
                            .clipShape(Circle())
                    }

                    Text("\(String(format: "%.0f", viewModel.cloningTime))ms")
                        .font(.caption2.monospacedDigit())
                        .foregroundColor(.secondary)
                }
                .padding(8)
                .background(Color(uiColor: .tertiarySystemBackground))
                .cornerRadius(8)
            }

            // Verification Result
            if !viewModel.verifiedText.isEmpty || viewModel.verificationTime > 0 {
                ResultRow(
                    icon: "checkmark.bubble",
                    label: "STT Verification",
                    value: viewModel.verifiedText.isEmpty ? "⚠️ No speech detected" : viewModel.verifiedText,
                    timing: viewModel.verificationTime
                )

                // Similarity indicator
                if !viewModel.verifiedText.isEmpty && !viewModel.translatedText.isEmpty {
                    let similarity = viewModel.calculateSimilarity()
                    HStack {
                        Image(systemName: similarity > 0.7 ? "checkmark.circle.fill" : similarity > 0.3 ? "exclamationmark.triangle.fill" : "xmark.circle.fill")
                            .foregroundColor(similarity > 0.7 ? .green : similarity > 0.3 ? .orange : .red)
                        Text("Similarity: \(String(format: "%.0f", similarity * 100))%")
                            .font(.caption.bold())
                        Spacer()
                        Text(similarity > 0.7 ? "Intelligible" : similarity > 0.3 ? "Partially" : "Unintelligible")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    .padding(8)
                    .background(Color(uiColor: .tertiarySystemBackground))
                    .cornerRadius(8)
                }
            }

            // Total Time
            if viewModel.totalTime > 0 {
                HStack {
                    Text("Total Pipeline Time:")
                        .font(.caption.bold())
                    Spacer()
                    Text("\(String(format: "%.0f", viewModel.totalTime))ms")
                        .font(.caption.monospacedDigit().bold())
                        .foregroundColor(.meeshyPrimary)
                }
            }
        }
    }

    // MARK: - Logs Section

    private var logsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Debug Logs")
                    .font(.subheadline.bold())
                    .foregroundColor(.secondary)

                Spacer()

                Button {
                    viewModel.clearLogs()
                } label: {
                    Text("Clear")
                        .font(.caption)
                        .foregroundColor(.red)
                }
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(viewModel.logs, id: \.self) { log in
                        Text(log)
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundColor(logColor(for: log))
                    }
                }
            }
            .frame(height: 150)
            .padding(8)
            .background(Color.black.opacity(0.9))
            .cornerRadius(8)
        }
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Button {
                    Task { await viewModel.checkBackendAvailability() }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                }

                Button {
                    viewModel.reset()
                } label: {
                    Label("Reset", systemImage: "arrow.counterclockwise")
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.orange)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                }

                Button {
                    withAnimation { isVisible = false }
                } label: {
                    Label("Hide", systemImage: "eye.slash")
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.gray)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                }
            }
        }
    }

    // MARK: - Helpers

    private var statusColor: Color {
        if viewModel.isProcessing { return .orange }
        if viewModel.hasError { return .red }
        if viewModel.backendAvailable { return .green }
        return .gray
    }

    private var statusIcon: String {
        if viewModel.isProcessing { return "waveform" }
        if viewModel.hasError { return "exclamationmark.triangle" }
        if viewModel.backendAvailable { return "checkmark.icloud" }
        return "icloud.slash"
    }

    private func logColor(for log: String) -> Color {
        if log.contains("ERROR") || log.contains("❌") { return .red }
        if log.contains("WARNING") || log.contains("⚠️") { return .orange }
        if log.contains("SUCCESS") || log.contains("✅") { return .green }
        if log.contains("START") { return .cyan }
        if log.contains("END") { return .yellow }
        return .white
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in dragOffset = value.translation }
            .onEnded { value in
                position.x += value.translation.width
                position.y += value.translation.height
                dragOffset = .zero
                let screen = UIScreen.main.bounds
                position.x = max(30, min(screen.width - 30, position.x))
                position.y = max(80, min(screen.height - 100, position.y))
            }
    }
}

// MARK: - Supporting Views

struct StatusDot: View {
    let isActive: Bool
    let label: String
    var color: Color = .green

    var body: some View {
        VStack(spacing: 2) {
            Circle()
                .fill(isActive ? color : Color.gray.opacity(0.3))
                .frame(width: 10, height: 10)
            Text(label)
                .font(.system(size: 8))
                .foregroundColor(.secondary)
        }
    }
}

struct ResultRow: View {
    let icon: String
    let label: String
    let value: String
    let timing: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(.secondary)
                Text(label)
                    .font(.caption.bold())
                Spacer()
                if timing > 0 {
                    Text("\(String(format: "%.0f", timing))ms")
                        .font(.caption2.monospacedDigit())
                        .foregroundColor(.secondary)
                }
            }
            Text(value)
                .font(.caption)
                .foregroundColor(.primary)
                .lineLimit(2)
        }
        .padding(8)
        .background(Color(uiColor: .tertiarySystemBackground))
        .cornerRadius(8)
    }
}

// MARK: - ViewModel

@MainActor
class VoiceCloningDebugViewModel: ObservableObject {
    // MARK: - Published State

    @Published var backendAvailable = false
    @Published var isRecording = false
    @Published var isUploading = false
    @Published var isTranslating = false
    @Published var isVerifying = false
    @Published var isPlaying = false
    @Published var isProcessing = false
    @Published var hasRecording = false
    @Published var hasClonedAudio = false
    @Published var hasError = false

    @Published var currentStep = ""
    @Published var progress: Double = 0

    @Published var transcribedText = ""
    @Published var translatedText = ""
    @Published var verifiedText = ""
    @Published var targetLanguage = "en"
    @Published var sourceLanguage = "fr"

    @Published var transcriptionTime: Double = 0
    @Published var translationTime: Double = 0
    @Published var cloningTime: Double = 0
    @Published var verificationTime: Double = 0
    @Published var totalTime: Double = 0

    @Published var logs: [String] = []
    @Published var voiceAnalysis: CloudVoiceCloningService.VoiceAnalysis?

    // MARK: - Services

    private let cloudService = CloudVoiceCloningService.shared

    // MARK: - Audio

    private var audioRecorder: AVAudioRecorder?
    private var audioPlayer: AVAudioPlayer?
    private var recordingURL: URL?
    private var clonedAudioURL: URL?

    // MARK: - Constants

    private let debugTag = "[VOICE-CLONE-DEBUG]"

    // Supported languages (matches backend)
    let supportedLanguages = [
        "en": "English", "fr": "Français", "es": "Español", "de": "Deutsch",
        "it": "Italiano", "pt": "Português", "pl": "Polski", "tr": "Türkçe",
        "ru": "Русский", "nl": "Nederlands", "cs": "Čeština", "ar": "العربية",
        "zh": "中文", "ja": "日本語", "ko": "한국어", "hu": "Magyar"
    ]

    // MARK: - Initialization

    init() {
        log("🚀 VoiceCloningDebugViewModel initialized")
        Task {
            await checkBackendAvailability()
        }
    }

    // MARK: - Backend Availability

    func checkBackendAvailability() async {
        log("📡 Checking backend availability...")
        await cloudService.checkAvailability()
        backendAvailable = cloudService.isAvailable

        if backendAvailable {
            log("✅ Backend service available")
        } else {
            log("❌ Backend service unavailable")
        }
    }

    // MARK: - Logging

    private func log(_ message: String) {
        let timestamp = DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .medium)
        let logLine = "[\(timestamp)] \(message)"
        logs.append(logLine)
        print("\(debugTag) \(logLine)")

        // Keep logs manageable
        if logs.count > 200 {
            logs.removeFirst(50)
        }
    }

    func clearLogs() {
        logs.removeAll()
        log("Logs cleared")
    }

    // MARK: - Backend Refresh

    func loadModels() async {
        // For cloud service, just check availability
        await checkBackendAvailability()
    }

    /// Computed property for backward compatibility
    var modelsLoaded: Bool { backendAvailable }

    // MARK: - Recording

    func toggleRecording() async {
        if isRecording {
            stopRecording()
        } else {
            await startRecording()
        }
    }

    private func startRecording() async {
        log("🎙️ Starting recording...")

        // Request permissions
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try audioSession.setActive(true)
        } catch {
            log("❌ ERROR: Audio session setup failed: \(error)")
            return
        }

        // Create recording URL
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        recordingURL = documentsPath.appendingPathComponent("debug_recording_\(Date().timeIntervalSince1970).m4a")

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 22050,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: recordingURL!, settings: settings)
            audioRecorder?.record()
            isRecording = true
            log("🔴 Recording started")
        } catch {
            log("❌ ERROR: Failed to start recording: \(error)")
        }
    }

    private func stopRecording() {
        audioRecorder?.stop()
        isRecording = false
        hasRecording = recordingURL != nil
        log("⏹️ Recording stopped")

        if let url = recordingURL {
            log("📁 Recording saved: \(url.lastPathComponent)")
        }
    }

    // MARK: - Full Pipeline (Cloud-based)

    func runFullPipeline() async {
        guard let recordingURL = recordingURL else {
            log("❌ ERROR: No recording available")
            return
        }

        guard backendAvailable else {
            log("❌ ERROR: Backend service unavailable")
            hasError = true
            return
        }

        isProcessing = true
        hasError = false
        let pipelineStart = Date()

        log("═══════════════════════════════════════════════════════════")
        log("[VOICE-CLONE-DEBUG-START] Starting cloud pipeline...")
        log("   Source: \(sourceLanguage) → Target: \(targetLanguage)")
        log("═══════════════════════════════════════════════════════════")

        do {
            // Get user ID for voice profile
            let userId = AuthenticationManager.shared.currentUser?.id ?? "debug-user"

            // Step 1: Optional Voice Analysis
            progress = 0.1
            currentStep = "1/3: Analyzing voice..."
            log("🎭 Step 1: Analyzing voice characteristics...")

            let analysisStart = Date()
            do {
                voiceAnalysis = try await cloudService.analyzeVoice(audioURL: recordingURL)
                let analysisTime = Date().timeIntervalSince(analysisStart) * 1000
                log("   ✅ Voice analyzed in \(String(format: "%.0f", analysisTime))ms")
                log("   📊 Pitch: \(String(format: "%.0f", voiceAnalysis?.pitchHz ?? 0))Hz")
                log("   📊 Type: \(voiceAnalysis?.voiceType ?? "unknown")")
                log("   📊 Brightness: \(String(format: "%.2f", voiceAnalysis?.brightness ?? 0))")
            } catch {
                log("   ⚠️ Voice analysis skipped: \(error.localizedDescription)")
            }

            // Step 2: Upload & Translate with Voice Cloning
            progress = 0.3
            currentStep = "2/3: Uploading & translating..."
            isUploading = true
            isTranslating = true
            log("🌐 Step 2: Uploading audio to cloud for translation...")
            log("   📊 Source language: \(sourceLanguage)")
            log("   📊 Target language: \(targetLanguage)")
            log("   📊 Voice cloning: enabled")

            let translationStart = Date()
            let result = try await cloudService.translateAudio(
                audioURL: recordingURL,
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage,
                userId: userId,
                enableVoiceCloning: true
            )
            translationTime = Date().timeIntervalSince(translationStart) * 1000
            isUploading = false
            isTranslating = false

            // Extract results
            transcribedText = result.originalText
            translatedText = result.translatedText
            cloningTime = Double(result.processingTimeMs)

            if let audioURL = result.audioURL {
                clonedAudioURL = audioURL
                hasClonedAudio = true
            }

            log("   ✅ Translation complete in \(String(format: "%.0f", translationTime))ms")
            log("   📝 Original (\(result.sourceLanguage)): \"\(transcribedText)\"")
            log("   📝 Translated (\(result.targetLanguage)): \"\(translatedText)\"")
            log("   🎭 Voice cloned: \(result.voiceCloned)")

            if let similarity = result.similarityScore {
                log("   📊 Similarity score: \(String(format: "%.0f", similarity * 100))%")
            }

            // Step 3: Local STT Verification
            progress = 0.8
            currentStep = "3/3: Verifying audio..."
            isVerifying = true
            log("🔍 Step 3: Verifying cloned audio with local STT...")

            if let audioURL = clonedAudioURL {
                let verificationStart = Date()
                verifiedText = await verifyClonedAudio(url: audioURL, language: targetLanguage)
                verificationTime = Date().timeIntervalSince(verificationStart) * 1000
                isVerifying = false

                log("   ✅ Verification complete in \(String(format: "%.0f", verificationTime))ms")
                log("   📝 Recognized: \"\(verifiedText)\"")

                // Calculate similarity
                let similarity = calculateTextSimilarity(expected: translatedText, actual: verifiedText)
                log("   📊 Text match: \(String(format: "%.1f", similarity * 100))%")

                if similarity >= 0.7 {
                    log("   ✅ Audio is intelligible!")
                } else if similarity >= 0.3 {
                    log("   ⚠️ Audio is partially intelligible")
                } else {
                    log("   ❌ Audio quality issues detected")
                }
            } else {
                isVerifying = false
                log("   ⚠️ No audio to verify")
            }

            // Pipeline Complete
            progress = 1.0
            totalTime = Date().timeIntervalSince(pipelineStart) * 1000

            log("═══════════════════════════════════════════════════════════")
            log("[VOICE-CLONE-DEBUG-END] Pipeline complete!")
            log("═══════════════════════════════════════════════════════════")
            log("📊 TIMING SUMMARY:")
            log("   • Cloud processing:  \(String(format: "%.0f", translationTime))ms")
            log("   • STT Verification:  \(String(format: "%.0f", verificationTime))ms")
            log("   • TOTAL:             \(String(format: "%.0f", totalTime))ms")
            log("═══════════════════════════════════════════════════════════")

        } catch {
            log("═══════════════════════════════════════════════════════════")
            log("[VOICE-CLONE-DEBUG-END] ❌ Pipeline FAILED!")
            log("   Error: \(error.localizedDescription)")
            log("═══════════════════════════════════════════════════════════")
            hasError = true
        }

        isProcessing = false
        isUploading = false
        isTranslating = false
        isVerifying = false
    }

    // MARK: - STT Verification

    private func verifyClonedAudio(url: URL, language: String) async -> String {
        // Map language code to locale
        let localeMap = [
            "en": "en-US", "fr": "fr-FR", "es": "es-ES", "de": "de-DE",
            "it": "it-IT", "pt": "pt-BR", "pl": "pl-PL", "tr": "tr-TR",
            "ru": "ru-RU", "nl": "nl-NL", "cs": "cs-CZ", "ar": "ar-SA",
            "zh": "zh-CN", "ja": "ja-JP", "ko": "ko-KR", "hu": "hu-HU"
        ]
        let locale = localeMap[language] ?? "en-US"

        log("   🔍 Using SFSpeechRecognizer (\(locale)) for verification...")

        return await withCheckedContinuation { continuation in
            let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
            let request = SFSpeechURLRecognitionRequest(url: url)
            request.requiresOnDeviceRecognition = true
            request.shouldReportPartialResults = false

            var hasResumed = false

            recognizer?.recognitionTask(with: request) { result, error in
                guard !hasResumed else { return }

                if let error = error {
                    self.log("   ⚠️ Verification STT error: \(error.localizedDescription)")
                    hasResumed = true
                    continuation.resume(returning: "")
                    return
                }

                if let result = result, result.isFinal {
                    hasResumed = true
                    continuation.resume(returning: result.bestTranscription.formattedString)
                }
            }

            // Timeout after 20 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
                if !hasResumed {
                    self.log("   ⚠️ Verification STT timeout")
                    hasResumed = true
                    continuation.resume(returning: "")
                }
            }
        }
    }

    private func calculateTextSimilarity(expected: String, actual: String) -> Double {
        guard !expected.isEmpty else { return actual.isEmpty ? 1.0 : 0.0 }
        guard !actual.isEmpty else { return 0.0 }

        let expectedWords = Set(expected.lowercased().components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty })
        let actualWords = Set(actual.lowercased().components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty })

        guard !expectedWords.isEmpty else { return 0.0 }

        let intersection = expectedWords.intersection(actualWords)
        let union = expectedWords.union(actualWords)

        return Double(intersection.count) / Double(union.count)
    }

    func calculateSimilarity() -> Double {
        calculateTextSimilarity(expected: translatedText, actual: verifiedText)
    }

    // MARK: - Playback

    func playClonedAudio() {
        guard let url = clonedAudioURL else { return }

        if isPlaying {
            audioPlayer?.stop()
            isPlaying = false
            log("⏹️ Playback stopped")
            return
        }

        do {
            audioPlayer = try AVAudioPlayer(contentsOf: url)
            audioPlayer?.play()
            isPlaying = true
            log("▶️ Playing cloned audio...")

            // Auto-stop when done
            DispatchQueue.main.asyncAfter(deadline: .now() + (audioPlayer?.duration ?? 0)) {
                self.isPlaying = false
            }
        } catch {
            log("❌ ERROR: Playback failed: \(error)")
        }
    }

    // MARK: - Reset

    func reset() {
        transcribedText = ""
        translatedText = ""
        verifiedText = ""
        transcriptionTime = 0
        translationTime = 0
        cloningTime = 0
        verificationTime = 0
        totalTime = 0
        progress = 0
        hasRecording = false
        hasClonedAudio = false
        hasError = false
        recordingURL = nil
        clonedAudioURL = nil
        voiceAnalysis = nil
        log("🔄 Reset complete")
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color.gray.opacity(0.3).ignoresSafeArea()
        VoiceCloningDebugOverlay()
    }
}
