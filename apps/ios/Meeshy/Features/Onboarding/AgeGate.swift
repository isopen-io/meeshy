import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - L'écran « Meeshy est réservé aux 13 ans et plus », hors onboarding (#9929)
//
// Une déclaration sous 13 ans est DÉFINITIVE : ensuite, la connexion, le lien
// magique et le rafraîchissement du jeton répondent 403 `AGE_BELOW_MINIMUM`.
// Le transport le signale (`AgeGateSignal`) ; ce contrôleur, vivant pour toute
// la durée de l'app, montre l'écran par-dessus l'écran de connexion comme
// par-dessus une session qui vient d'être fermée — jamais une erreur générique,
// jamais une reconnexion qui boucle.

@MainActor
final class AgeGateController: ObservableObject {
    static let shared = AgeGateController()

    @Published private(set) var isShowing = false

    private let isAuthenticated: @MainActor () -> Bool
    private let signOut: @MainActor () async -> Void
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        center: NotificationCenter = .default,
        isAuthenticated: (@MainActor () -> Bool)? = nil,
        signOut: (@MainActor () async -> Void)? = nil
    ) {
        self.isAuthenticated = isAuthenticated ?? { AuthManager.shared.isAuthenticated }
        self.signOut = signOut ?? { await AuthManager.shared.logout() }
        center.publisher(for: .meeshyAgeBelowMinimum)
            .sink { [weak self] _ in
                Task { @MainActor in self?.isShowing = true }
            }
            .store(in: &cancellables)
    }

    /// « J'ai compris » : l'écran se retire, et une session encore ouverte se
    /// ferme — la passerelle les a révoquées, aucune ne doit survivre ici.
    func acknowledge() async {
        guard isShowing else { return }
        isShowing = false
        if isAuthenticated() { await signOut() }
    }
}

/// L'écran plein, sans autre sortie que « J'ai compris ».
struct AgeGateView: View {
    let onAcknowledge: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @ScaledMetric(relativeTo: .largeTitle) private var symbolSize: CGFloat = 72

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            Spacer(minLength: MeeshySpacing.xl)
            Image(systemName: "hand.raised.fill")
                .resizable()
                .scaledToFit()
                .frame(width: min(symbolSize, 110), height: min(symbolSize, 110))
                .foregroundStyle(MeeshyColors.brandGradient)
                .accessibilityHidden(true)
            Text(String(localized: "onboarding.age.refused.title", bundle: .main))
                .font(.title2.weight(.bold))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: colorScheme == .dark))
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text(String(localized: "ageGate.body", bundle: .main))
                .font(.body)
                .foregroundStyle(MeeshyColors.textMuted(isDark: colorScheme == .dark))
                .multilineTextAlignment(.center)
            Spacer(minLength: MeeshySpacing.xl)
            Button(action: onAcknowledge) {
                Text(String(localized: "onboarding.age.refused.signOut", bundle: .main))
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Capsule().fill(MeeshyColors.brandGradient))
            }
            .accessibilityIdentifier("ageGate.acknowledge")
        }
        .padding(.horizontal, MeeshySpacing.xxl)
        .padding(.bottom, MeeshySpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(MeeshyColors.mainBackgroundGradient(isDark: colorScheme == .dark).ignoresSafeArea())
        .accessibilityAddTraits(.isModal)
    }
}

private struct AgeGateOverlay: ViewModifier {
    @ObservedObject var controller: AgeGateController

    func body(content: Content) -> some View {
        content.overlay {
            if controller.isShowing {
                AgeGateView { Task { await controller.acknowledge() } }
                    .transition(.opacity)
            }
        }
    }
}

extension View {
    /// Monte l'écran de refus d'âge au-dessus de tout le contenu de l'app.
    func ageGateOverlay() -> some View {
        modifier(AgeGateOverlay(controller: AgeGateController.shared))
    }
}
