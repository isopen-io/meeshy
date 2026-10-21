enum RootRoute: Equatable {
    case connected
    case login
    case none
}

enum RootPresentationRules {
    static func route(session: AppRootSession, hasCheckedSession: Bool, previewReplacesLogin: Bool) -> RootRoute {
        if session.isAuthenticated { return .connected }
        guard hasCheckedSession, !previewReplacesLogin, !session.isSwitchingAccount else { return .none }
        return .login
    }

    static func showsGuestCover(guest: GuestSession?, isAuthenticated: Bool) -> Bool {
        guard let guest else { return false }
        return !isAuthenticated || guest.isDeliberate
    }

    static func visitorContentIsEligible(isAuthenticated: Bool, hasGuestSession: Bool, splashPhase: LaunchSplashController.Phase) -> Bool {
        !isAuthenticated && !hasGuestSession && splashPhase != .covering
    }

    static func showsOnboarding(
        hasCompletedOnboarding: Bool,
        isAuthenticated: Bool,
        splashPhase: LaunchSplashController.Phase,
        hasGuestSession: Bool,
        hasVisitorRequest: Bool
    ) -> Bool {
        !hasCompletedOnboarding && !isAuthenticated && splashPhase != .covering && !hasGuestSession && !hasVisitorRequest
    }

    static func showsCelebration(isAuthenticated: Bool, isShowing: Bool) -> Bool {
        isAuthenticated && isShowing
    }
}
