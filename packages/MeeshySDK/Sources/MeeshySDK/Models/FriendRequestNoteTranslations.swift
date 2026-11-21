import Foundation

/// Les traductions du mot d'une demande d'ami (#19460, servies par #19258) : par langue (code en minuscules), le texte.
/// Lues avec indulgence sous les trois formes que la passerelle peut servir — une carte `{ "fr": "…" }`, une entrée
/// `{ language, text }` ou une liste d'entrées — ; une langue ou un texte vide se saute, une forme inattendue vaut
/// « aucune », jamais la perte de la demande entière.
public struct FriendRequestNoteTranslations: Codable, Sendable, Equatable {
    public let texts: [String: String]

    public init(_ texts: [String: String]) {
        self.texts = texts.reduce(into: [String: String]()) { kept, pair in
            let language = pair.key.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let text = pair.value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !language.isEmpty, !text.isEmpty, kept[language] == nil else { return }
            kept[language] = text
        }
    }

    private struct Entry: Decodable {
        let language: String?
        let text: String?

        private enum CodingKeys: String, CodingKey {
            case language, targetLanguage, text, translatedContent
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            let language = (try? container.decodeIfPresent(String.self, forKey: .language))
                ?? (try? container.decodeIfPresent(String.self, forKey: .targetLanguage))
            let text = (try? container.decodeIfPresent(String.self, forKey: .text))
                ?? (try? container.decodeIfPresent(String.self, forKey: .translatedContent))
            self.language = language
            self.text = text
        }

        var pair: (String, String)? {
            guard let language, let text else { return nil }
            return (language, text)
        }
    }

    public init(from decoder: Decoder) throws {
        guard let single = try? decoder.singleValueContainer() else {
            self.init([:])
            return
        }
        if let entry = try? single.decode(Entry.self), let pair = entry.pair {
            self.init([pair.0: pair.1])
        } else if let map = try? single.decode([String: String].self) {
            self.init(map)
        } else if let list = try? single.decode([Entry].self) {
            self.init(Dictionary(list.compactMap(\.pair), uniquingKeysWith: { first, _ in first }))
        } else {
            self.init([:])
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(texts)
    }
}
