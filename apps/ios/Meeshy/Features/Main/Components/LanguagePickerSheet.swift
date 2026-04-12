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
    @ObservedObject private var theme = ThemeManager.shared
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
            .searchable(text: $searchText, prompt: "Rechercher une langue")
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                        .foregroundColor(Color(hex: "6366F1"))
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
                    .font(.system(size: 20))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 36)
                Text("Aucune")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                Spacer()
                if selectedCode.isEmpty {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(Color(hex: "6366F1"))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(selectedCode.isEmpty
                        ? Color(hex: "6366F1").opacity(0.1)
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
                    .font(.system(size: 24))
                    .frame(width: 36)

                VStack(alignment: .leading, spacing: 2) {
                    Text(lang.nativeName)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                    Text(lang.name)
                        .font(.system(size: 12))
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
