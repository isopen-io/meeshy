enum RootRoute: Equatable {
    case connected
    case login
    case none
}

enum RootPresentationRules {
    static func route(session: AppRootSession, hasCheckedSession: Bool, previewReplacesLogin: Bool) -> RootRoute {
        .none
    }

    static func showsGuestCover(guest: GuestSession?, isAuthenticated: Bool) -> Bool {
        false
    }

    static func visitorContentIsEligible(isAuthenticated: Bool, hasGuestSession: Bool, splashPhase: LaunchSplashController.Phase) -> Bool {
        false
    }

    static func showsOnboarding(
        hasCompletedOnboarding: Bool,
        isAuthenticated: Bool,
        splashPhase: LaunchSplashController.Phase,
        hasGuestSession: Bool,
        hasVisitorRequest: Bool
    ) -> Bool {
        false
    }

    static func showsCelebration(isAuthenticated: Bool, isShowing: Bool) -> Bool {
        false
    }
}
