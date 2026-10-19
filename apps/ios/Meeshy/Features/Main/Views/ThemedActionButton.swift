import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Themed Action Button
struct ThemedActionButton: View {
    let icon: String
    let color: String
    let label: String
    let hint: String
    var badge: Int = 0
    var size: CGFloat = 46
    /// `false` = glow ET pulse ÉTEINTS. L'échelle de menu (`menuLadder`) reste
    /// MONTÉE menu fermé (opacité 0 via `menuAnimation`, zIndex −1) pour que le
    /// ressort d'ouverture anime depuis un état existant — mais un `onAppear`
    /// inconditionnel y démarrait le glow `repeatForever` (ombre re-rasterisée
    /// à CHAQUE frame) sur six boutons INVISIBLES, en permanence, derrière la
    /// liste de conversations (audit chauffe 2026-08-26). Le décor ne respire
    /// que quand il est visible.
    var isGlowEnabled: Bool = true
    let action: () -> Void

    @State private var isPressed = false
    @State private var isGlowing = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    private var reduceMotion: Bool { systemReduceMotion || userForcedReduceMotion }

    private var iconSize: CGFloat { round(size * 0.39) }

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.15, dampingFraction: 0.5)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) { isPressed = false }
            }
            action()
        }) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: color), Color(hex: color).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: size, height: size)
                    .shadow(
                        color: Color(hex: color).opacity(isGlowing ? 0.65 : 0.45),
                        radius: isGlowing ? MeeshyShadow.strong.radius : MeeshyShadow.medium.radius,
                        y: 4
                    )

                Image(systemName: icon)
                    .font(MeeshyFont.relative(iconSize, weight: .semibold))
                    .foregroundColor(.white)
                    .scaleEffect(isPressed ? 1.2 : 1.0)
                    .rotationEffect(.degrees(isPressed ? -8 : 0))

                if badge > 0 {
                    Text(NotificationBadge.displayed(badge))
                        .font(MeeshyFont.relative(MeeshyFont.microSize, weight: NotificationBadge.fontWeight))
                        .foregroundColor(Color(hex: color))
                        .lineLimit(1)
                        .padding(.horizontal, MeeshySpacing.xs)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(Capsule().fill(Color.white))
                        .offset(x: size * 0.33, y: -size * 0.33)
                        // Même règle que le glow : pas de respiration infinie
                        // sur une pastille que personne ne voit (menu fermé).
                        .ifTrue(isGlowEnabled) { $0.pulse(intensity: 0.08) }
                }
            }
            .scaleEffect(isPressed ? 0.82 : 1)
        }
        .accessibilityLabel(label)
        .accessibilityHint(hint)
        .onAppear { syncGlow() }
        // Le menu s'ouvre/se ferme SANS remonter les boutons (l'échelle reste
        // dans la hiérarchie) : c'est ce changement-ci, pas `onAppear`, qui
        // démarre et arrête réellement la respiration.
        .adaptiveOnChange(of: isGlowEnabled) { _, _ in syncGlow() }
        .onDisappear { stopGlow() }
    }

    /// Reduce Motion: keep the static base shadow, no breathing glow.
    private func syncGlow() {
        guard isGlowEnabled, !reduceMotion else {
            stopGlow()
            return
        }
        withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
            isGlowing = true
        }
    }

    private func stopGlow() {
        withTransaction(Transaction(animation: nil)) {
            isGlowing = false
        }
    }
}
