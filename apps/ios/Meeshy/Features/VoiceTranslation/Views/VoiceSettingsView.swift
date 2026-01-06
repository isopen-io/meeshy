//
//  VoiceSettingsView.swift
//  Meeshy
//
//  Voice selection and TTS settings UI
//

import SwiftUI
import AVFoundation

// MARK: - Voice Settings View

struct VoiceSettingsView: View {
    @StateObject private var profileManager = VoiceProfileManager.shared
    @State private var selectedLanguage: VoiceTranslationLanguage = .english
    @State private var isPreviewPlaying = false
    @State private var showPersonalVoiceInfo = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                // Personal Voice Section
                personalVoiceSection

                // Language Selection
                languageSection

                // Voice Selection for Language
                voiceSelectionSection

                // Speech Settings
                speechSettingsSection

                // Statistics
                statisticsSection
            }
            .navigationTitle("Voice Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        profileManager.savePreferences()
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showPersonalVoiceInfo) {
                PersonalVoiceInfoSheet()
            }
            .task {
                await profileManager.refreshVoices()
            }
        }
    }

    // MARK: - Personal Voice Section

    private var personalVoiceSection: some View {
        Section {
            if profileManager.hasPersonalVoice && profileManager.personalVoiceAuthorized {
                // Personal Voice available and authorized
                HStack {
                    Image(systemName: "person.wave.2.fill")
                        .foregroundStyle(.green)
                        .font(.title2)

                    VStack(alignment: .leading) {
                        Text("Personal Voice")
                            .font(.headline)
                        Text("Your voice is available for translations")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            } else if profileManager.personalVoiceAuthorized && !profileManager.hasPersonalVoice {
                // Authorized but no Personal Voice created
                HStack {
                    Image(systemName: "person.wave.2")
                        .foregroundStyle(.orange)
                        .font(.title2)

                    VStack(alignment: .leading) {
                        Text("Personal Voice")
                            .font(.headline)
                        Text("Create your Personal Voice in Settings")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Button("Setup") {
                        profileManager.openPersonalVoiceSettings()
                    }
                    .buttonStyle(.bordered)
                }
            } else {
                // Not authorized
                HStack {
                    Image(systemName: "person.wave.2")
                        .foregroundStyle(.secondary)
                        .font(.title2)

                    VStack(alignment: .leading) {
                        Text("Personal Voice")
                            .font(.headline)
                        Text("Use your own voice for translations")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Button("Enable") {
                        Task {
                            await profileManager.requestPersonalVoiceAuthorization()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }

            Button {
                showPersonalVoiceInfo = true
            } label: {
                Label("Learn about Personal Voice", systemImage: "info.circle")
                    .font(.subheadline)
            }
        } header: {
            Text("Personal Voice")
        } footer: {
            Text("Personal Voice lets translated text be spoken in your own voice. Requires iOS 17+.")
        }
    }

    // MARK: - Language Section

    private var languageSection: some View {
        Section("Select Language") {
            Picker("Language", selection: $selectedLanguage) {
                ForEach(VoiceTranslationLanguage.allCases) { language in
                    HStack {
                        Text(language.flagEmoji)
                        Text(language.nativeName)
                    }
                    .tag(language)
                }
            }
            .pickerStyle(.menu)
        }
    }

    // MARK: - Voice Selection Section

    private var voiceSelectionSection: some View {
        Section("Available Voices") {
            let voices = profileManager.getVoices(for: selectedLanguage)
            let selectedVoice = profileManager.getSelectedVoice(for: selectedLanguage)

            if voices.isEmpty {
                Text("No voices available for this language")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(voices) { voice in
                    VoiceRow(
                        voice: voice,
                        isSelected: selectedVoice?.id == voice.id,
                        isPlaying: isPreviewPlaying,
                        onSelect: {
                            profileManager.selectVoice(voice, for: selectedLanguage)
                        },
                        onPreview: {
                            Task {
                                isPreviewPlaying = true
                                await profileManager.previewVoice(voice)
                                isPreviewPlaying = false
                            }
                        }
                    )
                }
            }
        }
    }

    // MARK: - Speech Settings Section

    private var speechSettingsSection: some View {
        Section("Speech Settings") {
            // Speech Rate
            VStack(alignment: .leading) {
                HStack {
                    Text("Speed")
                    Spacer()
                    Text(speedLabel)
                        .foregroundStyle(.secondary)
                }

                Slider(
                    value: $profileManager.speechRate,
                    in: AVSpeechUtteranceMinimumSpeechRate...AVSpeechUtteranceMaximumSpeechRate
                )
            }

            // Pitch
            VStack(alignment: .leading) {
                HStack {
                    Text("Pitch")
                    Spacer()
                    Text(pitchLabel)
                        .foregroundStyle(.secondary)
                }

                Slider(
                    value: $profileManager.speechPitch,
                    in: 0.5...2.0
                )
            }

            // Preferred Quality
            Picker("Preferred Quality", selection: $profileManager.preferredQuality) {
                ForEach(SpeechSynthesisService.VoiceQuality.allCases, id: \.self) { quality in
                    Text(quality.displayName).tag(quality)
                }
            }

            // Reset button
            Button("Reset to Defaults") {
                profileManager.resetToDefaults()
            }
            .foregroundStyle(.red)
        }
    }

    private var speedLabel: String {
        let ratio = profileManager.speechRate / AVSpeechUtteranceDefaultSpeechRate
        if ratio < 0.8 { return "Slow" }
        if ratio > 1.2 { return "Fast" }
        return "Normal"
    }

    private var pitchLabel: String {
        if profileManager.speechPitch < 0.9 { return "Low" }
        if profileManager.speechPitch > 1.1 { return "High" }
        return "Normal"
    }

    // MARK: - Statistics Section

    private var statisticsSection: some View {
        Section("Voice Statistics") {
            let stats = profileManager.statistics

            LabeledContent("Total Voices", value: "\(stats.totalVoices)")
            LabeledContent("Premium Voices", value: "\(stats.premiumVoices)")
            LabeledContent("Enhanced Voices", value: "\(stats.enhancedVoices)")
            LabeledContent("Languages Covered", value: "\(stats.languagesCovered)")

            if stats.personalVoices > 0 {
                LabeledContent("Personal Voices", value: "\(stats.personalVoices)")
            }
        }
    }
}

// MARK: - Voice Row

struct VoiceRow: View {
    let voice: SpeechSynthesisService.VoiceInfo
    let isSelected: Bool
    let isPlaying: Bool
    let onSelect: () -> Void
    let onPreview: () -> Void

    var body: some View {
        HStack {
            // Selection indicator
            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(isSelected ? .blue : .secondary)
                .onTapGesture(perform: onSelect)

            // Voice info
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(voice.displayName)
                        .font(.body)

                    if voice.isPersonalVoice {
                        Image(systemName: "person.wave.2.fill")
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                }

                HStack(spacing: 8) {
                    // Quality badge
                    Text(voice.quality.displayName)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(qualityColor.opacity(0.2))
                        .foregroundStyle(qualityColor)
                        .clipShape(Capsule())

                    // Gender if known
                    if let gender = voice.gender {
                        Text(gender.rawValue.capitalized)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            // Preview button
            Button {
                onPreview()
            } label: {
                Image(systemName: isPlaying ? "stop.circle.fill" : "play.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.blue)
            }
            .buttonStyle(.plain)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onSelect)
    }

    private var qualityColor: Color {
        switch voice.quality {
        case .premium, .personalVoice: return .orange
        case .enhanced: return .blue
        case .standard: return .gray
        }
    }
}

// MARK: - Personal Voice Info Sheet

struct PersonalVoiceInfoSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Hero image
                    Image(systemName: "person.wave.2.fill")
                        .font(.system(size: 80))
                        .foregroundStyle(.blue)
                        .frame(maxWidth: .infinity)
                        .padding(.top)

                    // Title
                    Text("What is Personal Voice?")
                        .font(.title2)
                        .fontWeight(.bold)

                    // Description
                    Text("Personal Voice is an iOS 17+ feature that lets you create a synthetic voice that sounds like you. When enabled in Meeshy, your translated messages will be spoken in your own voice.")
                        .foregroundStyle(.secondary)

                    // Benefits
                    VStack(alignment: .leading, spacing: 16) {
                        benefitRow(
                            icon: "waveform",
                            title: "Your Unique Voice",
                            description: "Translations are spoken in a voice that sounds like you"
                        )

                        benefitRow(
                            icon: "lock.shield",
                            title: "Private & Secure",
                            description: "Your voice data stays on your device"
                        )

                        benefitRow(
                            icon: "globe",
                            title: "Works Across Languages",
                            description: "Your voice speaking any supported language"
                        )
                    }

                    // Setup instructions
                    VStack(alignment: .leading, spacing: 12) {
                        Text("How to Set Up")
                            .font(.headline)

                        setupStep(1, "Go to Settings > Accessibility > Personal Voice")
                        setupStep(2, "Tap 'Create a Personal Voice'")
                        setupStep(3, "Follow the prompts to record your voice")
                        setupStep(4, "Return to Meeshy and enable Personal Voice")
                    }

                    // Note
                    Text("Note: Creating a Personal Voice takes about 15 minutes and requires reading phrases aloud in a quiet environment.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .padding()
            }
            .navigationTitle("Personal Voice")
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

    private func benefitRow(icon: String, title: String, description: String) -> some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(.blue)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func setupStep(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(.white)
                .frame(width: 24, height: 24)
                .background(Circle().fill(.blue))

            Text(text)
                .font(.subheadline)
        }
    }
}

// MARK: - Quick Voice Picker

/// Compact voice picker for inline use
struct QuickVoicePicker: View {
    let language: VoiceTranslationLanguage
    @Binding var selectedVoice: SpeechSynthesisService.VoiceInfo?
    @StateObject private var profileManager = VoiceProfileManager.shared

    var body: some View {
        Menu {
            ForEach(profileManager.getVoices(for: language)) { voice in
                Button {
                    selectedVoice = voice
                    profileManager.selectVoice(voice, for: language)
                } label: {
                    HStack {
                        Text(voice.displayName)
                        if voice.isPersonalVoice {
                            Image(systemName: "person.wave.2.fill")
                        }
                        if selectedVoice?.id == voice.id {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack {
                Image(systemName: "speaker.wave.2")
                Text(selectedVoice?.name ?? "Select Voice")
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.caption)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.systemGray5))
            .clipShape(Capsule())
        }
        .onAppear {
            selectedVoice = profileManager.getSelectedVoice(for: language)
        }
    }
}

// MARK: - Preview

#Preview("Voice Settings") {
    VoiceSettingsView()
}

#Preview("Personal Voice Info") {
    PersonalVoiceInfoSheet()
}
