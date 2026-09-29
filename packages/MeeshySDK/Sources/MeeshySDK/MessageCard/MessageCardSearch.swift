import Foundation

/// **CHERCHER PARMI LES TEMPLATES** — miroir de
/// `apps/web/src/lib/export/message-card-search.ts`. La galerie du composer
/// montre des centaines de cartes ; on y cherche avec les MOTS que
/// l'utilisateur voit (le nom de la palette, de la typographie, de la liaison,
/// dans sa langue) et ceux du ton (« sombre », « clair »). La recherche ignore
/// la casse et les accents, et chaque mot tapé doit commencer un mot d'un
/// template : « pl sombre » trouve les cartes « Plume » sur fond sombre.
///
/// L'ORDRE DE LA GALERIE est le même que sur le web : les templates les plus
/// utilisés d'abord, puis un brassage où deux cartes voisines ne partagent ni
/// palette, ni typographie, ni liaison.

public enum MessageCardTone: String, CaseIterable, Sendable {
    case dark, light
}

public extension MessageCardPalette {
    /// Une palette sombre s'écrit en blanc ; une claire, à l'encre.
    var tone: MessageCardTone { replyInk == .hex("#FFFFFF") ? .dark : .light }
}

/// Les mots de l'interface qui nomment chaque dimension, dans la langue de l'utilisateur.
public struct MessageCardVocabulary: Sendable {
    public let typeface: [MessageCardTypefaceID: String]
    public let link: [MessageCardLinkID: String]
    public let tone: [MessageCardTone: String]

    public init(typeface: [MessageCardTypefaceID: String], link: [MessageCardLinkID: String], tone: [MessageCardTone: String]) {
        self.typeface = typeface
        self.link = link
        self.tone = tone
    }
}

public enum MessageCardSearch {

    public static func fold(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en")).lowercased()
    }

    static func tokens(_ text: String) -> [String] {
        fold(text)
            .split { !($0.isLetter || $0.isNumber) }
            .map(String.init)
    }

    /// Les mots d'un template, dans la langue de l'interface — et ses identifiants, stables d'une langue à l'autre.
    public static func words(of id: MessageCardTemplateID, vocabulary: MessageCardVocabulary) -> [String] {
        let palette = id.palette.palette
        return [
            palette.name,
            vocabulary.typeface[id.typeface] ?? "",
            vocabulary.link[id.link] ?? "",
            vocabulary.tone[palette.tone] ?? "",
            id.palette.rawValue,
            id.typeface.rawValue,
            id.link.rawValue,
        ].flatMap(tokens)
    }

    /// Les 784 templates dans l'ordre de la galerie : un brassage BIJECTIF, identique au web.
    public static let galleryOrder: [MessageCardTemplateID] = {
        let palettes = MessageCardPaletteID.allCases
        let typefaces = MessageCardTypefaceID.allCases
        let links = MessageCardLinkID.allCases
        return MessageCardTemplates.all.indices.map { k in
            let a = k % palettes.count
            let b = (k / palettes.count) % typefaces.count
            let c = (k / (palettes.count * typefaces.count)) % links.count
            return MessageCardTemplateID(
                palette: palettes[a],
                typeface: typefaces[(a + b) % typefaces.count],
                link: links[(a + b + c) % links.count]
            )
        }
    }()

    /// Les templates qui répondent à `query`, les plus utilisés en tête ; une requête vide les rend tous.
    public static func search(
        _ query: String,
        vocabulary: MessageCardVocabulary,
        usage: [MessageCardTemplateID: Int] = [:],
        tone: MessageCardTone? = nil
    ) -> [MessageCardTemplateID] {
        let terms = tokens(query)
        let matches = galleryOrder.filter { id in
            if let tone, id.palette.palette.tone != tone { return false }
            if terms.isEmpty { return true }
            let candidates = words(of: id, vocabulary: vocabulary)
            return terms.allSatisfy { term in candidates.contains { $0.hasPrefix(term) } }
        }
        let count: (MessageCardTemplateID) -> Int = { usage[$0] ?? 0 }
        let used = matches.enumerated()
            .filter { count($0.element) > 0 }
            .sorted { lhs, rhs in
                count(lhs.element) != count(rhs.element) ? count(lhs.element) > count(rhs.element) : lhs.offset < rhs.offset
            }
            .map(\.element)
        return used + matches.filter { count($0) == 0 }
    }
}
