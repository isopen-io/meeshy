import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les badges d'accumulation sur Progression (#9380)
//
// `GameBadgeView` (l'hexagone, sept matières, l'empreinte) et `BadgeStage` (la
// matière qui remonte du bas en 0,7 s, avec sa tape légère) n'avaient AUCUN hôte :
// l'écran n'affichait les badges que sous forme de pastilles. Cette étagère les
// montre — ceux que l'utilisateur a GAGNÉS, allumés ; ceux qu'une frappe a éteints,
// en empreinte qui dit ce qu'il manque pour les rallumer (« −37 »). Un badge jamais
// gagné ne s'y montre pas : les pastilles de la page « Badges » disent déjà ce qui
// reste à atteindre.

/// UN badge d'accumulation tel que l'étagère le dessine.
nonisolated struct GameBadgeItem: Identifiable, Equatable, Sendable {
    let axis: EngagementAxisKey
    let threshold: Int
    let material: GameMaterial
    /// Le compteur tient le palier. Faux ⇒ l'empreinte d'un badge gagné puis éteint par une frappe.
    let lit: Bool
    /// Ce qu'il manque pour le rallumer ; 0 quand il est allumé.
    let missing: Int

    var id: String { "\(axis.rawValue):\(threshold)" }
}

nonisolated enum GameBadges {

    /// La matière dit la HAUTEUR du palier (conception, § II.7) : Cuivre 1 · Bronze 10 ·
    /// Argent 50 · Or 100 · Platine 500 · Obsidienne 1 000 · Prisme 5 000.
    private static let materials: [Int: GameMaterial] = [
        1: .copper, 10: .bronze, 50: .silver, 100: .gold, 500: .platinum, 1_000: .obsidian, 5_000: .prism,
    ]

    /// Un palier que le jeu ne connaît pas encore reçoit la matière la plus haute : un badge de
    /// plus haut niveau que les connus ne se dessine jamais en cuivre.
    static func material(forThreshold threshold: Int) -> GameMaterial {
        materials[threshold] ?? .prism
    }

    /// Les badges gagnés, axe après axe. Un palier gravé ne se reprend jamais (le résolveur le
    /// tient pour atteint même quand le compteur est retombé) : c'est le compteur courant qui
    /// dit s'il est ALLUMÉ ou réduit à son empreinte.
    static func items(for progress: EngagementProgress) -> [GameBadgeItem] {
        progress.axes.flatMap { axis in
            axis.scale.tiers.filter(\.reached).map { tier in
                GameBadgeItem(
                    axis: axis.axis,
                    threshold: tier.threshold,
                    material: material(forThreshold: tier.threshold),
                    lit: axis.scale.value >= tier.threshold,
                    missing: max(0, tier.threshold - axis.scale.value)
                )
            }
        }
    }
}

/// L'étagère : une carte, une grille de badges. Absente quand rien n'a encore été gagné.
struct GameBadgeShelfView: View {
    let items: [GameBadgeItem]
    var haptics: GameHapticsProviding = GameHaptics.shared

    private let columns = [GridItem(.adaptive(minimum: 64, maximum: 88), spacing: MeeshySpacing.md)]
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                Text(ProgressionCopy.badgesTitle)
                    .font(.caption2.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(theme.textMuted)
                    .accessibilityAddTraits(.isHeader)
                ProgressionCard(tint: MeeshyColors.brandPrimary) {
                    LazyVGrid(columns: columns, spacing: MeeshySpacing.md) {
                        ForEach(items) { item in
                            GameBadgeCell(item: item, haptics: haptics)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Un badge. Rien ne se joue au premier rendu : seul un CHANGEMENT d'état — allumé par une
/// mission, éteint par une frappe — rejoue la chorégraphie (la matière remonte, ou se retire),
/// et la tape légère n'accompagne que l'allumage.
private struct GameBadgeCell: View {
    let item: GameBadgeItem
    let haptics: GameHapticsProviding

    @State private var play = 0

    private var label: String {
        item.lit
            ? GameCopy.formatCount(item.threshold)
            : "−" + GameCopy.formatCount(item.missing)
    }

    private var accessibilityText: String {
        let axis = ProgressionCopy.title(for: item.axis)
        guard item.lit else {
            return axis + ", " + String(
                localized: "game.badge.a11y.imprint",
                defaultValue: "Éteint, encore \(GameCopy.formatCount(item.missing)) pour le rallumer",
                bundle: .main
            )
        }
        return axis + ", " + ProgressionCopy.tierAccessibilityLabel(
            EngagementTier(threshold: item.threshold, reached: true, reachedAt: nil)
        )
    }

    var body: some View {
        BadgeStage(
            shape: .accumulation, material: item.material, label: label,
            lit: item.lit, play: play, accessibilityLabel: accessibilityText
        )
        .frame(width: 64, height: 64)
        .adaptiveOnChange(of: item.lit) { _, lit in
            play += 1
            if lit { haptics.play(GameHapticPattern.badgeLit) }
        }
    }
}
