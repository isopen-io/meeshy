import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class TwoFactorViewModelTests: XCTestCase {

    // MARK: - Properties

    private var mockService: MockTwoFactorService!

    // MARK: - Lifecycle

    override func setUp() {
        super.setUp()
        mockService = MockTwoFactorService()
    }

    override func tearDown() {
        mockService = nil
        super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT() -> TwoFactorViewModel {
        TwoFactorViewModel(service: mockService)
    }

    // MARK: - checkStatus

    func test_checkStatus_setsIsEnabledTrue_whenStatusEnabled() async {
        mockService.getStatusResult = .success(
            TwoFactorStatus(enabled: true, enabledAt: "2026-01-01T00:00:00Z", hasBackupCodes: true, backupCodesCount: 4)
        )
        let sut = makeSUT()

        await sut.checkStatus()

        XCTAssertTrue(sut.isEnabled)
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.error)
        XCTAssertEqual(mockService.getStatusCallCount, 1)
    }

    func test_checkStatus_setsIsEnabledFalse_whenStatusDisabled() async {
        mockService.getStatusResult = .success(
            TwoFactorStatus(enabled: false, enabledAt: nil, hasBackupCodes: nil, backupCodesCount: nil)
        )
        let sut = makeSUT()

        await sut.checkStatus()

        XCTAssertFalse(sut.isEnabled)
        XCTAssertFalse(sut.isLoading)
    }

    func test_checkStatus_setsError_whenServiceFails() async {
        mockService.getStatusResult = .failure(NSError(domain: "test", code: 500))
        let sut = makeSUT()

        await sut.checkStatus()

        XCTAssertFalse(sut.isLoading)
        XCTAssertNotNil(sut.error)
    }

    // MARK: - beginSetup

    func test_beginSetup_setsSetupData_onSuccess() async {
        let expectedSetup = TwoFactorSetup(
            secret: "SECRET123",
            qrCodeDataUrl: "data:image/png;base64,XYZ",
            otpauthUrl: "otpauth://totp/Meeshy:user?secret=SECRET123"
        )
        mockService.setupResult = .success(expectedSetup)
        let sut = makeSUT()

        await sut.beginSetup()

        XCTAssertNotNil(sut.setupData)
        XCTAssertEqual(sut.setupData?.secret, "SECRET123")
        XCTAssertEqual(sut.setupData?.otpauthUrl, "otpauth://totp/Meeshy:user?secret=SECRET123")
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.error)
        XCTAssertEqual(mockService.setupCallCount, 1)
    }

    func test_beginSetup_setsError_onFailure() async {
        mockService.setupResult = .failure(NSError(domain: "test", code: 500))
        let sut = makeSUT()

        await sut.beginSetup()

        XCTAssertNil(sut.setupData)
        XCTAssertNotNil(sut.error)
        XCTAssertFalse(sut.isLoading)
    }

    // MARK: - enable (verify code)

    func test_enable_setsRecoveryCodesAndIsEnabled_onSuccess() async {
        let expectedCodes = TwoFactorBackupCodes(backupCodes: ["A1", "B2", "C3", "D4"])
        mockService.enableResult = .success(expectedCodes)
        let sut = makeSUT()

        await sut.enable(code: "123456")

        XCTAssertTrue(sut.isEnabled)
        XCTAssertEqual(sut.recoveryCodes, ["A1", "B2", "C3", "D4"])
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.error)
        XCTAssertEqual(mockService.enableCallCount, 1)
        XCTAssertEqual(mockService.lastEnableCode, "123456")
    }

    func test_enable_setsError_onFailure() async {
        mockService.enableResult = .failure(NSError(domain: "test", code: 400))
        let sut = makeSUT()

        await sut.enable(code: "000000")

        XCTAssertFalse(sut.isEnabled)
        XCTAssertTrue(sut.recoveryCodes.isEmpty)
        XCTAssertNotNil(sut.error)
        XCTAssertEqual(mockService.enableCallCount, 1)
    }

    // MARK: - disable

    func test_disable_setsIsEnabledFalse_onSuccess() async {
        mockService.disableResult = .success(())
        let sut = makeSUT()
        sut.isEnabled = true

        await sut.disable(code: "654321", password: "mypassword")

        XCTAssertFalse(sut.isEnabled)
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.error)
        XCTAssertEqual(mockService.disableCallCount, 1)
        XCTAssertEqual(mockService.lastDisableCode, "654321")
        XCTAssertEqual(mockService.lastDisablePassword, "mypassword")
    }

    func test_disable_setsError_onFailure() async {
        mockService.disableResult = .failure(NSError(domain: "test", code: 400))
        let sut = makeSUT()
        sut.isEnabled = true

        await sut.disable(code: "000000", password: "wrong")

        XCTAssertTrue(sut.isEnabled)
        XCTAssertNotNil(sut.error)
        XCTAssertEqual(mockService.disableCallCount, 1)
    }

    // MARK: - getBackupCodes

    func test_getBackupCodes_setsRecoveryCodes_onSuccess() async {
        let expectedCodes = TwoFactorBackupCodes(backupCodes: ["R1", "R2", "R3"])
        mockService.getBackupCodesResult = .success(expectedCodes)
        let sut = makeSUT()

        await sut.getBackupCodes(code: "111111")

        XCTAssertEqual(sut.recoveryCodes, ["R1", "R2", "R3"])
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.error)
        XCTAssertEqual(mockService.getBackupCodesCallCount, 1)
        XCTAssertEqual(mockService.lastGetBackupCodesCode, "111111")
    }

    func test_getBackupCodes_setsError_onFailure() async {
        mockService.getBackupCodesResult = .failure(NSError(domain: "test", code: 500))
        let sut = makeSUT()

        await sut.getBackupCodes(code: "111111")

        XCTAssertTrue(sut.recoveryCodes.isEmpty)
        XCTAssertNotNil(sut.error)
    }

    // MARK: - State management

    func test_clearError_resetsError() async {
        mockService.getStatusResult = .failure(NSError(domain: "test", code: 500))
        let sut = makeSUT()
        await sut.checkStatus()
        XCTAssertNotNil(sut.error)

        sut.clearError()

        XCTAssertNil(sut.error)
    }

    func test_reset_clearsAllSetupState() async {
        let sut = makeSUT()
        await sut.beginSetup()
        await sut.enable(code: "123456")

        sut.reset()

        XCTAssertNil(sut.setupData)
        XCTAssertTrue(sut.recoveryCodes.isEmpty)
        XCTAssertNil(sut.error)
    }
}
