import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// Les constats d'audit des Réglages (#18315) soldés avec les deux strates
/// (#18589) : un bouton qui a un effet visible, un envoi qui ne part qu'une
/// fois, une apparition qui se fond. Les gardes de source portent sur ce qui ne
/// laisse aucune trace hors du rendu (une transition, un `.disabled`) ; le
/// reste se prouve par le comportement.
@MainActor
final class SettingsAuditFixesTests: XCTestCase {

    private final class FailingCircleNotifyService: CircleNotifyServiceProviding, @unchecked Sendable {
        private struct Unreachable: Error {}
        func load() async throws -> CircleNotifyPreferences { throw Unreachable() }
        func update(_ key: CircleNotifyKey, to choice: RelationAudienceChoice) async throws -> RelationAudienceChoice { choice }
    }

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    // MARK: - « Noter l'app » a toujours un effet

    func test_reviewLink_opensTheWriteReviewPageOfMeeshy() {
        let link = SupportReviewLink.url.absoluteString
        XCTAssertTrue(link.contains("apps.apple.com/app/id6760208591"), link)
        XCTAssertTrue(link.hasSuffix("action=write-review"), link)
    }

    func test_supportView_rateButton_noLongerDependsOnTheReviewQuota() throws {
        let support = try code("Meeshy/Features/Settings/Views/SupportView.swift")
        XCTAssertFalse(support.contains("requestReview()"), "iOS ne présente pas toujours l'invite : le bouton restait inerte")
        XCTAssertTrue(support.contains("openURL(SupportReviewLink.url)"))
    }

    // MARK: - « Réessayer » se voit

    func test_load_retryAfterAFailure_passesThroughLoading() async {
        let defaults = UserDefaults(suiteName: "SettingsAuditFixesTests.\(UUID().uuidString)") ?? .standard
        let sut = CircleNotifySettingsViewModel(service: FailingCircleNotifyService(), networkMonitor: FakeNetworkMonitor(isOnline: true),
                                                defaults: defaults, accountId: nil, onRefusal: { _ in })
        var states: [CircleNotifySettingsViewModel.LoadState] = []
        let recording = sut.$loadState.sink { states.append($0) }
        await sut.load()
        await sut.load()
        recording.cancel()
        XCTAssertEqual(states, [.loading, .unavailable, .loading, .unavailable])
    }

    // MARK: - Un envoi de code part une fois

    func test_emailVerify_isGuardedAgainstASecondTap() throws {
        let email = try code("Meeshy/Features/Settings/Views/SecurityEmailSection.swift")
        XCTAssertTrue(email.contains("guard !emailLoading else { return }"))
        XCTAssertTrue(email.contains(".disabled(emailLoading)"))
        XCTAssertTrue(email.contains("SecurityVerifyGlyph(isSending: emailLoading)"), "l'envoi en cours se voit")
    }

    func test_phoneVerify_isGuardedAgainstASecondTap() throws {
        let phone = try code("Meeshy/Features/Settings/Views/SecurityPhoneSection.swift")
        XCTAssertTrue(phone.contains(".disabled(phoneFlow.isSending)"))
        XCTAssertTrue(phone.contains("SecurityVerifyGlyph(isSending: phoneFlow.isSending)"))
        let flow = try code("Meeshy/Features/Settings/ViewModels/PhoneChangeFlowModel.swift")
        XCTAssertTrue(flow.contains("guard !isSending else { return }"))
    }

    // MARK: - Le profil vocal créé se voit au retour

    func test_voiceManage_reloadsTheProfileWhenTheWizardCloses() throws {
        let manage = try code("Meeshy/Features/Settings/Views/VoiceProfileManageView.swift")
        XCTAssertTrue(manage.contains(".sheet(isPresented: $showWizard, onDismiss: { Task { await viewModel.loadProfile() } })"))
    }

    // MARK: - Ce qui apparaît se fond

    func test_settings_logoutVeil_fadeIsCarriedByItsContainer() throws {
        let buttons = try code("Meeshy/Features/Settings/Views/SettingsSessionButtons.swift")
        XCTAssertTrue(buttons.contains("value: isVisible)"), "le fondu observe la valeur, hors de la vue insérée")
        let settings = try code("Meeshy/Features/Settings/Views/SettingsView.swift")
        XCTAssertTrue(settings.contains("SettingsLogoutVeil(isVisible: isLoggingOut)"))
        XCTAssertFalse(settings.contains("withAnimation("), "chaque animation des Réglages lit « réduire les animations »")
    }

    /// Un `withAnimation` nu ignore la préférence « Réduire les animations »
    /// de l'app : chaque changement d'état animé passe par l'aide qui la lit.
    func test_securityAndTwoFactor_everyAnimatedChange_readsReduceMotion() throws {
        for path in ["Meeshy/Features/Settings/Views/TwoFactorSetupView.swift",
                     "Meeshy/Features/Settings/Views/SecurityEmailSection.swift"] {
            let source = try code(path)
            XCTAssertNil(source.range(of: "(?<![A-Za-z])withAnimation", options: .regularExpression), "\(path) anime sans lire la réduction")
            XCTAssertTrue(source.contains("MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)"), path)
        }
    }

    func test_focusHighlight_readsBothHalvesOfReduceMotion() throws {
        let focus = try code("Meeshy/Features/Settings/Views/SettingsFocus.swift")
        XCTAssertTrue(focus.contains("@Environment(\\.meeshyForceReduceMotion)"), "la préférence de l'app éteint aussi la pulsation")
        XCTAssertNil(focus.range(of: "(?<![A-Za-z])withAnimation", options: .regularExpression))
    }

    func test_settings_riviereRow_fadesWhenReadingModesToggle() throws {
        let settings = try code("Meeshy/Features/Settings/Views/SettingsView.swift")
        XCTAssertTrue(settings.contains("value: readingModesEnabled)"))
        XCTAssertTrue(settings.contains(".contentTransition(.opacity)"))
    }

    func test_voiceWizard_stepsFadeIntoEachOther() throws {
        let wizard = try code("Meeshy/Features/Settings/Views/VoiceProfileWizardView.swift")
        XCTAssertTrue(wizard.contains("value: viewModel.currentStep)"))
        XCTAssertTrue(wizard.contains(".transition(.opacity)"))
    }

    func test_activeSessions_revokedRowFadesOut() throws {
        let sessions = try code("Meeshy/Features/Settings/Views/ActiveSessionsView.swift")
        XCTAssertTrue(sessions.contains("value: viewModel.otherSessions.map(\\.id))"))
    }

    func test_encryptedDevice_codeFadesInPlaceOfTheButton() throws {
        let sheet = try code("Meeshy/Features/Settings/Views/EncryptedDevices/EncryptedDeviceSheet.swift")
        XCTAssertTrue(sheet.contains("value: shown != nil)"))
    }
}
