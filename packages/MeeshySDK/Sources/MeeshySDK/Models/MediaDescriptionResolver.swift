import Foundation

/// La description servie d'un média (#12333) — miroir EXACT de
/// `resolveMediaDescription` (`packages/shared/utils/media-description.ts`),
/// qui sert le web : le PREMIER RANG du prisme du lecteur que l'une des deux
/// sources sert — la description de l'AUTEUR d'abord, puis la TRANSCRIPTION,
/// à chaque rang (une langue est servie par une traduction, ou parce que la
/// source est déjà écrite dedans). Aucun rang servi : l'original de l'auteur,
/// sinon celui de la transcription. Jamais la première traduction venue
/// (Prisme, règles 1 et 3). Une pièce protégée ne se décrit pas.
public enum MediaDescriptionResolver {

    public struct Source: Sendable, Equatable {
        public let original: String
        public let language: String?
        public let translations: [String: String]

        public init(original: String, language: String?, translations: [String: String]) {
            self.original = original
            self.language = language
            self.translations = translations
        }
    }

    public struct Served: Sendable, Equatable {
        public let text: String
        public let language: String?
        public let translated: Bool
    }

    public static func resolve(author: Source?, transcript: Source?, preferredLanguages: [String], isProtected: Bool) -> Served? {
        guard !isProtected else { return nil }
        let sources = [author, transcript].compactMap { $0 }.filter { !$0.original.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard let first = sources.first else { return nil }
        for rank in preferredLanguages {
            guard let wanted = MeeshyUser.normalizeLanguageCode(rank) else { continue }
            for source in sources {
                if MeeshyUser.normalizeLanguageCode(source.language) == wanted {
                    return Served(text: source.original, language: source.language, translated: false)
                }
                if let match = source.translations.first(where: { MeeshyUser.normalizeLanguageCode($0.key) == wanted && !$0.value.isEmpty }) {
                    return Served(text: match.value, language: match.key, translated: true)
                }
            }
        }
        return Served(text: first.original, language: first.language, translated: false)
    }
}

public extension MeeshyMessageAttachment {
    /// La description que VoiceOver dit à la place de cette pièce, dans la
    /// langue du lecteur. `nil` sous protection (vue unique, flou, chiffrement)
    /// ou quand la pièce n'a ni description ni transcription.
    func servedDescription(preferredLanguages: [String]) -> MediaDescriptionResolver.Served? {
        let author = alt.flatMap { text -> MediaDescriptionResolver.Source? in
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : MediaDescriptionResolver.Source(original: trimmed, language: altLanguage, translations: altTranslations ?? [:])
        }
        let transcript = transcription.map { embedded in
            MediaDescriptionResolver.Source(
                original: embedded.text,
                language: embedded.language,
                translations: (audioTranslations ?? [:]).compactMapValues { $0.transcription }
            )
        }
        return MediaDescriptionResolver.resolve(
            author: author,
            transcript: transcript,
            preferredLanguages: preferredLanguages,
            isProtected: isViewOnce || isBlurred || isEncrypted
        )
    }
}
