//
//  TranslationPreviewSheet.swift
//  Meeshy
//
//  Sheet view for previewing audio translations in different languages
//  Shows how the message will sound to recipients speaking other languages
//
//  iOS 17+
//

import SwiftUI

// MARK: - Translation Preview Sheet

struct TranslationPreviewSheet: View {
    @ObservedObject var previewService: TranslationPreviewService
    let audioURL: URL
    let onDismiss: () -> Void

    @State private var selectedLanguage: VoiceTranslationLanguage = .english
    @State private var showLanguagePicker = false

    // Popular languages for quick access
    private let quickLanguages: [VoiceTranslationLanguage] = [
        .english, .french, .spanish, .german, .chinese, .arabic
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemBackground).ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Header with explanation
                        headerSection

                        // Quick language selector
                        quickLanguageSelector

                        // All languages button
                        allLanguagesButton

                        Divider()
                            .padding(.horizontal)

                        // Current preview state
                        previewStateSection

                        // Transcription and translation display
                        // Afficher le texte traduit dès qu'il est disponible
                        if let textTranslation = previewService.currentTextTranslation {
                            translationDisplayFromText(textTranslation)
                        } else if let preview = previewService.currentPreview {
                            translationDisplay(preview)
                        }

                        // Playback controls (affiché si audio disponible)
                        if previewService.state.hasAudio {
                            playbackControls
                        } else if previewService.state == .textOnlyReady {
                            textOnlyIndicator
                        }

                        // Cached previews
                        if !previewService.cachedPreviews.isEmpty {
                            cachedPreviewsSection
                        }

