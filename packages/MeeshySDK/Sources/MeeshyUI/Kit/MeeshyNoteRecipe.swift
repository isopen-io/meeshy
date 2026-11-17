import Foundation

/// Les quatre formes de la note : en ligne, bande teintée à filet, bandeau pleine
/// largeur, donnée en direct.
public nonisolated enum MeeshyNoteForm: String, Sendable, Equatable, CaseIterable {
    case line
    case band
    case banner
    case live
}

/// Un SENS : il teinte la tête, le filet et le fond, jamais seul porteur — un
/// glyphe et des mots le doublent.
public nonisolated enum MeeshyNoteKind: String, Sendable, Equatable, CaseIterable {
    case neutral
    case info
    case ok
    case warn
    case security
}

/// La tête de la note : un glyphe, un point fixe, un point qui pulse, ou rien.
public nonisolated enum MeeshyNoteLead: Sendable, Equatable {
    case systemImage(String)
    case dot
    case pulse
    case none
}

public nonisolated enum MeeshyNoteSize: String, Sendable, Equatable, CaseIterable {
    case compact
    case regular
}

/// La tête telle que la recette la rend : le glyphe à poser, le point (qui bat ou
/// non), ou rien.
public nonisolated enum MeeshyNoteResolvedLead: Sendable, Equatable {
    case glyph(String)
    case dot(pulsing: Bool)
    case none
}

/// Le conteneur d'une forme : aucun (ligne, direct), la bande teintée, le
/// bandeau pleine largeur.
public nonisolated enum MeeshyNoteContainer: String, Sendable, Equatable {
    case none
    case tinted
    case full
}

/// **La recette de K46 en VALEURS** : phrase, tête, conteneur, filet par forme.
/// Aucune horloge, aucun réseau : la fraîcheur d'une donnée en direct est dite par
/// l'hôte (`isStale`).
public nonisolated struct MeeshyNoteRecipe: Sendable, Equatable {

    public static let lineHeightMultiplier: Double = 1.4
    public static let detailSize: Double = 12.5
    public static let dotSize: Double = 9
    public static let wrapWidth: Double = 320
    public static let actionTapHeight: Double = 44
    public static let bandRadius: Double = 16
    public static let bandTintPercent = 10
    public static let bandRule: Double = 3
    public static let bannerMinimumHeight: Double = 48
    public static let bannerBottomRule: Double = 1

    public let form: MeeshyNoteForm
    public let inkKind: MeeshyNoteKind
    public let lead: MeeshyNoteResolvedLead
    public let phraseSize: Double
    public let leadSize: Double
    public let container: MeeshyNoteContainer
    public let ruleWidth: Double
    public let minimumHeight: Double
    public let cornerRadius: Double
    public let tintPercent: Int
    public let bottomRuleWidth: Double
    public let showsDetail: Bool
    public let actionWrapsBelow: Bool
    public let actionTapHeight: Double
    public let animatesHeight: Bool

    public static func resolve(form: MeeshyNoteForm,
                               kind: MeeshyNoteKind,
                               lead: MeeshyNoteLead?,
                               size: MeeshyNoteSize,
                               isStale: Bool,
                               hasDetail: Bool,
                               hasAction: Bool,
                               width: Double,
                               reduceMotion: Bool) -> MeeshyNoteRecipe {
        let canPulse = !isStale && !reduceMotion
        let resolvedLead = resolveLead(lead, form: form, kind: kind, canPulse: canPulse)
        return MeeshyNoteRecipe(
            form: form,
            inkKind: isStale ? .neutral : kind,
            lead: resolvedLead,
            phraseSize: phraseSize(of: form),
            leadSize: leadSize(of: form, lead: resolvedLead),
            container: container(of: form),
            ruleWidth: form == .band ? bandRule : 0,
            minimumHeight: form == .banner ? bannerMinimumHeight : 0,
            cornerRadius: form == .band ? bandRadius : 0,
            tintPercent: form == .band ? bandTintPercent : 0,
            bottomRuleWidth: form == .banner ? bannerBottomRule : 0,
            showsDetail: hasDetail && (form == .band || form == .banner),
            actionWrapsBelow: hasAction && width < wrapWidth,
            actionTapHeight: hasAction ? actionTapHeight : 0,
            animatesHeight: form == .banner && !reduceMotion
        )
    }

    private static func resolveLead(_ lead: MeeshyNoteLead?, form: MeeshyNoteForm, kind: MeeshyNoteKind,
                                    canPulse: Bool) -> MeeshyNoteResolvedLead {
        switch lead {
        case .some(.systemImage(let name)): return .glyph(name)
        case .some(.dot): return .dot(pulsing: false)
        case .some(.pulse): return .dot(pulsing: canPulse)
        case .some(.none): return .none
        case nil: return form == .live ? .dot(pulsing: canPulse) : .glyph(defaultGlyph(for: kind))
        }
    }

    /// La tête par défaut d'un sens : un glyphe, jamais la couleur seule.
    public static func defaultGlyph(for kind: MeeshyNoteKind) -> String {
        switch kind {
        case .neutral: return "circle"
        case .info: return "info.circle"
        case .ok: return "checkmark.circle"
        case .warn: return "exclamationmark.triangle"
        case .security: return "lock.shield"
        }
    }

    private static func phraseSize(of form: MeeshyNoteForm) -> Double {
        switch form {
        case .line: return 12.5
        case .band: return 13
        case .banner: return 14
        case .live: return 13.5
        }
    }

    private static func leadSize(of form: MeeshyNoteForm, lead: MeeshyNoteResolvedLead) -> Double {
        if case .dot = lead { return dotSize }
        return form == .banner ? 22 : 16
    }

    private static func container(of form: MeeshyNoteForm) -> MeeshyNoteContainer {
        switch form {
        case .line, .live: return .none
        case .band: return .tinted
        case .banner: return .full
        }
    }

    /// La phrase d'une ligne de liste : 13 compacte, 14,5 normale.
    public static func listPhraseSize(_ size: MeeshyNoteSize) -> Double {
        size == .compact ? 13 : 14.5
    }

    /// Seul `warn` s'annonce à son arrivée, sauf avis contraire de l'hôte.
    public static func announces(kind: MeeshyNoteKind, override: Bool?) -> Bool {
        override ?? (kind == .warn)
    }

    /// Une annonce part une fois par arrivée d'un sens : une phrase qui change
    /// sans changer de sens ne se redit pas.
    public static func shouldAnnounce(previous: MeeshyNoteKind?, current: MeeshyNoteKind, override: Bool?) -> Bool {
        previous != current && announces(kind: current, override: override)
    }

    /// La phrase, la valeur en gras où qu'elle tombe ; sans valeur trouvée, intacte.
    public static func attributedPhrase(_ text: String, emphasis: String?) -> AttributedString {
        var attributed = AttributedString(text)
        guard let emphasis, !emphasis.isEmpty, let range = attributed.range(of: emphasis) else {
            return attributed
        }
        attributed[range].inlinePresentationIntent = .stronglyEmphasized
        return attributed
    }
}
