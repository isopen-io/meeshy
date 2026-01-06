//
//  VoiceCloningDemoView.swift
//  Meeshy
//
//  POC Demo view for on-device voice cloning using OpenVoice CoreML
//  Demonstrates the full pipeline: Record → Extract Embedding → Clone Voice
//
//  100% On-Device - No internet required
//

import SwiftUI
import AVFoundation

// MARK: - Voice Cloning Demo View

struct VoiceCloningDemoView: View {
    @StateObject private var viewModel = VoiceCloningDemoViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    headerSection

                    // Status Banner
                    statusBanner

                    // Step 1: Record Reference
                    recordingSection

                    // Step 2: Voice Embedding
                    embeddingSection

                    // Step 3: Generate Cloned Speech
                    generationSection

                    // Results
                    if viewModel.generatedAudioURL != nil {
                        resultsSection
                    }

                    // Performance Stats
                    if viewModel.showStats {
                        statsSection
                    }
                }
                .padding()
            }
            .navigationTitle("Voice Cloning POC")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Fermer") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        viewModel.showStats.toggle()
                    } label: {
                        Image(systemName: "chart.bar.fill")
                    }
                }
            }
            .onAppear {
                Task {
                    await viewModel.loadModels()
                }
            }
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: 12) {
            Image(systemName: "waveform.circle.fill")
                .font(.system(size: 60))
                .foregroundStyle(
                    LinearGradient(
                        colors: [.purple, .blue],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Text("Clonage Vocal On-Device")
                .font(.title2.bold())

            Text("100% hors-ligne avec CoreML + Neural Engine")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical)
    }

    // MARK: - Status Banner

    private var statusBanner: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(viewModel.modelState == .loaded ? Color.green : Color.orange)
                .frame(width: 12, height: 12)

            Text(viewModel.statusText)
                .font(.subheadline.weight(.medium))

            Spacer()

            if viewModel.modelState == .loading(progress: 0) {
                ProgressView()
                    .scaleEffect(0.8)
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(uiColor: .secondarySystemBackground))
        )
    }

    // MARK: - Recording Section

    private var recordingSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("1. Enregistrer votre voix", systemImage: "1.circle.fill")
                .font(.headline)

            Text("Parlez pendant 3-6 secondes pour capturer votre empreinte vocale")
                .font(.caption)
                .foregroundColor(.secondary)

            HStack(spacing: 16) {
                // Record button
                Button {
                    if viewModel.isRecording {
                        viewModel.stopRecording()
                    } else {
                        viewModel.startRecording()
                    }
                } label: {
                    HStack {
                        Image(systemName: viewModel.isRecording ? "stop.fill" : "mic.fill")
                        Text(viewModel.isRecording ? "Arreter" : "Enregistrer")
                    }
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(viewModel.isRecording ? Color.red : Color.blue)
                    .cornerRadius(12)
                }

                // Duration indicator
                if viewModel.isRecording || viewModel.recordingDuration > 0 {
                    Text(String(format: "%.1fs", viewModel.recordingDuration))
                        .font(.title2.monospacedDigit().bold())
                        .foregroundColor(viewModel.isRecording ? .red : .primary)
                        .frame(width: 60)
                }
            }

            // Waveform visualization
            if viewModel.isRecording {
                WaveformVisualization(levels: viewModel.audioLevels)
                    .frame(height: 60)
            }

            // Recorded audio playback
            if let url = viewModel.recordedAudioURL {
                HStack {
                    Button {
                        viewModel.playRecordedAudio()
                    } label: {
                        Label("Ecouter", systemImage: viewModel.isPlayingRecorded ? "pause.fill" : "play.fill")
                    }
                    .buttonStyle(.bordered)

                    Spacer()

                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("Audio capture")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(uiColor: .systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 10)
        )
    }

    // MARK: - Embedding Section

    private var embeddingSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("2. Extraire l'empreinte vocale", systemImage: "2.circle.fill")
                .font(.headline)

            Text("Le Neural Engine analyse votre voix et cree une empreinte unique (256 dimensions)")
                .font(.caption)
                .foregroundColor(.secondary)

            Button {
                Task {
                    await viewModel.extractEmbedding()
                }
            } label: {
                HStack {
                    if viewModel.isExtractingEmbedding {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "cpu.fill")
                    }
                    Text(viewModel.isExtractingEmbedding ? "Extraction..." : "Extraire Empreinte")
                }
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(
                    viewModel.recordedAudioURL != nil ? Color.purple : Color.gray
                )
                .cornerRadius(12)
            }
            .disabled(viewModel.recordedAudioURL == nil || viewModel.isExtractingEmbedding)

            // Embedding visualization
            if let embedding = viewModel.speakerEmbedding {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("Empreinte extraite")
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        Text("\(embedding.embedding.count) dims")
                            .font(.caption.monospacedDigit())
                            .foregroundColor(.secondary)
                    }

                    // Visual embedding representation
                    EmbeddingVisualization(embedding: embedding.embedding)
                        .frame(height: 40)

                    if viewModel.embeddingLatencyMs > 0 {
                        Text("Latence: \(String(format: "%.0f", viewModel.embeddingLatencyMs))ms")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .padding()
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.green.opacity(0.1))
                )
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(uiColor: .systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 10)
        )
    }

    // MARK: - Generation Section

    private var generationSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            generationHeader
            generationTextInput
            generationLanguagePicker
            generationButton
        }
        .padding()
        .background(generationBackground)
    }

    private var generationHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("3. Generer voix clonee", systemImage: "3.circle.fill")
                .font(.headline)

            Text("Entrez du texte a synthetiser avec votre voix clonee")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private var generationTextInput: some View {
        TextField("Texte a synthetiser...", text: $viewModel.textToSynthesize, axis: .vertical)
            .textFieldStyle(.roundedBorder)
            .lineLimit(3...6)
    }

    private var generationLanguagePicker: some View {
        HStack {
            Text("Langue:")
                .font(.subheadline)
            Picker("Langue", selection: $viewModel.targetLanguage) {
                Text("\(VoiceTranslationLanguage.french.flagEmoji) Francais").tag(VoiceTranslationLanguage.french)
                Text("\(VoiceTranslationLanguage.english.flagEmoji) English").tag(VoiceTranslationLanguage.english)
                Text("\(VoiceTranslationLanguage.spanish.flagEmoji) Espanol").tag(VoiceTranslationLanguage.spanish)
                Text("\(VoiceTranslationLanguage.german.flagEmoji) Deutsch").tag(VoiceTranslationLanguage.german)
                Text("\(VoiceTranslationLanguage.italian.flagEmoji) Italiano").tag(VoiceTranslationLanguage.italian)
                Text("\(VoiceTranslationLanguage.portuguese.flagEmoji) Portugues").tag(VoiceTranslationLanguage.portuguese)
                Text("\(VoiceTranslationLanguage.chinese.flagEmoji) Zhongwen").tag(VoiceTranslationLanguage.chinese)
                Text("\(VoiceTranslationLanguage.japanese.flagEmoji) Nihongo").tag(VoiceTranslationLanguage.japanese)
            }
            .pickerStyle(.menu)
        }
    }

    private var generationButton: some View {
        let canGenerate = viewModel.speakerEmbedding != nil && !viewModel.textToSynthesize.isEmpty
        let buttonColor: Color = canGenerate ? .orange : .gray

        return Button {
            Task {
                await viewModel.generateClonedSpeech()
            }
        } label: {
            HStack {
                if viewModel.isGenerating {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: "waveform")
                }
                Text(viewModel.isGenerating ? "Generation..." : "Generer Voix Clonee")
            }
            .font(.headline)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding()
            .background(buttonColor)
            .cornerRadius(12)
        }
        .disabled(!canGenerate || viewModel.isGenerating)
    }

    private var generationBackground: some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(Color(uiColor: .systemBackground))
            .shadow(color: .black.opacity(0.05), radius: 10)
    }

    // MARK: - Results Section

    private var resultsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Resultat", systemImage: "checkmark.seal.fill")
                .font(.headline)
                .foregroundColor(.green)

            HStack(spacing: 16) {
                // Play generated audio
                Button {
                    viewModel.playGeneratedAudio()
                } label: {
                    HStack {
                        Image(systemName: viewModel.isPlayingGenerated ? "pause.circle.fill" : "play.circle.fill")
                            .font(.title)
                        VStack(alignment: .leading) {
                            Text("Voix Clonee")
                                .font(.subheadline.weight(.medium))
                            Text(String(format: "%.1fs", viewModel.generatedDuration))
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .buttonStyle(.bordered)
                .tint(.green)

                Spacer()

                // Stats
                VStack(alignment: .trailing, spacing: 4) {
                    Text("Latence totale")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("\(String(format: "%.0f", viewModel.generationLatencyMs))ms")
                        .font(.title3.monospacedDigit().bold())
                        .foregroundColor(.orange)
                }
            }

            // Success message
            HStack {
                Image(systemName: "sparkles")
                    .foregroundColor(.yellow)
                Text("Voix clonee 100% on-device!")
                    .font(.subheadline)
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(
                        LinearGradient(
                            colors: [.purple.opacity(0.2), .blue.opacity(0.2)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
            )
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(uiColor: .systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 10)
        )
    }

    // MARK: - Stats Section

    private var statsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Performance Stats", systemImage: "gauge.high")
                .font(.headline)

            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                GridRow {
                    Text("Modele")
                    Text("Latence")
                    Text("Status")
                }
                .font(.caption.weight(.medium))
                .foregroundColor(.secondary)

                Divider()

                GridRow {
                    Text("SpeakerEmbedding")
                    Text("\(String(format: "%.0f", viewModel.embeddingLatencyMs))ms")
                        .monospacedDigit()
                    Image(systemName: viewModel.speakerEmbedding != nil ? "checkmark.circle.fill" : "circle")
                        .foregroundColor(viewModel.speakerEmbedding != nil ? .green : .gray)
                }
                .font(.caption)

                GridRow {
                    Text("HiFiGAN Vocoder")
                    Text("\(String(format: "%.0f", viewModel.vocoderLatencyMs))ms")
                        .monospacedDigit()
                    Image(systemName: viewModel.generatedAudioURL != nil ? "checkmark.circle.fill" : "circle")
                        .foregroundColor(viewModel.generatedAudioURL != nil ? .green : .gray)
                }
                .font(.caption)

                Divider()

                GridRow {
                    Text("Total Pipeline")
                        .fontWeight(.medium)
                    Text("\(String(format: "%.0f", viewModel.generationLatencyMs))ms")
                        .monospacedDigit()
                        .fontWeight(.medium)
                    Text("")
                }
                .font(.caption)
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(uiColor: .tertiarySystemBackground))
            )
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(uiColor: .systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 10)
        )
    }
}

