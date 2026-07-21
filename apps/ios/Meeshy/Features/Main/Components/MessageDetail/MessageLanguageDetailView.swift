import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

/// Explorateur de langues du Prisme Linguistique pour un message.
/// État de traduction 100 % encapsulé — extrait de l'ancien
/// `MessageDetailSheet.languageTabContent`. Aucun changement de comportement.
struct MessageLanguageDetailView: View {
    let message: Message
    let contactColor: String
    let conversationId: String
    var textTranslations: [MessageTranslation] = []
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var onSelectTranslation: ((MessageTranslation?) -> Void)? = nil
    var onSelectAudioLanguage: ((String?) -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    // Translation state
    @State private var translations: [String: String] = [:]
    @State private var translatingLanguages: Set<String> = []
    @State private var selectedLanguageCode: String? = nil
    @State private var isLoadingTranslations = false
    @State private var translationError: String? = nil
    @State private var mergedTranslatedAudios: [MessageTranslatedAudio] = []
    @State private var translatingAudioLanguages: Set<String> = []

    var body: some View {
        content
            .onAppear { Task { await loadExistingTranslations() } }
            .onReceive(
                MessageSocketManager.shared.translationFailed
                    .filter { $0.messageId == message.id }
                    .receive(on: DispatchQueue.main)
            ) { _ in
                translatingLanguages = []
            }
            .onReceive(
                MessageSocketManager.shared.audioTranslationFailed
                    .filter { $0.messageId == message.id }
                    .receive(on: DispatchQueue.main)
            ) { _ in
                translatingAudioLanguages = []
            }
    }

    // MARK: - Language Tab Content

    private var content: some View {
        let originalLang = message.originalLanguage
        let originalColor = Color(hex: LanguageDisplay.colorHex(for:originalLang))

        return VStack(alignment: .leading, spacing: 14) {
            // Original language banner
            HStack(spacing: 8) {
                Circle()
                    .fill(originalColor)
                    .frame(width: 8, height: 8)
                Image(systemName: "text.bubble.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(originalColor)
                Text(String(format: String(localized: "message-detail.original", defaultValue: "Original \u{2022} %@", bundle: .main), Self.languageName(for: originalLang)))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                Spacer()
                Text(originalLang.uppercased())
                    .font(.system(.caption2, design: .monospaced).weight(.bold))
                    .foregroundColor(originalColor)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(originalColor.opacity(0.12)))
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(originalColor.opacity(isDark ? 0.08 : 0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(originalColor.opacity(0.15), lineWidth: 0.5)
                    )
            )

            // Original content preview (text or transcription for audio messages)
            if !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(message.content)
                    .font(.footnote)
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(3)
                    .padding(.horizontal, 4)
            } else if let transcription {
                HStack(spacing: 6) {
                    Image(systemName: "waveform")
                        .font(.caption2.weight(.medium))
                        .foregroundColor(originalColor.opacity(0.7))
                    Text(transcription.text)
                        .font(.footnote)
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(3)
                }
                .padding(.horizontal, 4)
            }

            // Selected translation display
            if let selectedCode = selectedLanguageCode, let translated = translations[selectedCode] {
                let langColor = Color(hex: LanguageDisplay.colorHex(for:selectedCode))

                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(langColor)
                            .frame(width: 6, height: 6)
                        Text(Self.languageName(for: selectedCode))
                            .font(.caption.weight(.semibold))
                            .foregroundColor(langColor)
                        Spacer()
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) { selectedLanguageCode = nil }
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.subheadline)
                                .foregroundColor(theme.textMuted)
                        }
                        .accessibilityLabel(String(localized: "message-detail.a11y.close-translation", defaultValue: "Fermer la traduction", bundle: .main))
                    }

