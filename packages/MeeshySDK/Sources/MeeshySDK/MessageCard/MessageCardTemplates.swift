import Foundation

/// **LES TEMPLATES D'UNE CARTE D'EXPORT** — le miroir iOS de
/// `apps/web/src/lib/export/message-card-templates.ts`.
///
/// Des centaines de cartes, composées de trois dimensions indépendantes :
/// la PALETTE (le fond, ses encres, l'accent et le filigrane), la TYPOGRAPHIE
/// (la police de la réponse et celle de la citation) et la LIAISON (la façon
/// dont la question mène à la réponse). 14 × 8 × 7 = 784 templates, chacun
/// nommé par un identifiant STABLE `palette.typographie.liaison` — les MÊMES
/// que sur le web : le compteur d'usage et le format par défaut les retiennent,
/// on n'en renomme donc aucun. `MessageCardTemplateParityTests` tient chaque
/// identifiant égal à la table web.
///
/// Les polices sont celles des STORIES iOS (`StoryTextStyle.fontName`), comme
/// celles du web sont celles de ses stories : la même typographie « Affiche »
/// dessine une story et une carte sur la même plateforme.

public struct MessageCardColor: Equatable, Hashable, Sendable {
    public let red: Double
    public let green: Double
    public let blue: Double
    public let alpha: Double

    public init(red: Double, green: Double, blue: Double, alpha: Double = 1) {
        self.red = red
        self.green = green
        self.blue = blue
        self.alpha = alpha
    }

    /// `#RRGGBB` — une valeur illisible rend le noir, jamais une exception.
    public static func hex(_ value: String) -> MessageCardColor {
        let digits = value.hasPrefix("#") ? String(value.dropFirst()) : value
        let rgb = UInt32(digits, radix: 16) ?? 0
        return MessageCardColor(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }

    public static func rgba(_ red: Int, _ green: Int, _ blue: Int, _ alpha: Double) -> MessageCardColor {
        MessageCardColor(red: Double(red) / 255, green: Double(green) / 255, blue: Double(blue) / 255, alpha: alpha)
    }

    public static let transparent = MessageCardColor.rgba(0, 0, 0, 0)
}

/// Une police de carte : la pile système (graisse CSS, italique) ou une police de story.
public enum MessageCardFace: Equatable, Hashable, Sendable {
    case native(weight: Int, italic: Bool)
    case story(StoryTextStyle)

    public static func system(_ weight: Int) -> MessageCardFace { .native(weight: weight, italic: false) }
}

/// Une police à un corps donné — ce que la mise en page mesure et ce que la peinture dessine.
public struct MessageCardFont: Equatable, Hashable, Sendable {
    public let face: MessageCardFace
    /// Arrondi au pixel, comme la chaîne `font` du canvas web.
    public let size: Double

    public init(face: MessageCardFace, size: Double) {
        self.face = face
        self.size = size.rounded()
    }
}

public struct MessageCardGradientStop: Equatable, Sendable {
    public let offset: Double
    public let color: MessageCardColor
}

public struct MessageCardPalette: Equatable, Sendable {
    /// Un nom PROPRE, identique dans les sept langues.
    public let name: String
    public let background: [MessageCardGradientStop]
    public let glow: MessageCardColor?
    public let replyInk: MessageCardColor
    public let quoteInk: MessageCardColor
    public let authorInk: MessageCardColor
    public let accent: MessageCardColor
    /// Le fond des bulles (liaison « bulles ») — la citation, puis la réponse.
    public let quotePanel: MessageCardColor
    public let replyPanel: MessageCardColor
    public let watermarkInk: MessageCardColor
    public let watermarkAlpha: Double
}

public struct MessageCardTypeface: Equatable, Sendable {
    public let replyFace: MessageCardFace
    public let quoteFace: MessageCardFace
    /// Un corps plus petit pour les polices étroites ou très hautes.
    public let replyScale: Double
}

public enum MessageCardPaletteID: String, CaseIterable, Sendable {
    case aurore, minuit, lagon, braise, foret, velours, ardoise
    case editorial, manuscrit, neige, peche, menthe, citron, lavande

