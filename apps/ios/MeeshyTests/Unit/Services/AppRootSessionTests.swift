import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class AppRootSessionTests: XCTestCase {

    @MainActor
    private final class FakeRootSessionSource: AppRootSessionSource {
        var isAuthenticated = false
        var hasResolvedStoredSession = false
        var isSwitchingAccount = false
        var sessionRevocationNotice: SessionRevocationNotice?
        var rootSystemLanguage: String?
        var displayName = "Awa"
    }

    private func makeSource(
        authenticated: Bool = true,
        resolved: Bool = true,
        switching: Bool = false,
        notice: SessionRevocationNotice? = nil,
        language: String? = "fr"
    ) -> FakeRootSessionSource {
        let source = FakeRootSessionSource()
        source.isAuthenticated = authenticated
        source.hasResolvedStoredSession = resolved
        source.isSwitchingAccount = switching
        source.sessionRevocationNotice = notice
        source.rootSystemLanguage = language
        return source
    }

    func test_init_projectsTheFiveRootFields() {
        let notice = SessionRevocationNotice(reason: .sessionExpired)
        let session = AppRootSession(makeSource(authenticated: true, resolved: true, switching: true, notice: notice, language: "es"))

        XCTAssertTrue(session.isAuthenticated)
        XCTAssertTrue(session.hasResolvedStoredSession)
        XCTAssertTrue(session.isSwitchingAccount)
        XCTAssertEqual(session.revocationNotice, notice)
        XCTAssertEqual(session.systemLanguage, "es")
    }

    func test_init_withAnonymousSource_projectsTheClosedState() {
        let session = AppRootSession(makeSource(authenticated: false, resolved: false, language: nil))

        XCTAssertFalse(session.isAuthenticated)
        XCTAssertFalse(session.hasResolvedStoredSession)
        XCTAssertNil(session.revocationNotice)
        XCTAssertNil(session.systemLanguage)
    }

    func test_sameRootFields_withAnotherProfile_areEqual() {
        let source = makeSource()
        let before = AppRootSession(source)
        source.displayName = "Awa Diop"
        let after = AppRootSession(source)

        XCTAssertEqual(before, after)
    }

    func test_languageChange_isNotEqual() {
        let source = makeSource(language: "fr")
        let before = AppRootSession(source)
        source.rootSystemLanguage = "en"

        XCTAssertNotEqual(before, AppRootSession(source))
    }

    func test_revocationNotice_isNotEqual() {
        let source = makeSource()
        let before = AppRootSession(source)
        source.sessionRevocationNotice = SessionRevocationNotice(reason: .adminRevoke)

        XCTAssertNotEqual(before, AppRootSession(source))
    }

    func test_authenticationChange_isNotEqual() {
        let source = makeSource(authenticated: false)
        let before = AppRootSession(source)
        source.isAuthenticated = true

        XCTAssertNotEqual(before, AppRootSession(source))
    }
}