// MARK: - Waveform Visualization

struct WaveformVisualization: View {
    let levels: [Float]

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 2) {
                ForEach(0..<min(levels.count, 50), id: \.self) { index in
                    let normalizedLevel = CGFloat(levels[index])
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.red.opacity(0.8))
                        .frame(
                            width: (geometry.size.width - 100) / 50,
                            height: max(4, normalizedLevel * geometry.size.height)
                        )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
    }
}

// MARK: - Embedding Visualization

struct EmbeddingVisualization: View {
    let embedding: [Float]

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 1) {
                ForEach(0..<min(embedding.count, 64), id: \.self) { index in
                    let value = embedding[index * (embedding.count / 64)]
                    let normalizedValue = (value + 1) / 2 // Normalize from [-1,1] to [0,1]
                    Rectangle()
                        .fill(
                            Color(
                                hue: Double(normalizedValue) * 0.7,
                                saturation: 0.8,
                                brightness: 0.9
                            )
                        )
                        .frame(width: geometry.size.width / 64)
                }
            }
        }
        .cornerRadius(4)
    }
}

// MARK: - View Model

@MainActor
class VoiceCloningDemoViewModel: ObservableObject {
    // MARK: - Published State

    @Published var modelState: OpenVoiceCoreMLService.ModelState = .notLoaded
    @Published var statusText = "Chargement des modeles..."

