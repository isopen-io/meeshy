import SwiftUI

// MARK: - Pull-to-Refresh State

/// Phase logique d'un pull-to-refresh. Le contrôleur (la View qui possède
/// le ScrollView) gère la transition entre phases via le scroll offset et
/// le drag-end. L'indicator se contente de réagir à la phase courante.
public enum MeeshyPullPhase: Equatable, Sendable {
    case idle
    case pulling(progress: CGFloat)  // 0...1 — progression vers le seuil
    case armed                        // seuil dépassé, lâche pour déclencher
    case refreshing
    case completing
}

// MARK: - Pull Indicator

/// Indicateur visuel Meeshy pour le pull-to-refresh, brand-coherent (logo
/// dashes + dégradé indigo + breathing). Réutilisable n'importe où qui
/// pilote son propre état (home, profil, communautés...).
///
/// L'indicator se dimensionne lui-même : hauteur 0 quand `phase = .idle`,
/// croît avec la progression du pull, puis reste à pleine hauteur durant
/// `.refreshing`. Pas de Spacer interne — l'appelant le pousse dans son
/// layout (typiquement en haut d'un VStack dans un ScrollView).
public struct MeeshyPullIndicator: View {
    public let phase: MeeshyPullPhase

    /// Hauteur maximale de la zone d'affichage de l'indicator.
    /// Volontairement alignée sur le seuil de pull-to-refresh côté
    /// contrôleur (90pt) : la container croît linéairement avec le
    /// pull, remplit pile la zone révélée par le scroll, et reste à
    /// pleine hauteur pendant le refresh.
    public static let maxHeight: CGFloat = 90
    private static let logoSize: CGFloat = 40
    private static let ringSize: CGFloat = 54

    public init(phase: MeeshyPullPhase) {
        self.phase = phase
    }

    private var visibleHeight: CGFloat {
        switch phase {
        case .idle: return 0
        case .pulling(let p): return Self.maxHeight * min(1, max(0, p))
        case .armed, .refreshing, .completing: return Self.maxHeight
        }
    }

    private var logoOpacity: CGFloat {
        switch phase {
        case .idle: return 0
        case .pulling(let p): return min(1, max(0, p))
        case .armed, .refreshing, .completing: return 1
        }
    }

    private var logoScale: CGFloat {
        switch phase {
        case .idle: return 0.6
        case .pulling(let p): return 0.6 + 0.4 * min(1, max(0, p))
        case .armed: return 1.04
        case .refreshing, .completing: return 1.0
        }
    }

    /// Rotation pendant le pull pour donner un feedback proportionnel,
    /// jusqu'à 180° au seuil. Pendant refresh, le logo ne tourne pas —
    /// le breathing du AnimatedLogoView suffit comme signe d'activité.
    private var logoRotation: Double {
        switch phase {
        case .idle: return 0
        case .pulling(let p): return Double(min(1, max(0, p))) * 180
        case .armed: return 180
        case .refreshing, .completing: return 0
        }
    }

    /// Couleur du logo : passe progressivement de gris désaturé (idle/pull
    /// faible) vers indigo brand au seuil. Évite que le logo "saute" en
    /// couleur, transition organique.
    private var logoColor: Color {
        switch phase {
        case .idle: return MeeshyColors.indigo300.opacity(0.5)
        case .pulling(let p):
            let t = min(1, max(0, p))
            return MeeshyColors.indigo300.opacity(0.5).interpolated(to: MeeshyColors.indigo500, t: t)
        case .armed, .refreshing, .completing: return MeeshyColors.indigo500
        }
    }

    private var isRefreshing: Bool {
        if case .refreshing = phase { return true }
        return false
    }

    public var body: some View {
        ZStack {
            // Anneau gradient autour du logo durant refresh — indique que
            // le système travaille (en complément du breathing du logo).
            if isRefreshing {
                Circle()
                    .stroke(
                        AngularGradient(
                            gradient: Gradient(colors: [
                                MeeshyColors.indigo500,
                                MeeshyColors.indigo700,
                                MeeshyColors.indigo500.opacity(0.3),
                                MeeshyColors.indigo500
                            ]),
                            center: .center
                        ),
                        style: StrokeStyle(lineWidth: 2, lineCap: .round)
                    )
                    .frame(width: Self.ringSize, height: Self.ringSize)
                    .rotationEffect(.degrees(ringRotation))
                    .onAppear { startRingRotation() }
                    .transition(.opacity.combined(with: .scale))
            }

            AnimatedLogoView(
                color: logoColor,
                lineWidth: 3.5,
                continuous: isRefreshing
            )
            .frame(width: Self.logoSize, height: Self.logoSize)
            .scaleEffect(logoScale)
            .rotationEffect(.degrees(logoRotation))
            .opacity(logoOpacity)
        }
        .frame(maxWidth: .infinity)
        .frame(height: visibleHeight)
        .clipped()
        .animation(.spring(response: 0.45, dampingFraction: 0.85), value: phase)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(.updatesFrequently)
    }

    @State private var ringRotation: Double = 0

    private func startRingRotation() {
        withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
            ringRotation = 360
        }
    }

    private var accessibilityLabel: String {
        switch phase {
        case .idle, .pulling: return ""
        case .armed: return String(localized: "pull_refresh.armed", defaultValue: "Relâcher pour rafraîchir", bundle: .module)
        case .refreshing: return String(localized: "pull_refresh.refreshing", defaultValue: "Rafraîchissement en cours", bundle: .module)
        case .completing: return String(localized: "pull_refresh.done", defaultValue: "Rafraîchi", bundle: .module)
        }
    }
}

// MARK: - Color interpolation helper

extension Color {
    /// Interpole linéairement entre `self` et `other` selon `t` (0...1).
    /// Utilisé pour la transition de couleur progressive du logo pendant
    /// le pull. Approximation via UIColor RGB — suffisant pour un dégradé
    /// perceptuellement smooth sur la plage indigo300 → indigo500.
    func interpolated(to other: Color, t: CGFloat) -> Color {
        let t = min(1, max(0, t))
        let lhs = UIColor(self)
        let rhs = UIColor(other)
        var lr: CGFloat = 0, lg: CGFloat = 0, lb: CGFloat = 0, la: CGFloat = 0
        var rr: CGFloat = 0, rg: CGFloat = 0, rb: CGFloat = 0, ra: CGFloat = 0
        lhs.getRed(&lr, green: &lg, blue: &lb, alpha: &la)
        rhs.getRed(&rr, green: &rg, blue: &rb, alpha: &ra)
        return Color(
            red: Double(lr + (rr - lr) * t),
            green: Double(lg + (rg - lg) * t),
            blue: Double(lb + (rb - lb) * t),
            opacity: Double(la + (ra - la) * t)
        )
    }
}
