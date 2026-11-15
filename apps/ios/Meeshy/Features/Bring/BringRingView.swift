import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'écran d'un Bring qui sonne chez moi : qui me fait sonner, pourquoi ce son est forcé, et UN geste pour l'arrêter.
/// Il se monte par-dessus toute l'app (`bringRingOverlay()`), comme l'écran de refus d'âge : rien d'autre n'est
/// atteignable tant qu'il sonne, et VoiceOver le lit comme une alerte modale.
struct BringRingView: View {
    let incoming: BringIncoming
    let onStop: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulsing = false

    private var name: String {
        incoming.name ?? String(localized: "bring.incoming.someone", defaultValue: "Quelqu’un", bundle: .main)
    }

    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            Spacer(minLength: MeeshySpacing.xl)
            LivePresence {
                MeeshyAvatar(
                    name: name,
                    context: .profileSheet,
                    accentColor: DynamicColorGenerator.colorForName(name),
                    avatarURL: incoming.avatarURL,
                    presenceState: PresenceManager.shared.knownPresenceState(for: incoming.ring.fromUserId),
                    isDark: isDark
                )
            }
            .scaleEffect(pulsing ? 1.06 : 1)
            .accessibilityHidden(true)
            Text(verbatim: "🔔")
                .font(.largeTitle)
                .accessibilityHidden(true)
            Text(String(format: String(localized: "bring.incoming.title", defaultValue: "%@ vous fait sonner", bundle: .main), name))
                .font(.title2.weight(.bold))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text(String(localized: "bring.incoming.body", defaultValue: "Un Bring : un appel pour une urgence extrême.", bundle: .main))
                .font(.body)
                .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
                .multilineTextAlignment(.center)
            Spacer(minLength: MeeshySpacing.xl)
            Button(action: onStop) {
                Text(String(localized: "bring.incoming.stop", defaultValue: "Arrêter", bundle: .main))
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(Capsule().fill(MeeshyColors.error))
            }
            .accessibilityIdentifier("bring.incoming.stop")
        }
        .padding(.horizontal, MeeshySpacing.xxl)
        .padding(.bottom, MeeshySpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(MeeshyColors.mainBackgroundGradient(isDark: isDark).ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { pulsing = true }
        }
    }
}

private struct BringRingOverlay: ViewModifier {
    @ObservedObject var center: BringCenter

    func body(content: Content) -> some View {
        content.overlay {
            if let incoming = center.incoming {
                BringRingView(incoming: incoming) { center.stopIncoming() }
                    .transition(.opacity)
                    .id(incoming.id)
            }
        }
        .animation(.easeOut(duration: 0.2), value: center.incoming?.id)
    }
}

extension View {
    /// Monte l'écran de sonnerie d'un Bring au-dessus de tout le contenu de l'app.
    func bringRingOverlay() -> some View {
        modifier(BringRingOverlay(center: BringCenter.shared))
    }
}
