import Foundation

/// Les cinq formes : titre de section, sur-titre de groupe, séparateur (un libellé
/// entre deux filets), étape numérotée, bandeau de colonne.
public nonisolated enum MeeshySectionHeaderForm: String, Sendable, Equatable, CaseIterable {
    case title
    case overline
    case divider
    case step
    case column
}

/// Le contexte de taille : la page (22), une feuille (19), une colonne large (26).
public nonisolated enum MeeshySectionHeaderSize: String, Sendable, Equatable, CaseIterable {
    case page
    case sheet
    case column
}

/// L'état d'une étape : faite (coche), en cours (aplat de la teinte), à faire (contour).
public nonisolated enum MeeshySectionHeaderStepState: String, Sendable, Equatable, CaseIterable {
    case done
    case current
    case todo
}

public nonisolated enum MeeshySectionHeaderStepAppearance: String, Sendable, Equatable {
    case check
    case filled
    case outlined
}

/// **La recette de K44 en VALEURS** : la police par forme et par taille, le
/// compteur accolé, la tête, le chevron de repli, la hauteur de la ligne (44 au
/// moins), l'appui, le témoin « en direct », l'accessoire qui passe dessous aux
/// grandes tailles. Un compteur absent ou nul ne rend ni nombre ni écart.
public nonisolated struct MeeshySectionHeaderRecipe: Sendable, Equatable {

    public static let countFontSize: Double = 16
    public static let countGap: Double = 8
    public static let minHeight: Double = 44
    public static let overlineFontSize: Double = 11
    public static let ruleGap: Double = 12
    public static let leadGap: Double = 10
    public static let liveDot: Double = 8
    public static let liveDotGap: Double = 10
    public static let pressVeilOpacity: Double = 0.09
    public static let pressedScale: Double = 0.985
    public static let largeTextScale: Double = 1.6
    /// Le détail de fin (« 4 arrêts ») : petit, secondaire, et il suit Dynamic Type.
    public static let detailFontSize: Double = 12.5

    public let form: MeeshySectionHeaderForm
    public let titleFontSize: Double
    public let countFontSize: Double
    public let showsCount: Bool
    public let countGap: Double
    public let leadingSize: Double
    public let minHeight: Double
    public let isUppercase: Bool
    public let showsRules: Bool
    public let ruleGap: Double
    public let showsChevron: Bool
    public let chevronDegrees: Double
    public let isWholeRowTappable: Bool
    public let pressVeil: Double
    public let pressScale: Double
    public let liveDotSize: Double
    public let liveDotGap: Double
    public let accessoryBelowTitle: Bool

    public static func resolve(
        form: MeeshySectionHeaderForm = .title,
        size: MeeshySectionHeaderSize = .page,
        count: Int? = nil,
        isCollapsible: Bool = false,
        isExpanded: Bool = true,
        isPressed: Bool = false,
        isLive: Bool = false,
        textScale: Double = 1
    ) -> MeeshySectionHeaderRecipe {
        let hasCount = (count ?? 0) > 0
        return MeeshySectionHeaderRecipe(
            form: form,
            titleFontSize: titleFontSize(form: form, size: size),
            countFontSize: countFontSize,
            showsCount: hasCount,
            countGap: hasCount ? countGap : 0,
            leadingSize: leadingSize(form: form, size: size),
            minHeight: minHeight,
            isUppercase: form == .overline,
            showsRules: form == .divider,
            ruleGap: ruleGap,
            showsChevron: isCollapsible,
            chevronDegrees: isCollapsible && !isExpanded ? 180 : 0,
            isWholeRowTappable: isCollapsible,
            pressVeil: isCollapsible && isPressed ? pressVeilOpacity : 0,
            pressScale: isCollapsible && isPressed ? pressedScale : 1,
            liveDotSize: isLive ? liveDot : 0,
            liveDotGap: isLive ? liveDotGap : 0,
            accessoryBelowTitle: textScale >= largeTextScale
        )
    }

    /// Ce que le lecteur d'écran dit d'une ligne repliable : le titre, son compte s'il n'est pas nul, puis la pastille
    /// de titre (K41) quand il y en a une.
    public static func spokenTitle(title: String, count: Int?, titleBadge: String?) -> String {
        let counted = (count ?? 0) > 0 ? count.map { String($0) } : nil
        return [title, counted, titleBadge].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    /// La ligne repliable se lit d'un bloc : le titre dit, puis le détail de fin ; un détail vide se tait.
    public static func spokenRow(spokenTitle: String, detail: String?) -> String {
        [spokenTitle, detail].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    public static func titleFontSize(form: MeeshySectionHeaderForm, size: MeeshySectionHeaderSize) -> Double {
        switch form {
        case .overline, .divider: return overlineFontSize
        case .step: return 19
        case .title, .column:
            switch size {
            case .page: return 22
            case .sheet: return 19
            case .column: return 26
            }
        }
    }

    public static func leadingSize(form: MeeshySectionHeaderForm, size: MeeshySectionHeaderSize) -> Double {
        if form == .step { return 26 }
        return size == .column ? 44 : 32
    }

    public static func stepAppearance(_ state: MeeshySectionHeaderStepState) -> MeeshySectionHeaderStepAppearance {
        switch state {
        case .done: return .check
        case .current: return .filled
        case .todo: return .outlined
        }
    }
}
