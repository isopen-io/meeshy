import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class EmailVerificationViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        email: String = "test@example.com",
        authService: MockAuthServiceSDK = MockAuthServiceSDK()
    ) -> (sut: EmailVerificationViewModel, authService: MockAuthServiceSDK) {
        let sut = EmailVerificationViewModel(email: email, authService: authService)
        return (sut, authService)
    }

    // MARK: - verifyCode

    func test_verifyCode_success_setsVerificationSuccess() async {
        let (sut, mock) = makeSUT()
        mock.verifyEmailWithCodeResult = .success(())

        await sut.verifyCode("123456")

        XCTAssertTrue(sut.verificationSuccess)
        XCTAssertNil(sut.error)
        XCTAssertFalse(sut.isVerifying)
        XCTAssertEqual(mock.verifyEmailWithCodeCallCount, 1)
        XCTAssertEqual(mock.lastVerifyEmailCode, "123456")
        XCTAssertEqual(mock.lastVerifyEmailEmail, "test@example.com")
    }

    func test_verifyCode_error_setsError() async {
        let (sut, mock) = makeSUT()
        mock.verifyEmailWithCodeResult = .failure(MeeshyError.server(statusCode: 400, message: "Invalid code"))

        await sut.verifyCode("000000")

        XCTAssertFalse(sut.verificationSuccess)
        XCTAssertNotNil(sut.error)
        XCTAssertFalse(sut.isVerifying)
    }

    func test_verifyCode_genericError_setsError() async {
        let (sut, mock) = makeSUT()
        mock.verifyEmailWithCodeResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Server error"]))

        await sut.verifyCode("999999")

        XCTAssertFalse(sut.verificationSuccess)
        XCTAssertNotNil(sut.error)
    }

    func test_verifyCode_clearsOldError() async {
        let (sut, mock) = makeSUT()
        mock.verifyEmailWithCodeResult = .failure(NSError(domain: "test", code: 500))
        await sut.verifyCode("bad")
        XCTAssertNotNil(sut.error)

        mock.verifyEmailWithCodeResult = .success(())
        await sut.verifyCode("good")
        XCTAssertNil(sut.error)
        XCTAssertTrue(sut.verificationSuccess)
    }

    // MARK: - resendCode

    func test_resendCode_success_setsResendSuccess() async {
        let (sut, mock) = makeSUT(email: "user@test.com")
        mock.resendVerificationEmailResult = .success(())

        await sut.resendCode()

        XCTAssertEqual(mock.resendVerificationEmailCallCount, 1)
        XCTAssertEqual(mock.lastResendEmail, "user@test.com")
        XCTAssertFalse(sut.isResending)
        XCTAssertNil(sut.error)
    }

    func test_resendCode_error_setsError() async {
        let (sut, mock) = makeSUT()
        mock.resendVerificationEmailResult = .failure(NSError(domain: "test", code: 429))

        await sut.resendCode()

        XCTAssertNotNil(sut.error)
        XCTAssertFalse(sut.isResending)
    }

    // MARK: - email property

    func test_emailProperty_matchesInitialization() {
        let (sut, _) = makeSUT(email: "hello@world.com")
        XCTAssertEqual(sut.email, "hello@world.com")
    }

    // MARK: - initial state

    func test_initialState_allFlagsAreFalse() {
        let (sut, _) = makeSUT()
        XCTAssertFalse(sut.isVerifying)
        XCTAssertFalse(sut.isResending)
        XCTAssertFalse(sut.resendSuccess)
        XCTAssertFalse(sut.verificationSuccess)
        XCTAssertNil(sut.error)
    }
}
