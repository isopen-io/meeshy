import Foundation
import Combine
import MeeshySDK

@MainActor
final class TwoFactorViewModel: ObservableObject {
    @Published var isEnabled = false
    @Published var isLoading = false
    @Published var error: String?
    @Published var setupData: TwoFactorSetup?
    @Published var recoveryCodes: [String] = []

    private let service: TwoFactorServiceProviding

    init(service: TwoFactorServiceProviding = TwoFactorService.shared) {
        self.service = service
    }

    func checkStatus() async {
        isLoading = true
        error = nil
        do {
            let status = try await service.getStatus()
            isEnabled = status.enabled
        } catch {
            self.error = "Impossible de charger le statut 2FA"
        }
        isLoading = false
    }

    func beginSetup() async {
        isLoading = true
        error = nil
        do {
            let setup = try await service.setup()
            setupData = setup
        } catch {
            self.error = "Impossible de demarrer la configuration 2FA"
        }
        isLoading = false
    }

    func enable(code: String) async {
        isLoading = true
        error = nil
        do {
            let result = try await service.enable(code: code)
            recoveryCodes = result.backupCodes
            isEnabled = true
        } catch {
            self.error = "Code invalide. Verifiez et reessayez."
        }
        isLoading = false
    }

    func disable(code: String, password: String) async {
        isLoading = true
        error = nil
        do {
            try await service.disable(code: code, password: password)
            isEnabled = false
        } catch {
            self.error = "Impossible de desactiver le 2FA"
        }
        isLoading = false
    }

    func getBackupCodes(code: String) async {
        isLoading = true
        error = nil
        do {
            let result = try await service.getBackupCodes(code: code)
            recoveryCodes = result.backupCodes
        } catch {
            self.error = "Impossible de charger les codes de secours"
        }
        isLoading = false
    }

    func clearError() {
        error = nil
    }

    func reset() {
        setupData = nil
        recoveryCodes = []
        error = nil
    }
}
