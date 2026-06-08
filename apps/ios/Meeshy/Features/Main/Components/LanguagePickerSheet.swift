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
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
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
                    LazyVStack(spacing: 2) {
                        if allowClear {
                            clearRow
                        }
                        ForEach(filteredLanguages, id: \.code) { lang in
                            languageRow(lang)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                }
            }
            .searchable(text: $searchText, prompt: String(localized: "language-picker.search", defaultValue: "Search a language", bundle: .main))
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", defaultValue: "Close", bundle: .main)) { dismiss() }
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
            HStack(spacing: 12) {
                Image(systemName: "xmark.circle")
                    .font(.title3)
                    .foregroundColor(theme.textMuted)
                    .frame(width: 36)
                Text(String(localized: "language-picker.none", defaultValue: "None", bundle: .main))
                    .font(.body.weight(.medium))
                    .foregroundColor(theme.textPrimary)
                Spacer()
                if selectedCode.isEmpty {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(MeeshyColors.indigo500)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(selectedCode.isEmpty
                        ? MeeshyColors.indigo500.opacity(0.1)
                        : Color.clear)
            )
        }
    }

    private func languageRow(_ lang: LanguageInfo) -> some View {
        let isSelected = lang.code == selectedCode
        return Button {
            HapticFeedback.light()
            onSelect(lang.code)
            dismiss()
        } label: {
            HStack(spacing: 12) {
                Text(lang.flag)
                    .font(.title2)
                    .frame(width: 36)

                VStack(alignment: .leading, spacing: 2) {
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
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected
                        ? Color(hex: lang.colorHex).opacity(0.1)
                        : Color.clear)
            )
        }
    }
}
