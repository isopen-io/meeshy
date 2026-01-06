//
//  AudioEditorView.swift
//  Meeshy
//
//  Audio editor for voice messages before sending
//  Features:
//  - Waveform visualization with multi-effect segments
//  - Trim audio (start/end with draggable handles)
//  - Multiple voice effects on different segments
//  - Timeline showing effect segments with colors
//  - Preview playback with effects applied
//  - Export with all effects baked in
//
//  iOS 16+
//

import SwiftUI
import AVFoundation
import Accelerate

// MARK: - Audio Editor View

struct AudioEditorView: View {
    // MARK: - Properties

    let audioURL: URL
    let initialEffect: AudioEffectType
    let onConfirm: (URL, [AudioEffectRegion]) -> Void
    let onCancel: () -> Void

    /// Optional callback for effects timeline (microsecond precision)
    /// Called with the recorded timeline when export completes
    var onEffectsTimelineReady: ((AudioEffectsRecordingTimeline?) -> Void)?

    @StateObject private var viewModel: AudioEditorViewModel
    @StateObject private var timedTranscriptionService = TimedTranscriptionService()
    @StateObject private var translationPreviewService = TranslationPreviewService()
    @Environment(\.dismiss) private var dismiss

    // Multi-effect UI state
    @State private var showAddEffectMenu = false
    @State private var addEffectPosition: Double = 0
    @State private var editingSegment: AudioEffectRegion?
    @State private var showTranscription = false
    @State private var showTranslationPreview = false
    @State private var isEditingTranscription = false

    // Transcription segments for advanced editor
    @State private var transcriptionTextSegments: [TranscriptionTextSegment] = []

    // Inline translation state
    @State private var selectedTargetLanguage: VoiceTranslationLanguage = .english
    @State private var showTranslationSection = true
    @State private var isTranslationExpanded = false

    // Grid settings (from ModernAudioEditorView)
    @State private var gridEnabled = false

    // MARK: - Init

    init(
        audioURL: URL,
        initialEffect: AudioEffectType = .normal,
        onConfirm: @escaping (URL, [AudioEffectRegion]) -> Void,
        onCancel: @escaping () -> Void,
        onEffectsTimelineReady: ((AudioEffectsRecordingTimeline?) -> Void)? = nil
    ) {
        self.audioURL = audioURL
        self.initialEffect = initialEffect
        self.onConfirm = onConfirm
        self.onCancel = onCancel
        self.onEffectsTimelineReady = onEffectsTimelineReady
        self._viewModel = StateObject(wrappedValue: AudioEditorViewModel(url: audioURL, initialEffect: initialEffect))
    }

    /// Legacy init for single effect (backward compatibility)
    init(
        audioURL: URL,
        initialEffect: AudioEffectType = .normal,
        onConfirm: @escaping (URL, AudioEffectType) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.audioURL = audioURL
        self.initialEffect = initialEffect
        self.onConfirm = { url, segments in
            // Return the primary effect or normal if no segments
            let primaryEffect = segments.first?.effectType ?? .normal
            onConfirm(url, primaryEffect)
        }
        self.onCancel = onCancel
        self.onEffectsTimelineReady = nil
        self._viewModel = StateObject(wrappedValue: AudioEditorViewModel(url: audioURL, initialEffect: initialEffect))
    }

