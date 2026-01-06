//
//  VoiceMessageTranscriptionView.swift
//  Meeshy
//
//  View for transcribing and translating recorded voice messages
//

import SwiftUI
import AVFoundation

// MARK: - Voice Message Transcription View

/// Overlay view for transcribing a voice message
struct VoiceMessageTranscriptionView: View {
    let audioURL: URL
    let onTranscriptionComplete: (String, VoiceTranslationLanguage) -> Void
    let onDismiss: () -> Void

    @StateObject private var viewModel = VoiceTranslationViewModel()
    @State private var transcriptionResult: String = ""
    @State private var detectedLanguage: VoiceTranslationLanguage?
    @State private var isTranscribing = false
    @State private var progress: Double = 0

    var body: some View {
        VStack(spacing: 20) {
            // Header
            HStack {
                Text("Transcribe Voice Message")
                    .font(.headline)
                Spacer()
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .font(.title2)
                }
            }

            Divider()

            // Language selection
            if !isTranscribing && transcriptionResult.isEmpty {
                languageSelector
            }

            // Progress indicator
            if isTranscribing {
                progressView
            }

            // Result
            if !transcriptionResult.isEmpty {
                resultView
            }

            Spacer()

            // Action buttons
            actionButtons
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .shadow(radius: 20)
        .padding()
    }

    // MARK: - Language Selector

    private var languageSelector: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Select audio language:")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    // Auto-detect option
                    languageChip(
                        emoji: "🔍",
                        name: "Auto-detect",
                        isSelected: detectedLanguage == nil
                    ) {
                        detectedLanguage = nil
                    }

