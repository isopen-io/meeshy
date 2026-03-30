import SwiftUI
import MeeshySDK
import MeeshyUI

struct PostTranslationSheet: View {
    let post: FeedPost
    var onSelectLanguage: ((String) -> Void)?
    var onRequestTranslation: ((String, String) -> Void)? // (postId, targetLanguage)

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
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
            .navigationTitle("Langues")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(theme.textSecondary)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(theme.inputBackground))
                    }
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
                    Text("Original (\(display?.name ?? post.originalLanguage ?? "?"))")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(MeeshyColors.success)
                }

                Text(post.content)
                    .font(.system(size: 15))
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
    }

    // MARK: - Available Translations

    private var translationsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Traductions disponibles")
                .font(.system(size: 14, weight: .semibold))
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
                            .font(.system(size: 20))

                        VStack(alignment: .leading, spacing: 2) {
                            Text(display?.name ?? Locale.current.localizedString(forLanguageCode: lang) ?? lang)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(theme.textPrimary)

                            if let text = availableTranslations[lang]?.text {
                                Text(text)
                                    .font(.system(size: 12))
                                    .foregroundColor(theme.textMuted)
                                    .lineLimit(1)
                            }
                        }

                        Spacer()

                        if let confidence = availableTranslations[lang]?.confidenceScore {
                            Text("\(Int(confidence * 100))%")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(theme.textMuted)
                        }

                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
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
            Text("Autres langues")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            ForEach(missingLanguages, id: \.self) { lang in
                HStack(spacing: 10) {
                    let display = LanguageDisplay.from(code: lang)
                    Text(display?.flag ?? languageFlag(lang))
                        .font(.system(size: 20))

                    Text(display?.name ?? Locale.current.localizedString(forLanguageCode: lang) ?? lang)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    if requestedLanguages.contains(lang) {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 10, weight: .bold))
                            Text("Demandee")
                                .font(.system(size: 11, weight: .medium))
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
                                    ToastManager.shared.showError("Erreur de traduction")
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "translate")
                                    .font(.system(size: 12, weight: .medium))
                                Text("Traduire")
                                    .font(.system(size: 12, weight: .semibold))
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
