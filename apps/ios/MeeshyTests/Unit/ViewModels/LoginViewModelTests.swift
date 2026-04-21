//
//  LoginViewModelTests.swift
//  MeeshyTests
//
//  Unit tests for LoginViewModel
//

import XCTest
@testable import Meeshy

@MainActor
final class LoginViewModelTests: XCTestCase {
    var sut: LoginViewModel!
    var mockAuthService: MockAuthService!

    override func setUp() {
        super.setUp()
        mockAuthService = MockAuthService()
        sut = LoginViewModel()
    }

    override func tearDown() {
        sut = nil
        mockAuthService = nil
        super.tearDown()
    }

    // MARK: - Initialization Tests

    func testInitialization() {
        XCTAssertEqual(sut.email, "")
        XCTAssertEqual(sut.password, "")
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.errorMessage)
        XCTAssertNil(sut.emailError)
        XCTAssertNil(sut.passwordError)
        XCTAssertFalse(sut.showTwoFactorView)
    }

    // MARK: - Email Validation Tests

    func testEmailValidation_ValidEmail() async {
        sut.email = "test@meeshy.me"

        // Wait for debounce
        try? await Task.sleep(nanoseconds: 600_000_000)

        XCTAssertNil(sut.emailError)
    }

    func testEmailValidation_InvalidEmail() async {
        sut.email = "invalid-email"

        // Wait for debounce
        try? await Task.sleep(nanoseconds: 600_000_000)

        XCTAssertNotNil(sut.emailError)
        XCTAssertTrue(sut.emailError?.contains("valid email") ?? false)
    }

    func testEmailValidation_EmptyEmail() async {
        sut.email = ""

        // Wait for debounce
        try? await Task.sleep(nanoseconds: 600_000_000)

        XCTAssertNil(sut.emailError)
    }

    func testEmailValidation_EmailWithSpaces() async {
        sut.email = "  test@meeshy.me  "

        // Wait for debounce
        try? await Task.sleep(nanoseconds: 600_000_000)

        XCTAssertNil(sut.emailError)
    }

    // MARK: - Password Validation Tests

    func testPasswordValidation_ValidPassword() {
        sut.email = "test@meeshy.me"
        sut.password = "password123"

        // Trigger validation through login attempt
        Task {
            await sut.login()
        }

        // Password should be valid (no error)
        XCTAssertNil(sut.passwordError)
    }

    func testPasswordValidation_EmptyPassword() async {
        sut.email = "test@meeshy.me"
        sut.password = ""

        await sut.login()

        XCTAssertNotNil(sut.passwordError)
        XCTAssertTrue(sut.passwordError?.contains("required") ?? false)
    }

    func testPasswordValidation_ShortPassword() async {
        sut.email = "test@meeshy.me"
        sut.password = "12345"

        await sut.login()

        XCTAssertNotNil(sut.passwordError)
        XCTAssertTrue(sut.passwordError?.contains("6 characters") ?? false)
    }

    // MARK: - Login Tests

    func testLogin_Success() async {
        // This test would require dependency injection of AuthService
        // Demonstrating the test structure:
        sut.email = "test@meeshy.me"
        sut.password = "password123"

        // Note: In production, inject MockAuthService via dependency injection
        // await sut.login()

        // Assertions would check:
        // XCTAssertFalse(sut.isLoading)
        // XCTAssertNil(sut.errorMessage)
        // XCTAssertTrue(AuthService.shared.isAuthenticated)
    }

    func testLogin_InvalidCredentials() async {
        sut.email = "test@meeshy.me"
        sut.password = "wrongpassword"

        // Would test with mocked service that returns error
        // Expected: errorMessage is set
        // XCTAssertNotNil(sut.errorMessage)
        // XCTAssertTrue(sut.errorMessage?.contains("Invalid") ?? false)
    }

    func testLogin_Requires2FA() async {
        sut.email = "test@meeshy.me"
        sut.password = "password123"

        // Would test with mocked service that throws requires2FA error
        // Expected: showTwoFactorView is true
        // XCTAssertTrue(sut.showTwoFactorView)
    }

    func testLogin_NetworkError() async {
        sut.email = "test@meeshy.me"
        sut.password = "password123"

        // Would test with mocked service that throws network error
        // Expected: errorMessage mentions network
        // XCTAssertNotNil(sut.errorMessage)
        // XCTAssertTrue(sut.errorMessage?.contains("network") ?? false)
    }

    func testLogin_LoadingState() async {
        sut.email = "test@meeshy.me"
        sut.password = "password123"

        let expectation = XCTestExpectation(description: "Login started")

        Task {
            // Check loading state during login
            await sut.login()
            expectation.fulfill()
        }

        // Would verify isLoading is true during operation
        // XCTAssertTrue(sut.isLoading)

        await fulfillment(of: [expectation], timeout: 5.0)

        // After completion
        XCTAssertFalse(sut.isLoading)
    }

    // MARK: - Biometric Authentication Tests

    func testBiometricType_FaceID() {
        // Test would check if biometricType is properly set
        // when device supports Face ID
        // XCTAssertEqual(sut.biometricType, .faceID)
    }

    func testBiometricType_TouchID() {
        // Test would check if biometricType is properly set
        // when device supports Touch ID
        // XCTAssertEqual(sut.biometricType, .touchID)
    }

    func testBiometricType_None() {
        // Test would check if biometricType is none
        // when device doesn't support biometrics
        // XCTAssertEqual(sut.biometricType, .none)
    }

    func testLoginWithBiometrics_Success() async {
        // Would test successful biometric authentication
        // await sut.loginWithBiometrics()
        // XCTAssertNil(sut.errorMessage)
    }

    func testLoginWithBiometrics_Failure() async {
        // Would test failed biometric authentication
        // await sut.loginWithBiometrics()
        // XCTAssertNotNil(sut.errorMessage)
    }

    func testLoginWithBiometrics_NotAvailable() async {
        await sut.loginWithBiometrics()

        // Should show error when biometrics not available
        XCTAssertNotNil(sut.errorMessage)
    }

    // MARK: - Error Handling Tests

    func testClearError() {
        sut.errorMessage = "Test error"
        sut.emailError = "Email error"
        sut.passwordError = "Password error"

        sut.clearError()

        XCTAssertNil(sut.errorMessage)
        XCTAssertNil(sut.emailError)
        XCTAssertNil(sut.passwordError)
    }

    func testHandleError_InvalidCredentials() {
        // Test that auth errors are properly mapped to user-friendly messages
        // This would require exposing the error handling method or testing through login
    }

    func testHandleError_NetworkTimeout() {
        // Test network timeout error handling
    }

    func testHandleError_NoInternet() {
        // Test no internet connection error handling
    }

    // MARK: - Integration Tests (with Mock Service)

    func testFullLoginFlow_WithMockService() async {
        // This demonstrates how tests would work with dependency injection:
        /*
        let mockAuthService = MockAuthService()
        let viewModel = LoginViewModel(authService: mockAuthService)

        mockAuthService.mockLoginResponse = (
            user: MockDataGenerator.createUser(),
            accessToken: "mock-access-token",
            refreshToken: "mock-refresh-token",
            requires2FA: false
        )

        viewModel.email = "test@meeshy.me"
        viewModel.password = "password123"

        await viewModel.login()

        XCTAssertFalse(viewModel.isLoading)
        XCTAssertNil(viewModel.errorMessage)
        XCTAssertEqual(mockAuthService.loginCallCount, 1)
        XCTAssertEqual(mockAuthService.lastLoginEmail, "test@meeshy.me")
        */
    }

    // MARK: - Edge Case Tests

    func testLogin_WithWhitespaceEmail() async {
        sut.email = "  test@meeshy.me  "
        sut.password = "password123"

        // Should trim whitespace before sending
        // await sut.login()
        // Verify email is trimmed
    }

    func testLogin_WithEmptyFields() async {
        sut.email = ""
        sut.password = ""

        await sut.login()

        XCTAssertNotNil(sut.emailError)
        XCTAssertNotNil(sut.passwordError)
    }

    func testLogin_ConcurrentCalls() async {
        sut.email = "test@meeshy.me"
        sut.password = "password123"

        // Test that concurrent login calls are handled properly
        async let login1 = sut.login()
        async let login2 = sut.login()

        await login1
        await login2

        // Should handle gracefully without crashes
    }

    // MARK: - Memory Leak Tests

    func testMemoryLeak_ViewModel() {
        var viewModel: LoginViewModel? = LoginViewModel()
        weak var weakReference = viewModel

        viewModel = nil

        XCTAssertNil(weakReference, "LoginViewModel should be deallocated")
    }
}
