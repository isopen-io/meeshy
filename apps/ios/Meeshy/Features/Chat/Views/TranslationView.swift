//
//  TranslationView.swift
//  Meeshy
//
//  Inline translation display for messages
//  iOS 16+
//

import SwiftUI

struct TranslationView: View {
    // MARK: - Properties

    let originalText: String
    let translatedText: String
    let sourceLanguage: TranslationLanguage
    let targetLanguage: TranslationLanguage
    let onDismiss: () -> Void

    @State private var showOriginal = false

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Translation Header
            HStack(spacing: 8) {
                Image(systemName: "character.bubble")
                    .font(.system(size: 14))
                    .foregroundColor(.blue)

                Text("Translated from \(sourceLanguage.displayName)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.blue)

                Spacer()

                Button(action: {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showOriginal.toggle()
                    }
                }) {
                    Text(showOriginal ? "Show Translation" : "Show Original")
                        .font(.system(size: 12))
                        .foregroundColor(.blue)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.blue.opacity(0.1))
            .cornerRadius(8)

            // Content
            if showOriginal {
                originalContent
            } else {
                translatedContent
            }

            // Powered By
            HStack(spacing: 4) {
                Text("Powered by")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)

                Text("Meeshy Translate")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.blue)
            }
        }
    }

    // MARK: - Original Content

    private var originalContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Original")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
                .textCase(.uppercase)

            Text(originalText)
                .font(.system(size: 17))
                .foregroundColor(.primary)
                .opacity(0.7)
        }
    }

    // MARK: - Translated Content

    private var translatedContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Translation")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
                .textCase(.uppercase)

            Text(translatedText)
                .font(.system(size: 17, weight: .medium))
                .foregroundColor(.primary)
        }
    }
}

// MARK: - Language Model

struct TranslationLanguage: Codable, Identifiable, Hashable {
    let id: String
    let code: String
    let displayName: String
    let nativeName: String

    init(id: String = UUID().uuidString, code: String, displayName: String, nativeName: String) {
        self.id = id
        self.code = code
        self.displayName = displayName
        self.nativeName = nativeName
    }

    // Common Languages
    static let english = TranslationLanguage(code: "en", displayName: "English", nativeName: "English")
    static let spanish = TranslationLanguage(code: "es", displayName: "Spanish", nativeName: "Español")
    static let french = TranslationLanguage(code: "fr", displayName: "French", nativeName: "Français")
    static let german = TranslationLanguage(code: "de", displayName: "German", nativeName: "Deutsch")
    static let italian = TranslationLanguage(code: "it", displayName: "Italian", nativeName: "Italiano")
    static let portuguese = TranslationLanguage(code: "pt", displayName: "Portuguese", nativeName: "Português")
    static let russian = TranslationLanguage(code: "ru", displayName: "Russian", nativeName: "Русский")
    static let chinese = TranslationLanguage(code: "zh", displayName: "Chinese", nativeName: "中文")
    static let japanese = TranslationLanguage(code: "ja", displayName: "Japanese", nativeName: "日本語")
    static let korean = TranslationLanguage(code: "ko", displayName: "Korean", nativeName: "한국어")
    static let arabic = TranslationLanguage(code: "ar", displayName: "Arabic", nativeName: "العربية")
    static let hindi = TranslationLanguage(code: "hi", displayName: "Hindi", nativeName: "हिन्दी")

    static let allLanguages: [TranslationLanguage] = [
        .english, .spanish, .french, .german, .italian, .portuguese,
        .russian, .chinese, .japanese, .korean, .arabic, .hindi
    ]
}

// MARK: - Translation Model
// Local view model for displaying translations in the UI
struct ViewTranslation: Codable, Identifiable {
    let id: String
    let sourceLanguage: TranslationLanguage
    let targetLanguage: TranslationLanguage
    let translatedText: String
    let createdAt: Date

    init(
        id: String = UUID().uuidString,
        sourceLanguage: TranslationLanguage,
        targetLanguage: TranslationLanguage,
        translatedText: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.sourceLanguage = sourceLanguage
        self.targetLanguage = targetLanguage
        self.translatedText = translatedText
        self.createdAt = createdAt
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 20) {
        TranslationView(
            originalText: "Hola, ¿cómo estás?",
            translatedText: "Hello, how are you?",
            sourceLanguage: .spanish,
            targetLanguage: .english,
            onDismiss: {}
        )
        .padding()

        TranslationView(
            originalText: "This is a much longer message that demonstrates how the translation view handles multiple lines of text. It should wrap nicely and maintain good readability.",
            translatedText: "Este es un mensaje mucho más largo que demuestra cómo la vista de traducción maneja múltiples líneas de texto. Debería ajustarse bien y mantener una buena legibilidad.",
            sourceLanguage: .english,
            targetLanguage: .spanish,
            onDismiss: {}
        )
        .padding()
    }
}
