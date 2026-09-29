import Foundation
import MeeshySDK

/// Les onglets du plateau de l'atelier « Imagine » — un seul panneau à la fois.
/// Miroir de `ExportTab` (`apps/web/src/routes/thread-export-tray.tsx`).
///
/// L'ORDRE est celui du porteur (#8692) : le format de l'image se choisit en
/// tête des réglages, et « Frame » — la disposition — vient AVANT « Fond ».
enum MessageCardExportTab: String, CaseIterable, Identifiable {
    case styles, format, frame, palette, typeface, link, media, details, language

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .styles: return "square.grid.2x2"
        case .format: return "aspectratio"
        case .frame: return "rectangle.dashed"
        case .palette: return "paintpalette"
        case .typeface: return "textformat"
        case .link: return "arrow.turn.down.right"
        case .media: return "photo.on.rectangle"
        case .details: return "slider.horizontal.3"
        case .language: return "globe"
        }
    }

    var label: String {
        switch self {
        case .styles: return MessageCardExportText.text("export.card.tab.styles", "Styles")
        case .format: return MessageCardExportText.text("export.card.tab.format", "Format")
        case .frame: return MessageCardExportText.text("export.card.tab.frame", "Frame")
        case .palette: return MessageCardExportText.text("export.card.tab.palette", "Fond")
        case .typeface: return MessageCardExportText.text("export.card.tab.typeface", "Police")
        case .link: return MessageCardExportText.text("export.card.tab.link", "Liaison")
        case .media: return MessageCardExportText.text("export.card.tab.media", "Médias")
        case .details: return MessageCardExportText.text("export.card.tab.details", "Détails")
        case .language: return MessageCardExportText.text("export.card.tab.language", "Langue")
        }
    }

    /// L'onglet qui règle la partie touchée sur l'aperçu.
    static func of(_ part: MessageCardPartID) -> MessageCardExportTab {
        switch part {
        case .background: return .palette
        case .header: return .frame
        case .quote, .reply: return .typeface
        case .link: return .link
        case .media: return .media
        }
    }

    /// Les onglets qu'un contenu OFFRE : « Médias » n'existe qu'avec un média,
    /// « Langue » qu'avec une seconde langue.
    static func offered(hasMedia: Bool, languageCount: Int) -> [MessageCardExportTab] {
        allCases.filter { tab in
            switch tab {
            case .media: return hasMedia
            case .language: return languageCount > 1
            default: return true
            }
        }
    }
}

/// Les libellés de l'atelier « Imagine » — les MÊMES clés que le catalogue web
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
        case .media: return text("export.card.part.media", "Médias")
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
        case .showTimes: return text("export.card.option.times", "Heures des messages")
        case .useHandles: return text("export.card.option.handles", "Pseudo au lieu du nom")
        }
    }

    static func aspectLabel(_ aspect: MessageCardAspect) -> String {
        switch aspect {
        case .auto: return text("export.card.aspect.auto", "Auto")
        case .story: return text("export.card.aspect.story", "Story")
        case .portrait: return text("export.card.aspect.portrait", "Portrait")
        case .square: return text("export.card.aspect.square", "Carré")
        case .landscape: return text("export.card.aspect.landscape", "Paysage")
        }
    }

    static func headerLabel(_ orientation: MessageCardHeaderOrientation) -> String {
        switch orientation {
        case .horizontal: return text("export.card.header.horizontal", "En ligne")
        case .stacked: return text("export.card.header.stacked", "Lettre à lettre")
        case .rotatedUp: return text("export.card.header.rotatedUp", "Vers le haut")
        case .rotatedDown: return text("export.card.header.rotatedDown", "Vers le bas")
        }
    }

    static func placementLabel(_ placement: MessageCardAuthorPlacement) -> String {
        switch placement {
        case .above: return text("export.card.names.above", "Noms au-dessus")
        case .after: return text("export.card.names.after", "Noms à la fin")
        }
    }

    static func tiltLabel(_ tilt: MessageCardTilt) -> String {
        switch tilt {
        case .none: return text("export.card.tilt.none", "Droit")
        case .left: return text("export.card.tilt.left", "Penché à gauche")
        case .right: return text("export.card.tilt.right", "Penché à droite")
        }
    }

    static func mediaLayoutLabel(_ layout: MessageCardMediaLayout) -> String {
        switch layout {
        case .above: return text("export.card.media.above", "Au-dessus")
        case .below: return text("export.card.media.below", "Au-dessous")
        case .mosaic: return text("export.card.media.mosaic", "Mosaïque")
        case .backdrop: return text("export.card.media.backdrop", "En fond")
        }
    }

    static func audioStyleLabel(_ style: MessageCardAudioStyle) -> String {
        switch style {
        case .wave: return text("export.card.audio.wave", "Onde")
        case .pill: return text("export.card.audio.pill", "Pastille")
        case .spectrum: return text("export.card.audio.spectrum", "Spectre")
        case .ticket: return text("export.card.audio.ticket", "Fiche")
        }
    }

    static func outputLabel(_ output: MessageCardOutput) -> String {
        switch output {
        case .image: return text("export.card.output.image", "Image")
        case .gif: return text("export.card.output.gif", "GIF")
        case .video: return text("export.card.output.video", "Vidéo")
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

/// Les pictogrammes des choix de l'atelier — un site, pour les tuiles et leurs témoins.
enum MessageCardExportSymbols {

    static func header(_ orientation: MessageCardHeaderOrientation) -> String {
        switch orientation {
        case .horizontal: return "text.alignleft"
        case .stacked: return "textformat.abc"
        case .rotatedUp: return "arrow.up"
        case .rotatedDown: return "arrow.down"
        }
    }

    static func tilt(_ tilt: MessageCardTilt) -> String {
        switch tilt {
        case .none: return "rectangle"
        case .left: return "rotate.left"
        case .right: return "rotate.right"
        }
    }

    static func mediaLayout(_ layout: MessageCardMediaLayout) -> String {
        switch layout {
        case .above: return "rectangle.tophalf.inset.filled"
        case .below: return "rectangle.bottomhalf.inset.filled"
        case .mosaic: return "square.grid.2x2"
        case .backdrop: return "photo.fill"
        }
    }

    static func audioStyle(_ style: MessageCardAudioStyle) -> String {
        switch style {
        case .wave: return "waveform"
        case .pill: return "play.circle"
        case .spectrum: return "chart.bar.fill"
        case .ticket: return "music.note.list"
        }
    }

    static func output(_ output: MessageCardOutput) -> String {
        switch output {
        case .image: return "photo"
        case .gif: return "square.stack.3d.forward.dottedline"
        case .video: return "film"
        }
    }
}
