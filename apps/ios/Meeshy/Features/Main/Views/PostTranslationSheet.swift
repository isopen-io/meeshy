import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct PostTranslationSheet: View {
    let post: FeedPost
    var onSelectLanguage: ((String) -> Void)?
    var onRequestTranslation: ((String, String) -> Void)? // (postId, targetLanguage)

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @State private var requestingLanguages: Set<String> = []
    @State private var requestedLanguages: Set<String> = []

    private var availableTranslations: [String: PostTranslation] {
        post.translations ?? [:]
    }

    private var missingLanguages: [String] {
        let user = AuthManager.shared.currentUser
        let existing = Set(availableTranslations.keys.map { $0.lowercased() })
        let origLang = post.originalLanguage?.lowercased() ?? ""
        var missing: [String] = []
        for lang in user?.preferredContentLanguages ?? [] {
            let l = lang.lowercased()
            if l != origLang && !existing.contains(l) && !missing.contains(l) {
                missing.append(l)
            }
        }
        return missing
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        originalSection
                        if !availableTranslations.isEmpty {
                            translationsSection
                        }
                        if !missingLanguages.isEmpty {
                            requestTranslationSection
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle(String(localized: "feed.post.translation.title", defaultValue: "Langues", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(theme.textSecondary)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(theme.inputBackground))
                    }
                    .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Original Content Section

    private var originalSection: some View {
        Button {
            HapticFeedback.light()
            onSelectLanguage?(post.originalLanguage ?? "")
            dismiss()
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    let display = LanguageDisplay.from(code: post.originalLanguage)
                    Text(display?.flag ?? languageFlag(post.originalLanguage ?? "?"))
                    Text("\(String(localized: "feed.post.translation.original", defaultValue: "Original", bundle: .main)) (\(display?.name ?? post.originalLanguage ?? "?"))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Image(systemName: "checkmark.circle.fill")
                        .font(.callout)
                        .foregroundColor(MeeshyColors.success)
                }

                Text(post.content)
                    .font(.subheadline)
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(4)
                    .multilineTextAlignment(.leading)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(theme.inputBorder, lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
        // WCAG 1.4.1 — the original is the checked/active option (green
        // `checkmark.circle.fill`), a state conveyed by icon + colour alone.
        // Expose it to VoiceOver so the selection isn't visual-only (doctrine 85i/186i).
        .accessibilityAddTraits(.isSelected)
    }

    // MARK: - Available Translations

    private var translationsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "feed.post.translation.available", defaultValue: "Traductions disponibles", bundle: .main))
                .font(.subheadline.weight(.semibold))
                .foregroundColor(theme.textPrimary)

            ForEach(Array(availableTranslations.keys.sorted()), id: \.self) { lang in
                Button {
                    HapticFeedback.light()
                    onSelectLanguage?(lang)
                    dismiss()
                } label: {
                    HStack(spacing: 10) {
                        let display = LanguageDisplay.from(code: lang)
                        Text(display?.flag ?? languageFlag(lang))
                            .font(.title3)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(display?.name ?? Locale.current.localizedString(forLanguageCode: lang) ?? lang)
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(theme.textPrimary)

                            if let text = availableTranslations[lang]?.text {
                                Text(text)
                                    .font(.caption)
                                    .foregroundColor(theme.textMuted)
                                    .lineLimit(1)
                            }
                        }

                        Spacer()

                        if let confidence = availableTranslations[lang]?.confidenceScore {
                            let percent = confidence.formatted(.percent.precision(.fractionLength(0)))
                            Text(percent)
                                .font(.caption.weight(.medium))
                                .foregroundColor(theme.textMuted)
                                .accessibilityLabel(String(localized: "feed.post.translation.confidence.a11y", defaultValue: "Confiance de traduction \(percent)", bundle: .main))
                        }

                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(theme.textMuted)
                    }
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(theme.inputBackground)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(theme.inputBorder, lineWidth: 1)
                            )
                    )
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
    }

    // MARK: - Request New Translations

    private var requestTranslationSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "feed.post.translation.other_languages", defaultValue: "Autres langues", bundle: .main))
                .font(.subheadline.weight(.semibold))
                .foregroundColor(theme.textPrimary)

            ForEach(missingLanguages, id: \.self) { lang in
                HStack(spacing: 10) {
                    let display = LanguageDisplay.from(code: lang)
                    Text(display?.flag ?? languageFlag(lang))
                        .font(.title3)

                    Text(display?.name ?? Locale.current.localizedString(forLanguageCode: lang) ?? lang)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    if requestedLanguages.contains(lang) {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark")
                                .font(.caption2.weight(.bold))
                            Text(String(localized: "feed.post.translation.requested", defaultValue: "Demandee", bundle: .main))
                                .font(.caption2.weight(.medium))
                        }
                        .foregroundColor(MeeshyColors.success)
                    } else if requestingLanguages.contains(lang) {
                        ProgressView()
                            .scaleEffect(0.7)
                    } else {
                        Button {
                            HapticFeedback.light()
                            requestingLanguages.insert(lang)
                            Task {
                                do {
                                    try await PostService.shared.requestTranslation(postId: post.id, targetLanguage: lang)
                                    requestingLanguages.remove(lang)
                                    requestedLanguages.insert(lang)
                                    onRequestTranslation?(post.id, lang)
                                } catch {
                                    requestingLanguages.remove(lang)
                                    FeedbackToastManager.shared.showError(String(localized: "feed.post.translation.error", defaultValue: "Erreur de traduction", bundle: .main))
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "translate")
                                    .font(.caption.weight(.medium))
                                Text(String(localized: "feed.post.translation.translate", defaultValue: "Traduire", bundle: .main))
                                    .font(.caption.weight(.semibold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                Capsule().fill(MeeshyColors.brandGradient)
                            )
                        }
                    }
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(theme.inputBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(theme.inputBorder.opacity(0.5), lineWidth: 1)
                        )
                )
            }
        }
    }

    private func languageFlag(_ code: String) -> String {
        LanguageDisplay.from(code: code)?.flag ?? "\u{1F310}"
    }
}
