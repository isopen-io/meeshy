import SwiftUI
import MeeshySDK
import MeeshyUI

struct TranslationDetailSheet: View {
    let messageId: String
    let originalContent: String
    let originalLanguage: String
    let translations: [MessageTranslation]
    let accentColor: String
    var onRequestTranslation: ((String, String) -> Void)? = nil
    var onSelectTranslation: ((MessageTranslation) -> Void)? = nil

    @State private var selectedLanguageCode: String = ""
    @State private var isRequesting = false
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    private var availableLanguages: [LanguageOption] {
        LanguageOption.defaults
    }

    private var existingLanguageCodes: Set<String> {
        Set(translations.map { $0.targetLanguage.lowercased() })
    }

    private var requestableLanguages: [LanguageOption] {
        availableLanguages.filter { !existingLanguageCodes.contains($0.code.lowercased()) }
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 20) {
                    originalSection
                    if !translations.isEmpty {
                        translationsSection
                    }
                    requestSection
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(theme.mode.isDark ? Color.black : Color(UIColor.systemGroupedBackground))
            .navigationTitle("Traductions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 20))
                            .foregroundStyle(theme.textMuted)
                    }
                    .accessibilityLabel("Fermer")
                }
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Original Section

    private var originalSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "text.quote")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                Text("Original")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                Spacer()
                languagePill(code: originalLanguage, isSelected: false)
            }

            Text(originalContent)
                .font(.system(size: 15))
                .foregroundColor(theme.textPrimary)
                .lineLimit(5)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(theme.mode.isDark ? Color.white.opacity(0.06) : Color.white)
        )
    }

    // MARK: - Available Translations

    private var translationsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "translate")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: "4ECDC4"))
                Text("Traductions disponibles")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }

            FlowLayout(spacing: 8) {
                ForEach(translations) { translation in
                    translationPill(translation)
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(theme.mode.isDark ? Color.white.opacity(0.06) : Color.white)
        )
    }

    private func translationPill(_ translation: MessageTranslation) -> some View {
        let lang = availableLanguages.first { $0.code.lowercased() == translation.targetLanguage.lowercased() }
        let label = lang?.flag ?? translation.targetLanguage.uppercased()
        let name = lang?.name ?? translation.targetLanguage

        return Button {
            onSelectTranslation?(translation)
            HapticFeedback.light()
        } label: {
            VStack(spacing: 4) {
                Text(label)
                    .font(.system(size: 20))
                Text(name)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
            .frame(width: 64, height: 56)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(hex: accentColor).opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Color(hex: accentColor).opacity(0.2), lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel("Traduction en \(name)")
    }

    // MARK: - Request Section

    private var requestSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "plus.bubble")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                Text("Demander une traduction")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }

            if requestableLanguages.isEmpty {
                Text("Toutes les langues disponibles sont deja traduites")
                    .font(.system(size: 13))
                    .foregroundColor(theme.textMuted)
                    .italic()
            } else {
                FlowLayout(spacing: 8) {
                    ForEach(requestableLanguages) { lang in
                        requestLanguagePill(lang)
                    }
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(theme.mode.isDark ? Color.white.opacity(0.06) : Color.white)
        )
    }

    private func requestLanguagePill(_ lang: LanguageOption) -> some View {
        let isSelected = selectedLanguageCode == lang.code

        return Button {
            if isSelected {
                requestTranslation(lang.code)
            } else {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    selectedLanguageCode = lang.code
                }
                HapticFeedback.light()
            }
        } label: {
            HStack(spacing: 4) {
                Text(lang.flag)
                    .font(.system(size: 14))
                Text(isSelected ? "Traduire" : lang.name)
                    .font(.system(size: 12, weight: isSelected ? .bold : .medium))
                    .foregroundColor(isSelected ? .white : theme.textPrimary)
                if isRequesting && isSelected {
                    ProgressView()
                        .scaleEffect(0.6)
                        .tint(.white)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(isSelected ? Color(hex: accentColor) : Color(hex: accentColor).opacity(0.1))
            )
        }
        .accessibilityLabel("Traduire en \(lang.name)")
    }

    private func requestTranslation(_ langCode: String) {
        isRequesting = true
        onRequestTranslation?(messageId, langCode)
        HapticFeedback.medium()

        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            isRequesting = false
            selectedLanguageCode = ""
        }
    }

    // MARK: - Helpers

    private func languagePill(code: String, isSelected: Bool) -> some View {
        let lang = availableLanguages.first { $0.code.lowercased() == code.lowercased() }
        let label = lang.map { "\($0.flag) \($0.code.uppercased())" } ?? code.uppercased()

        return Text(label)
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(theme.textSecondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                Capsule()
                    .fill(theme.mode.isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05))
            )
    }
}
