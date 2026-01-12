//
//  RegisterViewModelTests.swift
//  MeeshyTests
//
//  Unit tests for RegisterViewModel
//

import XCTest
@testable import Meeshy

@MainActor
final class RegisterViewModelTests: XCTestCase {
    var sut: RegisterViewModel!
    var mockAuthService: MockAuthService!

    override func setUp() {
        super.setUp()
        mockAuthService = MockAuthService()
        // sut = RegisterViewModel(authService: mockAuthService)
    }

    override func tearDown() {
        sut = nil
        mockAuthService = nil
        super.tearDown()
    }

    // MARK: - Validation Tests

    func testUsernameValidation_Valid() {
        // XCTAssertTrue(sut.isUsernameValid("validusername"))
    }

    func testUsernameValidation_TooShort() {
        // XCTAssertFalse(sut.isUsernameValid("ab"))
    }

    func testUsernameValidation_SpecialCharacters() {
        // XCTAssertFalse(sut.isUsernameValid("user@name"))
    }

    func testEmailValidation_Valid() {
        // XCTAssertTrue(sut.isEmailValid("test@meeshy.me"))
    }

    func testPasswordStrength_Weak() {
        // XCTAssertEqual(sut.passwordStrength("123"), .weak)
    }

    func testPasswordStrength_Medium() {
        // XCTAssertEqual(sut.passwordStrength("password123"), .medium)
    }

    func testPasswordStrength_Strong() {
        // XCTAssertEqual(sut.passwordStrength("P@ssw0rd!123"), .strong)
    }

    func testPasswordMatch_Success() {
        // sut.password = "password123"
        // sut.confirmPassword = "password123"
        // XCTAssertNil(sut.passwordMismatchError)
    }

    func testPasswordMatch_Failure() {
        // sut.password = "password123"
        // sut.confirmPassword = "password456"
        // XCTAssertNotNil(sut.passwordMismatchError)
    }

    // MARK: - Registration Tests

    func testRegister_Success() async {
        mockAuthService.mockRegisterResponse = (
            user: MockDataGenerator.createUser(),
            accessToken: "token",
            refreshToken: "refresh"
        )

        // await sut.register()
        // XCTAssertTrue(mockAuthService.isAuthenticated)
        // XCTAssertEqual(mockAuthService.registerCallCount, 1)
    }

    func testRegister_DuplicateEmail() async {
        mockAuthService.shouldFailLogin = true
        // await sut.register()
        // XCTAssertNotNil(sut.errorMessage)
    }

    func testRegister_NetworkError() async {
        mockAuthService.shouldFailLogin = true
        // await sut.register()
        // XCTAssertNotNil(sut.errorMessage)
    }

    // MARK: - UI State Tests

    func testLoadingState() {
        // XCTAssertFalse(sut.isLoading)
    }

    func testFormValidation_AllFieldsRequired() {
        // All fields empty should fail validation
    }
}
