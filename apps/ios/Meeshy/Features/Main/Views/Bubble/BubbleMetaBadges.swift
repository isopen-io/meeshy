import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Edited Indicator (was: ThemedMessageBubble.editedIndicator)

/// Badge "edited" / "Saving…" affiche en overlay top-leading des
/// bulles textuelles. Stateless — Equatable synthetise. `isDark` est porte
/// par les inputs pour declencher un rebuild quand le theme bascule, le
/// reste des couleurs venant de `ThemeManager.shared` lu dans body.
struct BubbleEditedIndicator: View, Equatable {
    let isMe: Bool
    let isSaving: Bool
    let hasEditHistory: Bool
    let isDark: Bool

    var body: some View {
        let theme = ThemeManager.shared
        let metaColor: Color = isMe
            ? Color.white.opacity(0.6)
            : theme.textSecondary.opacity(0.5)

        return HStack(spacing: 3) {
            if isSaving {
                // Saving feedback: arrow-spin glyph instead of pencil so the
                // user sees their edit is still propagating to the server.
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(.caption2, design: .default).weight(.semibold))
                    .minimumScaleFactor(0.8)
                    .rotationEffect(.degrees(isSaving ? 360 : 0))
                    // `meeshyAnimation` plutôt que les deux `@Environment` que
                    // déclarent les autres sites : cette vue est `Equatable`
                    // par SYNTHÈSE, et une propriété stockée `@Environment`
                    // (non `Equatable`) la casserait. Le modificateur du SDK
                    // lit l'environnement lui-même et laisse la vue sans état.
                    //
                    // Rien à choisir comme valeur de repos ici : 360° ≡ 0°, le
                    // glyphe arrêté est exactement celui que la rotation
                    // traverse — et le « Saving… » juste à droite continue de
                    // dire ce que la rotation disait.
                    .meeshyAnimation(
                        .linear(duration: 1).repeatForever(autoreverses: false),
                        value: isSaving
                    )
                Text(String(localized: "bubble.meta.saving", defaultValue: "Saving…", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .italic()
            } else {
                Image(systemName: "pencil")
                    .font(.system(.caption2, design: .default).weight(.semibold))
                    .minimumScaleFactor(0.8)
                Text(String(localized: "bubble.meta.edited", defaultValue: "Edited", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .italic()
                if hasEditHistory {
                    // Dot affordance hinting the detail sheet shows history.
                    Circle()
                        .fill(metaColor)
                        .frame(width: 3, height: 3)
                        .opacity(0.7)
                }
            }
        }
        .foregroundColor(metaColor)
    }
}

// MARK: - Pinned Indicator (was: ThemedMessageBubble.pinnedIndicator)

/// Badge "Pinned" affiche au dessus des bulles epinglees. Purement stateless —
/// aucun input requis car `MeeshyColors.pinnedBlue` est theme-invariant. La
/// conformance `Equatable` synthetisee sur un struct sans champs renvoie
/// toujours `true`, ce qui est exactement le comportement souhaite pour
/// preserver le fast-path `.equatable()`.
struct BubblePinnedIndicator: View, Equatable {
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "pin.fill")
                .font(.caption2.weight(.bold))
                .foregroundColor(MeeshyColors.pinnedBlue)
                .rotationEffect(.degrees(45))

            Text(String(localized: "bubble.meta.pinned", defaultValue: "Pinned", bundle: .main))
                .font(.caption2.weight(.medium))
                .foregroundColor(MeeshyColors.pinnedBlue)
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "bubble.meta.pinned.a11y", defaultValue: "Pinned message", bundle: .main))
    }
}

// MARK: - Forwarded Indicator (was: ThemedMessageBubble.forwardedIndicator)

/// Badge "Forwarded" affiche au dessus des bulles transferees.
///
/// La vue ne prend plus deux `String?` independants : cette signature laissait
/// l'appelant choisir de nommer la PERSONNE des que le groupe manquait. Elle
/// recoit une attribution DEJA tranchee par `ForwardBadgePolicy` — trois cas
/// exhaustifs, aucun repli implicite. `ForwardAttribution` est `Equatable`,
/// donc la vue le reste sans dependre du type SDK.
struct BubbleForwardedIndicator: View, Equatable {
    let isMe: Bool
    let isDark: Bool
    let attribution: ForwardAttribution

    var body: some View {
        let theme = ThemeManager.shared
        return HStack(spacing: 4) {
            Image(systemName: "arrowshape.turn.up.right.fill")
                .font(.caption2.weight(.medium))
                .foregroundColor(theme.textMuted)

            Text(Self.label(for: attribution))
                .font(.caption2)
                .italic()
                .foregroundColor(theme.textMuted)
                .lineLimit(1)
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
        .accessibilityElement(children: .combine)
    }

    static func label(for attribution: ForwardAttribution) -> String {
        switch attribution {
        case .group(let name):
            return String(localized: "bubble.meta.forwarded.fromGroup", defaultValue: "Forwarded from \(name)", bundle: .main)
        case .person(let name):
            return String(localized: "bubble.meta.forwarded.from", defaultValue: "Fwd. from \(name)", bundle: .main)
        case .anonymous:
            return String(localized: "bubble.meta.forwarded", defaultValue: "Forwarded", bundle: .main)
        }
    }
}

// Note: the offline-pending hourglass + failed-retry control are now rendered
// inline by `BubbleFooter` / `BubbleDeliveryCheck`. The former standalone
// `BubbleDeliveryBadge` has been removed.

// MARK: - Ephemeral Badge (was: ThemedMessageBubble.ephemeralTimerOverlay)

/// Capsule "flame + timer" affichee sous les messages ephemeres pour
/// rappeler le compte a rebours avant expiration.
struct BubbleEphemeralBadge: View, Equatable {
    let timerText: String
    let isDark: Bool

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill")
                .font(.caption2.weight(.semibold))
                .foregroundColor(MeeshyColors.error)

            Text(timerText)
                .font(.system(.caption2, design: .monospaced).weight(.bold))
                .foregroundColor(MeeshyColors.error)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(MeeshyColors.error.opacity(isDark ? 0.15 : 0.1))
                .overlay(
                    Capsule()
                        .stroke(MeeshyColors.error.opacity(0.3), lineWidth: 0.5)
                )
        )
        .accessibilityLabel(String(localized: "bubble.meta.ephemeral.a11y", defaultValue: "Ephemeral message, expires in \(timerText)", bundle: .main))
    }
}