                        Spacer(minLength: 40)
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Prévisualiser les traductions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") {
                        previewService.stopPlayback()
                        onDismiss()
                    }
                }
            }
            .sheet(isPresented: $showLanguagePicker) {
                TranslationLanguagePickerSheet(
                    selectedLanguage: $selectedLanguage,
                    onSelect: { language in
                        selectedLanguage = language
                        showLanguagePicker = false
                        generatePreview(for: language)
                    }
                )
            }
        }
        .onDisappear {
            previewService.stopPlayback()
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: 12) {
            Image(systemName: "globe.europe.africa.fill")
                .font(.system(size: 44))
                .foregroundStyle(
                    LinearGradient(
                        colors: [.blue, .purple],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Text("Comment votre message sonnera")
                .font(.headline)

            Text("Écoutez votre message traduit dans différentes langues avec votre voix clonée")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Quick Language Selector

    private var quickLanguageSelector: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Langues populaires")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.secondary)

            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 12) {
                ForEach(quickLanguages, id: \.rawValue) { language in
                    languageButton(language)
                }
            }
        }
    }

    private func languageButton(_ language: VoiceTranslationLanguage) -> some View {
        let isSelected = selectedLanguage == language
        let hasCache = previewService.cachedPreviews[language] != nil
        let isProcessing = previewService.state.isProcessing && selectedLanguage == language

        return Button {
            selectedLanguage = language
            generatePreview(for: language)
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    Text(language.flagEmoji)
                        .font(.system(size: 28))

                    if isProcessing {
                        ProgressView()
                            .scaleEffect(0.8)
                    }
                }

                Text(language.nativeName)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)

                if hasCache {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.green)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color.blue.opacity(0.15) : Color(.systemGray6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.blue : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
        .disabled(isProcessing)
    }

    // MARK: - All Languages Button

    private var allLanguagesButton: some View {
        Button {
            showLanguagePicker = true
        } label: {
            HStack {
                Image(systemName: "globe")
                Text("Toutes les langues")
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Preview State Section

    private var previewStateSection: some View {
        Group {
            switch previewService.state {
            case .idle:
                idleState
            case .extractingVoice(let progress):
                processingState(
                    icon: "waveform.and.person.filled",
                    title: "Extraction de la voix...",
                    progress: progress
                )
            case .transcribing(let progress):
                processingState(
                    icon: "text.bubble",
                    title: "Transcription...",
                    progress: progress
                )
            case .translating(let progress):
                processingState(
                    icon: "character.book.closed",
                    title: "Traduction vers \(selectedLanguage.nativeName)...",
                    progress: progress
                )
            case .textReady:
                textReadyState
            case .synthesizing(let progress):
                processingState(
                    icon: "speaker.wave.3",
                    title: "Synthèse vocale...",
                    progress: progress
                )
            case .ready, .readyWithFallback, .textOnlyReady:
                EmptyView()
            case .error(let message):
                errorState(message)
            }
        }
    }

    private var textReadyState: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 24))
                .foregroundColor(.green)

            VStack(alignment: .leading, spacing: 2) {
                Text("Traduction prête")
                    .font(.subheadline.weight(.medium))

                Text("Génération de l'audio en cours...")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            ProgressView()
                .scaleEffect(0.8)
        }
        .padding()
        .background(Color.green.opacity(0.1))
        .cornerRadius(12)
    }

    private var idleState: some View {
        VStack(spacing: 16) {
            Text("Sélectionnez une langue pour commencer")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    private func processingState(icon: String, title: String, progress: Double) -> some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .stroke(Color.blue.opacity(0.2), lineWidth: 4)
                    .frame(width: 60, height: 60)

                Circle()
                    .trim(from: 0, to: previewService.state.progress)
                    .stroke(Color.blue, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .frame(width: 60, height: 60)
                    .rotationEffect(.degrees(-90))

                Image(systemName: icon)
                    .font(.system(size: 24))
                    .foregroundColor(.blue)
            }

            Text(title)
                .font(.subheadline.weight(.medium))

            ProgressView(value: progress)
                .tint(.blue)
                .frame(maxWidth: 200)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundColor(.orange)

            Text(message)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button("Réessayer") {
                generatePreview(for: selectedLanguage)
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    // MARK: - Translation Display

    /// Affichage du texte traduit (avant que l'audio soit prêt)
    private func translationDisplayFromText(_ translation: TranslationPreviewService.TextTranslation) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            // Original text
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Texte original")
                        .font(.caption.weight(.medium))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text(translation.sourceLanguage.flagEmoji)
                    Text(translation.sourceLanguage.nativeName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Text(translation.originalText)
                    .font(.body)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.systemGray6))
                    .cornerRadius(10)
            }

            // Arrow
            HStack {
                Spacer()
                Image(systemName: "arrow.down")
                    .font(.title3)
                    .foregroundColor(.green)
                Spacer()
            }

            // Translated text
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Traduction")
                        .font(.caption.weight(.medium))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text(translation.targetLanguage.flagEmoji)
                    Text(translation.targetLanguage.nativeName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Text(translation.translatedText)
                    .font(.body)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.green.opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color.green.opacity(0.3), lineWidth: 1)
                    )
                    .cornerRadius(10)

                // Bouton copier
                HStack {
                    Spacer()
                    Button {
                        UIPasteboard.general.string = translation.translatedText
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "doc.on.doc")
                            Text("Copier")
                        }
                        .font(.caption)
                        .foregroundColor(.green)
                    }
                }
            }
        }
    }

    /// Indicateur quand seul le texte est disponible (pas d'audio)
    private var textOnlyIndicator: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "text.bubble.fill")
                    .foregroundColor(.orange)
                Text("Traduction textuelle uniquement")
                    .font(.subheadline.weight(.medium))
            }

            Text("La synthèse vocale n'est pas disponible pour cette langue")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color.orange.opacity(0.1))
        .cornerRadius(12)
    }

    private func translationDisplay(_ preview: TranslationPreviewService.TranslationPreview) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            // Original text
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Texte original")
                        .font(.caption.weight(.medium))
                        .foregroundColor(.secondary)
                    Spacer()
                    if let srcLang = detectSourceLanguage() {
                        Text(srcLang.flagEmoji)
                    }
                }

                Text(preview.originalText)
                    .font(.body)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.systemGray6))
                    .cornerRadius(10)
            }

            // Arrow
            HStack {
                Spacer()
                Image(systemName: "arrow.down")
                    .font(.title3)
                    .foregroundColor(.blue)
                Spacer()
            }

            // Translated text
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Traduction")
                        .font(.caption.weight(.medium))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text(preview.targetLanguage.flagEmoji)
                    Text(preview.targetLanguage.nativeName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Text(preview.translatedText)
                    .font(.body)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.blue.opacity(0.1))
                    .cornerRadius(10)
            }
        }
    }

    private func detectSourceLanguage() -> VoiceTranslationLanguage? {
        // Try to detect from device locale
        let languageCode = Locale.current.language.languageCode?.identifier ?? "en"
        return VoiceTranslationLanguage(rawValue: languageCode)
    }

    // MARK: - Playback Controls

    private var playbackControls: some View {
        VStack(spacing: 16) {
            // Play button
            Button {
                previewService.togglePlayback()
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: previewService.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 44))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(previewService.isPlaying ? "En lecture..." : "Écouter la traduction")
                            .font(.headline)

                        if let preview = previewService.currentPreview {
                            Text(formatDuration(preview.duration))
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    Spacer()
                }
                .foregroundColor(.blue)
                .padding()
                .background(Color.blue.opacity(0.1))
                .cornerRadius(16)
            }
            .buttonStyle(.plain)

            // Voice type indicator
            if let preview = previewService.currentPreview {
                HStack(spacing: 8) {
                    if preview.usedVoiceCloning {
                        Image(systemName: "person.wave.2.fill")
                            .foregroundColor(.purple)
                        Text("Voix clonée à partir de votre audio")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    } else {
                        Image(systemName: "speaker.wave.3.fill")
                            .foregroundColor(.blue)
                        Text("Voix standard (synthèse Apple)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
    }

    // MARK: - Cached Previews Section

    private var cachedPreviewsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Traductions générées")
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.secondary)

                Spacer()

                Button {
                    previewService.clearCache()
                } label: {
                    Text("Effacer")
                        .font(.caption)
                        .foregroundColor(.red)
                }
            }

            ForEach(Array(previewService.cachedPreviews.values), id: \.id) { preview in
                cachedPreviewRow(preview)
            }
        }
    }

    private func cachedPreviewRow(_ preview: TranslationPreviewService.TranslationPreview) -> some View {
        Button {
            previewService.playPreview(preview)
        } label: {
            HStack(spacing: 12) {
                Text(preview.targetLanguage.flagEmoji)
                    .font(.title2)

                VStack(alignment: .leading, spacing: 2) {
                    Text(preview.targetLanguage.nativeName)
                        .font(.subheadline.weight(.medium))

                    Text(preview.translatedText.prefix(50) + "...")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Image(systemName: "play.circle")
                    .font(.title2)
                    .foregroundColor(.blue)
            }
            .padding(12)
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

    private func generatePreview(for language: VoiceTranslationLanguage) {
        Task {
            await previewService.generatePreview(
                audioURL: audioURL,
                targetLanguage: language
            )
        }
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let seconds = Int(duration)
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60

        if minutes > 0 {
            return "\(minutes):\(String(format: "%02d", remainingSeconds))"
        } else {
            return "0:\(String(format: "%02d", remainingSeconds))"
        }
    }
}

// MARK: - Translation Language Picker Sheet

struct TranslationLanguagePickerSheet: View {
    @Binding var selectedLanguage: VoiceTranslationLanguage
    let onSelect: (VoiceTranslationLanguage) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(VoiceTranslationLanguage.allCases, id: \.rawValue) { language in
                    Button {
                        onSelect(language)
                    } label: {
                        HStack {
                            Text(language.flagEmoji)
                                .font(.title2)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(language.nativeName)
                                    .font(.body)
                                    .foregroundColor(.primary)

                                Text(language.localeIdentifier)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }

                            Spacer()

                            if language == selectedLanguage {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.blue)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Choisir une langue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Preview

#Preview("Translation Preview Sheet") {
    TranslationPreviewSheet(
        previewService: TranslationPreviewService(),
        audioURL: URL(fileURLWithPath: "/tmp/sample.m4a"),
        onDismiss: {}
    )
}
