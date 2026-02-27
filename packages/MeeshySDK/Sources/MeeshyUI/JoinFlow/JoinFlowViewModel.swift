import SwiftUI
import MeeshySDK
import Combine

@MainActor
public final class JoinFlowViewModel: ObservableObject {

    // MARK: - Published State

    @Published public var linkInfo: ShareLinkInfo?
    @Published public var joinResult: AnonymousJoinResponse?
    @Published public var phase: Phase = .loading
    @Published public var errorMessage: String?

    // Form fields
    @Published public var firstName = ""
    @Published public var lastName = ""
    @Published public var username = ""
    @Published public var email = ""
    @Published public var birthday = Date()
    @Published public var language = "fr"
    @Published public var isSubmitting = false

    public enum Phase {
        case loading
        case preview
        case form
        case success
        case error(String)
    }

    // MARK: - Private

    private let shareLinkService = ShareLinkService.shared
    private let identifier: String

    // MARK: - Init

    public init(identifier: String) {
        self.identifier = identifier
    }

    // MARK: - Load Link Info

    public func loadLinkInfo() async {
        phase = .loading
        errorMessage = nil

        do {
            let info = try await shareLinkService.getLinkInfo(identifier: identifier)
            linkInfo = info
            phase = .preview
        } catch let error as APIError {
            let message: String
            switch error {
            case .serverError(404, _):
                message = "Ce lien de conversation est introuvable"
            case .serverError(410, _):
                message = "Ce lien a expire ou n'est plus actif"
            default:
                message = error.errorDescription ?? "Erreur inconnue"
            }
            errorMessage = message
            phase = .error(message)
        } catch {
            let message = "Impossible de charger les informations du lien"
            errorMessage = message
            phase = .error(message)
        }
    }

    // MARK: - Proceed to Form

    public func proceedToForm() {
        phase = .form
    }

    // MARK: - Form Validation

    public var isFormValid: Bool {
        guard !firstName.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        guard !lastName.trimmingCharacters(in: .whitespaces).isEmpty else { return false }

        if let info = linkInfo {
            if info.requireNickname && username.trimmingCharacters(in: .whitespaces).isEmpty {
                return false
            }
            if info.requireEmail && !isValidEmail(email) {
                return false
            }
        }

        return true
    }

    // MARK: - Submit Join

    public func submitJoin() async {
        guard let info = linkInfo, isFormValid else { return }

        isSubmitting = true
        errorMessage = nil

        let birthdayString: String? = info.requireBirthday ? ISO8601DateFormatter().string(from: birthday) : nil

        let request = AnonymousJoinRequest(
            firstName: firstName.trimmingCharacters(in: .whitespaces),
            lastName: lastName.trimmingCharacters(in: .whitespaces),
            username: username.trimmingCharacters(in: .whitespaces).isEmpty ? nil : username.trimmingCharacters(in: .whitespaces),
            email: email.trimmingCharacters(in: .whitespaces).isEmpty ? nil : email.trimmingCharacters(in: .whitespaces),
            birthday: birthdayString,
            language: language
        )

        do {
            let result = try await shareLinkService.joinAnonymously(linkId: info.linkId, request: request)
            joinResult = result
            phase = .success
        } catch let error as APIError {
            switch error {
            case .serverError(409, let msg):
                errorMessage = msg ?? "Ce nom d'utilisateur est deja pris"
            case .serverError(403, let msg):
                errorMessage = msg ?? "Acces refuse"
            case .serverError(410, let msg):
                errorMessage = msg ?? "Ce lien a expire"
            case .serverError(429, _):
                errorMessage = "Trop d'utilisateurs connectes"
            default:
                errorMessage = error.errorDescription ?? "Erreur lors de la connexion"
            }
        } catch {
            errorMessage = "Erreur inattendue"
        }

        isSubmitting = false
    }

    // MARK: - Helpers

    private func isValidEmail(_ email: String) -> Bool {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return false }
        return trimmed.contains("@") && trimmed.contains(".")
    }
}