    /// Init with full timeline support (web architecture)
    init(
        audioURL: URL,
        initialEffect: AudioEffectType = .normal,
        preserveOriginalAudio: Bool = true,
        onConfirmWithTimeline: @escaping (URL, [AudioEffectRegion], AudioEffectsRecordingTimeline?) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.audioURL = audioURL
        self.initialEffect = initialEffect
        self.onConfirm = { url, segments in
            // This will be overridden by the timeline-aware callback
        }
        self.onCancel = onCancel

        let vm = AudioEditorViewModel(url: audioURL, initialEffect: initialEffect)
        vm.preserveOriginalAudio = preserveOriginalAudio
        self._viewModel = StateObject(wrappedValue: vm)

        self.onEffectsTimelineReady = { timeline in
            // Timeline ready callback
        }
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            // Background
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                // Top bar (fixed)
                topBar

                // Scrollable content area
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 0) {
                        // Synced transcription view (ABOVE waveform - from ModernAudioEditorView)
                        SyncedTranscriptionView(
                            transcriptionService: timedTranscriptionService,
                            currentTime: viewModel.playheadPosition * viewModel.duration,
                            totalDuration: viewModel.duration,
                            trimRange: (viewModel.trimStartPosition * viewModel.duration)...(viewModel.trimEndPosition * viewModel.duration),
                            isEditing: isEditingTranscription,
                            onWordTap: { word in
                                let normalizedPos = word.startTime / max(0.001, viewModel.duration)
                                viewModel.seekToPosition(normalizedPos)
                            },
                            onTextEdit: { wordId, newText in
                                timedTranscriptionService.updateWord(id: wordId, newText: newText)
                            }
                        )
                        .padding(.horizontal, 20)
                        .padding(.bottom, 8)
                        .padding(.top, 12)

                        // Waveform with trim handles and effect segments overlay
                        waveformSection
                            .padding(.horizontal, 20)

                        // Effect segments timeline (below waveform)
                        effectSegmentsTimeline
                            .padding(.horizontal, 20)
                            .padding(.top, 8)

                        // Duration info
                        durationInfo

                        // Inline translation preview section
                        if showTranslationSection {
                            inlineTranslationSection
                                .padding(.top, 12)
                        }

                        // Spacer to ensure content can scroll above bottom bar
                        Spacer()
                            .frame(height: 20)
                    }
                }

                // Effects selector (fixed at bottom)
                effectsSection

                // Bottom bar (fixed)
                bottomBar
            }

            // Loading overlay
            if viewModel.isLoading {
                loadingOverlay
            }

            // Processing overlay
            if viewModel.isProcessing {
                processingOverlay
            }
        }
        .onAppear {
            viewModel.loadAudio()
            // Auto-start transcription (from ModernAudioEditorView)
            Task {
                await timedTranscriptionService.transcribe(url: audioURL)
            }
        }
        .onDisappear {
            viewModel.cleanup()
            translationPreviewService.cleanup()
            timedTranscriptionService.cancel()
        }
        .sheet(isPresented: $showAddEffectMenu) {
            AddEffectMenu(
                position: addEffectPosition,
                onSelectEffect: { effectType in
                    viewModel.addEffectAtCurrentPosition(effectType)
                    showAddEffectMenu = false
                },
                onDismiss: { showAddEffectMenu = false }
            )
        }
        .sheet(item: $editingSegment) { segment in
            AdvancedEffectEditorView(
                timeline: viewModel.effectTimeline,
                segment: segment,
                audioDuration: viewModel.duration,
                transcriptionSegments: $transcriptionTextSegments,
                currentTime: viewModel.playheadPosition * viewModel.duration,
                onSeek: { time in
                    let position = time / max(0.001, viewModel.duration)
                    viewModel.seekToPosition(position)
                },
                onPlayFromTime: { time in
                    let position = time / max(0.001, viewModel.duration)
                    viewModel.seekToPosition(position)
                    if !viewModel.isPlaying {
                        viewModel.togglePlayPause()
                    }
                },
                onDismiss: { editingSegment = nil }
            )
        }
        .sheet(isPresented: $showTranscription) {
            TranscriptionEditorSheet(
                transcriptionService: timedTranscriptionService,
                onDismiss: { showTranscription = false }
            )
        }
        .sheet(isPresented: $showTranslationPreview) {
            TranslationPreviewSheet(
                previewService: translationPreviewService,
                audioURL: audioURL,
                onDismiss: { showTranslationPreview = false }
            )
        }
        .onChange(of: timedTranscriptionService.transcription) { _, newValue in
            // Sync transcription to TranscriptionTextSegments for advanced editor
            if let transcription = newValue {
                syncTranscriptionSegments(from: transcription)
            }
        }
    }

    /// Convert transcription to editable text segments (word-level from TimedTranscriptionService)
    private func syncTranscriptionSegments(from transcription: TimedTranscription) {
        // Convert timed words to TranscriptionTextSegments
        // Group words into sentence-like segments
        transcriptionTextSegments = transcription.words.map { word in
            TranscriptionTextSegment(
                text: word.text,
                startTime: word.startTime,
                endTime: word.endTime,
                language: "fr"
            )
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack(spacing: 16) {
            // Cancel button
            Button {
                viewModel.cleanup()
                onCancel()
            } label: {
                Text("Annuler")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white)
            }

            Spacer()

            // Title + Duration
            VStack(spacing: 2) {
                Text("Modifier")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)

                Text(viewModel.selectedDurationFormatted)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(.white.opacity(0.6))
            }

            Spacer()

            // Tools
            HStack(spacing: 12) {
                // Transcription edit toggle
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        isEditingTranscription.toggle()
                    }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                } label: {
                    Image(systemName: isEditingTranscription ? "pencil.circle.fill" : "pencil.circle")
                        .font(.system(size: 18))
                        .foregroundColor(isEditingTranscription ? .yellow : .white.opacity(0.7))
                }

                // Transcription status indicator
                Button {
                    showTranscription = true
                } label: {
                    Image(systemName: timedTranscriptionService.transcription != nil ? "text.bubble.fill" : "text.bubble")
                        .font(.system(size: 18))
                        .foregroundColor(timedTranscriptionService.transcription != nil ? .green : .white.opacity(0.7))
                }

                // Translation preview button
                Button {
                    showTranslationPreview = true
                } label: {
                    Image(systemName: translationPreviewService.state == .ready ? "globe.europe.africa.fill" : "globe.europe.africa")
                        .font(.system(size: 18))
                        .foregroundColor(translationPreviewService.state == .ready ? .blue : .white.opacity(0.7))
                }

                // Grid settings
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        gridEnabled.toggle()
                    }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                } label: {
                    Image(systemName: gridEnabled ? "grid" : "grid.circle")
                        .font(.system(size: 18))
                        .foregroundColor(gridEnabled ? .yellow : .white.opacity(0.7))
                }

                // Reset button
                Button {
                    viewModel.resetEdits()
                } label: {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.system(size: 18))
                        .foregroundColor(.white.opacity(0.7))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.black.opacity(0.4))
    }

    // MARK: - Waveform Section

    private var waveformSection: some View {
        VStack(spacing: 4) {
            // Interactive waveform with segment cursors
            EditorWaveformView(
                playheadPosition: Binding(
                    get: { viewModel.playheadPosition },
                    set: { viewModel.seekToPosition($0) }
                ),
                trimStartPosition: Binding(
                    get: { viewModel.trimStartPosition },
                    set: { viewModel.updateTrimStart($0) }
                ),
                trimEndPosition: Binding(
                    get: { viewModel.trimEndPosition },
                    set: { viewModel.updateTrimEnd($0) }
                ),
                effectTimeline: viewModel.effectTimeline,
                waveformSamples: viewModel.waveformSamples,
                duration: viewModel.duration,
                isPlaying: viewModel.isPlaying,
                onSeek: { position in
                    viewModel.seekToPosition(position)
                },
                onSegmentUpdate: { segmentId, startTime, endTime in
                    viewModel.effectTimeline.updateSegment(segmentId, startTime: startTime, endTime: endTime)
                    viewModel.invalidatePreview()
                }
            )
            .frame(height: 120)

            // Time ruler
            TimeRulerView(
                duration: viewModel.duration,
                trimStart: viewModel.trimStartPosition,
                trimEnd: viewModel.trimEndPosition
            )
            .padding(.horizontal, 4)

            // Trim handles below waveform
            trimHandlesRow
        }
    }

    private var trimHandlesRow: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let handleWidth: CGFloat = 72 // Wider to show full time
            let availableWidth = width - (handleWidth * 2)

            ZStack(alignment: .leading) {
                // Start trim handle (orange/yellow)
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.orange)
                        .frame(width: 6, height: 32)

                    VStack(spacing: 2) {
                        Image(systemName: "chevron.left.2")
                            .font(.system(size: 12, weight: .bold))
                        Text(viewModel.trimStartTimeFormatted)
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .foregroundColor(.orange)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .background(Color.orange.opacity(0.2))
                .cornerRadius(8)
                .frame(width: handleWidth)
                .offset(x: viewModel.trimStartPosition * availableWidth)
                .gesture(
                    DragGesture(minimumDistance: 1)
                        .onChanged { value in
                            let newPosition = (value.location.x - handleWidth / 2) / availableWidth
                            viewModel.updateTrimStart(newPosition)
                        }
                )

                // End trim handle (orange/yellow)
                HStack(spacing: 6) {
                    VStack(spacing: 2) {
                        Image(systemName: "chevron.right.2")
                            .font(.system(size: 12, weight: .bold))
                        Text(viewModel.trimEndTimeFormatted)
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .foregroundColor(.orange)

                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.orange)
                        .frame(width: 6, height: 32)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .background(Color.orange.opacity(0.2))
                .cornerRadius(8)
                .frame(width: handleWidth)
                .offset(x: viewModel.trimEndPosition * availableWidth + handleWidth)
                .gesture(
                    DragGesture(minimumDistance: 1)
                        .onChanged { value in
                            let newPosition = (value.location.x - handleWidth / 2) / availableWidth
                            viewModel.updateTrimEnd(newPosition)
                        }
                )
            }
        }
        .frame(height: 42)
    }

    // MARK: - Duration Info

    private var durationInfo: some View {
        HStack {
            // Start time
            Text(viewModel.trimStartTimeFormatted)
                .font(.system(size: 14, weight: .medium, design: .monospaced))
                .foregroundColor(.yellow)

            Spacer()

            // Play button
            Button {
                viewModel.togglePlayPause()
            } label: {
                Image(systemName: viewModel.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(.yellow)
                    .shadow(color: .black.opacity(0.3), radius: 4)
            }

            Spacer()

            // End time / Selected duration
            VStack(alignment: .trailing, spacing: 2) {
                Text(viewModel.trimEndTimeFormatted)
                    .font(.system(size: 14, weight: .medium, design: .monospaced))
                    .foregroundColor(.yellow)

                Text("(\(viewModel.selectedDurationFormatted))")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.6))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
    }

    // MARK: - Inline Translation Section

    /// Quick language buttons for translation preview
    private let quickTranslationLanguages: [VoiceTranslationLanguage] = [
        .english, .french, .spanish, .german, .chinese, .arabic
    ]

    private var inlineTranslationSection: some View {
        VStack(spacing: 12) {
            // Header with toggle
            HStack {
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isTranslationExpanded.toggle()
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "globe.europe.africa.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.blue)

                        Text("Traduction TTS")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.white.opacity(0.9))

                        // Status badge
                        translationStatusBadge

                        Image(systemName: isTranslationExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.white.opacity(0.5))
                    }
                }

                Spacer()

                // Quick play translated audio button (if audio ready - either voice cloning or fallback TTS)
                if translationPreviewService.state.hasAudio {
                    Button {
                        translationPreviewService.togglePlayback()
                    } label: {
                        Image(systemName: translationPreviewService.isPlaying ? "stop.circle.fill" : "play.circle.fill")
                            .font(.system(size: 24))
                            .foregroundColor(translationPreviewService.currentPreview?.usedVoiceCloning == true ? .purple : .green)
                    }
                }

                // Full sheet button
                Button {
                    showTranslationPreview = true
                } label: {
                    Image(systemName: "arrow.up.right.square")
                        .font(.system(size: 16))
                        .foregroundColor(.white.opacity(0.6))
                }
            }

            // Quick language selector (always visible)
            quickLanguageBar

            // Expanded content: transcription and translation
            if isTranslationExpanded {
                translationContentView
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.white.opacity(0.05))
        .cornerRadius(12)
        .padding(.horizontal, 16)
    }

    private var translationStatusBadge: some View {
        Group {
            switch translationPreviewService.state {
            case .idle:
                Text("Non traduit")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.white.opacity(0.1))
                    .cornerRadius(4)

            case .extractingVoice, .transcribing, .translating, .synthesizing:
                HStack(spacing: 4) {
                    ProgressView()
                        .scaleEffect(0.5)
                    Text(translationPreviewService.state.displayText)
                        .font(.system(size: 9, weight: .medium))
                }
                .foregroundColor(.orange)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.orange.opacity(0.15))
                .cornerRadius(4)

            case .textReady:
                HStack(spacing: 2) {
                    Image(systemName: "text.bubble.fill")
                        .font(.system(size: 8))
                    Text(selectedTargetLanguage.flagEmoji)
                        .font(.system(size: 10))
                }
                .foregroundColor(.orange)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.orange.opacity(0.15))
                .cornerRadius(4)

            case .ready:
                HStack(spacing: 2) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 8))
                    Text(selectedTargetLanguage.flagEmoji)
                        .font(.system(size: 10))
                }
                .foregroundColor(.green)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.green.opacity(0.15))
                .cornerRadius(4)

            case .readyWithFallback:
                HStack(spacing: 2) {
                    Image(systemName: "speaker.wave.2.fill")
                        .font(.system(size: 8))
                    Text(selectedTargetLanguage.flagEmoji)
                        .font(.system(size: 10))
                }
                .foregroundColor(.blue)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.blue.opacity(0.15))
                .cornerRadius(4)

            case .textOnlyReady:
                HStack(spacing: 2) {
                    Image(systemName: "doc.text.fill")
                        .font(.system(size: 8))
                    Text(selectedTargetLanguage.flagEmoji)
                        .font(.system(size: 10))
                }
                .foregroundColor(.yellow)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.yellow.opacity(0.15))
                .cornerRadius(4)

            case .error:
                HStack(spacing: 2) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 8))
                    Text("Erreur")
                        .font(.system(size: 9, weight: .medium))
                }
                .foregroundColor(.red)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.red.opacity(0.15))
                .cornerRadius(4)
            }
        }
    }

    private var quickLanguageBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(quickTranslationLanguages, id: \.rawValue) { language in
                    quickLanguageButton(language)
                }
            }
        }
    }

    private func quickLanguageButton(_ language: VoiceTranslationLanguage) -> some View {
        let isSelected = selectedTargetLanguage == language
        let hasCache = translationPreviewService.cachedPreviews[language] != nil
        let isProcessing = translationPreviewService.state.isProcessing && selectedTargetLanguage == language

        return Button {
            selectedTargetLanguage = language
            triggerTranslation(to: language)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
            VStack(spacing: 3) {
                ZStack {
                    Text(language.flagEmoji)
                        .font(.system(size: 20))

                    if isProcessing {
                        Circle()
                            .stroke(Color.orange, lineWidth: 2)
                            .frame(width: 28, height: 28)
                            .rotationEffect(.degrees(Double.random(in: 0...360)))
                            .animation(.linear(duration: 1).repeatForever(autoreverses: false), value: isProcessing)
                    }
                }

                Text(language.shortName)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(isSelected ? .white : .white.opacity(0.6))

                // Cache indicator
                if hasCache {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 5, height: 5)
                }
            }
            .frame(width: 44)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? Color.blue.opacity(0.4) : Color.white.opacity(0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? Color.blue : Color.clear, lineWidth: 1.5)
            )
        }
        .disabled(isProcessing)
    }

    private var translationContentView: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Original text (transcription)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Texte original")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))

                    Spacer()

                    if let srcLang = detectSourceLanguageForTranslation() {
                        Text(srcLang.flagEmoji)
                            .font(.system(size: 12))
                    }
                }

                if let transcription = timedTranscriptionService.transcription, !transcription.fullText.isEmpty {
                    Text(transcription.fullText)
                        .font(.system(size: 13))
                        .foregroundColor(.white.opacity(0.9))
                        .lineLimit(3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(Color.white.opacity(0.08))
                        .cornerRadius(8)
                } else if timedTranscriptionService.isTranscribing {
                    HStack(spacing: 8) {
                        ProgressView()
                            .scaleEffect(0.8)
                        Text("Transcription en cours...")
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.5))
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white.opacity(0.05))
                    .cornerRadius(8)
                } else {
                    Button {
                        Task {
                            await timedTranscriptionService.transcribe(url: audioURL)
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "text.bubble")
                            Text("Transcrire l'audio")
                        }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.yellow)
                        .padding(10)
                        .frame(maxWidth: .infinity)
                        .background(Color.yellow.opacity(0.1))
                        .cornerRadius(8)
                    }
                }
            }

            // Arrow separator
            HStack {
                Spacer()
                Image(systemName: "arrow.down")
                    .font(.system(size: 12))
                    .foregroundColor(.blue.opacity(0.6))
                Spacer()
            }

            // Translated text
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Traduction")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))

                    Spacer()

                    Text(selectedTargetLanguage.flagEmoji)
                        .font(.system(size: 12))
                    Text(selectedTargetLanguage.nativeName)
                        .font(.system(size: 10))
                        .foregroundColor(.white.opacity(0.6))
                }

                if let preview = translationPreviewService.currentPreview {
                    Text(preview.translatedText)
                        .font(.system(size: 13))
                        .foregroundColor(.white)
                        .lineLimit(3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(Color.blue.opacity(0.15))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                        )
                } else if translationPreviewService.state.isProcessing {
                    HStack(spacing: 8) {
                        ProgressView()
                            .scaleEffect(0.8)
                        Text(translationPreviewService.state.displayText)
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.5))
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.blue.opacity(0.08))
                    .cornerRadius(8)
                } else if case .error(let message) = translationPreviewService.state {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 4) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.system(size: 10))
                            Text("Erreur de traduction")
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundColor(.orange)

                        Text(message)
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.5))
                            .lineLimit(2)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.1))
                    .cornerRadius(8)
                } else {
                    Text("Sélectionnez une langue pour traduire")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.4))
                        .italic()
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.white.opacity(0.05))
                        .cornerRadius(8)
                }
            }

            // Voice type indicator
            if translationPreviewService.state.hasAudio {
                HStack(spacing: 6) {
                    if translationPreviewService.currentPreview?.usedVoiceCloning == true {
                        Image(systemName: "person.wave.2.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.purple)
                        Text("Audio synthétisé avec votre voix clonée")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.5))
                    } else {
                        Image(systemName: "speaker.wave.2.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.blue)
                        Text("Audio synthétisé (voix standard)")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.5))
                    }
                }
            }
        }
        .padding(.top, 8)
    }

    private func triggerTranslation(to language: VoiceTranslationLanguage) {
        Task {
            await translationPreviewService.generatePreview(
                audioURL: audioURL,
                targetLanguage: language
            )
        }
    }

    private func detectSourceLanguageForTranslation() -> VoiceTranslationLanguage? {
        let languageCode = Locale.current.language.languageCode?.identifier ?? "en"
        return VoiceTranslationLanguage(rawValue: languageCode)
    }

    // MARK: - Effect Segments Timeline

    private var effectSegmentsTimeline: some View {
        // Use a wrapper view that observes effectTimeline directly for real-time updates
        EffectSegmentsTimelineBar(
            timeline: viewModel.effectTimeline,
            duration: viewModel.duration,
            playheadPosition: viewModel.playheadPosition,
            isPlaying: viewModel.isPlaying,
            onAddEffect: {
                addEffectPosition = viewModel.playheadPosition
                showAddEffectMenu = true
            },
            onSelectSegment: { segmentId in
                viewModel.effectTimeline.selectedSegmentId = segmentId
                if let segment = viewModel.effectTimeline.segments.first(where: { $0.id == segmentId }) {
                    editingSegment = segment
                }
            }
        )
    }

    // MARK: - Effects Section

    private var effectsSection: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Ajouter un effet")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white.opacity(0.8))

                Spacer()

                // Mode indicator
                Text("Tap pour ajouter à la position")
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.5))
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(AudioEffectsCatalog.shared.voiceMessageEffects) { effect in
                        AudioEffectButton(
                            effect: effect,
                            isSelected: viewModel.selectedEffect == effect.type
                        ) {
                            // Add effect at current playhead position
                            viewModel.addEffectAtCurrentPosition(effect.type)
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .padding(.vertical, 16)
        .background(Color.black.opacity(0.5))
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        HStack {
            // Status indicators
            HStack(spacing: 8) {
                // Trim indicator
                if viewModel.isTrimmed {
                    HStack(spacing: 4) {
                        Image(systemName: "scissors")
                            .font(.system(size: 12))
                        Text("Réduit")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(.yellow)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Color.yellow.opacity(0.2)))
                }

                // Effects count indicator - opens graph view
                if !viewModel.effectTimeline.segments.isEmpty {
                    EffectsCountButton(
                        timeline: viewModel.effectTimeline,
                        duration: viewModel.duration,
                        currentTime: viewModel.playheadPosition * viewModel.duration,
                        onSegmentSelected: { segment in
                            viewModel.effectTimeline.selectedSegmentId = segment.id
                            editingSegment = segment
                        }
                    )
                }
            }

            Spacer()

            // Confirm button
            Button {
                confirmAudio()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Ajouter")
                        .font(.system(size: 17, weight: .semibold))
                }
                .foregroundColor(.black)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(
                    Capsule()
                        .fill(Color.yellow)
                )
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.black.opacity(0.3))
    }

    // MARK: - Overlays

    private var loadingOverlay: some View {
        ZStack {
            Color.black.opacity(0.7).ignoresSafeArea()

            VStack(spacing: 16) {
                ProgressView()
                    .scaleEffect(1.5)
                    .tint(.white)

                Text("Chargement...")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
            }
        }
    }

    private var processingOverlay: some View {
        ZStack {
            Color.black.opacity(0.8).ignoresSafeArea()

            VStack(spacing: 20) {
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.2), lineWidth: 6)
                        .frame(width: 80, height: 80)

                    Circle()
                        .trim(from: 0, to: viewModel.processingProgress)
                        .stroke(Color.yellow, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .frame(width: 80, height: 80)
                        .rotationEffect(.degrees(-90))

                    Text("\(Int(viewModel.processingProgress * 100))%")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                }

                Text("Traitement de l'audio...")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
            }
        }
    }

    // MARK: - Actions

    private func confirmAudio() {
        Task {
            let finalURL = await viewModel.processAndExport()
            await MainActor.run {
                // Pass the effects timeline to the callback if provided
                let effectsTimeline = viewModel.getEffectsTimeline()
                onEffectsTimelineReady?(effectsTimeline)

                // Call the main confirm callback
                onConfirm(finalURL, viewModel.effectTimeline.segments)

                // Log timeline info for debugging
                if let timeline = effectsTimeline {
                    mediaLogger.info("[AudioEditor] Confirmed with effects timeline: \(timeline.events.count) events, duration: \(timeline.durationSeconds)s")
                }
            }
        }
    }
}

