import Foundation
import MeeshySDK

@MainActor
final class EmailVerificationViewModel: ObservableObject {
    @Published var isVerifying = false
    @Published var isResending = false
    @Published var resendSuccess = false
    @Published var verificationSuccess = false
    @Published var error: String?

    let email: String
    private let authService: AuthServiceProviding

    init(email: String, authService: AuthServiceProviding = AuthService.shared) {
        self.email = email
        self.authService = authService
    }

    func verifyCode(_ code: String) async {
        isVerifying = true
        error = nil

        do {
            try await authService.verifyEmailWithCode(code: code, email: email)
            verificationSuccess = true
        } catch let meeshyError as MeeshyError {
            error = meeshyError.localizedDescription
        } catch {
            self.error = error.localizedDescription
        }

        isVerifying = false
    }

    func resendCode() async {
        isResending = true
        error = nil

        do {
            try await authService.resendVerificationEmail(email: email)
            resendSuccess = true
            try? await Task.sleep(for: .seconds(3))
            resendSuccess = false
        } catch {
            self.error = (error as? MeeshyError)?.localizedDescription
                ?? String(localized: "emailVerification.error.resendFailed", defaultValue: "Impossible de renvoyer le code de verification")
        }

        isResending = false
    }
}
