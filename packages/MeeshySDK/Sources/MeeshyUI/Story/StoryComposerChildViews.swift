import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - Story Language Picker

struct StoryLanguagePickerView: View {
    @Binding var selectedLanguage: String
    @Environment(\.dismiss) var dismiss
    @State var searchText = ""

    var languages: [(code: String, name: String)] {
        Locale.availableIdentifiers
            .compactMap { id -> (String, String)? in
                let locale = Locale(identifier: id)
                guard let langCode = locale.language.languageCode?.identifier,
                      langCode.count >= 2, langCode.count <= 3,
                      let name = Locale.current.localizedString(forLanguageCode: langCode) else { return nil }
                return (langCode, name.prefix(1).uppercased() + name.dropFirst())
            }
            .reduce(into: [(String, String)]()) { result, item in
                if !result.contains(where: { $0.0 == item.0 }) { result.append(item) }
            }
            .sorted { $0.1 < $1.1 }
    }

    var filteredLanguages: [(code: String, name: String)] {
        guard !searchText.isEmpty else { return languages }
        let query = searchText.lowercased()
        return languages.filter { $0.name.lowercased().contains(query) || $0.code.lowercased().contains(query) }
    }

    var body: some View {
        NavigationStack {
            List(filteredLanguages, id: \.code) { item in
                Button {
                    selectedLanguage = item.code
                    HapticFeedback.light()
                    dismiss()
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name)
                                .font(.system(size: 16, weight: selectedLanguage == item.code ? .semibold : .regular))
                                .foregroundColor(.primary)
                            Text(item.code)
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                        if selectedLanguage == item.code {
                            Image(systemName: "checkmark")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(MeeshyColors.indigo500)
                        }
                    }
                }
            }
            .searchable(text: $searchText, prompt: String(localized: "story.language.search", defaultValue: "Rechercher une langue", bundle: .module))
            .navigationTitle(String(localized: "story.language.title", defaultValue: "Langue du contenu", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .module)) { dismiss() }
                        .foregroundColor(MeeshyColors.indigo500)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

// MARK: - Media Pill Label (extracted for Sendable conformance)

struct MediaPillLabel: View {
    let icon: String
    let text: String
    var destructive: Bool = false

    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        // Le bandeau composer a un fond opaque adaptatif (blanc en light,
        // indigo950 en dark). Les pills hardcodés en `.white` étaient
        // invisibles sur fond clair (blanc sur blanc). On adapte foreground
        // et background fill au mode.
        let fgBase: Color = colorScheme == .dark ? .white : MeeshyColors.indigo950
        let foreground: Color = destructive ? MeeshyColors.error : fgBase.opacity(0.88)
        let bgFill: Color = destructive
            ? MeeshyColors.error.opacity(0.15)
            : fgBase.opacity(0.10)
        let strokeColor: Color = destructive
            ? MeeshyColors.error.opacity(0.35)
            : fgBase.opacity(0.18)

        return HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 12, weight: .medium))
            Text(text).font(.system(size: 11, weight: .medium))
        }
        .foregroundColor(foreground)
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(bgFill)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(strokeColor, lineWidth: 0.5)
                )
        )
    }
}