// MARK: - Audio Editor ViewModel

@MainActor
final class AudioEditorViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published private(set) var isLoading = true
    @Published private(set) var isProcessing = false
    @Published private(set) var processingProgress: Double = 0
    @Published private(set) var isPlaying = false
    @Published private(set) var waveformSamples: [CGFloat] = []
    @Published private(set) var trimStartPosition: Double = 0.0
    @Published private(set) var trimEndPosition: Double = 1.0
    @Published private(set) var playheadPosition: Double = 0.0
    @Published private(set) var duration: Double = 0
    @Published var selectedEffect: AudioEffectType

    /// Timeline for managing multiple effect segments
    @Published var effectTimeline: AudioEffectTimeline

    /// Effects recording timeline tracker (microsecond precision)
    /// Tracks all effect events for sending to server with original audio
    let effectsTracker = AudioEffectsTimelineTracker()

    /// The recorded effects timeline (set when export completes)
    private(set) var recordedEffectsTimeline: AudioEffectsRecordingTimeline?

    // MARK: - Private Properties

    private let audioURL: URL
    private var audioPlayer: AVAudioPlayer?
    private var playbackTimer: Timer?
    private let minimumTrimDuration: Double = 0.5
    private let defaultEffectDuration: TimeInterval = 3.0

    // Smooth playback system (replaces real-time effect switching)
    private let smoothRenderer = SmoothAudioEffectsRenderer()
    private let smoothPlayback = SmoothPlaybackController()
    private var renderedPreviewURL: URL?
    private var isPreparingPreview = false
    private var lastRenderedTimeline: AudioEffectTimeline?
    private var lastRenderedTrimStart: Double = 0
    private var lastRenderedTrimEnd: Double = 1

    // Audio Engine for single effect preview (no segment switching)
    private var previewEngine: AVAudioEngine?
    private var previewPlayerNode: AVAudioPlayerNode?
    private var previewSourceFile: AVAudioFile?
    private var currentEffectNodes: [AVAudioNode] = []

    // Track the actual playback start position (for updatePlayheadFromEngine)
    private var playbackStartPosition: Double = 0

    /// Flag to preserve original audio (no baked effects)
    var preserveOriginalAudio = true

    // MARK: - Computed Properties

    var isTrimmed: Bool {
        trimStartPosition > 0.001 || trimEndPosition < 0.999
    }

    var trimStartTimeFormatted: String {
        formatTime(trimStartPosition * duration)
    }

    var trimEndTimeFormatted: String {
        formatTime(trimEndPosition * duration)
    }

    var selectedDurationFormatted: String {
        formatTime((trimEndPosition - trimStartPosition) * duration)
    }

    /// Check if any effects are applied
    var hasEffects: Bool {
        !effectTimeline.segments.isEmpty || selectedEffect != .normal
    }

    // MARK: - Init

    init(url: URL, initialEffect: AudioEffectType) {
        self.audioURL = url
        self.selectedEffect = initialEffect
        self.effectTimeline = AudioEffectTimeline()
    }

    // MARK: - Effect Segment Management

    /// Add an effect at the current playhead position
    func addEffectAtCurrentPosition(_ effectType: AudioEffectType) {
        guard effectType != .normal else { return }

        let currentTime = playheadPosition * duration
        let endTime = min(currentTime + defaultEffectDuration, duration)

        effectTimeline.addSegment(
            effectType: effectType,
            startTime: currentTime,
            endTime: endTime
        )

        // Track effect activation with microsecond precision for server timeline
        effectsTracker.recordActivation(
            effectType.rawValue,
            params: ["startTime": currentTime, "endTime": endTime]
        )

        selectedEffect = effectType
        mediaLogger.info("[AudioEditor] Added effect segment: \(effectType.rawValue) at \(currentTime)s (tracked at \(effectsTracker.currentTimestamp)ms)")
    }

    /// Remove an effect segment and track the deactivation
    func removeEffectSegment(_ segmentId: UUID) {
        if let segment = effectTimeline.segments.first(where: { $0.id == segmentId }) {
            effectsTracker.recordDeactivation(segment.effectType.rawValue)
        }
        effectTimeline.removeSegment(segmentId)
    }

    /// Update effect parameters and track the change
    func updateEffectParameters(_ effectType: AudioEffectType, params: [String: Any]) {
        effectsTracker.recordUpdate(effectType.rawValue, params: params)
    }

    /// Get the active effect at a specific time position
    func activeEffectAt(time: TimeInterval) -> AudioEffectType {
        let effects = effectTimeline.effectsAt(time: time)
        // Return the most recently added effect if multiple overlap
        return effects.last ?? selectedEffect
    }

    // MARK: - Setup

    func loadAudio() {
        isLoading = true

        Task {
            do {
                // Load audio player
                let player = try AVAudioPlayer(contentsOf: audioURL)
                player.prepareToPlay()
                self.audioPlayer = player
                self.duration = player.duration

                // Initialize effect timeline with correct duration
                self.effectTimeline.setDuration(player.duration)

                // Start effects tracker for recording timeline
                // Uses microsecond precision via mach_absolute_time
                effectsTracker.startTracking(
                    sampleRate: Int(player.format.sampleRate),
                    channels: Int(player.format.channelCount)
                )

                mediaLogger.info("[AudioEditor] Started effects tracking with sample rate: \(Int(player.format.sampleRate))Hz")

                // Generate waveform
                await generateWaveform()

                self.isLoading = false

            } catch {
                mediaLogger.error("[AudioEditor] Failed to load audio: \(error.localizedDescription)")
                self.isLoading = false
            }
        }
    }

    private func generateWaveform() async {
        do {
            let file = try AVAudioFile(forReading: audioURL)
            let format = file.processingFormat
            let frameCount = UInt32(file.length)

            guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
                return
            }

            try file.read(into: buffer)

            guard let floatData = buffer.floatChannelData?[0] else {
                return
            }

            // Downsample to ~60 samples for display
            let sampleCount = 60
            let samplesPerBar = Int(frameCount) / sampleCount

            var samples: [CGFloat] = []

            for i in 0..<sampleCount {
                let startIndex = i * samplesPerBar
                let endIndex = min(startIndex + samplesPerBar, Int(frameCount))

                var sum: Float = 0
                for j in startIndex..<endIndex {
                    sum += abs(floatData[j])
                }

                let average = sum / Float(endIndex - startIndex)
                // Normalize to 0-1 range
                let normalized = CGFloat(min(average * 3, 1.0))
                samples.append(max(0.1, normalized))
            }

            await MainActor.run {
                self.waveformSamples = samples
            }

        } catch {
            mediaLogger.error("[AudioEditor] Failed to generate waveform: \(error.localizedDescription)")
            // Generate placeholder waveform
            await MainActor.run {
                self.waveformSamples = (0..<60).map { _ in CGFloat.random(in: 0.2...0.8) }
            }
        }
    }

    // MARK: - Playback

    func togglePlayPause() {
        if isPlaying {
            stopPlayback()
        } else {
            startPlaybackWithEffect()
        }
    }

    private func startPlaybackWithEffect() {
        do {
            // Stop any existing preview
            stopPreviewEngine()

            // Setup audio session
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)

            // Determine playback mode: use segments if available, otherwise use selected effect
            let hasSegments = !effectTimeline.segments.isEmpty

            if hasSegments {
                // Play with dynamic effect switching based on segments
                startSegmentAwarePlayback()
            } else {
                // Play with single effect applied to entire audio
                startSingleEffectPlayback()
            }

            UIImpactFeedbackGenerator(style: .light).impactOccurred()

        } catch {
            mediaLogger.error("[AudioEditor] Failed to start playback with effect: \(error)")
            // Fallback to simple playback without effects
            startSimplePlayback()
        }
    }

    /// Start playback with smooth offline-rendered effects
    /// Uses SmoothAudioEffectsRenderer for stutter-free playback
    private func startSegmentAwarePlayback() {
        // Save the current playhead position to start from
        let startPosition = playheadPosition

        Task {
            do {
                // Check if we need to re-render (timeline changed)
                let needsRender = renderedPreviewURL == nil || timelineHasChanged()

                if needsRender {
                    isPreparingPreview = true
                    mediaLogger.info("[AudioEditor] Rendering preview with \(effectTimeline.segments.count) effect segments...")

                    // Render audio with effects applied offline
                    let trimRange = (start: trimStartPosition * duration, end: trimEndPosition * duration)
                    let renderedURL = try await smoothRenderer.render(
                        sourceURL: audioURL,
                        timeline: effectTimeline,
                        trimRange: trimRange
                    )

                    self.renderedPreviewURL = renderedURL
                    self.lastRenderedTimeline = effectTimeline.copy()
                    self.lastRenderedTrimStart = trimStartPosition
                    self.lastRenderedTrimEnd = trimEndPosition
                    isPreparingPreview = false

                    mediaLogger.info("[AudioEditor] Preview rendered successfully (trim: \(trimStartPosition) - \(trimEndPosition))")
                }

                // Load and play the rendered file
                guard let previewURL = renderedPreviewURL else {
                    startSimplePlayback()
                    return
                }

                try smoothPlayback.load(url: previewURL)

                // Setup callbacks
                smoothPlayback.onTimeUpdate = { [weak self] time in
                    guard let self = self else { return }
                    let trimDuration = (self.trimEndPosition - self.trimStartPosition) * self.duration
                    if trimDuration > 0 {
                        self.playheadPosition = self.trimStartPosition + (time / trimDuration) * (self.trimEndPosition - self.trimStartPosition)
                    }
                }

                smoothPlayback.onPlaybackComplete = { [weak self] in
                    self?.onPlaybackComplete()
                }

                // Calculate the seek time based on current playhead position
                // The rendered file only contains the trimmed portion (trimStart to trimEnd)
                // So we need to calculate the relative position within the trim range
                let trimDuration = (trimEndPosition - trimStartPosition) * duration
                let relativePosition = (startPosition - trimStartPosition) / (trimEndPosition - trimStartPosition)
                let seekTime = max(0, relativePosition * trimDuration)

                // Seek to the correct position before playing
                if seekTime > 0.01 {
                    smoothPlayback.seek(to: seekTime)
                    mediaLogger.info("[AudioEditor] Seeking to \(seekTime)s (playhead at \(startPosition))")
                }

                // Start playback
                smoothPlayback.play()
                isPlaying = true
                // Keep the playhead at the starting position (don't reset to trimStart)
                playheadPosition = startPosition

            } catch {
                mediaLogger.error("[AudioEditor] Smooth playback failed: \(error)")
                isPreparingPreview = false
                // Fallback to simple playback
                startSimplePlayback()
            }
        }
    }

    /// Check if the timeline or trim bounds have changed since last render
    private func timelineHasChanged() -> Bool {
        guard let last = lastRenderedTimeline else { return true }

        // Check if trim bounds changed
        if abs(trimStartPosition - lastRenderedTrimStart) > 0.001 ||
           abs(trimEndPosition - lastRenderedTrimEnd) > 0.001 {
            return true
        }

        // Compare segment counts and effect types
        if last.segments.count != effectTimeline.segments.count { return true }
        for (i, segment) in effectTimeline.segments.enumerated() {
            let lastSegment = last.segments[i]
            if segment.effectType != lastSegment.effectType ||
               abs(segment.startTime - lastSegment.startTime) > 0.01 ||
               abs(segment.endTime - lastSegment.endTime) > 0.01 {
                return true
            }
        }
        return false
    }

    /// Invalidate rendered preview when timeline changes
    func invalidatePreview() {
        renderedPreviewURL = nil
        lastRenderedTimeline = nil
    }

    /// Start playback with a single effect applied to entire audio
    private func startSingleEffectPlayback() {
        // Save current playhead position
        let startPosition = playheadPosition

        do {
            // Create new engine
            let engine = AVAudioEngine()
            let playerNode = AVAudioPlayerNode()

            // Load source file
            let sourceFile = try AVAudioFile(forReading: audioURL)
            let format = sourceFile.processingFormat

            engine.attach(playerNode)

            // Setup effect chain based on selected effect
            setupEffectChain(engine: engine, playerNode: playerNode, format: format)

            // Start engine
            try engine.start()

            // Calculate start frame based on CURRENT playhead position (not trim start)
            // Use the current playhead position if it's within trim range, otherwise use trim start
            let effectiveStartPosition = max(startPosition, trimStartPosition)
            let startFrame = AVAudioFramePosition(effectiveStartPosition * Double(sourceFile.length))
            let endFrame = AVAudioFramePosition(trimEndPosition * Double(sourceFile.length))
            let framesToPlay = AVAudioFrameCount(endFrame - startFrame)

            // Seek to start position
            sourceFile.framePosition = startFrame

            // Schedule segment
            playerNode.scheduleSegment(
                sourceFile,
                startingFrame: startFrame,
                frameCount: framesToPlay,
                at: nil
            ) { [weak self] in
                Task { @MainActor in
                    self?.onPlaybackComplete()
                }
            }

            playerNode.play()

            // Store references
            self.previewEngine = engine
            self.previewPlayerNode = playerNode
            self.previewSourceFile = sourceFile
            self.isPlaying = true
            // Keep playhead at current position, don't reset to trimStart
            self.playheadPosition = effectiveStartPosition
            // Track the actual start position for playhead updates
            self.playbackStartPosition = effectiveStartPosition

            // Setup timer for playhead updates
            playbackTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.updatePlayheadFromEngine()
                }
            }

            mediaLogger.info("[AudioEditor] Single effect playback started from \(effectiveStartPosition)")

        } catch {
            mediaLogger.error("[AudioEditor] Single effect playback failed: \(error)")
            startSimplePlayback()
        }
    }

    private func setupEffectChain(engine: AVAudioEngine, playerNode: AVAudioPlayerNode, format: AVAudioFormat) {
        // Clear previous effect nodes
        currentEffectNodes.removeAll()

        // Use the centralized AudioEffectProcessor
        let nodes = AudioEffectProcessor.shared.setupEffectChain(
            engine: engine,
            playerNode: playerNode,
            format: format,
            effectType: selectedEffect
        )
        currentEffectNodes.append(contentsOf: nodes)
    }

    private func startSimplePlayback() {
        guard let player = audioPlayer else { return }

        // Use current playhead position if within trim range, otherwise use trim start
        let effectiveStartPosition = max(playheadPosition, trimStartPosition)
        player.currentTime = effectiveStartPosition * duration
        player.play()
        isPlaying = true
        playheadPosition = effectiveStartPosition

        playbackTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updatePlayhead()
            }
        }

        mediaLogger.info("[AudioEditor] Simple playback started from \(effectiveStartPosition)")
    }

    private func stopPlayback() {
        // Stop smooth playback controller
        smoothPlayback.stop()

        // Stop preview engine
        stopPreviewEngine()

        // Stop simple audio player
        audioPlayer?.pause()

        isPlaying = false
        playbackTimer?.invalidate()
        playbackTimer = nil
    }

    private func stopPreviewEngine() {
        previewPlayerNode?.stop()
        previewEngine?.stop()
        previewEngine = nil
        previewPlayerNode = nil
        previewSourceFile = nil
    }

    private func onPlaybackComplete() {
        isPlaying = false
        playheadPosition = trimStartPosition
        playbackTimer?.invalidate()
        playbackTimer = nil
        stopPreviewEngine()
    }

    private func updatePlayheadFromEngine() {
        guard let playerNode = previewPlayerNode,
              let sourceFile = previewSourceFile,
              let nodeTime = playerNode.lastRenderTime,
              let playerTime = playerNode.playerTime(forNodeTime: nodeTime),
              duration > 0 else { return }

        // Use playbackStartPosition (where we actually started) instead of trimStartPosition
        let startFrame = AVAudioFramePosition(playbackStartPosition * Double(sourceFile.length))
        let currentFrame = startFrame + playerTime.sampleTime
        let currentPosition = Double(currentFrame) / Double(sourceFile.length)

        playheadPosition = min(currentPosition, trimEndPosition)

        // Check if reached trim end
        if currentPosition >= trimEndPosition {
            onPlaybackComplete()
        }
    }

    private func updatePlayhead() {
        guard let player = audioPlayer, duration > 0 else { return }

        let currentPosition = player.currentTime / duration
        playheadPosition = currentPosition

        if currentPosition >= trimEndPosition {
            stopPlayback()
            playheadPosition = trimStartPosition
            audioPlayer?.currentTime = trimStartPosition * duration
        }
    }

    func seekToTrimStart() {
        if let sourceFile = previewSourceFile {
            let startFrame = AVAudioFramePosition(trimStartPosition * Double(sourceFile.length))
            sourceFile.framePosition = startFrame
        }
        audioPlayer?.currentTime = trimStartPosition * duration
        playheadPosition = trimStartPosition
    }

    /// Seek to any position (0.0 - 1.0)
    func seekToPosition(_ position: Double) {
        let clampedPosition = max(trimStartPosition, min(position, trimEndPosition))

        if let sourceFile = previewSourceFile {
            let frame = AVAudioFramePosition(clampedPosition * Double(sourceFile.length))
            sourceFile.framePosition = frame
        }

        audioPlayer?.currentTime = clampedPosition * duration
        playheadPosition = clampedPosition

        // Update smooth playback controller if active
        let time = clampedPosition * duration - trimStartPosition * duration
        if smoothPlayback.isReady {
            smoothPlayback.seek(to: time)
        }
    }

    // MARK: - Trim Controls

    func updateTrimStart(_ position: Double) {
        let maxStart = trimEndPosition - (minimumTrimDuration / duration)
        let newPosition = max(0, min(position, maxStart))

        // Only update if position actually changed
        if abs(newPosition - trimStartPosition) > 0.001 {
            trimStartPosition = newPosition

            // Invalidate rendered preview since trim bounds changed
            invalidatePreview()

            // Ensure playhead stays within new trim bounds
            if playheadPosition < trimStartPosition {
                playheadPosition = trimStartPosition
            }

            // Haptic at boundaries
            if trimStartPosition <= 0.001 || trimStartPosition >= maxStart {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } else {
                UISelectionFeedbackGenerator().selectionChanged()
            }
        }
    }

    func updateTrimEnd(_ position: Double) {
        let minEnd = trimStartPosition + (minimumTrimDuration / duration)
        let newPosition = max(minEnd, min(position, 1.0))

        // Only update if position actually changed
        if abs(newPosition - trimEndPosition) > 0.001 {
            trimEndPosition = newPosition

            // Invalidate rendered preview since trim bounds changed
            invalidatePreview()

            // Ensure playhead stays within new trim bounds
            if playheadPosition > trimEndPosition {
                playheadPosition = trimEndPosition
            }

            // Haptic at boundaries
            if trimEndPosition >= 0.999 || trimEndPosition <= minEnd {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } else {
                UISelectionFeedbackGenerator().selectionChanged()
            }
        }
    }

    // MARK: - Effects

    func selectEffect(_ effect: AudioEffectType) {
        selectedEffect = effect
        UIImpactFeedbackGenerator(style: .light).impactOccurred()

        // Restart playback with new effect preview if playing
        if isPlaying {
            stopPlayback()
            startPlaybackWithEffect()
        }
    }

    // MARK: - Reset

    func resetEdits() {
        trimStartPosition = 0
        trimEndPosition = 1.0
        playheadPosition = 0
        selectedEffect = .normal

        // Clear all effect segments
        effectTimeline.clearAll()

        audioPlayer?.currentTime = 0

        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    // MARK: - Export

    /// Process and export audio
    /// When `preserveOriginalAudio` is true, returns the original audio URL and stores effects timeline
    /// Effects are applied at playback time using the timeline (web architecture)
    func processAndExport() async -> URL {
        await MainActor.run {
            isProcessing = true
            processingProgress = 0
            stopPlayback()
        }

        do {
            await MainActor.run { processingProgress = 0.1 }

            // Stop tracking and get the complete effects timeline
            let effectsTimeline = effectsTracker.stopTracking()
            await MainActor.run {
                self.recordedEffectsTimeline = effectsTimeline
            }

            if let timeline = effectsTimeline {
                mediaLogger.info("[AudioEditor] Effects timeline captured: \(timeline.events.count) events, duration: \(timeline.duration)ms")
            }

            await MainActor.run { processingProgress = 0.2 }

            // Check if we have any modifications
            let hasSegments = !effectTimeline.segments.isEmpty
            let hasSingleEffect = selectedEffect != .normal && !hasSegments

            // PRESERVE ORIGINAL AUDIO MODE (Web Architecture):
            // - Original audio is NEVER modified
            // - Effects are tracked in timeline
            // - Timeline is sent to server with original audio
            // - Effects applied at playback time
            if preserveOriginalAudio {
                // Only trim if needed, but never bake effects
                var outputURL = audioURL

                if isTrimmed {
                    let startTime = trimStartPosition * duration
                    let endTime = trimEndPosition * duration
                    outputURL = try await trimAudio(from: startTime, to: endTime)
                    mediaLogger.info("[AudioEditor] Audio trimmed (original preserved): \(startTime)s - \(endTime)s")
                }

                await MainActor.run {
                    processingProgress = 0.6
                }

                await MainActor.run {
                    processingProgress = 1.0
                    isProcessing = false
                }

                mediaLogger.info("[AudioEditor] Export complete (original preserved). Effects in timeline for server.")
                return outputURL
            }

            // LEGACY MODE: Bake effects into audio (for backwards compatibility)
            await MainActor.run { processingProgress = 0.3 }

            // If no trimming and no effects, return original
            if !isTrimmed && !hasSegments && !hasSingleEffect {
                await MainActor.run {
                    processingProgress = 1.0
                    isProcessing = false
                }
                return audioURL
            }

            await MainActor.run { processingProgress = 0.4 }

            // Trim audio if needed
            var outputURL = audioURL
            if isTrimmed {
                let startTime = trimStartPosition * duration
                let endTime = trimEndPosition * duration
                outputURL = try await trimAudio(from: startTime, to: endTime)
            }

            await MainActor.run { processingProgress = 0.5 }

            // Apply effects based on segments or single effect
            if hasSegments {
                // Apply multiple effect segments
                outputURL = try await applyEffectSegments(to: outputURL)
            } else if hasSingleEffect {
                // Apply single effect to entire audio
                outputURL = try await applyEffect(to: outputURL)
            }

            await MainActor.run {
                processingProgress = 1.0
                isProcessing = false
            }

            return outputURL

        } catch {
            mediaLogger.error("[AudioEditor] Export failed: \(error.localizedDescription)")
            await MainActor.run {
                isProcessing = false
            }
            return audioURL
        }
    }

    /// Get the recorded effects timeline for sending to server
    /// This should be called after processAndExport() completes
    func getEffectsTimelineJSON() -> [String: Any]? {
        return recordedEffectsTimeline?.toJSON()
    }

    /// Get the recorded effects timeline
    func getEffectsTimeline() -> AudioEffectsRecordingTimeline? {
        return recordedEffectsTimeline
    }

    /// Apply multiple effect segments to the audio
    private func applyEffectSegments(to inputURL: URL) async throws -> URL {
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("multi_effected_\(UUID().uuidString).m4a")

        // Load source file
        let sourceFile = try AVAudioFile(forReading: inputURL)
        let format = sourceFile.processingFormat
        let totalFrames = sourceFile.length
        let sampleRate = format.sampleRate

        // Create output file
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: format.channelCount,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        let outputFile = try AVAudioFile(forWriting: outputURL, settings: outputSettings)

        // Sort segments by start time
        let sortedSegments = effectTimeline.segments.sorted { $0.startTime < $1.startTime }

        // Process audio in chunks, applying effects where segments exist
        let chunkSize: AVAudioFrameCount = 4096
        var currentFrame: AVAudioFramePosition = 0

        await MainActor.run { processingProgress = 0.5 }

        while currentFrame < totalFrames {
            let remainingFrames = AVAudioFrameCount(totalFrames - currentFrame)
            let framesToRead = min(chunkSize, remainingFrames)

            guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: framesToRead) else {
                break
            }

            sourceFile.framePosition = currentFrame
            try sourceFile.read(into: buffer, frameCount: framesToRead)

            // Check if current position has an active effect segment
            let currentTime = Double(currentFrame) / sampleRate

            // Find active segments at this position
            let activeSegments = sortedSegments.filter { segment in
                currentTime >= segment.startTime && currentTime < segment.endTime
            }

            // Apply effect if there's an active segment
            if let activeSegment = activeSegments.last {
                let processedBuffer = try await processBufferWithEffect(
                    buffer: buffer,
                    effectType: activeSegment.effectType,
                    format: format
                )
                try outputFile.write(from: processedBuffer)
            } else {
                // No effect, write original buffer
                try outputFile.write(from: buffer)
            }

            currentFrame += AVAudioFramePosition(framesToRead)

            // Update progress
            let progress = 0.5 + (Double(currentFrame) / Double(totalFrames)) * 0.4
            await MainActor.run { processingProgress = progress }
        }

        return outputURL
    }

    /// Process a single buffer with an effect
    private func processBufferWithEffect(
        buffer: AVAudioPCMBuffer,
        effectType: AudioEffectType,
        format: AVAudioFormat
    ) async throws -> AVAudioPCMBuffer {
        // For real-time processing, we apply the effect using AVAudioEngine
        let engine = AVAudioEngine()
        let playerNode = AVAudioPlayerNode()

        engine.attach(playerNode)

        // Setup effect chain
        _ = AudioEffectProcessor.shared.setupEffectChain(
            engine: engine,
            playerNode: playerNode,
            format: format,
            effectType: effectType
        )

        // Create output buffer
        guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: buffer.frameLength) else {
            return buffer
        }

        // Install tap to capture processed audio
        var capturedBuffer: AVAudioPCMBuffer?
        engine.mainMixerNode.installTap(onBus: 0, bufferSize: buffer.frameLength, format: format) { tappedBuffer, _ in
            capturedBuffer = tappedBuffer
        }

        try engine.start()

        // Schedule and play the buffer using continuation for async await
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            playerNode.scheduleBuffer(buffer, at: nil, options: [], completionCallbackType: .dataPlayedBack) { _ in
                continuation.resume()
            }
            playerNode.play()
        }

        // Small additional delay to ensure processing completes
        try await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds

        // Cleanup
        playerNode.stop()
        engine.mainMixerNode.removeTap(onBus: 0)
        engine.stop()

        return capturedBuffer ?? buffer
    }

    private func trimAudio(from startTime: Double, to endTime: Double) async throws -> URL {
        let asset = AVAsset(url: audioURL)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("trimmed_\(UUID().uuidString).m4a")

        guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            throw NSError(domain: "AudioEditor", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
        }

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .m4a

        let startCMTime = CMTime(seconds: startTime, preferredTimescale: 1000)
        let endCMTime = CMTime(seconds: endTime, preferredTimescale: 1000)
        exportSession.timeRange = CMTimeRange(start: startCMTime, end: endCMTime)

        await exportSession.export()

        if let error = exportSession.error {
            throw error
        }

        return outputURL
    }

    private func applyEffect(to inputURL: URL) async throws -> URL {
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("effected_\(UUID().uuidString).m4a")

        // Create audio engine and nodes
        let engine = AVAudioEngine()
        let playerNode = AVAudioPlayerNode()

        // Load source file
        let sourceFile = try AVAudioFile(forReading: inputURL)
        let format = sourceFile.processingFormat

        // Add player node
        engine.attach(playerNode)

        // Use centralized AudioEffectProcessor for effect chain
        _ = AudioEffectProcessor.shared.setupEffectChain(
            engine: engine,
            playerNode: playerNode,
            format: format,
            effectType: selectedEffect
        )

        // Create output file
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: format.channelCount,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        let outputFile = try AVAudioFile(
            forWriting: outputURL,
            settings: outputSettings
        )

        // Install tap to capture processed audio
        let bufferSize: AVAudioFrameCount = 4096
        engine.mainMixerNode.installTap(onBus: 0, bufferSize: bufferSize, format: format) { buffer, _ in
            do {
                try outputFile.write(from: buffer)
            } catch {
                mediaLogger.error("[AudioEditor] Failed to write buffer: \(error)")
            }
        }

        // Start engine and playback
        try engine.start()

        // Calculate duration for waiting
        let framesToProcess = sourceFile.length
        let sampleRate = format.sampleRate
        let durationInSeconds = Double(framesToProcess) / sampleRate

        // Schedule and play the file with completion handler
        playerNode.scheduleFile(sourceFile, at: nil) {
            // Playback completed
        }
        playerNode.play()

        // Wait for playback to complete (using Task.sleep)
        try await Task.sleep(nanoseconds: UInt64((durationInSeconds + 0.5) * 1_000_000_000))

        // Cleanup
        playerNode.stop()
        engine.mainMixerNode.removeTap(onBus: 0)
        engine.stop()

        return outputURL
    }

    // MARK: - Cleanup

    func cleanup() {
        stopPlayback()
        stopPreviewEngine()
        audioPlayer = nil
        currentEffectNodes.removeAll()

        // Reset effects tracker if still tracking
        effectsTracker.reset()
        recordedEffectsTimeline = nil
    }

    // MARK: - Helpers

    private func formatTime(_ time: Double) -> String {
        guard time.isFinite && time >= 0 else { return "0:00" }

        let totalSeconds = Int(time)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        let milliseconds = Int((time - Double(totalSeconds)) * 100)

        if time < 60 {
            return String(format: "0:%02d.%02d", seconds, milliseconds)
        } else {
            return String(format: "%d:%02d", minutes, seconds)
        }
    }
}