    public var palette: MessageCardPalette {
        switch self {
        case .aurore: return .dark("Aurore", [(0, "#1B1340"), (0.55, "#2A1B5C"), (1, "#0E0A24")], glow: .rgba(236, 72, 153, 0.28), accent: "#A78BFA", author: "#F9A8D4")
        case .minuit: return .dark("Minuit", [(0, "#0B1020"), (1, "#111827")], glow: .rgba(59, 130, 246, 0.22), accent: "#60A5FA", author: "#93C5FD")
        case .lagon: return .dark("Lagon", [(0, "#042F2E"), (1, "#0F766E")], glow: .rgba(45, 212, 191, 0.25), accent: "#5EEAD4", author: "#99F6E4")
        case .braise: return .dark("Braise", [(0, "#1C0A05"), (0.6, "#431407"), (1, "#7C2D12")], glow: .rgba(251, 146, 60, 0.3), accent: "#FB923C", author: "#FDBA74")
        case .foret: return .dark("Forêt", [(0, "#052E16"), (1, "#14532D")], glow: .rgba(132, 204, 22, 0.2), accent: "#A3E635", author: "#BEF264")
        case .velours: return .dark("Velours", [(0, "#3B0764"), (1, "#701A75")], glow: .rgba(244, 114, 182, 0.3), accent: "#F0ABFC", author: "#F5D0FE")
        case .ardoise: return .dark("Ardoise", [(0, "#18181B"), (1, "#27272A")], glow: nil, accent: "#E4E4E7", author: "#A1A1AA")
        case .editorial: return .light("Éditorial", [(0, "#FBF8F1"), (1, "#F1EADB")], glow: nil, ink: "#1C1917", quote: "#78716C", accent: "#1C1917", author: "#9A3412")
        case .manuscrit: return .light("Manuscrit", [(0, "#FFF4E0"), (1, "#FDE2C3")], glow: .rgba(251, 146, 60, 0.22), ink: "#3B2314", quote: "#8A6A55", accent: "#EA580C", author: "#C2410C")
        case .neige:
            // Un fond déjà blanc : ses bulles se teintent d'encre plutôt que de blanc.
            return .light("Neige", [(0, "#FFFFFF"), (1, "#F1F5F9")], glow: nil, ink: "#0F172A", quote: "#64748B", accent: "#6366F1", author: "#4F46E5",
                          quotePanel: .rgba(15, 23, 42, 0.05), replyPanel: .rgba(99, 102, 241, 0.08))
        case .peche: return .light("Pêche", [(0, "#FFE4E6"), (1, "#FECDD3")], glow: .rgba(255, 255, 255, 0.5), ink: "#4C0519", quote: "#9F1239", accent: "#E11D48", author: "#BE123C")
        case .menthe: return .light("Menthe", [(0, "#ECFDF5"), (1, "#D1FAE5")], glow: nil, ink: "#064E3B", quote: "#047857", accent: "#10B981", author: "#047857")
        case .citron: return .light("Citron", [(0, "#FEFCE8"), (1, "#FEF08A")], glow: nil, ink: "#422006", quote: "#854D0E", accent: "#CA8A04", author: "#A16207")
        case .lavande: return .light("Lavande", [(0, "#F5F3FF"), (1, "#DDD6FE")], glow: .rgba(255, 255, 255, 0.45), ink: "#2E1065", quote: "#6D28D9", accent: "#7C3AED", author: "#6D28D9")
        }
    }
}

public enum MessageCardTypefaceID: String, CaseIterable, Sendable {
    case rond, didone, plume, affiche, futur, machine, marqueur, systeme

    public var typeface: MessageCardTypeface {
        switch self {
        case .rond: return MessageCardTypeface(replyFace: .story(.bubble), quoteFace: .native(weight: 400, italic: true), replyScale: 1)
        case .didone: return MessageCardTypeface(replyFace: .story(.elegant), quoteFace: .story(.elegant), replyScale: 1)
        case .plume: return MessageCardTypeface(replyFace: .story(.brush), quoteFace: .story(.note), replyScale: 1.08)
        case .affiche: return MessageCardTypeface(replyFace: .story(.poster), quoteFace: .system(500), replyScale: 1)
        case .futur: return MessageCardTypeface(replyFace: .story(.futuristic), quoteFace: .system(400), replyScale: 1.04)
        case .machine: return MessageCardTypeface(replyFace: .story(.retro), quoteFace: .story(.retro), replyScale: 0.92)
        case .marqueur: return MessageCardTypeface(replyFace: .story(.tag), quoteFace: .story(.note), replyScale: 0.9)
        case .systeme: return MessageCardTypeface(replyFace: .system(700), quoteFace: .native(weight: 400, italic: true), replyScale: 1)
        }
    }
}

public enum MessageCardLinkID: String, CaseIterable, Sendable {
    case orbite, filet, guillemets, fleche, bulles, fil, silence
}

/// `palette.typographie.liaison` — l'identifiant stable d'un template.
public struct MessageCardTemplateID: Hashable, Sendable, CustomStringConvertible {
    public let palette: MessageCardPaletteID
    public let typeface: MessageCardTypefaceID
    public let link: MessageCardLinkID

