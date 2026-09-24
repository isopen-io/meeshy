import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Le parcours à l'écran : la pastille de points, « Passer tout », la barre de
/// progression, puis la carte courante.
///
/// **Un calque, pas une présentation modale.** La révélation de succès
/// (`EngagementRevealHost`), le composeur de story et la feuille système de
/// notifications sont des présentations plein écran ; posées PAR-DESSUS ce
/// calque, elles jouent sans qu'il faille le refermer. Présenté en
/// `fullScreenCover`, l'onboarding aurait empêché la racine de présenter quoi
/// que ce soit — y compris la célébration du premier message, le pic du
/// parcours.
struct OnboardingOverlay: View {
    @ObservedObject var model: OnboardingViewModel
    let onOpenStory: () -> Void
    let onExplore: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced

    @State private var flight: OnboardingReward?
    @State private var flightArrived = false
    @State private var pillBump = false

    private var isDark: Bool { colorScheme == .dark }
    private var reduceMotion: Bool { MeeshyMotion.shouldReduce(system: systemReduce, userForced: userForced) }

    var body: some View {
        ZStack {
            OnboardingBackdrop(isDark: isDark)
            VStack(spacing: MeeshySpacing.md) {
                topBar
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.top, MeeshySpacing.sm)
                    .zIndex(1)
                OnboardingCardView(model: model, isDark: isDark, onOpenStory: onOpenStory, onExplore: onExplore)
                    .id(model.card)
                    .transition(reduceMotion
                                ? .opacity
                                : .asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                              removal: .move(edge: .leading).combined(with: .opacity)))
            }
        }
        .meeshyAnimation(.spring(response: 0.5, dampingFraction: 0.86), value: model.card)
        .adaptiveOnChange(of: model.lastReward) { _, reward in
            guard let reward else { return }
            celebrate(reward)
        }
        .accessibilityAddTraits(.isModal)
        .accessibilityIdentifier("onboarding.overlay")
    }

    // MARK: - La barre du haut

    private var topBar: some View {
        VStack(spacing: MeeshySpacing.md) {
            HStack {
                OnboardingPointsPill(points: model.sessionPoints, bump: pillBump)
                    .overlay { rewardFlight }
                Spacer(minLength: MeeshySpacing.md)
                if model.card != .recap {
                    Button {
                        Task { await model.skipAll() }
                    } label: {
                        Text(String(localized: "onboarding.skipAll", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold, design: .rounded))
                            .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                            .padding(.horizontal, MeeshySpacing.sm)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("onboarding.skipAll")
                }
            }
            if case .step = model.card, model.stepCount > 0 {
                OnboardingProgressBar(position: model.stepPosition, count: model.stepCount, isDark: isDark)
            }
        }
    }

    /// Le « +N » qui MONTE vers la pastille : posé en calque de la pastille
    /// elle-même, il n'a aucune coordonnée à calculer — et suit donc la
    /// pastille à droite en arabe, sans une ligne de plus.
    @ViewBuilder
    private var rewardFlight: some View {
        if let flight {
            Text(verbatim: "+\(flight.points)")
                .font(MeeshyFont.relative(MeeshyFont.largeTitleSize, weight: .heavy, design: .rounded))
                .foregroundStyle(MeeshyColors.brandGradient)
                .shadow(color: MeeshyColors.indigo500.opacity(0.5), radius: 12, y: 4)
                .fixedSize()
                .offset(y: reduceMotion ? 44 : (flightArrived ? 0 : 280))
                .scaleEffect(reduceMotion ? 1 : (flightArrived ? 0.4 : 1.6))
                .opacity(flightArrived ? 0 : 1)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    private func celebrate(_ reward: OnboardingReward) {
        UIAccessibility.post(
            notification: .announcement,
            argument: String.localizedStringWithFormat(String(localized: "onboarding.reward.announce", bundle: .main), reward.points)
        )
        HapticFeedback.success()
        flightArrived = false
        flight = reward
        let travel = reduceMotion ? Animation.easeOut(duration: 1.2).delay(0.6) : .spring(response: 0.9, dampingFraction: 0.82).delay(0.15)
        withAnimation(travel) { flightArrived = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + (reduceMotion ? 1.9 : 0.85)) {
            if !reduceMotion {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.45)) { pillBump = true }
                withAnimation(.spring(response: 0.4, dampingFraction: 0.7).delay(0.2)) { pillBump = false }
            }
            if self.flight == reward { self.flight = nil }
        }
    }
}

// MARK: - L'hôte, posé en une ligne sur chaque racine

/// Monte l'onboarding sur une racine connectée : lecture de l'état au premier
/// utilisateur connu, présentation en calque, et les trois portes qui sortent
/// du calque — le composeur de story, Meeshy Global, et la fin.
///
/// Écrit UNE fois et posé des deux côtés (`RootView`, `iPadRootView`) : un hôte
/// écrit deux fois diverge, et la divergence ne rougit nulle part.
struct OnboardingHost: ViewModifier {
    let storyViewModel: StoryViewModel
    let router: Router

    @StateObject private var model = OnboardingViewModel()
    @State private var startedForUserId: String?
    @State private var storyUploadsAtOpen: Int?

    func body(content: Content) -> some View {
        content
            .overlay {
                if model.isPresented {
                    OnboardingOverlay(model: model, onOpenStory: openStoryComposer, onExplore: exploreGlobal)
                        .transition(.opacity)
                }
            }
            .meeshyAnimation(.easeInOut(duration: 0.35), value: model.isPresented)
            .onReceive(AuthManager.shared.$currentUser.receive(on: DispatchQueue.main)) { user in
                guard let user, startedForUserId != user.id else { return }
                startedForUserId = user.id
                Task { await model.start(user: user) }
            }
            .onReceive(storyViewModel.$showStoryComposer.dropFirst().receive(on: DispatchQueue.main)) { showing in
                guard !showing, let before = storyUploadsAtOpen else { return }
                storyUploadsAtOpen = nil
                let published = storyViewModel.activeUploads.count > before
                Task { await model.storyComposerClosed(published: published) }
            }
    }

    /// La visibilité par défaut de la première story suit le régime serveur :
    /// « amis » pour un mineur OU un âge inconnu. On ne l'écrit que dans ce
    /// sens — imposer « public » écraserait l'audience qu'un adulte aurait déjà
    /// choisie ; le défaut du composeur est de toute façon public.
    private func openStoryComposer() {
        if model.storyDefaultVisibility == .friends {
            StoryVisibilityPreferenceStore().remember(PostVisibility.friends.rawValue)
        }
        storyUploadsAtOpen = storyViewModel.activeUploads.count
        storyViewModel.showStoryComposer = true
    }

    private func exploreGlobal() {
        let conversationId = model.globalConversationId
        Task {
            await model.finish()
            guard let conversationId, let url = URL(string: "meeshy://conversation/\(conversationId)") else { return }
            router.handleDeepLink(url)
        }
    }
}

extension View {
    /// Pose l'onboarding post-inscription sur une racine. UNE ligne, des deux côtés.
    func onboardingHost(storyViewModel: StoryViewModel, router: Router) -> some View {
        modifier(OnboardingHost(storyViewModel: storyViewModel, router: router))
    }
}
