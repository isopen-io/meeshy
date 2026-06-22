import Foundation
import NaturalLanguage

/// Détection de langue on-device (stateless) pour fixer `originalLanguage` à
/// l'émission. Atome SDK : entrée opaque (texte) → code ISO 639-1.
public enum LanguageDetection {
    /// Nombre minimum de lettres pour tenter une détection.
    public static let minAlphaCount = 4
    /// Confiance minimale de la langue dominante.
    public static let minConfidence = 0.65

    public static func detectLanguageCode(for text: String, fallback: String?) -> String? {
        let alpha = text.unicodeScalars.filter { CharacterSet.letters.contains($0) }.count
        guard alpha >= minAlphaCount else { return MeeshyUser.normalizeLanguageCode(fallback) }

        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)
        guard let dominant = recognizer.dominantLanguage else {
            return MeeshyUser.normalizeLanguageCode(fallback)
        }
        let confidence = recognizer.languageHypotheses(withMaximum: 1)[dominant] ?? 0
        guard confidence >= minConfidence else {
            return MeeshyUser.normalizeLanguageCode(fallback)
        }
        return MeeshyUser.normalizeLanguageCode(dominant.rawValue)
            ?? MeeshyUser.normalizeLanguageCode(fallback)
    }
}