                    Text(translated)
                        .font(.subheadline)
                        .foregroundColor(theme.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(langColor.opacity(isDark ? 0.08 : 0.05))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(langColor.opacity(0.2), lineWidth: 0.5)
                        )
                )
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            // Divider
            Rectangle()
                .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                .frame(height: 0.5)

            // Language list
            ForEach(LanguageDisplay.translationPickerLanguages.filter { $0.code != originalLang }, id: \.code) { lang in
                languageRow(lang, originalLang: originalLang)
            }

            if let translationError {
                Text(translationError)
                    .font(.caption2)
                    .foregroundColor(MeeshyColors.error)
                    .padding(.horizontal, 8)
                    .padding(.top, 4)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: selectedLanguageCode)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: translations.count)
    }

    private func languageRow(_ lang: LanguageDisplay, originalLang: String) -> some View {
        let langColor = Color(hex: LanguageDisplay.colorHex(for:lang.code))
        let hasTranslation = translations[lang.code] != nil
        let isTranslating = translatingLanguages.contains(lang.code) || translatingAudioLanguages.contains(lang.code)
        let isSelected = selectedLanguageCode == lang.code

        return Button {
            HapticFeedback.light()
            if hasTranslation {
                withAnimation(.easeInOut(duration: 0.2)) {
                    selectedLanguageCode = isSelected ? nil : lang.code
                }
                // Notify parent to update bubble
                if !isSelected, let translated = translations[lang.code] {
                    let mt = MessageTranslation(
                        id: "\(message.id)-\(lang.code)",
                        messageId: message.id,
                        sourceLanguage: message.originalLanguage,
                        targetLanguage: lang.code,
                        translatedContent: translated,
                        translationModel: "nllb-200",
                        confidenceScore: nil
                    )
                    onSelectTranslation?(mt)
                    if !mergedTranslatedAudios.isEmpty {
                        onSelectAudioLanguage?(lang.code)
                    }
                } else if isSelected {
                    onSelectTranslation?(nil)
                    if !mergedTranslatedAudios.isEmpty {
                        onSelectAudioLanguage?(nil)
                    }
                }
            } else if mergedTranslatedAudios.contains(where: { $0.targetLanguage.lowercased() == lang.code.lowercased() }) {
                // Audio-only translation available — toggle selection
                withAnimation(.easeInOut(duration: 0.2)) {
                    selectedLanguageCode = isSelected ? nil : lang.code
                }
                if !isSelected {
                    onSelectAudioLanguage?(lang.code)
                } else {
                    onSelectAudioLanguage?(nil)
                }
            } else {
                if transcription != nil {
                    Task { await translateAudioTo(lang.code) }
                } else {
                    Task { await translateTo(lang.code, from: originalLang) }
                }
            }
        } label: {
            HStack(spacing: 10) {
                // Color dot
                Circle()
                    .fill(langColor)
                    .frame(width: 8, height: 8)

                // Flag + name
                Text(lang.flag)
                    .font(.callout)
                Text(lang.name)
                    .font(.footnote.weight(.medium))
                    .foregroundColor(isSelected ? langColor : theme.textPrimary)

                Spacer()

                // Translation preview or action
                if isTranslating {
                    ProgressView()
                        .scaleEffect(0.7)
                        .tint(langColor)
                } else if hasTranslation {
                    Text(String((translations[lang.code] ?? "").prefix(60)) + (translations[lang.code]?.count ?? 0 > 60 ? "..." : ""))
                        .font(.caption2)
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                        .frame(maxWidth: 180, alignment: .trailing)

                    Button {
                        Task { await translateTo(lang.code, from: originalLang) }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.caption2.weight(.medium))
                            .foregroundColor(langColor.opacity(0.6))
                    }
                    .accessibilityLabel(String(localized: "message-detail.a11y.retranslate", defaultValue: "Retraduire", bundle: .main))

                    Image(systemName: isSelected ? "checkmark.circle.fill" : "chevron.right")
                        .font(.caption.weight(.medium))
                        .foregroundColor(isSelected ? langColor : theme.textMuted.opacity(0.5))
                } else if let audioForLang = mergedTranslatedAudios.first(where: { $0.targetLanguage.lowercased() == lang.code.lowercased() }) {
                    HStack(spacing: 3) {
                        Image(systemName: "waveform")
                            .font(.caption2.weight(.medium))
                            .minimumScaleFactor(0.8)
                            .foregroundColor(langColor.opacity(0.6))
                        Text(String(audioForLang.transcription.prefix(50)) + (audioForLang.transcription.count > 50 ? "..." : ""))
                            .font(.caption2)
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: 180, alignment: .trailing)

                    Image(systemName: isSelected ? "checkmark.circle.fill" : "chevron.right")
                        .font(.caption.weight(.medium))
                        .foregroundColor(isSelected ? langColor : theme.textMuted.opacity(0.5))
                } else {
                    Text(String(localized: "message-detail.translate", defaultValue: "Traduire", bundle: .main))
                        .font(.caption2.weight(.medium))
                        .foregroundColor(langColor)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(langColor.opacity(0.12)))
                }
            }
            .padding(.vertical, 9)
            .padding(.horizontal, 8)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSelected
                        ? langColor.opacity(isDark ? 0.08 : 0.05)
                        : Color.clear)
            )
        }
        .disabled(isTranslating)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    // MARK: - Network Actions

    private func translateTo(_ targetLang: String, from sourceLang: String) async {
        // Audio messages have empty `content`; text translation only applies
        // when there is text. (Audio messages are handled by the audio branch.)
        guard !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        translatingLanguages.insert(targetLang)
        translationError = nil
        defer { translatingLanguages.remove(targetLang) }

        do {
            let response = try await TranslationService.shared.translate(
                text: message.content,
                sourceLanguage: sourceLang,
                targetLanguage: targetLang,
                messageId: message.id
            )
            translations[targetLang] = response.translatedText
            withAnimation(.easeInOut(duration: 0.2)) {
                selectedLanguageCode = targetLang
            }
            let mt = MessageTranslation(
                id: "\(message.id)-\(targetLang)",
                messageId: message.id,
                sourceLanguage: sourceLang,
                targetLanguage: targetLang,
                translatedContent: response.translatedText,
                translationModel: "on-demand",
                confidenceScore: nil
            )
            onSelectTranslation?(mt)
            // No socket call: passing `messageId` routes /translate-blocking
            // into the Case 1 "retranslation" branch, which persists AND
            // broadcasts via `message:translation`. A second socket request
            // would double-persist.
            HapticFeedback.success()
        } catch {
            translationError = String(
                localized: "translation.error",
                defaultValue: "La traduction a échoué. Réessayez."
            )
            HapticFeedback.error()
        }
    }

    private func translateAudioTo(_ targetLang: String) async {
        guard let attachmentId = transcription?.attachmentId else { return }
        translatingAudioLanguages.insert(targetLang)
        translationError = nil
        defer { translatingAudioLanguages.remove(targetLang) }
        do {
            let response = try await AttachmentService.shared.translate(
                attachmentId: attachmentId,
                targetLanguages: [targetLang],
                sourceLanguage: message.originalLanguage,
                generateVoiceClone: false
            )
            mergedTranslatedAudios = Self.mergeAudioTranslations(
                existing: mergedTranslatedAudios,
                incoming: response.translations,
                attachmentId: attachmentId
            )
            withAnimation(.easeInOut(duration: 0.2)) { selectedLanguageCode = targetLang }
            onSelectAudioLanguage?(targetLang)
            HapticFeedback.success()
        } catch let consent as AttachmentConsentError {
            translationError = consent.message
            HapticFeedback.error()
        } catch {
            translationError = String(localized: "translation.audio.error",
                defaultValue: "La traduction audio a échoué. Réessayez.")
            HapticFeedback.error()
        }
    }

    static func mergeAudioTranslations(
        existing: [MessageTranslatedAudio],
        incoming: [AttachmentTranslationResult],
        attachmentId: String
    ) -> [MessageTranslatedAudio] {
        var byLang: [String: MessageTranslatedAudio] = Dictionary(
            uniqueKeysWithValues: existing.map { ($0.targetLanguage.lowercased(), $0) }
        )
        for result in incoming {
            let key = result.targetLanguage.lowercased()
            byLang[key] = MessageTranslatedAudio(
                id: result.id,
                attachmentId: attachmentId,
                targetLanguage: result.targetLanguage,
                url: result.audioUrl ?? "",
                transcription: result.translatedText ?? "",
                durationMs: result.durationMs ?? 0,
                format: "mp3",
                cloned: result.voiceCloned ?? false,
                quality: 0,
                ttsModel: "chatterbox"
            )
        }
        return Array(byLang.values)
    }

    private func loadExistingTranslations() async {
        guard !isLoadingTranslations else { return }
        isLoadingTranslations = true
        defer { isLoadingTranslations = false }

        if mergedTranslatedAudios.isEmpty { mergedTranslatedAudios = translatedAudios }

        // Pre-populate from ViewModel-provided translations
        for t in textTranslations {
            if translations[t.targetLanguage] == nil {
                translations[t.targetLanguage] = t.translatedContent
            }
        }

        // `GET /messages/:id/translations` returns `data` as an OBJECT that
        // nests the list under `translations` (next to the original-message
        // metadata) — NOT a bare array. Decoding `APIResponse<[TranslationData]>`
        // threw `Type mismatch for type Array<Any> at path data` on every
        // fetch. This local payload matches the real shape and only declares
        // the two fields consumed below, so it is also immune to the SDK
        // `TranslationData` field set (the REST elements omit `sourceLanguage`,
        // which `TranslationData` requires).
        struct TranslationsPayload: Decodable {
            struct Item: Decodable {
                let targetLanguage: String
                let translatedContent: String
            }
            let translations: [Item]
        }

        do {
            let response: APIResponse<TranslationsPayload> = try await APIClient.shared.request(
                endpoint: "/messages/\(message.id)/translations"
            )
            if response.success {
                for t in response.data.translations {
                    translations[t.targetLanguage] = t.translatedContent
                }
            }
        } catch {
            Logger.network.error("translation fetch failed: \(error.localizedDescription)")
        }
    }

    static func languageName(for code: String) -> String {
        LanguageDisplay.from(code: code)?.name ?? code.uppercased()
    }
}
