import XCTest
import UIKit
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// « Validez votre compte » passe PAR-DESSUS TOUT (#14046, directive porteur
/// du 2026-10-31 : « il faut rendre la bannière opaque par-dessus tout »).
///
/// Sur iOS, l'invitation est une FEUILLE (#8239), pas un bandeau : elle ne
/// recouvre aucun contrôle, on la lit puis on la ferme. Elle était posée par
/// `.sheet` sur la RACINE — or UIKit ne présente qu'un contrôleur modal par
/// présentateur : composer, visionneuse ou feuille ouverts, l'invitation ne
/// trouvait nulle part où se poser, et le jour était quand même consommé. Elle
/// vit désormais dans SA fenêtre (le patron de l'écran d'appel, #8725), au fond
/// plein, et « Plus tard » la retire avec sa fenêtre.
@MainActor
final class ActivationInvitePresenterTests: XCTestCase {

    private final class MockHosting: ActivationInviteWindowHosting {
        var canShow = true
        private(set) var showCount = 0
        private(set) var hideCount = 0
        private(set) var dismissedByUser: (() -> Void)?

        func show(_ model: ActivationInviteViewModel, onDismissedByUser: @escaping () -> Void) -> Bool {
            showCount += 1
            guard canShow else { return false }
            dismissedByUser = onDismissedByUser
            return true
        }

        func hide() { hideCount += 1 }
    }

    private final class AlwaysFreshDayStore: ActivationInviteDayStoring {
        func wasShownToday(now: Date) -> Bool { false }
        func markShown(now: Date) {}
    }

    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    private func makeSUT() -> (ActivationInvitePresenter, MockHosting, ActivationInviteViewModel) {
        let hosting = MockHosting()
        let now = self.now
        let model = ActivationInviteViewModel(store: AlwaysFreshDayStore(), now: { now })
        return (ActivationInvitePresenter(hosting: hosting), hosting, model)
    }

    private func invitedUser() -> MeeshyUser {
        let deadline = ISO8601DateFormatter().string(from: now.addingTimeInterval(19 * 86_400))
        return MeeshyUser(id: "u1", username: "amina", email: "amina@example.test",
                          activation: UserActivation(phase: .invite, deadline: deadline, missing: [.email]))
    }

    func test_apply_presented_showsTheInviteInItsOwnWindowOnce() {
        let (sut, hosting, model) = makeSUT()

        sut.apply(model: model, isPresented: true)
        sut.apply(model: model, isPresented: true)

        XCTAssertEqual(hosting.showCount, 1)
        XCTAssertTrue(sut.isShowing)
    }

    func test_apply_laterTapped_removesTheWindow() {
        let (sut, hosting, model) = makeSUT()
        sut.apply(model: model, isPresented: true)

        sut.apply(model: model, isPresented: false)

        XCTAssertEqual(hosting.hideCount, 1)
        XCTAssertFalse(sut.isShowing)
    }

    func test_sheetSwipedAway_dismissesTheModelWithoutASecondTeardown() {
        let (sut, hosting, model) = makeSUT()
        model.userChanged(invitedUser())
        sut.apply(model: model, isPresented: model.isPresented)

        hosting.dismissedByUser?()
        sut.apply(model: model, isPresented: model.isPresented)

        XCTAssertFalse(model.isPresented)
        XCTAssertFalse(sut.isShowing)
        XCTAssertEqual(hosting.hideCount, 0)
    }

    func test_noForegroundScene_retriesOnTheNextActivation() {
        let (sut, hosting, model) = makeSUT()
        hosting.canShow = false
        sut.apply(model: model, isPresented: true)
        XCTAssertFalse(sut.isShowing)

        hosting.canShow = true
        sut.retryPendingShow(model: model)

        XCTAssertTrue(sut.isShowing)
        XCTAssertEqual(hosting.showCount, 2)
    }

    func test_retry_withNothingPending_showsNothing() {
        let (sut, hosting, model) = makeSUT()

        sut.retryPendingShow(model: model)

        XCTAssertEqual(hosting.showCount, 0)
    }

    func test_inviteSurface_isOpaqueInLightAndDark() {
        [false, true].forEach { isDark in
            var alpha: CGFloat = 0
            ActivationInvitePresentation.surface(isDark: isDark).getRed(nil, green: nil, blue: nil, alpha: &alpha)
            XCTAssertEqual(alpha, 1, "isDark=\(isDark)")
        }
    }

    func test_inviteWindow_sitsAboveEveryPresentationButBelowTheCallScreen() {
        XCTAssertGreaterThan(ActivationInvitePresentation.windowLevel, .normal)
        XCTAssertLessThan(ActivationInvitePresentation.windowLevel, CallWindowPresentation.windowLevel)
    }

    func test_host_neverPresentsFromTheRoot() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Activation/ActivationInviteHost.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: root, encoding: .utf8))

        XCTAssertFalse(code.contains(".sheet("), "une feuille posée sur la racine ne se présente pas par-dessus un composer ou une visionneuse")
        XCTAssertTrue(code.contains("ActivationInvitePresenter"))
    }
}
