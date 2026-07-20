import SwiftUI
import MeeshySDK
import MeeshyUI

/// Onglet « Transcription » d'un message — transcription Whisper + traductions
/// audio (TTS). État de transcription 100 % encapsulé, extrait de l'ancien
/// `MessageDetailSheet.transcriptionTabContent`. Aucun changement de comportement.
struct MessageTranscriptionDetailView: View {
    let message: Message
    let contactColor: String
    let conversationId: String
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var onSelectAudioLanguage: ((String?) -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    @State private var isRequestingTranscription = false
    @State private var translatingAudioLanguages: Set<String> = []
    @State private var mergedTranslatedAudios: [MessageTranslatedAudio] = []

    private static let supportedLanguages: [(code: String, flag: String, name: String)] = [
        ("fr", "\u{1F1EB}\u{1F1F7}", "Fran\u{00e7}ais"),
        ("en", "\u{1F1EC}\u{1F1E7}", "English"),
        ("es", "\u{1F1EA}\u{1F1F8}", "Espa\u{00f1}ol"),
        ("de", "\u{1F1E9}\u{1F1EA}", "Deutsch"),
        ("ar", "\u{1F1F8}\u{1F1E6}", "\u{0627}\u{0644}\u{0639}\u{0631}\u{0628}\u{064A}\u{0629}"),
        ("zh", "\u{1F1E8}\u{1F1F3}", "\u{4E2D}\u{6587}"),
        ("pt", "\u{1F1F5}\u{1F1F9}", "Portugu\u{00EA}s"),
        ("it", "\u{1F1EE}\u{1F1F9}", "Italiano"),
        ("ja", "\u{1F1EF}\u{1F1F5}", "\u{65E5}\u{672C}\u{8A9E}"),
        ("ko", "\u{1F1F0}\u{1F1F7}", "\u{D55C}\u{AD6D}\u{C5B4}"),
        ("ru", "\u{1F1F7}\u{1F1FA}", "\u{0420}\u{0443}\u{0441}\u{0441}\u{043A}\u{0438}\u{0439}"),
        ("hi", "\u{1F1EE}\u{1F1F3}", "\u{0939}\u{093F}\u{0928}\u{094D}\u{0926}\u{0940}"),
        ("tr", "\u{1F1F9}\u{1F1F7}", "T\u{00FC}rk\u{00e7}e"),
        ("nl", "\u{1F1F3}\u{1F1F1}", "Nederlands"),
        ("pl", "\u{1F1F5}\u{1F1F1}", "Polski"),
        ("vi", "\u{1F1FB}\u{1F1F3}", "Ti\u{1EBF}ng Vi\u{1EC7}t"),
        ("th", "\u{1F1F9}\u{1F1ED}", "\u{0E44}\u{0E17}\u{0E22}"),
        ("sv", "\u{1F1F8}\u{1F1EA}", "Svenska")
    ]

    var body: some View {
        content
            .onAppear {
                if mergedTranslatedAudios.isEmpty { mergedTranslatedAudios = translatedAudios }
            }
            .onReceive(
                MessageSocketManager.shared.transcriptionFailed
                    .filter { $0.messageId == message.id }
                    .receive(on: DispatchQueue.main)
            ) { _ in
                isRequestingTranscription = false
                translatingAudioLanguages = []
            }
            .onReceive(
                MessageSocketManager.shared.audioTranslationFailed
                    .filter { $0.messageId == message.id }
                    .receive(on: DispatchQueue.main)
            ) { _ in
                translatingAudioLanguages = []
            }
    }

    @ViewBuilder
    private var content: some View {
        let accent = Color(hex: contactColor)
        let mediaAttachments = message.attachments.filter {
            AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack
        }

        VStack(alignment: .leading, spacing: 14) {
            if let transcription {
                transcriptionAvailableContent(transcription, accent: accent)
            } else {
                transcriptionEmptyContent(mediaAttachments: mediaAttachments, accent: accent)
            }

            if !mergedTranslatedAudios.isEmpty {
                translatedAudioTranscriptions(accent: accent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func transcriptionAvailableContent(_ transcription: MessageTranscription, accent: Color) -> some View {
        let langColor = Color(hex: LanguageDisplay.colorHex(for: transcription.language))
        let segments = TranscriptionDisplaySegment.buildFrom(transcription)

        return VStack(alignment: .leading, spacing: 12) {
            // Language + confidence banner
            HStack(spacing: 8) {
                Image(systemName: "waveform.and.mic")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(langColor)
                    .accessibilityHidden(true)

                Text(Self.languageName(for: transcription.language))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(theme.textPrimary)

                Spacer()

                if let conf = transcription.confidence {
                    Text(String(format: "%.0f%%", conf * 100))
                        .font(.system(.caption2, design: .monospaced).weight(.bold))
                        .foregroundColor(langColor)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(langColor.opacity(0.12)))
                }

                if let durationMs = transcription.durationMs {
                    Text(formatDuration(durationMs / 1000))
                        .font(.system(.caption2, design: .monospaced).weight(.medium))
                        .foregroundColor(theme.textMuted)
                }
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(langColor.opacity(isDark ? 0.08 : 0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(langColor.opacity(0.15), lineWidth: 0.5)
                    )
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(transcriptionBannerA11yLabel(transcription))

            // Full text
            Text(transcription.text)
                .font(.subheadline)
                .foregroundColor(theme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)

            // Word-by-word segments
            if !segments.isEmpty {
                Rectangle()
                    .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                    .frame(height: 0.5)

                FlowLayout(spacing: 0) {
                    ForEach(segments) { segment in
                        Text(segment.text + " ")
                            .font(.footnote.weight(.regular))
                            .foregroundColor(theme.textSecondary)
                            .padding(.horizontal, 2)
                            .padding(.vertical, 1)
                            .background(
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color(hex: segment.speakerColor).opacity(
                                        transcription.speakerCount ?? 1 > 1 ? 0.1 : 0
                                    ))
                            )
                    }
                }
                .padding(8)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.015))
                )
                // Redondant avec le texte plein ci-dessus (mêmes mots) — la
                // coloration locuteur est purement visuelle. Masqué à VoiceOver
                // pour éviter une 2e lecture mot-à-mot du même contenu.
                .accessibilityHidden(true)

                if let speakerCount = transcription.speakerCount, speakerCount > 1 {
                    HStack(spacing: 6) {
                        Image(systemName: "person.2.fill")
                            .font(.caption2.weight(.medium))
                            .foregroundColor(accent.opacity(0.6))
                            .accessibilityHidden(true)
                        Text(String(format: String(localized: "message-detail.transcription.speakers", defaultValue: "%d locuteurs detectes", bundle: .main), speakerCount))
                            .font(.caption.weight(.medium))
                            .foregroundColor(theme.textMuted)
                    }
                    .padding(.horizontal, 4)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func transcriptionEmptyContent(mediaAttachments: [MessageAttachment], accent: Color) -> some View {
        VStack(spacing: 14) {
            // Attachment cards
            ForEach(mediaAttachments) { attachment in
                HStack(spacing: 10) {
                    Image(systemName: AttachmentKind(mimeType: attachment.mimeType).sfSymbolName)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(accent)
                        .frame(width: 20)
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(attachment.originalName.isEmpty ? attachment.fileName : attachment.originalName)
                            .font(.footnote.weight(.medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)

                        if let duration = attachment.duration {
                            Text(formatDuration(duration / 1000))
                                .font(.caption2)
                                .foregroundColor(theme.textMuted)
                        }
                    }

                    Spacer()
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.03))
                )
                .accessibilityElement(children: .combine)
            }

            // Empty state with transcribe button
            VStack(spacing: 12) {
                Image(systemName: "text.word.spacing")
                    .font(.system(size: 28, weight: .light))
                    .foregroundColor(theme.textMuted.opacity(0.4))
                    .accessibilityHidden(true)

                Text(String(localized: "message-detail.transcription.empty", defaultValue: "Aucune transcription", bundle: .main))
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(theme.textMuted)

                if let firstMedia = mediaAttachments.first {
                    Button {
                        requestTranscription(for: firstMedia.id)
                    } label: {
                        HStack(spacing: 6) {
                            if isRequestingTranscription {
                                ProgressView()
                                    .tint(accent)
                                    .scaleEffect(0.7)
                            } else {
                                Image(systemName: "waveform.and.mic")
                                    .font(.footnote.weight(.semibold))
                            }
                            Text(String(localized: "message-detail.transcription.transcribe", defaultValue: "Transcrire", bundle: .main))
                                .font(.footnote.weight(.bold))
                        }
                        .foregroundColor(accent)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(accent.opacity(0.15)))
                        .overlay(Capsule().stroke(accent.opacity(0.3), lineWidth: 0.5))
                    }
                    .disabled(isRequestingTranscription)
                    .accessibilityLabel(String(localized: "message-detail.transcription.transcribe", defaultValue: "Transcrire", bundle: .main))
                    .accessibilityValue(isRequestingTranscription
                        ? String(localized: "a11y.transcription.in-progress", defaultValue: "Transcription en cours", bundle: .main)
                        : "")
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
        }
    }

    private func translatedAudioTranscriptions(accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Rectangle()
                .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                .frame(height: 0.5)

            HStack(spacing: 6) {
                Image(systemName: "translate")
                    .font(.caption2.weight(.medium))
                    .foregroundColor(accent.opacity(0.6))
                    .accessibilityHidden(true)
                Text(String(localized: "message-detail.audio-translations", defaultValue: "Traductions audio", bundle: .main))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(theme.textMuted)
            }
            .padding(.horizontal, 4)
            .accessibilityAddTraits(.isHeader)

            ForEach(mergedTranslatedAudios, id: \.id) { audio in
                let langColor = Color(hex: LanguageDisplay.colorHex(for: audio.targetLanguage))
                let display = LanguageDisplay.from(code: audio.targetLanguage)

                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text(display?.flag ?? "\u{1F310}")
                            .font(.subheadline)
                        Text(display?.name ?? audio.targetLanguage)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(theme.textPrimary)

                        Spacer()

                        if audio.cloned {
                            HStack(spacing: 3) {
                                Image(systemName: "person.wave.2")
                                    .font(.caption2.weight(.medium))
                                Text(String(localized: "message-detail.audio.cloned", defaultValue: "Clone", bundle: .main))
                                    .font(.caption2.weight(.bold))
                                    .minimumScaleFactor(0.8)
                            }
                            .foregroundColor(langColor)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(langColor.opacity(0.12)))
                        }

                        Text(formatDuration(audio.durationMs / 1000))
                            .font(.system(.caption2, design: .monospaced).weight(.medium))
                            .foregroundColor(theme.textMuted)
                    }

                    if !audio.transcription.isEmpty {
                        Text(audio.transcription)
                            .font(.footnote)
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(4)
                    }
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(langColor.opacity(isDark ? 0.06 : 0.03))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(langColor.opacity(0.12), lineWidth: 0.5)
                        )
                )
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(audioTranslationA11yLabel(audio))
            }
        }
    }