    // Recording
    @Published var isRecording = false
    @Published var recordingDuration: TimeInterval = 0
    @Published var audioLevels: [Float] = []
    @Published var recordedAudioURL: URL?
    @Published var isPlayingRecorded = false

    // Embedding
    @Published var isExtractingEmbedding = false
    @Published var speakerEmbedding: OpenVoiceCoreMLService.SpeakerEmbedding?
    @Published var embeddingLatencyMs: Double = 0

    // Generation
    @Published var textToSynthesize = "Bonjour, ceci est un test de clonage vocal sur iPhone."
    @Published var targetLanguage: VoiceTranslationLanguage = .french
    @Published var isGenerating = false
    @Published var generatedAudioURL: URL?
    @Published var generatedDuration: TimeInterval = 0
    @Published var generationLatencyMs: Double = 0
    @Published var vocoderLatencyMs: Double = 0
    @Published var isPlayingGenerated = false

    // Stats
    @Published var showStats = false

    // MARK: - Private Properties

    private let openVoiceService = OpenVoiceCoreMLService()
    private var audioRecorder: AVAudioRecorder?
    private var audioPlayer: AVAudioPlayer?
    private var recordingTimer: Timer?
    private var levelTimer: Timer?

    // MARK: - Model Loading

    func loadModels() async {
        statusText = "Chargement des modeles CoreML..."

        do {
            try await openVoiceService.loadModels { [weak self] progress in
                Task { @MainActor in
                    self?.modelState = .loading(progress: progress)
                    self?.statusText = "Chargement... \(Int(progress * 100))%"
                }
            }

            modelState = .loaded
            statusText = "Modeles charges - Pret pour le clonage vocal"

        } catch {
            modelState = .error(error.localizedDescription)
            statusText = "Erreur: \(error.localizedDescription)"
        }
    }

