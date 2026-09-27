import XCTest
import MeeshySDK
@testable import Meeshy

/// **Publier sans adresse prouvée mène directement à sa validation** (#8365) —
/// le gardien de l'app sait quand l'adresse est connue non prouvée (sans
/// aller-retour), présente la validation avec sa raison et l'adresse à qui
/// envoyer le code, et tranche TOUTES les demandes en cours d'un seul verdict.
@MainActor
final class EmailVerificationGateControllerTests: XCTestCase {

    private final class Presenter {
        private(set) var shown: [(reason: EmailGateReason, email: String)] = []
        private(set) var dismissCount = 0
        var canPresent = true
        var settle: ((Bool) -> Void)?

        func present(_ reason: EmailGateReason, _ email: String, _ settle: @escaping (Bool) -> Void) -> (() -> Void)? {
            guard canPresent else { return nil }
            shown.append((reason, email))
            self.settle = settle
            return { [weak self] in self?.dismissCount += 1 }
        }
    }

    private func makeUser(
        email: String? = "amina@example.test",
        emailVerifiedAt: String? = nil,
        activation: UserActivation? = UserActivation(phase: .quiet, deadline: nil, missing: [.email, .phone])
    ) -> MeeshyUser {
        MeeshyUser(id: "u1", username: "amina", email: email, emailVerifiedAt: emailVerifiedAt, activation: activation)
    }

    private func makeSUT(user: MeeshyUser?, onboarding: Bool = false) -> (EmailVerificationGateController, Presenter) {
        let presenter = Presenter()
        let sut = EmailVerificationGateController(
            currentUser: { user },
            onboardingPresented: { onboarding },
            present: { presenter.present($0, $1, $2) }
        )
        return (sut, presenter)
    }

    // MARK: - Connue non prouvée, sans aller-retour

    func test_emailKnownUnproven_unverifiedAddress_isTrue() async {
        let (sut, _) = makeSUT(user: makeUser())
        let unproven = await sut.emailKnownUnproven()
        XCTAssertTrue(unproven)
    }

    func test_emailKnownUnproven_verifiedOrNoAddress_isFalse() async {
        let verified = makeSUT(user: makeUser(emailVerifiedAt: "2026-09-01T00:00:00.000Z", activation: nil)).0
        let noEmail = makeSUT(user: makeUser(email: nil)).0
        let signedOut = makeSUT(user: nil).0
        let proven = makeSUT(user: makeUser(activation: UserActivation(phase: .done, deadline: nil, missing: [.phone]))).0

        let answers = [await verified.emailKnownUnproven(), await noEmail.emailKnownUnproven(),
                       await signedOut.emailKnownUnproven(), await proven.emailKnownUnproven()]
        XCTAssertEqual(answers, [false, false, false, false])
    }

    // MARK: - La validation se présente et tranche

    func test_verifyEmail_presentsReasonAndAddress_andCodeValidatedAnswersTrue() async {
        let (sut, presenter) = makeSUT(user: makeUser())

        async let answer = sut.verifyEmail(for: .publish)
        await Task.yield()
        XCTAssertEqual(presenter.shown.map(\.reason), [.publish])
        XCTAssertEqual(presenter.shown.first?.email, "amina@example.test")

        presenter.settle?(true)
        let verified = await answer
        XCTAssertTrue(verified)
        XCTAssertEqual(presenter.dismissCount, 1)

        let stillUnproven = await sut.emailKnownUnproven()
        XCTAssertFalse(stillUnproven, "le code validé vaut preuve, sans attendre la relecture du profil")
    }

    func test_verifyEmail_concurrentRequests_shareOnePresentationAndOneAnswer() async {
        let (sut, presenter) = makeSUT(user: makeUser())

        async let first = sut.verifyEmail(for: .publish)
        async let second = sut.verifyEmail(for: .link)
        await Task.yield()
        await Task.yield()
        XCTAssertEqual(presenter.shown.count, 1)

        presenter.settle?(false)
        let answers = await [first, second]
        XCTAssertEqual(answers, [false, false])
    }

    func test_verifyEmail_duringOnboarding_answersFalseWithoutPresenting() async {
        let (sut, presenter) = makeSUT(user: makeUser(), onboarding: true)
        let verified = await sut.verifyEmail(for: .publish)
        XCTAssertFalse(verified)
        XCTAssertTrue(presenter.shown.isEmpty)
    }

    func test_verifyEmail_withoutAddressOrPresenter_answersFalse() async {
        let noEmail = makeSUT(user: makeUser(email: nil)).0
        let (blocked, presenter) = makeSUT(user: makeUser())
        presenter.canPresent = false

        let answers = [await noEmail.verifyEmail(for: .invite), await blocked.verifyEmail(for: .invite)]
        XCTAssertEqual(answers, [false, false])
    }
}