    // MARK: - Network Actions

    private func requestTranscription(for attachmentId: String) {
        guard !isRequestingTranscription else { return }
        isRequestingTranscription = true
        HapticFeedback.light()

        Task {
            do {
                try await AttachmentService.shared.requestTranscription(attachmentId: attachmentId)
                await MainActor.run {
                    isRequestingTranscription = false
                    HapticFeedback.success()
                }
            } catch {
                await MainActor.run {
                    isRequestingTranscription = false
                    HapticFeedback.error()
                }
            }
        }
    }

    // MARK: - Accessibility

    /// Durée parlée locale-aware (« 12 secondes » / « 12 seconds » / « 12 Sekunden »)
    /// — remplace le rendu ambigu « 0:12 » pour VoiceOver. Zéro chaîne à traduire.
    private func spokenDuration(_ seconds: Int) -> String {
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = seconds >= 60 ? [.minute, .second] : [.second]
        formatter.unitsStyle = .full
        return formatter.string(from: TimeInterval(seconds)) ?? formatDuration(seconds)
    }

    private func transcriptionBannerA11yLabel(_ transcription: MessageTranscription) -> String {
        var parts: [String] = [
            String(format: String(localized: "a11y.transcription.in-language", defaultValue: "Transcription en %@", bundle: .main), Self.languageName(for: transcription.language))
        ]
        if let conf = transcription.confidence {
            parts.append(String(format: String(localized: "a11y.transcription.confidence", defaultValue: "confiance %d %%", bundle: .main), Int((conf * 100).rounded())))
        }
        if let durationMs = transcription.durationMs {
            parts.append(spokenDuration(durationMs / 1000))
        }
        return parts.joined(separator: ", ")
    }

    private func audioTranslationA11yLabel(_ audio: MessageTranslatedAudio) -> String {
        let display = LanguageDisplay.from(code: audio.targetLanguage)
        var parts: [String] = [display?.name ?? audio.targetLanguage]
        if audio.cloned {
            parts.append(String(localized: "a11y.audio.cloned-voice", defaultValue: "voix clonée", bundle: .main))
        }
        parts.append(spokenDuration(audio.durationMs / 1000))
        if !audio.transcription.isEmpty {
            parts.append(audio.transcription)
        }
        return parts.joined(separator: ", ")
    }

    // MARK: - Helpers

    private func formatDuration(_ seconds: Int) -> String {
        let mins = seconds / 60
        let secs = seconds % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private static func languageName(for code: String) -> String {
        supportedLanguages.first { $0.code == code }?.name ?? code.uppercased()
    }
}
