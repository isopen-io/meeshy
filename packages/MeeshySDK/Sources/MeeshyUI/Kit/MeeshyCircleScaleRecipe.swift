import SwiftUI

/// Les formes de l'échelle : des pastilles à compte, la pilule d'un niveau, des anneaux,
/// et l'échelle VERTICALE (`ladder`) : des nœuds reliés, le plus haut niveau en haut.
public nonisolated enum MeeshyCircleScaleForm: String, Sendable, Equatable, CaseIterable {
    case dots
    case pill
    case rings
    case ladder
}

/// Un nœud de l'échelle verticale : atteint (sous le niveau courant), courant, ou à venir
/// (au-dessus, en tirets). Sans niveau courant, tout est atteint et rien ne s'allume.
public nonisolated enum MeeshyCircleScaleLadderNode: String, Sendable, Equatable, CaseIterable {
    case reached
    case current
    case ahead
}

/// Les tailles : `compact` est la pilule de 26 (ou les crans de 12) dans une rangée.
public nonisolated enum MeeshyCircleScaleSize: String, Sendable, Equatable, CaseIterable {
    case compact
    case regular
    case large
}

/// Un niveau, tel que l'hôte le nomme : titre déjà traduit et glyphe du jeu.
public nonisolated struct MeeshyCircleScaleLevel: Sendable, Equatable {
    public let title: String
    public let systemImage: String

    public init(title: String, systemImage: String) {
        self.title = title
        self.systemImage = systemImage
    }
}

/// **La recette de K33 en VALEURS** : la loi d'intensité (la SEULE source des six
/// valeurs), les rangs bornés, les mesures de chaque forme. Aucune couleur : une
/// teinte unique, de plus en plus pleine ; l'hôte la remet, la recette la dose.
public nonisolated struct MeeshyCircleScaleRecipe: Sendable, Equatable {

    public static let minimumLevels = 2
    public static let maximumLevels = 8
    /// 100, 52, 32, 18, 8, contour : comptées depuis le plus haut niveau.
    static let intensityFromTop: [Double] = [1, 0.52, 0.32, 0.18, 0.08, 0]
    /// Au-dessus de ce seuil le fond est assez plein pour une encre sombre.
    static let darkInkThreshold = 0.52

    public let isRendered: Bool
    public let levelCount: Int
    public let litLevel: Int?
    public let otherLevel: Int?
    public let dotDiameter: Double
    public let stepHeight: Double
    public let stepGap: Double
    public let pillHeight: Double
    public let ringStroke: Double
    public let litRingStroke: Double
    public let ringGap: Double
    public let glowRadius: Double
    public let centerDiameter: Double
    public let markerDiameter: Double
    public let pressedScale: Double
    public let opacity: Double

    public static func resolve(count: Int,
                               current: Int?,
                               other: Int?,
                               form: MeeshyCircleScaleForm,
                               size: MeeshyCircleScaleSize,
                               isPressed: Bool,
                               isEnabled: Bool) -> MeeshyCircleScaleRecipe {
        MeeshyCircleScaleRecipe(
            isRendered: (minimumLevels...maximumLevels).contains(count),
            levelCount: count,
            litLevel: clamped(current, count: count),
            otherLevel: form == .pill ? nil : clamped(other, count: count),
            dotDiameter: 58,
            stepHeight: 12,
            stepGap: 6,
            pillHeight: pillHeight(size),
            ringStroke: 1.5,
            litRingStroke: 4,
            ringGap: 20,
            glowRadius: 26,
            centerDiameter: 40,
            markerDiameter: 48,
            pressedScale: isPressed ? 0.92 : 1,
            opacity: isEnabled ? 1 : 0.4
        )
    }

    private static func pillHeight(_ size: MeeshyCircleScaleSize) -> Double {
        switch size {
        case .compact: return 26
        case .regular: return 34
        case .large: return 44
        }
    }

    /// **La loi d'intensité** : le même nom a la même intensité partout, que l'hôte
    /// passe cinq niveaux ou six. Trois niveaux ou moins sautent un cran (100, 32, 8).
    public static func intensity(level: Int, of count: Int) -> Double {
        let total = max(count, 1)
        let fromTop = total - 1 - min(max(level, 0), total - 1)
        let index = total <= 3 ? fromTop * 2 : fromTop
        return intensityFromTop[min(index, intensityFromTop.count - 1)]
    }

    /// L'échelle verticale : un nœud de 26, 5 entre deux rangées, un trait de 2 qui les relie,
    /// un halo de 4 autour du niveau courant.
    public static let ladderNodeDiameter: Double = 26
    public static let ladderRowGap: Double = 5
    public static let ladderLineWidth: Double = 2
    public static let ladderHaloWidth: Double = 4

    /// L'ordre de lecture de l'échelle verticale : le plus haut niveau en haut.
    public static func ladderOrder(count: Int) -> [Int] {
        Array((0..<max(count, 0)).reversed())
    }

    /// L'état d'un nœud : courant, atteint en dessous, à venir au-dessus.
    public static func ladderNode(level: Int, current: Int?) -> MeeshyCircleScaleLadderNode {
        guard let current else { return .reached }
        if level == current { return .current }
        return level < current ? .reached : .ahead
    }

    /// Le rang ramené dans `0..<count` ; `nil` reste `nil` (« Mes cercles » n'allume rien).
    public static func clamped(_ level: Int?, count: Int) -> Int? {
        guard let level else { return nil }
        return min(max(level, 0), max(count, 1) - 1)
    }

    /// L'encre se choisit à l'intensité du fond, pas à la teinte : sombre sur un fond plein.
    public static func usesDarkInk(intensity: Double) -> Bool {
        intensity >= darkInkThreshold
    }

    /// Le tic suit un CHOIX qui change de niveau. Un niveau remis par l'hôte (profil
    /// chargé, changement venu d'ailleurs) ne fait rien vibrer.
    public static func playsHaptic(_ haptic: MeeshyCircleScaleHaptic, chosen: Int, current: Int?,
                                   reduceMotion: Bool) -> Bool {
        haptic == .onChange && !reduceMotion && chosen != current
    }

    /// Les comptes ne servent que s'ils ont la longueur des niveaux ; un compte
    /// négatif vaut zéro.
    public static func validCounts(_ counts: [Int]?, levelCount: Int) -> [Int]? {
        guard let counts, counts.count == levelCount else { return nil }
        return counts.map { max($0, 0) }
    }

    /// Un compte écrit par la langue courante ; zéro s'écrit « 0 ».
    public static func countText(_ count: Int, locale: Locale) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: max(count, 0))) ?? String(max(count, 0))
    }
}

/// Les mots dits : le niveau est toujours écrit ou dit, jamais seulement teinté.
public enum MeeshyCircleScaleWords {

    /// « Proche, 5 sur 6 » : le nom, puis le rang compté depuis le plus bas.
    public static func spokenValue(title: String, level: Int, of count: Int,
                                   bundle: Bundle? = nil, locale: Locale = .current) -> String {
        let position = String(localized: "kit.circle_scale.value", defaultValue: "\(level + 1) sur \(count)",
                              bundle: bundle ?? .module, locale: locale)
        return "\(title), \(position)"
    }

    /// « Ami, 3 » : le nom et son compte, lus ensemble.
    public static func spokenCount(title: String, count: Int, locale: Locale = .current) -> String {
        "\(title), \(MeeshyCircleScaleRecipe.countText(count, locale: locale))"
    }
}
