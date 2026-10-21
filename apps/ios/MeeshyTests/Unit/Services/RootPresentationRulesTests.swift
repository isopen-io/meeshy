import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class RootPresentationRulesTests: XCTestCase {

    private func session(authenticated: Bool = false, switching: Bool = false) -> AppRootSession {
        AppRootSession.make(isAuthenticated: authenticated, isSwitchingAccount: switching)
    }

    private func guest(deliberate: Bool) -> GuestSession {
        GuestSession(identifier: "link-1", context: nil, isDeliberate: deliberate)
    }

    func test_route_authenticated_isConnected_whateverElse() {
        for checked in [true, false] {
            for preview in [true, false] {
                XCTAssertEqual(
                    RootPresentationRules.route(session: session(authenticated: true), hasCheckedSession: checked, previewReplacesLogin: preview),
                    .connected
                )
            }
        }
    }

    func test_route_login_onlyWhenSessionCheckedWithoutPreviewNorSwitch() {
        XCTAssertEqual(RootPresentationRules.route(session: session(), hasCheckedSession: true, previewReplacesLogin: false), .login)
        XCTAssertEqual(RootPresentationRules.route(session: session(), hasCheckedSession: false, previewReplacesLogin: false), .none)
        XCTAssertEqual(RootPresentationRules.route(session: session(), hasCheckedSession: true, previewReplacesLogin: true), .none)
        XCTAssertEqual(RootPresentationRules.route(session: session(switching: true), hasCheckedSession: true, previewReplacesLogin: false), .none)
    }

    func test_guestCover_needsAGuestSession() {
        XCTAssertFalse(RootPresentationRules.showsGuestCover(guest: nil, isAuthenticated: false))
        XCTAssertFalse(RootPresentationRules.showsGuestCover(guest: nil, isAuthenticated: true))
    }

    func test_guestCover_accidentIsRefusedWhenAuthenticated_deliberateChoiceIsKept() {
        XCTAssertTrue(RootPresentationRules.showsGuestCover(guest: guest(deliberate: false), isAuthenticated: false))
        XCTAssertFalse(RootPresentationRules.showsGuestCover(guest: guest(deliberate: false), isAuthenticated: true))
        XCTAssertTrue(RootPresentationRules.showsGuestCover(guest: guest(deliberate: true), isAuthenticated: true))
        XCTAssertTrue(RootPresentationRules.showsGuestCover(guest: guest(deliberate: true), isAuthenticated: false))
    }

    func test_visitorContent_isEligibleOnlyWithoutSessionGuestNorSplash() {
        XCTAssertTrue(RootPresentationRules.visitorContentIsEligible(isAuthenticated: false, hasGuestSession: false, splashPhase: .gone))
        XCTAssertTrue(RootPresentationRules.visitorContentIsEligible(isAuthenticated: false, hasGuestSession: false, splashPhase: .fading))
        XCTAssertFalse(RootPresentationRules.visitorContentIsEligible(isAuthenticated: false, hasGuestSession: false, splashPhase: .covering))
        XCTAssertFalse(RootPresentationRules.visitorContentIsEligible(isAuthenticated: false, hasGuestSession: true, splashPhase: .gone))
        XCTAssertFalse(RootPresentationRules.visitorContentIsEligible(isAuthenticated: true, hasGuestSession: false, splashPhase: .gone))
    }

    func test_onboarding_needsAllFiveConjunctions() {
        func shows(
            completed: Bool = false, authenticated: Bool = false, splash: LaunchSplashController.Phase = .gone,
            guest: Bool = false, visitor: Bool = false
        ) -> Bool {
            RootPresentationRules.showsOnboarding(
                hasCompletedOnboarding: completed, isAuthenticated: authenticated, splashPhase: splash,
                hasGuestSession: guest, hasVisitorRequest: visitor
            )
        }
        XCTAssertTrue(shows())
        XCTAssertFalse(shows(completed: true))
        XCTAssertFalse(shows(authenticated: true))
        XCTAssertFalse(shows(splash: .covering))
        XCTAssertFalse(shows(guest: true))
        XCTAssertFalse(shows(visitor: true))
    }

    func test_celebration_needsASessionAndTheCelebrationShowing() {
        XCTAssertTrue(RootPresentationRules.showsCelebration(isAuthenticated: true, isShowing: true))
        XCTAssertFalse(RootPresentationRules.showsCelebration(isAuthenticated: false, isShowing: true))
        XCTAssertFalse(RootPresentationRules.showsCelebration(isAuthenticated: true, isShowing: false))
    }
}

extension AppRootSession {
    @MainActor
    fileprivate static func make(isAuthenticated: Bool, isSwitchingAccount: Bool) -> AppRootSession {
        final class Source: AppRootSessionSource {
            let isAuthenticated: Bool
            let isSwitchingAccount: Bool
            let hasResolvedStoredSession = true
            let sessionRevocationNotice: SessionRevocationNotice? = nil
            let rootSystemLanguage: String? = nil
            init(isAuthenticated: Bool, isSwitchingAccount: Bool) {
                self.isAuthenticated = isAuthenticated
                self.isSwitchingAccount = isSwitchingAccount
            }
        }
        return AppRootSession(Source(isAuthenticated: isAuthenticated, isSwitchingAccount: isSwitchingAccount))
    }
}
