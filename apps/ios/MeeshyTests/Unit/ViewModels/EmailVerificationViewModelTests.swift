import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
private final class MockEmailVerificationConfirmer: EmailVerificationConfirming {
    nonisolated deinit {}
    var result: Result<Bool, Error> = .success(true)
    private(set) var requests: [EmailVerificationRequest] = []

    func confirmEmail(_ request: EmailVerificationRequest) async throws -> Bool {
        requests.append(request)
        return try result.get()
    }
}

@MainActor
final class EmailVerificationViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        email: String = "test@example.com",
        password: String? = nil,
        accountCreated: Bool = false
    ) -> (sut: EmailVerificationViewModel, authService: MockAuthServiceSDK, confirmer: MockEmailVerificationConfirmer) {
        let authService = MockAuthServiceSDK()
        let confirmer = MockEmailVerificationConfirmer()
        let sut = EmailVerificationViewModel(
            email: email,
            password: password,
            accountCreated: accountCreated,
            authService: authService,
            confirmer: confirmer
        )
        return (sut, authService, confirmer)
    }

    // MARK: - verifyCode

    func test_verifyCode_sessionServed_opensSessionAndSucceeds() async {
        let (sut, _, confirmer) = makeSUT()
        confirmer.result = .success(true)

        await sut.verifyCode("123456")

        XCTAssertTrue(sut.verificationSuccess)
        XCTAssertTrue(sut.sessionOpened)
        XCTAssertNil(sut.error)
        XCTAssertFalse(sut.isVerifying)
        XCTAssertEqual(confirmer.requests, [.code("123456", email: "test@example.com")])
    }

    func test_verifyCode_sendsThePasswordTypedAtLogin() async {
        let (sut, _, confirmer) = makeSUT(email: "new@example.com", password: "typed-at-login")

        await sut.verifyCode("111222")

        XCTAssertEqual(confirmer.requests, [.code("111222", email: "new@example.com", password: "typed-at-login")])
    }

    func test_verifyCode_verifiedWithoutSession_succeedsWithoutOpeningSession() async {
        let (sut, _, confirmer) = makeSUT()
        confirmer.result = .success(false)

        await sut.verifyCode("123456")

        XCTAssertTrue(sut.verificationSuccess)
        XCTAssertFalse(sut.sessionOpened)
    }

    func test_verifyCode_error_setsError() async {
        let (sut, _, confirmer) = makeSUT()
        confirmer.result = .failure(MeeshyError.server(statusCode: 400, message: "Invalid code"))

        await sut.verifyCode("000000")

        XCTAssertFalse(sut.verificationSuccess)
        XCTAssertFalse(sut.sessionOpened)
        XCTAssertNotNil(sut.error)
        XCTAssertFalse(sut.isVerifying)
    }

    func test_verifyCode_clearsOldError() async {
        let (sut, _, confirmer) = makeSUT()
        confirmer.result = .failure(NSError(domain: "test", code: 500))
        await sut.verifyCode("bad")
        XCTAssertNotNil(sut.error)

        confirmer.result = .success(true)
        await sut.verifyCode("good")
        XCTAssertNil(sut.error)
        XCTAssertTrue(sut.verificationSuccess)
    }

    // MARK: - resendCode

    func test_resendCode_success_callsResendVerification() async {
        let (sut, mock, _) = makeSUT(email: "user@test.com")
        mock.resendVerificationEmailResult = .success(())

        await sut.resendCode()

        XCTAssertEqual(mock.resendVerificationEmailCallCount, 1)
        XCTAssertEqual(mock.lastResendEmail, "user@test.com")
        XCTAssertFalse(sut.isResending)
        XCTAssertNil(sut.error)
    }

    func test_resendCode_error_setsError() async {
        let (sut, mock, _) = makeSUT()
        mock.resendVerificationEmailResult = .failure(NSError(domain: "test", code: 429))

        await sut.resendCode()

        XCTAssertNotNil(sut.error)
        XCTAssertFalse(sut.isResending)
    }

    // MARK: - properties

    func test_properties_matchInitialization() {
        let (sut, _, _) = makeSUT(email: "hello@world.com", accountCreated: true)
        XCTAssertEqual(sut.email, "hello@world.com")
        XCTAssertTrue(sut.accountCreated)
    }

    func test_initialState_allFlagsAreFalse() {
        let (sut, _, _) = makeSUT()
        XCTAssertFalse(sut.isVerifying)
        XCTAssertFalse(sut.isResending)
        XCTAssertFalse(sut.resendSuccess)
        XCTAssertFalse(sut.verificationSuccess)
        XCTAssertFalse(sut.sessionOpened)
        XCTAssertNil(sut.error)
    }
}
