import SwiftUI
import MeeshySDK

struct PostTranslationSheet: View {
    let post: FeedPost
    var onSelectLanguage: ((String) -> Void)?

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        originalSection
                        if let translations = post.translations, !translations.isEmpty {
                            translationsSection(translations)
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
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Original Content Section

    private var originalSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text(languageFlag(post.originalLanguage ?? "?"))
                Text("Original (\(Locale.current.localizedString(forLanguageCode: post.originalLanguage ?? "?") ?? post.originalLanguage ?? "?"))")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
            }

            Text(post.content)
                .font(.system(size: 15))
                .foregroundColor(theme.textSecondary)
                .lineLimit(6)
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

    // MARK: - Available Translations

    private func translationsSection(_ translations: [String: PostTranslation]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Traductions disponibles")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            ForEach(Array(translations.keys.sorted()), id: \.self) { lang in
                Button {
                    HapticFeedback.light()
                    onSelectLanguage?(lang)
                    dismiss()
                } label: {
                    HStack(spacing: 10) {
                        Text(languageFlag(lang))
                            .font(.system(size: 20))

                        VStack(alignment: .leading, spacing: 2) {
                            Text(Locale.current.localizedString(forLanguageCode: lang) ?? lang)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(theme.textPrimary)

                            if let text = translations[lang]?.text {
                                Text(text)
                                    .font(.system(size: 12))
                                    .foregroundColor(theme.textMuted)
                                    .lineLimit(1)
                            }
                        }

                        Spacer()

                        if let confidence = translations[lang]?.confidenceScore {
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

    private func languageFlag(_ code: String) -> String {
        let flags: [String: String] = [
            "fr": "\u{1F1EB}\u{1F1F7}", "en": "\u{1F1EC}\u{1F1E7}",
            "es": "\u{1F1EA}\u{1F1F8}", "ar": "\u{1F1F8}\u{1F1E6}",
            "pt": "\u{1F1E7}\u{1F1F7}", "de": "\u{1F1E9}\u{1F1EA}",
            "zh": "\u{1F1E8}\u{1F1F3}", "ja": "\u{1F1EF}\u{1F1F5}",
            "ko": "\u{1F1F0}\u{1F1F7}", "it": "\u{1F1EE}\u{1F1F9}",
            "ru": "\u{1F1F7}\u{1F1FA}", "tr": "\u{1F1F9}\u{1F1F7}"
        ]
        return flags[code] ?? "\u{1F310}"
    }
}