    public init(palette: MessageCardPaletteID, typeface: MessageCardTypefaceID, link: MessageCardLinkID) {
        self.palette = palette
        self.typeface = typeface
        self.link = link
    }

    /// Lit un identifiant venu du stockage : `nil` s'il ne nomme aucun template (renommé, abîmé).
    public init?(rawValue: String) {
        let parts = rawValue.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 3,
              let palette = MessageCardPaletteID(rawValue: parts[0]),
              let typeface = MessageCardTypefaceID(rawValue: parts[1]),
              let link = MessageCardLinkID(rawValue: parts[2]) else { return nil }
        self.init(palette: palette, typeface: typeface, link: link)
    }

    public var rawValue: String { "\(palette.rawValue).\(typeface.rawValue).\(link.rawValue)" }
    public var description: String { rawValue }

    public func with(palette: MessageCardPaletteID? = nil, typeface: MessageCardTypefaceID? = nil, link: MessageCardLinkID? = nil) -> MessageCardTemplateID {
        MessageCardTemplateID(palette: palette ?? self.palette, typeface: typeface ?? self.typeface, link: link ?? self.link)
    }
}

public enum MessageCardTemplates {

    public static let all: [MessageCardTemplateID] = MessageCardPaletteID.allCases.flatMap { palette in
        MessageCardTypefaceID.allCases.flatMap { typeface in
            MessageCardLinkID.allCases.map { MessageCardTemplateID(palette: palette, typeface: typeface, link: $0) }
        }
    }

    /// La vitrine d'un appareil qui n'a encore rien exporté : un template par caractère.
    public static let featured: [MessageCardTemplateID] = [
        MessageCardTemplateID(palette: .aurore, typeface: .rond, link: .orbite),
        MessageCardTemplateID(palette: .editorial, typeface: .didone, link: .guillemets),
        MessageCardTemplateID(palette: .manuscrit, typeface: .plume, link: .fil),
        MessageCardTemplateID(palette: .minuit, typeface: .affiche, link: .fleche),
        MessageCardTemplateID(palette: .neige, typeface: .systeme, link: .bulles),
        MessageCardTemplateID(palette: .lagon, typeface: .futur, link: .filet),
    ]

    public static let defaultID = MessageCardTemplateID(palette: .aurore, typeface: .rond, link: .orbite)

    /// La police des grands guillemets de la liaison « guillemets » — une didone, quelle que soit la typographie.
    public static let guillemetFace: MessageCardFace = .story(.elegant)

    /// Un template tiré au hasard — `random` rend un nombre de [0, 1), injecté pour que le témoin le fixe.
    public static func random(_ random: () -> Double = { Double.random(in: 0..<1) }) -> MessageCardTemplateID {
        let index = min(all.count - 1, max(0, Int((random() * Double(all.count)).rounded(.down))))
        return all[index]
    }
}

private extension MessageCardPalette {
    static let darkQuoteInk = MessageCardColor.rgba(255, 255, 255, 0.66)

    static func stops(_ values: [(Double, String)]) -> [MessageCardGradientStop] {
        values.map { MessageCardGradientStop(offset: $0.0, color: .hex($0.1)) }
    }

    static func dark(_ name: String, _ background: [(Double, String)], glow: MessageCardColor?, accent: String, author: String) -> MessageCardPalette {
        MessageCardPalette(
            name: name,
            background: stops(background),
            glow: glow,
            replyInk: .hex("#FFFFFF"),
            quoteInk: darkQuoteInk,
            authorInk: .hex(author),
            accent: .hex(accent),
            quotePanel: .rgba(255, 255, 255, 0.08),
            replyPanel: .rgba(255, 255, 255, 0.14),
            watermarkInk: .hex("#FFFFFF"),
            watermarkAlpha: 0.05
        )
    }

    static func light(
        _ name: String, _ background: [(Double, String)], glow: MessageCardColor?,
        ink: String, quote: String, accent: String, author: String,
        quotePanel: MessageCardColor = .rgba(255, 255, 255, 0.55),
        replyPanel: MessageCardColor = .rgba(255, 255, 255, 0.85)
    ) -> MessageCardPalette {
        MessageCardPalette(
            name: name,
            background: stops(background),
            glow: glow,
            replyInk: .hex(ink),
            quoteInk: .hex(quote),
            authorInk: .hex(author),
            accent: .hex(accent),
            quotePanel: quotePanel,
            replyPanel: replyPanel,
            watermarkInk: .hex(ink),
            watermarkAlpha: 0.05
        )
    }
}