// MARK: - Effect Segments Timeline Bar (Observable)

/// Wrapper view that observes AudioEffectTimeline directly for real-time segment position updates
struct EffectSegmentsTimelineBar: View {
    @ObservedObject var timeline: AudioEffectTimeline
    let duration: TimeInterval
    let playheadPosition: Double
    let isPlaying: Bool
    let onAddEffect: () -> Void
    let onSelectSegment: (UUID) -> Void

    // Lane configuration
    private let laneHeight: CGFloat = 24
    private let laneSpacing: CGFloat = 3

    /// Compute lane assignments to avoid overlapping segments
    private var laneAssignments: [UUID: Int] {
        var assignments: [UUID: Int] = [:]
        var laneEndTimes: [Int: TimeInterval] = [:]

        let sortedSegments = timeline.segments.sorted { $0.startTime < $1.startTime }

        for segment in sortedSegments {
            var assignedLane = 0
            while true {
                let laneEndTime = laneEndTimes[assignedLane] ?? 0
                if segment.startTime >= laneEndTime {
                    break
                }
                assignedLane += 1
            }

            assignments[segment.id] = assignedLane
            laneEndTimes[assignedLane] = segment.endTime
        }

        return assignments
    }

    private var laneCount: Int {
        max(1, (laneAssignments.values.max() ?? 0) + 1)
    }

