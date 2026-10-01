import SwiftUI

// MARK: - EmojiDetector

public enum EmojiDetector {

    public enum EmojiOnlyResult: Equatable {
        case single
        case double
        case triple
        case quadruple
        case notEmojiOnly

        /// La taille d'un emoji dans un texte — la base des multiples (#9054).
        public static let inlineSize: CGFloat = 17

        /// ×4 jusqu'à deux emojis, ×3 à trois, ×2 à quatre (#9054).
        public var fontSize: CGFloat? {
            switch self {
            case .single, .double: return Self.inlineSize * 4
            case .triple: return Self.inlineSize * 3
            case .quadruple: return Self.inlineSize * 2
            case .notEmojiOnly: return nil
            }
        }
    }

    public static func analyze(_ text: String) -> EmojiOnlyResult {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .notEmojiOnly }

        let characters = Array(trimmed)
        guard characters.count <= 4, characters.allSatisfy(\.isEmoji) else {
            return .notEmojiOnly
        }

        switch characters.count {
        case 1: return .single
        case 2: return .double
        case 3: return .triple
        case 4: return .quadruple
        default: return .notEmojiOnly
        }
    }
}

// MARK: - Character Emoji Detection

private extension Character {
    var isEmoji: Bool {
        guard let firstScalar = unicodeScalars.first else { return false }
        if firstScalar.properties.isEmoji && firstScalar.properties.isEmojiPresentation {
            return true
        }
        if unicodeScalars.count > 1 {
            return unicodeScalars.contains { $0.value == 0xFE0F || $0.value == 0x200D }
                || firstScalar.properties.isEmoji
        }
        return false
    }
}
