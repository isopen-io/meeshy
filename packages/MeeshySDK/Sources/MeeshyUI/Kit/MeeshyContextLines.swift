import SwiftUI

// MARK: - Énumérés (fiche K24 § 2)

public nonisolated enum MeeshyContextSurface: String, Sendable, Equatable, CaseIterable {
    /// L'encre des médias : blanc sur la scène, à l'opacité de la planche.
    case media
    /// L'encre du thème, pour les hôtes posés sur le fond de l'app.
    case theme
}

public nonisolated enum MeeshyContextAlignment: String, Sendable, Equatable, CaseIterable {
    case center
    case leading
}

public nonisolated enum MeeshyContextHaptic: String, Sendable, Equatable, CaseIterable {
    case light
    case none

    /// Le retour joué par le site unique de K02 (`MeeshyGlassButtonTrigger`).
    var glassHaptic: MeeshyGlassButtonHaptic {
        switch self {
        case .light: return .light
        case .none: return .none
        }
    }
}

/// Le côté vers lequel la cible tactile déborde le dessin : jamais sur le
/// contenu. Le son déborde vers le haut, les références vers le bas, la puce
/// des deux côtés.
nonisolated enum MeeshyContextHitEdge: Sendable, Equatable {
    case top
    case bottom
    case vertical
}

// MARK: - Recette (fiche K24 § 6) : nulle part ailleurs

public nonisolated enum MeeshyContextLinesRecipe {
    public static let barCount = 18
    public static let waveBarWidth: CGFloat = 2
    public static let waveBarPitch: CGFloat = 4
    public static let waveHeight: CGFloat = 12
    /// Plancher de barre : 2 pt sur 12 (planche).
    public static let waveFloor: Double = 2.0 / 12.0
    public static var waveSize: CGSize { CGSize(width: CGFloat(barCount) * waveBarPitch, height: waveHeight) }
    /// Encre du texte des deux lignes (planche : 92 et 88 %, jeton 85 %).
    public static let textOpacity: Double = 0.85
    /// Encre de l'onde et des séparateurs.
    public static let waveOpacity: Double = 0.7
    public static let pressedOpacity: Double = 0.7
    public static let hoverOpacity: Double = 0.85
    public static let longPressDelay: Double = MeeshyGlassButtonRecipe.longPressDuration
    public static let fadeWidth: CGFloat = 44
    public static let fadeDuration: Double = 0.2
    public static let maxTextScale: CGFloat = 1.5
    /// Le palier Dynamic Type où le texte s'arrête : ×1,5 pour les styles de
    /// 12 et 13 pt que portent les trois éléments.
    public static let maxDynamicTypeSize: DynamicTypeSize = .xxxLarge
    public static let chipHeight: CGFloat = MeeshyControlSize.regular
    public static let minimumTarget: CGFloat = MeeshyControlSize.tapTarget
    public static let soundLineOffset: CGFloat = 26
    public static let referenceOffset: CGFloat = MeeshySpacing.sm
    public static let referenceOffsetUnderShrunk: CGFloat = MeeshySpacing.xxs
    public static let soundTextSize: CGFloat = MeeshyFont.smallSize
    public static let noteSize: CGFloat = MeeshyIconSize.sm
    public static let referenceTextSize: CGFloat = MeeshyFont.subheadSize
    public static let chipTextSize: CGFloat = MeeshyFont.subheadSize
    public static let chipGlyphSize: CGFloat = MeeshyIconSize.md
    public static let chevronSize: CGFloat = MeeshyIconSize.sm
    public static let disabledOpacity: Double = MeeshyGlassButtonRecipe.disabledOpacity
}

// MARK: - Onde (loi de la ligne de son)

public nonisolated enum MeeshyContextWaveRule {
    /// `nil` ⇒ pas d'onde. Vide ⇒ onde de repli sinusoïde. Sinon le relevé est
    /// échantillonné à `count` barres, chacune bornée au plancher et à 1.
    public static func bars(levels: [Float]?, count: Int) -> [Double] {
        guard let levels, count > 0 else { return [] }
        guard !levels.isEmpty else { return fallback(count: count) }
        return (0..<count).map { index in
            let source = min(levels.count - 1, index * levels.count / count)
            return clamped(Double(levels[source]))
        }
    }

    private static func fallback(count: Int) -> [Double] {
        (0..<count).map { index in
            let phase = Double(index) / Double(count) * .pi * 2
            return clamped(0.35 + 0.45 * abs(sin(phase)))
        }
    }

    private static func clamped(_ value: Double) -> Double {
        min(1, max(MeeshyContextLinesRecipe.waveFloor, value.isNaN ? 0 : value))
    }
}

