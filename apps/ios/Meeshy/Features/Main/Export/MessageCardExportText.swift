import Foundation
import MeeshySDK

/// Les onglets du plateau du composer d'export — un seul panneau à la fois.
/// Miroir de `ExportTab` (`apps/web/src/routes/thread-export-tray.tsx`).
enum MessageCardExportTab: String, CaseIterable, Identifiable {
    case styles, palette, typeface, link, details, language

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .styles: return "square.grid.2x2"
        case .palette: return "paintpalette"
        case .typeface: return "textformat"
        case .link: return "arrow.turn.down.right"
        case .details: return "slider.horizontal.3"
        case .language: return "globe"
        }
    }

    var label: String {
        switch self {
        case .styles: return MessageCardExportText.text("export.card.tab.styles", "Styles")
        case .palette: return MessageCardExportText.text("export.card.tab.palette", "Fond")
        case .typeface: return MessageCardExportText.text("export.card.tab.typeface", "Police")
        case .link: return MessageCardExportText.text("export.card.tab.link", "Liaison")
        case .details: return MessageCardExportText.text("export.card.tab.details", "Détails")
        case .language: return MessageCardExportText.text("export.card.tab.language", "Langue")
        }
    }

    /// L'onglet qui règle la partie touchée sur l'aperçu.
    static func of(_ part: MessageCardPartID) -> MessageCardExportTab {
        switch part {
        case .background: return .palette
        case .header: return .details
        case .quote, .reply: return .typeface
        case .link: return .link
        }
    }
}

/// Les libellés du composer d'export — les MÊMES clés que le catalogue web
/// `catalog-export-card-<langue>.ts`, servies par `Localizable.xcstrings`.
enum MessageCardExportText {

    static func text(_ key: StaticString, _ fallback: String.LocalizationValue) -> String {
        String(localized: key, defaultValue: fallback, bundle: .main)
    }

    static func partLabel(_ part: MessageCardPartID) -> String {
        switch part {
        case .header: return text("export.card.part.header", "En-tête")
        case .quote: return text("export.card.part.quote", "Citation")
        case .link: return text("export.card.part.link", "Liaison")
        case .reply: return text("export.card.part.reply", "Réponse")
        case .background: return text("export.card.part.background", "Fond")
        }
    }

    static func templateLabel(_ id: MessageCardTemplateID) -> String {
        "\(id.palette.palette.name) · \(typefaceLabel(id.typeface)) · \(linkLabel(id.link))"
    }

    static func typefaceLabel(_ typeface: MessageCardTypefaceID) -> String {
        switch typeface {
        case .rond: return text("export.card.typeface.rond", "Ronde")
        case .didone: return text("export.card.typeface.didone", "Didone")
        case .plume: return text("export.card.typeface.plume", "Plume")
        case .affiche: return text("export.card.typeface.affiche", "Affiche")
        case .futur: return text("export.card.typeface.futur", "Futuriste")
        case .machine: return text("export.card.typeface.machine", "Machine à écrire")
        case .marqueur: return text("export.card.typeface.marqueur", "Marqueur")
        case .systeme: return text("export.card.typeface.systeme", "Système")
        }
    }

    static func linkLabel(_ link: MessageCardLinkID) -> String {
        switch link {
        case .orbite: return text("export.card.link.orbite", "Orbite")
        case .filet: return text("export.card.link.filet", "Filet")
        case .guillemets: return text("export.card.link.guillemets", "Guillemets")
        case .fleche: return text("export.card.link.fleche", "Flèche")
        case .bulles: return text("export.card.link.bulles", "Bulles")
        case .fil: return text("export.card.link.fil", "Fil")
        case .silence: return text("export.card.link.silence", "Silence")
        }
    }

    static func toneLabel(_ tone: MessageCardTone?) -> String {
        switch tone {
        case nil: return text("export.card.tone.all", "Tous")
        case .dark: return text("export.card.tone.dark", "Sombre")
        case .light: return text("export.card.tone.light", "Clair")
        }
    }

    static func toggleLabel(_ toggle: MessageCardFormat.Toggle) -> String {
        switch toggle {
        case .showConversationTitle: return text("export.card.option.title", "Titre de la conversation")
        case .showAuthors: return text("export.card.option.authors", "Noms des auteurs")
        case .showDate: return text("export.card.option.date", "Date")
        case .anonymizeQuoted: return text("export.card.option.anonymizeQuoted", "Anonymiser le message cité")
        case .anonymizeReply: return text("export.card.option.anonymizeReply", "Anonymiser la réponse")
        }
    }

    /// Les mots de la recherche de la galerie, dans la langue de l'interface.
    static var vocabulary: MessageCardVocabulary {
        MessageCardVocabulary(
            typeface: Dictionary(uniqueKeysWithValues: MessageCardTypefaceID.allCases.map { ($0, typefaceLabel($0)) }),
            link: Dictionary(uniqueKeysWithValues: MessageCardLinkID.allCases.map { ($0, linkLabel($0)) }),
            tone: [.dark: toneLabel(.dark), .light: toneLabel(.light)]
        )
    }
}
