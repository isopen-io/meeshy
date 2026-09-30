import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct ProfileLanguagePickerSheet: View {
    let title: String
    let languages: [LanguageInfo]
    let selectedCode: String
    let allowClear: Bool
    let onSelect: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @State private var searchText = ""

    private var filteredLanguages: [LanguageInfo] {
        guard !searchText.isEmpty else { return languages }
        let query = searchText.lowercased()
        return languages.filter {
            $0.name.lowercased().contains(query) ||
            $0.nativeName.lowercased().contains(query) ||
            $0.code.lowercased().contains(query)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                ScrollView {
                    LazyVStack(spacing: MeeshySpacing.xxs) {
                        if allowClear {
                            clearRow
                        }
                        ForEach(filteredLanguages, id: \.code) { lang in
                            languageRow(lang)
                        }
                    }
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.top, MeeshySpacing.sm)
                }
            }
            .searchable(text: $searchText, prompt: String(localized: "language-picker.search", defaultValue: "Rechercher une langue", bundle: .main))
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) { dismiss() }
                        .foregroundColor(MeeshyColors.indigo500)
                }
            }
        }
    }

    private var clearRow: some View {
        Button {
            HapticFeedback.light()
            onSelect("")
            dismiss()
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "xmark.circle")
                    .font(.title3)
                    .foregroundColor(theme.textMuted)
                    .frame(width: 36)
                Text(String(localized: "language-picker.none", defaultValue: "Aucune", bundle: .main))
                    .font(.body.weight(.medium))
                    .foregroundColor(theme.textPrimary)
                Spacer()
                if selectedCode.isEmpty {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(MeeshyColors.indigo500)
                }
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.md)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .fill(selectedCode.isEmpty
                        ? MeeshyColors.indigo500.opacity(0.1)
                        : Color.clear)
            )
        }
        .accessibilityLabel(Text(String(localized: "language-picker.none", defaultValue: "Aucune", bundle: .main)))
        .accessibilityAddTraits(selectedCode.isEmpty ? .isSelected : [])
    }

    private func languageRow(_ lang: LanguageInfo) -> some View {
        let isSelected = lang.code == selectedCode
        return Button {
            HapticFeedback.light()
            onSelect(lang.code)
            dismiss()
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                Text(lang.flag)
                    .font(.title2)
                    .frame(width: 36)

                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(lang.nativeName)
                        .font(.body.weight(.medium))
                        .foregroundColor(theme.textPrimary)
                    Text(lang.name)
                        .font(.caption)
                        .foregroundColor(theme.textMuted)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(Color(hex: lang.colorHex))
                }
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .fill(isSelected
                        ? Color(hex: lang.colorHex).opacity(0.1)
                        : Color.clear)
            )
        }
        .accessibilityLabel(Text(verbatim: "\(lang.nativeName), \(lang.name)"))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint(isSelected
            ? Text("")
            : Text(String(localized: "language-picker.select.hint", defaultValue: "Définit cette langue", bundle: .main)))
    }
}
