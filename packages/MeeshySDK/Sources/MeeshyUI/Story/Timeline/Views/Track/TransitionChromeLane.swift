import SwiftUI
import MeeshySDK

/// Read-only chrome strip above the ruler showing the slide's inter-slide
/// opening (left edge) / closing (right edge) animation, if any — the
/// Timeline editor previously gave zero indication these would play, even
/// though `OpeningEffectChips` (above the canvas, not part of the Timeline)
/// lets the user configure them. Both badges are sized to the same fixed
/// `StoryRenderer.slideTransitionDuration` (0.5s) every effect actually
/// animates over — not editable here; tap-to-edit stays out of scope for
/// this pass (design doc 2026-07-18) to avoid duplicating
/// `OpeningEffectChips`' UI.
public struct TransitionChromeLane: View {
    public let openingEffect: StoryTransitionEffect?
    public let closingEffect: StoryTransitionEffect?
    public let slideDuration: Float
    public let geometry: TimelineGeometry
    public let isDark: Bool

    public init(openingEffect: StoryTransitionEffect?,
                closingEffect: StoryTransitionEffect?,
                slideDuration: Float,
                geometry: TimelineGeometry,
                isDark: Bool) {
        self.openingEffect = openingEffect
        self.closingEffect = closingEffect
        self.slideDuration = slideDuration
        self.geometry = geometry
        self.isDark = isDark
    }

    /// Width every badge occupies — both opening and closing effects
    /// animate over the same fixed window (`StoryRenderer.slideTransitionDuration`),
    /// so there's exactly one width to compute regardless of effect kind.
    public static func badgeWidth(geometry: TimelineGeometry) -> CGFloat {
        geometry.width(for: Float(StoryRenderer.slideTransitionDuration))
    }

    public var body: some View {
        HStack(spacing: 0) {
            if let openingEffect {
                badge(for: openingEffect, alignment: .leading)
            } else {
                Spacer(minLength: 0).frame(width: Self.badgeWidth(geometry: geometry))
            }
            Spacer(minLength: 0)
            if let closingEffect {
                badge(for: closingEffect, alignment: .trailing)
            }
        }
        // Bandeau à la largeur VISIBLE (badge ouverture calé à gauche, fermeture
        // à droite), PAS à la largeur pleine durée (`geometry.width(for:
        // slideDuration)`). Cette dernière valait ex. 500 pt pour un slide de 10 s
        // et, la chrome lane vivant HORS du scroller horizontal, elle (a) laissait
        // le badge de fermeture toujours hors écran et (b) — un VStack se
        // dimensionnant sur son enfant le plus large — élargissait tout le
        // conteneur timeline au-delà de la fenêtre, sur-largeur re-proposée à la
        // barre de transport au-dessus qui rognait alors la lecture / le son.
        // `maxWidth: .infinity` = on remplit la fenêtre, les deux badges restent
        // visibles à leurs bords, et plus aucune largeur intrinsèque ne fuit.
        .frame(maxWidth: .infinity, minHeight: 18, maxHeight: 18)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func badge(for effect: StoryTransitionEffect, alignment: Alignment) -> some View {
        HStack(spacing: 3) {
            Image(systemName: effect.iconName)
                .font(.system(size: 8, weight: .semibold))
            Text(Self.displayName(effect))
                .font(.system(size: 8, weight: .semibold))
                .lineLimit(1)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .frame(width: Self.badgeWidth(geometry: geometry), alignment: alignment == .leading ? .leading : .trailing)
        .background(
            Capsule().fill(MeeshyColors.indigo500.opacity(isDark ? 0.30 : 0.18))
        )
        .foregroundStyle(MeeshyColors.indigo500)
        .accessibilityLabel(Self.displayName(effect))
    }

    /// Reuses `OpeningEffectChips`' exact localization keys and French
    /// `defaultValue`s (`Story/Controls/OpeningEffectChips.swift`) instead of
    /// introducing duplicate strings for the same four effect concepts.
    static func displayName(_ effect: StoryTransitionEffect) -> String {
        switch effect {
        case .fade:
            return String(localized: "story.composer.opening.fade", defaultValue: "Fondu", bundle: .module)
        case .zoom:
            return String(localized: "story.composer.opening.zoom", defaultValue: "Zoom", bundle: .module)
        case .slide:
            return String(localized: "story.composer.opening.slide", defaultValue: "Glissement", bundle: .module)
        case .reveal:
            return String(localized: "story.composer.opening.reveal", defaultValue: "Révélation", bundle: .module)
        }
    }
}
