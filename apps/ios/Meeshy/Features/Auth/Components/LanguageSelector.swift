//
//  LanguageSelector.swift
//  Meeshy
//
//  Language selection dropdown for authentication
//  Minimum iOS 16+
//

import SwiftUI

/// Language selector dropdown component
struct LanguageSelector: View {
    // MARK: - Properties

    let title: String
    @Binding var selectedLanguage: String
    let languages: [AuthLanguage]
    let errorMessage: String?

    @State private var showPicker = false

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Title
            Text(title)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.primary)

            // Selector Button
            Button(action: {
                showPicker.toggle()

                // Haptic feedback
                let generator = UIImpactFeedbackGenerator(style: .light)
                generator.impactOccurred()
            }) {
                HStack {
                    HStack(spacing: 12) {
                        // Language flag/icon
                        Text(selectedLanguageDisplay.flag)
                            .font(.system(size: 20))

                        // Language name
                        VStack(alignment: .leading, spacing: 2) {
                            Text(selectedLanguageDisplay.name)
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(.primary)

                            Text(selectedLanguageDisplay.nativeName)
                                .font(.system(size: 13))
                                .foregroundColor(.secondary)
                        }
                    }

                    Spacer()

                    // Chevron
                    Image(systemName: "chevron.down")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.secondary)
                        .rotationEffect(Angle(degrees: showPicker ? 180 : 0))
                        .animation(.easeInOut(duration: 0.2), value: showPicker)
                }
                .padding(.horizontal, 16)
                .frame(height: 50)
                .background(Color(UIColor.systemGray6))
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(borderColor, lineWidth: 1.5)
                )
            }
            .accessibilityLabel("\(title), currently selected: \(selectedLanguageDisplay.name)")

            // Error Message
            if let errorMessage = errorMessage, !errorMessage.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 12))
                    Text(errorMessage)
                        .font(.system(size: 13))
                }
                .foregroundColor(Color(red: 1, green: 59/255, blue: 48/255))
                .transition(.opacity)
            }
        }
        .sheet(isPresented: $showPicker) {
            LanguagePickerSheet(
                selectedLanguage: $selectedLanguage,
                languages: languages,
                onDismiss: { showPicker = false }
            )
        }
    }

    // MARK: - Computed Properties

    private var selectedLanguageDisplay: AuthLanguage {
        languages.first { $0.code == selectedLanguage } ?? AuthLanguage.default
    }

    private var borderColor: Color {
        if let errorMessage = errorMessage, !errorMessage.isEmpty {
            return Color(red: 1, green: 59/255, blue: 48/255)
        } else if showPicker {
            return Color(red: 0, green: 122/255, blue: 1)
        } else {
            return Color.clear
        }
    }
}

// MARK: - Language Picker Sheet

private struct LanguagePickerSheet: View {
    @Binding var selectedLanguage: String
    let languages: [AuthLanguage]
    let onDismiss: () -> Void

    @State private var searchText = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(filteredLanguages) { language in
                    LanguageRow(
                        language: language,
                        isSelected: selectedLanguage == language.code,
                        onSelect: {
                            selectedLanguage = language.code

                            // Haptic feedback
                            let generator = UISelectionFeedbackGenerator()
                            generator.selectionChanged()

                            dismiss()
                        }
                    )
                }
            }
            .listStyle(InsetGroupedListStyle())
            .searchable(text: $searchText, prompt: "Search languages")
            .navigationTitle("Select Language")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private var filteredLanguages: [AuthLanguage] {
        if searchText.isEmpty {
            return languages
        } else {
            return languages.filter { language in
                language.name.localizedCaseInsensitiveContains(searchText) ||
                language.nativeName.localizedCaseInsensitiveContains(searchText) ||
                language.code.localizedCaseInsensitiveContains(searchText)
            }
        }
    }
}

// MARK: - Language Row

private struct LanguageRow: View {
    let language: AuthLanguage
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 16) {
                // Flag
                Text(language.flag)
                    .font(.system(size: 28))

                // Language info
                VStack(alignment: .leading, spacing: 2) {
                    Text(language.name)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.primary)

                    Text(language.nativeName)
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                }

                Spacer()

                // Checkmark
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Auth Language Model

struct AuthLanguage: Identifiable {
    let id = UUID()
    let code: String
    let name: String
    let nativeName: String
    let flag: String

    static let supportedLanguages: [AuthLanguage] = [
        AuthLanguage(code: "en", name: "English", nativeName: "English", flag: "🇬🇧"),
        AuthLanguage(code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷"),
        AuthLanguage(code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸"),
        AuthLanguage(code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪"),
        AuthLanguage(code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹"),
        AuthLanguage(code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇵🇹"),
        AuthLanguage(code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺"),
        AuthLanguage(code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳"),
        AuthLanguage(code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵"),
        AuthLanguage(code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷"),
        AuthLanguage(code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦"),
        AuthLanguage(code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳"),
        AuthLanguage(code: "sw", name: "Swahili", nativeName: "Kiswahili", flag: "🇰🇪"),
        AuthLanguage(code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "🇳🇱"),
        AuthLanguage(code: "pl", name: "Polish", nativeName: "Polski", flag: "🇵🇱"),
        AuthLanguage(code: "tr", name: "Turkish", nativeName: "Türkçe", flag: "🇹🇷"),
        AuthLanguage(code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳"),
        AuthLanguage(code: "th", name: "Thai", nativeName: "ไทย", flag: "🇹🇭")
    ]

    static var `default`: AuthLanguage {
        AuthLanguage(code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷")
    }

    static func find(by code: String) -> AuthLanguage {
        supportedLanguages.first { $0.code == code } ?? `default`
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 24) {
        LanguageSelector(
            title: "System Language",
            selectedLanguage: .constant("fr"),
            languages: AuthLanguage.supportedLanguages,
            errorMessage: nil
        )

        LanguageSelector(
            title: "Regional Language",
            selectedLanguage: .constant("en"),
            languages: AuthLanguage.supportedLanguages,
            errorMessage: nil
        )

        LanguageSelector(
            title: "Language",
            selectedLanguage: .constant("es"),
            languages: AuthLanguage.supportedLanguages,
            errorMessage: "Please select a language"
        )
    }
    .padding()
}