    private var timelineHeight: CGFloat {
        CGFloat(laneCount) * laneHeight + CGFloat(max(0, laneCount - 1)) * laneSpacing
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header with segment count and undo button
            HStack {
                Text("Effets appliqués")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))

                if !timeline.segments.isEmpty {
                    Text("(\(timeline.segments.count))")
                        .font(.system(size: 11))
                        .foregroundColor(.yellow)

                    // Show lanes indicator if multiple lanes
                    if laneCount > 1 {
                        Text("• \(laneCount) lignes")
                            .font(.system(size: 10))
                            .foregroundColor(.orange)
                    }
                }

                Spacer()

                // Undo button
                if timeline.canUndo {
                    Button {
                        timeline.undo()
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    } label: {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.6))
                    }
                }

                // Add effect button
                Button(action: onAddEffect) {
                    HStack(spacing: 4) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 14))
                        Text("Ajouter")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.yellow)
                }
            }

            // Timeline with segments - updates in real-time with lanes
            GeometryReader { geometry in
                ZStack(alignment: .topLeading) {
                    // Background tracks for each lane
                    ForEach(0..<laneCount, id: \.self) { lane in
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.white.opacity(0.08))
                            .frame(height: laneHeight)
                            .offset(y: CGFloat(lane) * (laneHeight + laneSpacing))
                    }

                    // Effect segments on their assigned lanes
                    ForEach(timeline.segments) { segment in
                        let lane = laneAssignments[segment.id] ?? 0
                        let yOffset = CGFloat(lane) * (laneHeight + laneSpacing)
                        segmentBar(segment: segment, totalWidth: geometry.size.width, yOffset: yOffset)
                    }

                    // Playhead indicator (spans all lanes)
                    if isPlaying || playheadPosition > 0 {
                        Rectangle()
                            .fill(Color.white)
                            .frame(width: 2, height: timelineHeight)
                            .offset(x: playheadPosition * geometry.size.width)
                    }
                }
            }
            .frame(height: timelineHeight)

            // Segment legend (if segments exist)
            if !timeline.segments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(timeline.segments) { segment in
                            legendItem(segment: segment)
                        }
                    }
                }
                .frame(height: 24)
            }
        }
    }

    private func segmentBar(segment: AudioEffectRegion, totalWidth: CGFloat, yOffset: CGFloat = 0) -> some View {
        let startX = segment.startPosition(totalDuration: duration) * totalWidth
        let width = (segment.endPosition(totalDuration: duration) - segment.startPosition(totalDuration: duration)) * totalWidth
        let effectColor = segment.effectDefinition?.color ?? .gray
        let isSelected = timeline.selectedSegmentId == segment.id

        return HStack(spacing: 3) {
            Image(systemName: segment.effectDefinition?.icon ?? "waveform")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.white)

            if width > 50 {
                Text(segment.effectDefinition?.displayName ?? "")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(.white)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            // Edit indicator
            if width > 35 {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 8))
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .padding(.horizontal, 6)
        .frame(width: max(8, width), height: laneHeight - 4)
        .background(
            RoundedRectangle(cornerRadius: 5)
                .fill(
                    LinearGradient(
                        colors: [effectColor.opacity(isSelected ? 1.0 : 0.85), effectColor.opacity(isSelected ? 0.9 : 0.7)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 5)
                .stroke(isSelected ? Color.white : effectColor.opacity(0.5), lineWidth: isSelected ? 2 : 1)
        )
        .shadow(color: effectColor.opacity(0.4), radius: 2, y: 1)
        .offset(x: startX, y: yOffset + 2)
        .animation(.easeOut(duration: 0.05), value: segment.startTime)
        .animation(.easeOut(duration: 0.05), value: segment.endTime)
        .onTapGesture {
            onSelectSegment(segment.id)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
            .gesture(
                DragGesture()
                    .onChanged { value in
                        // Drag to move segment
                        let newPosition = value.location.x / totalWidth
                        let segmentDuration = segment.duration
                        let newStart = max(0, newPosition * duration - segmentDuration / 2)
                        let newEnd = min(newStart + segmentDuration, duration)
                        timeline.updateSegment(
                            segment.id,
                            startTime: newStart,
                            endTime: newEnd
                        )
                    }
            )
    }

    private func legendItem(segment: AudioEffectRegion) -> some View {
        let effectColor = segment.effectDefinition?.color ?? .gray
        let isSelected = timeline.selectedSegmentId == segment.id

        return HStack(spacing: 4) {
            Image(systemName: segment.effectDefinition?.icon ?? "waveform")
                .font(.system(size: 10))
            Text(segment.effectDefinition?.displayName ?? "")
                .font(.system(size: 10, weight: .medium))
        }
        .foregroundColor(isSelected ? .white : .white.opacity(0.7))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(effectColor.opacity(isSelected ? 0.8 : 0.5))
        .clipShape(Capsule())
        .onTapGesture {
            onSelectSegment(segment.id)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }
}

// MARK: - Preview

#Preview("Audio Editor") {
    AudioEditorView(
        audioURL: URL(fileURLWithPath: "/tmp/sample.m4a"),
        initialEffect: AudioEffectType.normal,
        onConfirm: { (_: URL, _: [AudioEffectRegion]) in },
        onCancel: {}
    )
}