                    ForEach(VoiceTranslationLanguage.allCases.prefix(6)) { language in
                        languageChip(
                            emoji: language.flagEmoji,
                            name: language.nativeName,
                            isSelected: viewModel.sourceLanguage == language
                        ) {
                            viewModel.sourceLanguage = language
                        }
                    }
                }
            }
        }
    }

    private func languageChip(
        emoji: String,
        name: String,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(emoji)
                Text(name)
                    .font(.caption)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? Color.blue : Color(.systemGray5))
            .foregroundStyle(isSelected ? .white : .primary)
            .clipShape(Capsule())
        }
    }

    // MARK: - Progress View

    private var progressView: some View {
        VStack(spacing: 16) {
            ProgressView(value: progress)
                .progressViewStyle(.linear)

            HStack {
                ProgressView()
                    .scaleEffect(0.8)

                Text("Transcribing audio...")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    // MARK: - Result View

    private var resultView: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                if let language = detectedLanguage {
                    Text(language.flagEmoji)
                    Text("Detected: \(language.nativeName)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()

                // Copy button
                Button {
                    UIPasteboard.general.string = transcriptionResult
                } label: {
                    Image(systemName: "doc.on.doc")
                        .foregroundStyle(.blue)
                }
            }

            ScrollView {
                Text(transcriptionResult)
                    .font(.body)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 150)
            .padding()
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 16) {
            if transcriptionResult.isEmpty {
                // Transcribe button
                Button {
                    Task {
                        await transcribe()
                    }
                } label: {
                    Label("Transcribe", systemImage: "text.bubble")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(isTranscribing)
            } else {
                // Use transcription button
                Button {
                    onTranscriptionComplete(transcriptionResult, detectedLanguage ?? viewModel.sourceLanguage)
                } label: {
                    Label("Use Transcription", systemImage: "checkmark.circle")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.green)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                // Retry button
                Button {
                    transcriptionResult = ""
                    detectedLanguage = nil
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .padding()
                        .background(Color(.systemGray5))
                        .clipShape(Circle())
                }
            }
        }
    }

    // MARK: - Transcription

    private func transcribe() async {
        isTranscribing = true
        progress = 0

        // Simulate progress for UX
        let progressTask = Task {
            for i in 1...10 {
                try? await Task.sleep(nanoseconds: 200_000_000)
                progress = Double(i) / 10.0
            }
        }

        if let result = await viewModel.transcribeWithLanguageDetection(at: audioURL) {
            transcriptionResult = result.text
            detectedLanguage = result.detectedLanguage
        } else if let text = await viewModel.transcribeAudioFile(at: audioURL) {
            transcriptionResult = text
            detectedLanguage = viewModel.sourceLanguage
        }

        progressTask.cancel()
        progress = 1.0
        isTranscribing = false
    }
}

// MARK: - Voice Message Bubble Extension

/// Extension to add transcription capability to voice message bubbles
struct TranscribableVoiceMessageBubble: View {
    let audioURL: URL
    let duration: TimeInterval
    let isFromCurrentUser: Bool

    @State private var showTranscription = false
    @State private var transcribedText: String?
    @State private var isPlaying = false

    var body: some View {
        VStack(alignment: isFromCurrentUser ? .trailing : .leading, spacing: 8) {
            // Audio player bubble
            HStack(spacing: 12) {
                // Play button
                Button {
                    isPlaying.toggle()
                    // TODO: Integrate with audio player
                } label: {
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.title3)
                        .foregroundStyle(isFromCurrentUser ? .white : .blue)
                }

                // Waveform placeholder
                HStack(spacing: 2) {
                    ForEach(0..<20, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 1)
                            .fill(isFromCurrentUser ? Color.white.opacity(0.7) : Color.blue.opacity(0.5))
                            .frame(width: 3, height: CGFloat.random(in: 8...24))
                    }
                }

                // Duration
                Text(formatDuration(duration))
                    .font(.caption)
                    .foregroundStyle(isFromCurrentUser ? .white.opacity(0.8) : .secondary)
            }
            .padding()
            .background(isFromCurrentUser ? Color.blue : Color(.systemGray5))
            .clipShape(RoundedRectangle(cornerRadius: 20))

            // Transcription button
            Button {
                showTranscription = true
            } label: {
                Label(
                    transcribedText != nil ? "View Transcription" : "Transcribe",
                    systemImage: "text.bubble"
                )
                .font(.caption)
                .foregroundStyle(.blue)
            }

            // Show transcribed text if available
            if let text = transcribedText {
                Text(text)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .sheet(isPresented: $showTranscription) {
            VoiceMessageTranscriptionView(
                audioURL: audioURL,
                onTranscriptionComplete: { text, _ in
                    transcribedText = text
                    showTranscription = false
                },
                onDismiss: {
                    showTranscription = false
                }
            )
            .presentationDetents([.medium])
        }
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Inline Transcription Button

/// Simple button to add to existing voice message UI
struct TranscribeButton: View {
    let audioURL: URL
    let onTranscription: (String) -> Void

    @StateObject private var viewModel = VoiceTranslationViewModel()
    @State private var isTranscribing = false

    var body: some View {
        Button {
            Task {
                await transcribe()
            }
        } label: {
            if isTranscribing {
                ProgressView()
                    .scaleEffect(0.7)
            } else {
                Image(systemName: "text.bubble")
                    .foregroundStyle(.blue)
            }
        }
        .disabled(isTranscribing)
    }

    private func transcribe() async {
        isTranscribing = true
        if let text = await viewModel.transcribeAudioFile(at: audioURL) {
            onTranscription(text)
        }
        isTranscribing = false
    }
}

// MARK: - Preview

#Preview("Transcription View") {
    VoiceMessageTranscriptionView(
        audioURL: URL(fileURLWithPath: "/tmp/test.m4a"),
        onTranscriptionComplete: { text, lang in
            print("Transcribed: \(text) in \(lang.nativeName)")
        },
        onDismiss: {}
    )
}

#Preview("Voice Bubble") {
    VStack {
        TranscribableVoiceMessageBubble(
            audioURL: URL(fileURLWithPath: "/tmp/test.m4a"),
            duration: 15.5,
            isFromCurrentUser: false
        )

        TranscribableVoiceMessageBubble(
            audioURL: URL(fileURLWithPath: "/tmp/test.m4a"),
            duration: 8.2,
            isFromCurrentUser: true
        )
    }
    .padding()
}
