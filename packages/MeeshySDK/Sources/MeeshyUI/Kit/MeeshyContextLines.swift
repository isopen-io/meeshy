import Foundation
import CoreGraphics

// MARK: - Énumérés (fiche K24 § 2)

public nonisolated enum MeeshyContextSurface: Sendable, Equatable {
    /// L'encre des médias : blanc sur la scène, à l'opacité de la planche.
    case media
    /// L'encre du thème, pour les hôtes posés sur le fond de l'app.
    case theme
}

public nonisolated enum MeeshyContextAlignment: Sendable, Equatable {
    case center
    case leading
}

public nonisolated enum MeeshyContextHaptic: Sendable, Equatable {
    case light
    case none
}

// MARK: - Recette (fiche K24 § 6) : nulle part ailleurs

public nonisolated enum MeeshyContextLinesRecipe {
    public static let barCount = 18
    /// Plancher de barre : 2 pt sur 12 (planche).
    public static let waveFloor: Double = 2.0 / 12.0
    public static let pressedOpacity: Double = 0.7
    public static let hoverOpacity: Double = 0.85
    public static let longPressDelay: Double = 0.5
    public static let fadeWidth: CGFloat = 44
    public static let fadeDuration: Double = 0.2
    public static let maxTextScale: CGFloat = 1.5
    public static let chipHeight: CGFloat = 36
    public static let minimumTarget: CGFloat = 44
    public static let soundLineOffset: CGFloat = 26
    public static let referenceOffset: CGFloat = 8
    public static let referenceOffsetUnderShrunk: CGFloat = 2
    public static let waveSize = CGSize(width: 72, height: 12)
    public static let waveBarWidth: CGFloat = 2
}

// MARK: - Onde (loi de la ligne de son)

public nonisolated enum MeeshyContextWaveRule {
    /// `nil` ⇒ pas d'onde. Vide ⇒ onde de repli sinusoïde. Sinon le relevé est
    /// rééchantillonné linéairement à `count` barres, chacune bornée au plancher
    /// et au plafond de 1.
    public static func bars(levels: [Float]?, count: Int) -> [Double] {
        guard let levels else { return [] }
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
        hasText(title) || showsWave(levels: levels) || hasText(detail ?? "")
    }

    public static func showsWave(levels: [Float]?) -> Bool {
        levels != nil
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

    /// Pas d'estompe si tout tient : on ne masque que ce qui déborde.
    public static func needsFade(contentWidth: CGFloat, available: CGFloat) -> Bool {
        contentWidth > available
    }

    private static func trimmed(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func hasText(_ text: String) -> Bool {
        !trimmed(text).isEmpty
    }
}
