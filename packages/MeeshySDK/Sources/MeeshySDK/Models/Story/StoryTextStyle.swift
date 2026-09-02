import Foundation

// MARK: - Story Text Style

public enum StoryTextStyle: String, Codable, CaseIterable, Sendable {
    case bold
    case neon
    case typewriter
    case handwriting
    case classic
    case calligraphy
    case cartoon
    case futuristic
    case fantasy
    case curve
    case tag
    // ── Extension à 18 familles (2026-08-20) ─────────────────────────────
    // `italic` et `retro` ne sont PAS des inventions : c'est le vocabulaire
    // HISTORIQUE du lecteur (`fontForStyle`, chemin texte simple), que des
    // stories publiées portent déjà sans que le composer sache le produire —
    // sur le canvas ces valeurs retombaient en `.bold` via `parsedTextStyle`.
    // Les cinq autres complètent la famille à 18, toutes sur des polices
    // EMBARQUÉES iOS (vérifiées par test : chaque nom PostScript doit
    // résoudre, sinon le repli serif rendrait la typo invisible).
    // Ajoutées EN QUEUE : l'ordre de `allCases` est l'ordre du cycle
    // d'attributs et des pickers — insérer au milieu déplacerait les habitudes.
    case italic
    case retro
    case elegant
    case poster
    case bubble
    case note
    case brush

    public var displayName: String {
        switch self {
        case .bold: return "Bold"
        case .neon: return "Neon"
        case .typewriter: return "Typewriter"
        case .handwriting: return "Handwriting"
        case .classic: return "Classic"
        case .calligraphy: return "Calligraphie"
        case .cartoon: return "Cartoon"
        case .futuristic: return "Futuriste"
        case .fantasy: return "Fantaisie"
        case .curve: return "Curve"
        case .tag: return "Tag"
        case .italic: return "Italique"
        case .retro: return "Rétro"
        case .elegant: return "Élégant"
        case .poster: return "Affiche"
        case .bubble: return "Bulle"
        case .note: return "Note"
        case .brush: return "Pinceau"
        }
    }

    public var fontName: String? {
        switch self {
        case .bold: return nil
        case .neon: return nil
        case .typewriter: return "Courier"
        case .handwriting: return "SnellRoundhand"
        case .classic: return "Georgia"
        case .calligraphy: return "Zapfino"
        case .cartoon: return "ChalkboardSE-Bold"
        case .futuristic: return "Futura-CondensedExtraBold"
        case .fantasy: return "Papyrus"
        case .curve: return "SavoyeLetPlain"
        case .tag: return "MarkerFelt-Wide"
        case .italic: return "Georgia-Italic"
        case .retro: return "AmericanTypewriter"
        case .elegant: return "Didot"
        case .poster: return "AvenirNextCondensed-Heavy"
        case .bubble: return "ArialRoundedMTBold"
        case .note: return "Noteworthy-Bold"
        case .brush: return "BradleyHandITCTT-Bold"
        }
    }

    public var fontWeight: Int {
        switch self {
        case .bold: return 800
        case .neon: return 600
        case .typewriter: return 400
        case .handwriting: return 400
        case .classic: return 500
        case .calligraphy: return 400
        case .cartoon: return 700
        case .futuristic: return 800
        case .fantasy: return 400
        case .curve: return 400
        case .tag: return 700
        case .italic: return 400
        case .retro: return 400
        case .elegant: return 400
        case .poster: return 800
        case .bubble: return 700
        case .note: return 700
        case .brush: return 700
        }
    }
}

// MARK: - Story Text Weight

/// Independent font-weight override for a `StoryTextObject`. `nil` on the object
/// means "derive the weight from `textStyle`" (legacy behavior); a non-nil value
/// lets the user pick fin / normal / semi-gras / gras regardless of style.
public enum StoryTextWeight: String, Codable, CaseIterable, Sendable {
    case thin       // fin
    case normal     // normal
    case semibold   // semi-gras
    case bold       // gras
}
