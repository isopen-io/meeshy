//
//  VoiceTranslationView.swift
//  Meeshy
//
//  Main view for real-time voice translation
//

import SwiftUI

struct VoiceTranslationView: View {
    @StateObject private var viewModel = VoiceTranslationViewModel()
    @State private var showLanguageSelector = false
    @State private var showVoiceSettings = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                // Background gradient
                backgroundGradient

                VStack(spacing: 24) {
                    // Language selector bar
                    languageSelectorBar

                    Spacer()

                    // Transcription display
                    transcriptionCard

                    // TTS controls
                    ttsControlBar

                    // Waveform visualization
                    if viewModel.isListening {
                        waveformView
                            .transition(.scale.combined(with: .opacity))
                    }

                    Spacer()

                    // Main control button
                    mainControlButton

                    // Status text
                    statusText
                }
                .padding()
            }
            .navigationTitle("Voice Translation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showVoiceSettings = true
                    } label: {
                        Image(systemName: "speaker.wave.3")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showLanguageSelector = true
                    } label: {
                        Image(systemName: "globe")
                    }
                }
            }
            .sheet(isPresented: $showLanguageSelector) {
                LanguageSelectorSheet(
                    sourceLanguage: $viewModel.sourceLanguage,
                    targetLanguage: $viewModel.targetLanguage
                )
            }
            .sheet(isPresented: $showVoiceSettings) {
                VoiceSettingsView()
            }
            .alert("Error", isPresented: $viewModel.showError) {
                Button("OK") {
                    viewModel.showError = false
                }
            } message: {
                Text(viewModel.errorMessage ?? "An error occurred")
            }
            .task {
                await viewModel.checkPermissions()
            }
        }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                Color(.systemBackground),
                Color.blue.opacity(0.05)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    // MARK: - Language Selector Bar

    private var languageSelectorBar: some View {
        HStack(spacing: 16) {
            // Source language
            languageBadge(
                language: viewModel.sourceLanguage,
                label: "You speak"
            )

            // Swap button
            Button {
                withAnimation(.spring(response: 0.3)) {
                    viewModel.swapLanguages()
                }
            } label: {
                Image(systemName: "arrow.left.arrow.right")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .frame(width: 44, height: 44)
                    .background(Color(.systemGray6))
                    .clipShape(Circle())
            }

            // Target language
            languageBadge(
                language: viewModel.targetLanguage,
                label: "They hear"
            )
        }
        .padding(.top)
    }

    private func languageBadge(language: VoiceTranslationLanguage, label: String) -> some View {
        VStack(spacing: 8) {
            Text(language.flagEmoji)
                .font(.system(size: 40))

            Text(language.nativeName)
                .font(.headline)

            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Transcription Card

    private var transcriptionCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Image(systemName: "text.bubble")
                    .foregroundStyle(.blue)
                Text("Transcription")
                    .font(.headline)
                Spacer()

                // Auto-translate toggle
                Toggle("", isOn: $viewModel.enableAutoTranslation)
                    .labelsHidden()
                    .scaleEffect(0.8)

                if !viewModel.currentTranscription.isEmpty || !viewModel.finalTranscription.isEmpty {
                    Button {
                        viewModel.clearTranscription()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Transcription and Translation
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    // Show transcription + translation pairs
                    ForEach(Array(zip(viewModel.transcriptionSegments.indices, viewModel.transcriptionSegments)), id: \.0) { index, segment in
                        VStack(alignment: .leading, spacing: 4) {
                            // Original text
                            HStack(alignment: .top, spacing: 8) {
                                Text(viewModel.sourceLanguage.flagEmoji)
                                    .font(.caption)
                                Text(segment.text)
                                    .foregroundStyle(.primary)
                            }

                            // Translation if available
                            if index < viewModel.translationSegments.count {
                                HStack(alignment: .top, spacing: 8) {
                                    Text(viewModel.targetLanguage.flagEmoji)
                                        .font(.caption)
                                    Text(viewModel.translationSegments[index].translatedText)
                                        .foregroundStyle(.blue)
                                        .fontWeight(.medium)
                                }
                            }
                        }
                        .padding(.vertical, 4)

                        if index < viewModel.transcriptionSegments.count - 1 {
                            Divider()
                        }
                    }

                    // Current partial transcription
                    if !viewModel.currentTranscription.isEmpty {
                        HStack(alignment: .top, spacing: 8) {
                            Text(viewModel.sourceLanguage.flagEmoji)
                                .font(.caption)
                            Text(viewModel.currentTranscription)
                                .foregroundStyle(.secondary)
                                .italic()
                        }
                    }

                    // Translation in progress
                    if viewModel.isTranslating {
                        HStack {
                            ProgressView()
                                .scaleEffect(0.7)
                            Text("Translating...")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    // Current translation result
                    if !viewModel.currentTranslation.isEmpty && !viewModel.isTranslating {
                        HStack(alignment: .top, spacing: 8) {
                            Text(viewModel.targetLanguage.flagEmoji)
                                .font(.caption)
                            Text(viewModel.currentTranslation)
                                .foregroundStyle(.green)
                                .fontWeight(.medium)
                        }
                    }

                    // Placeholder when empty
                    if viewModel.transcriptionSegments.isEmpty && viewModel.currentTranscription.isEmpty {
                        Text("Start speaking to see transcription and translation...")
                            .foregroundStyle(.tertiary)
                            .italic()
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 250)
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.1), radius: 10, y: 5)
    }

    // MARK: - Waveform View

    private var waveformView: some View {
        HStack(spacing: 4) {
            ForEach(0..<10, id: \.self) { index in
                RoundedRectangle(cornerRadius: 2)
                    .fill(
                        LinearGradient(
                            colors: [.blue, .purple],
                            startPoint: .bottom,
                            endPoint: .top
                        )
                    )
                    .frame(width: 8, height: CGFloat(viewModel.waveformBars[index]) * 60 + 10)
                    .animation(
                        .easeInOut(duration: 0.1),
                        value: viewModel.waveformBars[index]
                    )
            }
        }
        .frame(height: 70)
    }

    // MARK: - Main Control Button

    private var mainControlButton: some View {
        Button {
            Task {
                await viewModel.toggleListening()
            }
        } label: {
            ZStack {
                // Outer ring animation
                if viewModel.isListening {
                    Circle()
                        .stroke(Color.red.opacity(0.3), lineWidth: 4)
                        .frame(width: 100, height: 100)
                        .scaleEffect(viewModel.isListening ? 1.2 : 1.0)
                        .opacity(viewModel.isListening ? 0 : 1)
                        .animation(
                            .easeOut(duration: 1.0).repeatForever(autoreverses: false),
                            value: viewModel.isListening
                        )
                }

                // Main button
                Circle()
                    .fill(viewModel.isListening ? Color.red : Color.blue)
                    .frame(width: 80, height: 80)
                    .shadow(color: (viewModel.isListening ? Color.red : Color.blue).opacity(0.4), radius: 10)

                // Icon
                Image(systemName: viewModel.isListening ? "stop.fill" : "mic.fill")
                    .font(.system(size: 30))
                    .foregroundStyle(.white)
            }
        }
        .disabled(!viewModel.hasSpeechPermission || !viewModel.hasMicrophonePermission)
        .opacity((viewModel.hasSpeechPermission && viewModel.hasMicrophonePermission) ? 1 : 0.5)
    }

    // MARK: - Status Text

    private var statusText: some View {
        VStack(spacing: 4) {
            if !viewModel.hasSpeechPermission || !viewModel.hasMicrophonePermission {
                Label("Permissions required", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)

                Button("Grant Permissions") {
                    Task {
                        await viewModel.requestPermissions()
                    }
                }
                .font(.caption)
            } else if viewModel.isListening {
                Label("Listening...", systemImage: "waveform")
                    .foregroundStyle(.blue)
            } else if viewModel.isSpeaking {
                Label("Speaking...", systemImage: "speaker.wave.2.fill")
                    .foregroundStyle(.purple)
            } else if viewModel.isOnDeviceAvailable {
                Label("On-device • Private", systemImage: "lock.shield")
                    .foregroundStyle(.green)
            } else {
                Label("On-device not available for this language", systemImage: "exclamationmark.circle")
                    .foregroundStyle(.orange)
            }
        }
        .font(.caption)
        .padding(.bottom)
    }

    // MARK: - TTS Control Bar

    private var ttsControlBar: some View {
        HStack(spacing: 16) {
            // TTS Toggle
            Toggle(isOn: $viewModel.enableTTS) {
                Label("Auto-speak", systemImage: "speaker.wave.2")
                    .font(.subheadline)
            }
            .toggleStyle(.button)
            .buttonStyle(.bordered)
            .tint(viewModel.enableTTS ? .blue : .gray)

            // Replay button
            Button {
                Task {
                    await viewModel.replayLastTranslation()
                }
            } label: {
                Image(systemName: viewModel.isSpeaking ? "stop.fill" : "play.fill")
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .background(Color(.systemGray6))
                    .clipShape(Circle())
            }
            .disabled(viewModel.currentTranslation.isEmpty && !viewModel.isSpeaking)
            .opacity((viewModel.currentTranslation.isEmpty && !viewModel.isSpeaking) ? 0.5 : 1)

            // Personal Voice indicator
            if viewModel.usePersonalVoice {
                Image(systemName: "person.wave.2.fill")
                    .foregroundStyle(.green)
                    .font(.title3)
            }
        }
        .padding(.horizontal)
    }
}

// MARK: - Language Selector Sheet

struct LanguageSelectorSheet: View {
    @Binding var sourceLanguage: VoiceTranslationLanguage
    @Binding var targetLanguage: VoiceTranslationLanguage
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Your Language") {
                    ForEach(VoiceTranslationLanguage.allCases) { language in
                        languageRow(language: language, isSelected: sourceLanguage == language) {
                            sourceLanguage = language
                        }
                    }
                }

                Section("Target Language") {
                    ForEach(VoiceTranslationLanguage.allCases) { language in
                        languageRow(language: language, isSelected: targetLanguage == language) {
                            targetLanguage = language
                        }
                    }
                }
            }
            .navigationTitle("Languages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func languageRow(
        language: VoiceTranslationLanguage,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack {
                Text(language.flagEmoji)
                    .font(.title2)

                VStack(alignment: .leading) {
                    Text(language.nativeName)
                        .foregroundStyle(.primary)

                    if language.supportsOnDeviceRecognition {
                        Text("On-device available")
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.blue)
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    VoiceTranslationView()
}
