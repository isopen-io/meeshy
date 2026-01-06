//
//  CallTranslationOverlay.swift
//  Meeshy
//
//  Overlay UI for real-time call translation
//  Shows live captions and translation controls during calls
//

import SwiftUI

// MARK: - Call Translation Overlay

struct CallTranslationOverlay: View {
    @StateObject private var translationService = CallTranslationService.shared
    @State private var showSettings = false
    @State private var isExpanded = true

    var body: some View {
        VStack(spacing: 0) {
            // Header with controls
            headerView

            // Captions area (collapsible)
            if isExpanded && translationService.isTranslationActive {
                captionsView
                    .transition(.asymmetric(
                        insertion: .move(edge: .top).combined(with: .opacity),
                        removal: .move(edge: .top).combined(with: .opacity)
                    ))
            }
        }
        .animation(.spring(response: 0.3), value: isExpanded)
        .sheet(isPresented: $showSettings) {
            CallTranslationSettingsSheet(config: $translationService.config)
        }
    }

    // MARK: - Header View

    private var headerView: some View {
        HStack(spacing: 12) {
            // Translation toggle button
            Button {
                Task {
                    try? await translationService.toggleTranslation()
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: translationService.isTranslationActive ? "waveform" : "globe")
                        .font(.system(size: 16, weight: .medium))
                        .symbolEffect(.variableColor, isActive: translationService.isProcessing)

                    Text(translationService.isTranslationActive ? "Translating" : "Translate")
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundStyle(translationService.isTranslationActive ? .white : .primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    translationService.isTranslationActive
                        ? Color.green
                        : Color(.systemGray5)
                )
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)

            // Language pair indicator
            if translationService.isTranslationActive {
                HStack(spacing: 4) {
                    Text(translationService.config.sourceLanguage.flagEmoji)
                    Image(systemName: "arrow.right")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                    Text(translationService.config.targetLanguage.flagEmoji)
                }
                .font(.system(size: 16))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color(.systemGray6))
                .clipShape(Capsule())

                // Swap languages button
                Button {
                    translationService.swapLanguages()
                } label: {
                    Image(systemName: "arrow.left.arrow.right")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                        .frame(width: 32, height: 32)
                        .background(Color(.systemGray6))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }

            Spacer()

            // Expand/collapse button
            if translationService.isTranslationActive {
                Button {
                    isExpanded.toggle()
                } label: {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.secondary)
                        .frame(width: 32, height: 32)
                        .background(Color(.systemGray6))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }

            // Settings button
            Button {
                showSettings = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 32)
                    .background(Color(.systemGray6))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }

    // MARK: - Captions View

    private var captionsView: some View {
        VStack(spacing: 8) {
            // Current caption (large)
            if let caption = translationService.currentCaption {
                CurrentCaptionView(caption: caption)
            }

            // Recent captions (smaller, scrollable)
            if !translationService.recentCaptions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(translationService.recentCaptions.dropFirst().prefix(5)) { caption in
                            RecentCaptionChip(caption: caption)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }

            // Status indicators
            statusBar
        }
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }

    // MARK: - Status Bar

    private var statusBar: some View {
        HStack(spacing: 16) {
            // Processing indicator
            if translationService.isProcessing {
                HStack(spacing: 6) {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Processing...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // Speaking indicator
            if translationService.isSpeaking {
                HStack(spacing: 6) {
                    Image(systemName: "speaker.wave.2.fill")
                        .font(.caption)
                        .foregroundStyle(.blue)
                        .symbolEffect(.variableColor, isActive: true)
                    Text("Speaking")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            // Stats
            if translationService.totalTranslations > 0 {
                Text("\(translationService.totalTranslations) translations")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)

                Text("~\(Int(translationService.averageLatency * 1000))ms")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - Current Caption View

private struct CurrentCaptionView: View {
    let caption: CallTranslationService.TranslationCaption

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Direction indicator
            HStack(spacing: 6) {
                Image(systemName: caption.isFromMe ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                    .foregroundStyle(caption.isFromMe ? .green : .blue)
                    .font(.caption)
                Text(caption.isFromMe ? "You said:" : "They said:")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Original text
            HStack(alignment: .top, spacing: 8) {
                Text(caption.sourceLanguage.flagEmoji)
                    .font(.caption)
                Text(caption.originalText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            // Translated text (larger, emphasized)
            HStack(alignment: .top, spacing: 8) {
                Text(caption.targetLanguage.flagEmoji)
                    .font(.callout)
                Text(caption.translatedText)
                    .font(.headline)
                    .foregroundStyle(caption.isFromMe ? .green : .primary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(caption.isFromMe ? Color.green.opacity(0.1) : Color.blue.opacity(0.1))
        )
        .padding(.horizontal, 8)
    }
}

// MARK: - Recent Caption Chip

private struct RecentCaptionChip: View {
    let caption: CallTranslationService.TranslationCaption

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Direction indicator
            HStack(spacing: 4) {
                Image(systemName: caption.isFromMe ? "arrow.up" : "arrow.down")
                    .font(.system(size: 8))
                    .foregroundStyle(caption.isFromMe ? .green : .blue)
                Text(caption.translatedText)
                    .font(.caption)
                    .lineLimit(2)
                    .foregroundStyle(.primary)
            }

            Text(caption.timestamp.formatted(date: .omitted, time: .shortened))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(caption.isFromMe ? Color.green.opacity(0.1) : Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Call Translation Settings Sheet

struct CallTranslationSettingsSheet: View {
    @Binding var config: CallTranslationService.CallTranslationConfig
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                // Language Settings
                Section("Languages") {
                    // Source language
                    Picker("They speak", selection: $config.sourceLanguage) {
                        ForEach(VoiceTranslationLanguage.allCases) { language in
                            HStack {
                                Text(language.flagEmoji)
                                Text(language.nativeName)
                            }
                            .tag(language)
                        }
                    }

                    // Target language
                    Picker("I understand", selection: $config.targetLanguage) {
                        ForEach(VoiceTranslationLanguage.allCases) { language in
                            HStack {
                                Text(language.flagEmoji)
                                Text(language.nativeName)
                            }
                            .tag(language)
                        }
                    }

                    // Auto-detect
                    Toggle("Auto-detect language", isOn: $config.autoDetectLanguage)
                }

                // Translation Mode
                Section("Translation Mode") {
                    Picker("Mode", selection: $config.mode) {
                        Text("Incoming only").tag(CallTranslationService.TranslationMode.incoming)
                        Text("Outgoing only").tag(CallTranslationService.TranslationMode.outgoing)
                        Text("Both (Duplex)").tag(CallTranslationService.TranslationMode.duplex)
                    }
                    .pickerStyle(.segmented)
                }

                // TTS Settings
                Section("Voice Output") {
                    Toggle("Speak translations", isOn: $config.enableTTS)

                    if config.enableTTS {
                        Toggle("Use Personal Voice", isOn: $config.usePersonalVoice)

                        VStack(alignment: .leading) {
                            Text("Speed: \(speedLabel)")
                            Slider(
                                value: $config.speechRate,
                                in: 0.3...0.7
                            )
                        }

                        VStack(alignment: .leading) {
                            Text("Volume: \(Int(config.ttsVolume * 100))%")
                            Slider(value: $config.ttsVolume, in: 0.3...1.0)
                        }
                    }
                }

                // Captions
                Section("Captions") {
                    Toggle("Show live captions", isOn: $config.showCaptions)
                }
            }
            .navigationTitle("Translation Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var speedLabel: String {
        if config.speechRate < 0.4 { return "Slow" }
        if config.speechRate > 0.6 { return "Fast" }
        return "Normal"
    }
}

// MARK: - Call Translation Button

/// Compact button to add to call controls
struct CallTranslationButton: View {
    @StateObject private var translationService = CallTranslationService.shared
    @State private var showLanguageSelector = false

    var body: some View {
        Button {
            if translationService.isTranslationActive {
                Task {
                    await translationService.stopTranslation()
                }
            } else {
                showLanguageSelector = true
            }
        } label: {
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .fill(translationService.isTranslationActive ? Color.green : Color.white.opacity(0.2))
                        .frame(width: 56, height: 56)

                    Image(systemName: "globe")
                        .font(.system(size: 22))
                        .foregroundStyle(translationService.isTranslationActive ? .white : .white)
                }

                Text(translationService.isTranslationActive ? "Stop" : "Translate")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.8))
            }
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showLanguageSelector) {
            QuickLanguageSelector { source, target in
                Task {
                    try? await translationService.quickStart(from: source, to: target)
                }
            }
        }
    }
}

// MARK: - Quick Language Selector

struct QuickLanguageSelector: View {
    let onSelect: (VoiceTranslationLanguage, VoiceTranslationLanguage) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var sourceLanguage: VoiceTranslationLanguage = .english
    @State private var targetLanguage: VoiceTranslationLanguage = .french

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                // Language pair selector
                HStack(spacing: 20) {
                    // Source
                    VStack(spacing: 8) {
                        Text("They speak")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Menu {
                            ForEach(VoiceTranslationLanguage.allCases) { lang in
                                Button {
                                    sourceLanguage = lang
                                } label: {
                                    HStack {
                                        Text(lang.flagEmoji)
                                        Text(lang.nativeName)
                                    }
                                }
                            }
                        } label: {
                            VStack {
                                Text(sourceLanguage.flagEmoji)
                                    .font(.system(size: 40))
                                Text(sourceLanguage.nativeName)
                                    .font(.headline)
                            }
                            .frame(width: 100)
                            .padding()
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                        .buttonStyle(.plain)
                    }

                    // Arrow
                    Image(systemName: "arrow.right")
                        .font(.title2)
                        .foregroundStyle(.secondary)

                    // Target
                    VStack(spacing: 8) {
                        Text("I understand")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Menu {
                            ForEach(VoiceTranslationLanguage.allCases) { lang in
                                Button {
                                    targetLanguage = lang
                                } label: {
                                    HStack {
                                        Text(lang.flagEmoji)
                                        Text(lang.nativeName)
                                    }
                                }
                            }
                        } label: {
                            VStack {
                                Text(targetLanguage.flagEmoji)
                                    .font(.system(size: 40))
                                Text(targetLanguage.nativeName)
                                    .font(.headline)
                            }
                            .frame(width: 100)
                            .padding()
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                        .buttonStyle(.plain)
                    }
                }

                // Start button
                Button {
                    onSelect(sourceLanguage, targetLanguage)
                    dismiss()
                } label: {
                    Text("Start Translation")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.green)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .padding(.horizontal)
            }
            .padding()
            .navigationTitle("Start Translation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.height(350)])
    }
}

// MARK: - Preview

#Preview("Translation Overlay") {
    VStack {
        Spacer()
        CallTranslationOverlay()
    }
    .background(Color.black)
}

#Preview("Translation Button") {
    ZStack {
        Color.black.opacity(0.8)
        CallTranslationButton()
    }
}