    // MARK: - Recording

    func startRecording() {
        let audioSession = AVAudioSession.sharedInstance()

        do {
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try audioSession.setActive(true)

            let documentsPath = FileManager.default.temporaryDirectory
            let audioFilename = documentsPath.appendingPathComponent("voice_sample_\(UUID().uuidString).m4a")

            let settings: [String: Any] = [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 22050,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
            ]

            audioRecorder = try AVAudioRecorder(url: audioFilename, settings: settings)
            audioRecorder?.isMeteringEnabled = true
            audioRecorder?.record()

            isRecording = true
            recordingDuration = 0
            audioLevels = []
            recordedAudioURL = audioFilename

            // Update duration timer
            recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.recordingDuration += 0.1
                }
            }

            // Update audio levels
            levelTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
                self?.audioRecorder?.updateMeters()
                let level = self?.audioRecorder?.averagePower(forChannel: 0) ?? -160
                let normalizedLevel = max(0, (level + 50) / 50) // Normalize -50dB to 0dB → 0 to 1

                Task { @MainActor in
                    self?.audioLevels.append(Float(normalizedLevel))
                    if self?.audioLevels.count ?? 0 > 50 {
                        self?.audioLevels.removeFirst()
                    }
                }
            }

        } catch {
            print("Recording error: \(error)")
        }
    }

    func stopRecording() {
        audioRecorder?.stop()
        recordingTimer?.invalidate()
        levelTimer?.invalidate()
        isRecording = false
    }

    func playRecordedAudio() {
        guard let url = recordedAudioURL else { return }

        if isPlayingRecorded {
            audioPlayer?.stop()
            isPlayingRecorded = false
            return
        }

        do {
            audioPlayer = try AVAudioPlayer(contentsOf: url)
            audioPlayer?.play()
            isPlayingRecorded = true

            // Auto-stop when finished
            DispatchQueue.main.asyncAfter(deadline: .now() + (audioPlayer?.duration ?? 0) + 0.1) { [weak self] in
                self?.isPlayingRecorded = false
            }
        } catch {
            print("Playback error: \(error)")
        }
    }

    // MARK: - Embedding Extraction

    func extractEmbedding() async {
        guard let audioURL = recordedAudioURL else { return }

        isExtractingEmbedding = true
        let startTime = Date()

        do {
            let embedding = try await openVoiceService.extractSpeakerEmbedding(
                from: audioURL,
                language: .french
            )

            speakerEmbedding = embedding
            embeddingLatencyMs = Date().timeIntervalSince(startTime) * 1000

        } catch {
            print("Embedding extraction error: \(error)")
        }

        isExtractingEmbedding = false
    }

    // MARK: - Voice Generation

    func generateClonedSpeech() async {
        guard let embedding = speakerEmbedding else { return }

        isGenerating = true
        let startTime = Date()

        do {
            let result = try await openVoiceService.generateSpeech(
                text: textToSynthesize,
                embedding: embedding,
                language: targetLanguage
            )

            generatedAudioURL = result.audioURL
            generatedDuration = result.duration
            generationLatencyMs = Date().timeIntervalSince(startTime) * 1000
            vocoderLatencyMs = result.latencyMs

        } catch {
            print("Generation error: \(error)")
        }

        isGenerating = false
    }

    func playGeneratedAudio() {
        guard let url = generatedAudioURL else { return }

        if isPlayingGenerated {
            audioPlayer?.stop()
            isPlayingGenerated = false
            return
        }

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)

            audioPlayer = try AVAudioPlayer(contentsOf: url)
            audioPlayer?.play()
            isPlayingGenerated = true

            // Auto-stop when finished
            DispatchQueue.main.asyncAfter(deadline: .now() + (audioPlayer?.duration ?? 0) + 0.1) { [weak self] in
                self?.isPlayingGenerated = false
            }
        } catch {
            print("Playback error: \(error)")
        }
    }
}

// MARK: - Preview

#Preview {
    VoiceCloningDemoView()
}