// MARK: - Ajustement de la puce

public nonisolated enum MeeshyContextChipFit {
    /// Le libellé tient-il dans la place ? Sinon la puce ne garde que le disque.
    public static func showsTitle(titleWidth: CGFloat, available: CGFloat) -> Bool {
        titleWidth <= available
    }
}

// MARK: - Loi 13 : ce qui ne s'affiche jamais

public nonisolated enum MeeshyContextLinesRule {
    public static func soundLineHasContent(title: String, levels: [Float]?, detail: String?) -> Bool {
        hasText(title) || showsWave(levels: levels) || visibleText(detail) != nil
    }

    public static func showsWave(levels: [Float]?) -> Bool {
        levels != nil
    }

    /// Un texte qui ne porte que des blancs n'existe pas.
    public static func visibleText(_ text: String?) -> String? {
        guard let text, hasText(text) else { return nil }
        return text
    }

    /// Les références sans texte utile ne servent à rien : elles ne séparent
    /// donc jamais, ni en tête, ni en fin, ni doublées.
    public static func visibleReferences(_ texts: [String]) -> [String] {
        visibleItems(texts, text: { $0 })
    }

    /// Les éléments dont le texte n'est pas vide, dans l'ordre de l'hôte.
    public static func visibleItems<Item>(_ items: [Item], text: (Item) -> String) -> [Item] {
        items.filter { hasText(text($0)) }
    }

    public static func separatorCount(visible: [String]) -> Int {
        max(0, visible.count - 1)
    }

    public static func referenceLineHasContent(references: [String]) -> Bool {
        !visibleReferences(references).isEmpty
    }

    /// Un chevron n'existe qu'avec une action : `requested` ne fait que retirer.
    public static func showsChevron(hasAction: Bool, requested: Bool?) -> Bool {
        hasAction && (requested ?? true)
    }

    public static func firesHaptic(hasAction: Bool, haptic: MeeshyContextHaptic) -> Bool {
        hasAction && haptic == .light
    }

    public static func showsChip(title: String, glyph: String?) -> Bool {
        hasText(title) || glyph != nil
    }

    /// La valeur dite de la puce : le titre, puis le détail. Jamais le nom.
    public static func chipValue(title: String, detail: String?) -> String {
        [visibleText(title), visibleText(detail)].compactMap { $0 }.joined(separator: ", ")
    }

    /// Le détail de la puce prend l'encre pleine en `onLight`, où 85 % tombe
    /// sous 4,5:1 ; ailleurs il garde l'encre secondaire.
    public static func chipDetailOpacity(tone: MeeshyGlassTone) -> Double {
        tone == .onLight ? 1 : MeeshyContextLinesRecipe.textOpacity
    }

    /// Une ligne pressée passe à 70 %, survolée à 85 %, sans échelle.
    public static func lineOpacity(isPressed: Bool, isHovered: Bool) -> Double {
        if isPressed { return MeeshyContextLinesRecipe.pressedOpacity }
        return isHovered ? MeeshyContextLinesRecipe.hoverOpacity : 1
    }

    /// Pas d'estompe si tout tient : on ne masque que ce qui déborde.
    public static func needsFade(contentWidth: CGFloat, available: CGFloat) -> Bool {
        contentWidth > available
    }

    /// La cible tactile : le dessin, agrandi jusqu'à `minimum` du seul côté
    /// opposé au contenu (des deux pour la puce). L'encombrement ne change pas.
    static func hitRect(_ rect: CGRect, edge: MeeshyContextHitEdge, minimum: CGFloat) -> CGRect {
        let missing = max(0, minimum - rect.height)
        switch edge {
        case .top:
            return CGRect(x: rect.minX, y: rect.minY - missing, width: rect.width, height: rect.height + missing)
        case .bottom:
            return CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height + missing)
        case .vertical:
            return rect.insetBy(dx: 0, dy: -missing / 2)
        }
    }

    private static func hasText(_ text: String) -> Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
