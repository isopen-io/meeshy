import SwiftUI
import MeeshySDK
import MeeshyUI

struct RootSceneState {
    let hasCheckedSession: Bool
    let previewReplacesLogin: Bool
    let splashPhase: LaunchSplashController.Phase
    let isCelebrating: Bool
    let pendingDeepLink: DeepLink?
}

struct RootSceneActions {
    let onLoginAppear: () -> Void
    let onSkipCelebration: () -> Void
    let holdSplashUntilCeiling: () async -> Void
}

struct RootInputs {
    let hasCheckedSession: Bool
    let activeGuestSession: GuestSession?
    let splashPhase: LaunchSplashController.Phase
    let isCelebrating: Bool
    let pendingDeepLink: DeepLink?
    let hasCompletedOnboarding: Bool
    let hasVisitorRequest: Bool
    let crashReports: [CrashDiagnostic]
    let previewReplacesLogin: Bool

    var scene: RootSceneState {
        RootSceneState(
            hasCheckedSession: hasCheckedSession,
            previewReplacesLogin: previewReplacesLogin,
            splashPhase: splashPhase,
            isCelebrating: isCelebrating,
            pendingDeepLink: pendingDeepLink
        )
    }
}

struct RootScene: View {
    let session: AppRootSession
    let commands: AppRootSessionCommands
    let state: RootSceneState
    let actions: RootSceneActions

    var body: some View {
        ZStack {
            SessionContent(
                session: session,
                commands: commands,
                route: RootPresentationRules.route(
                    session: session,
                    hasCheckedSession: state.hasCheckedSession,
                    previewReplacesLogin: state.previewReplacesLogin
                ),
                pendingDeepLink: state.pendingDeepLink,
                onLoginAppear: actions.onLoginAppear
            )
            .opacity(state.splashPhase == .covering ? 0 : 1)
            .accessibilityHidden(state.isCelebrating)
            .modifier(ComposerRetoucheRecetteCover())

            if RootPresentationRules.showsCelebration(isAuthenticated: session.isAuthenticated, isShowing: state.isCelebrating) {
                ArrivalCelebrationView(onSkip: actions.onSkipCelebration)
                    .transition(.opacity)
                    .zIndex(3)
            }

            if state.splashPhase != .gone {
                SplashScreen()
                    .fullScreenGate(isPresented: state.splashPhase == .covering)
                    .task { await actions.holdSplashUntilCeiling() }
                    .zIndex(1)
            }

            #if DEBUG
            if OnboardingPreviewLaunch.isActive {
                OnboardingPreviewScreen().zIndex(2)
            }
            if ConversationLinkCardPreviewLaunch.isActive {
                ConversationLinkCardPreviewScreen().zIndex(2)
            }
            if ResetPasswordPreviewLaunch.isActive {
                ResetPasswordPreviewScreen().zIndex(2)
            }
            if ForgotPasswordPreviewLaunch.isActive {
                ForgotPasswordPreviewScreen().zIndex(2)
            }
            if LinkSignInConfirmationPreviewLaunch.isActive {
                LinkSignInConfirmationPreviewScreen().zIndex(2)
            }
            #endif
        }
        .meeshyAnimation(.easeInOut(duration: 0.35), value: state.isCelebrating)
    }
}
