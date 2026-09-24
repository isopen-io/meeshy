import SwiftUI
import MeeshySDK
import Combine

@MainActor
public final class JoinFlowViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

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

    /// Où le parcours commence une fois le lien chargé : la page d'invitation,
    /// ou directement le formulaire invité quand la personne a DÉJÀ choisi
    /// l'anonymat sur la page (compte présent, #7795) — la lui remontrer
    /// reposerait la question.
    public enum Entry: Sendable {
        case landing
        case anonymousForm
    }

    // MARK: - Private

    private let shareLinkService = ShareLinkService.shared
    private let identifier: String
    public let entry: Entry

    // MARK: - Init

    public init(identifier: String, entry: Entry = .landing) {
        self.identifier = identifier
        self.entry = entry
    }

    // MARK: - Load Link Info

    public func loadLinkInfo() async {
        phase = .loading
        errorMessage = nil

        do {
            let info = try await shareLinkService.getLinkInfo(identifier: identifier)
            linkInfo = info
            phase = entry == .anonymousForm ? .form : .preview
        } catch let error as MeeshyError {
            let message: String
            switch error {
            case .server(404, _):
                message = String(localized: "joinFlow.error.linkNotFound", defaultValue: "Ce lien de conversation est introuvable", bundle: .module)
            case .server(410, let msg):
                message = msg
            default:
                message = error.errorDescription ?? String(localized: "joinFlow.error.unknown", defaultValue: "Erreur inconnue", bundle: .module)
            }
            errorMessage = message
            phase = .error(message)
        } catch {
            let message = String(localized: "joinFlow.error.loadFailed", defaultValue: "Impossible de charger les informations du lien", bundle: .module)
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

        let request = AnonymousJoinRequest(
            firstName: firstName.trimmingCharacters(in: .whitespaces),
            lastName: lastName.trimmingCharacters(in: .whitespaces),
            username: username.trimmingCharacters(in: .whitespaces).isEmpty ? nil : username.trimmingCharacters(in: .whitespaces),
            email: email.trimmingCharacters(in: .whitespaces).isEmpty ? nil : email.trimmingCharacters(in: .whitespaces),
            birthday: Self.birthdayField(birthday, required: info.requireBirthday),
            language: language
        )

        do {
            let result = try await shareLinkService.joinAnonymously(linkId: info.linkId, request: request)
            joinResult = result
            phase = .success
        } catch let error as MeeshyError {
            switch error {
            case .server(409, let msg):
                errorMessage = msg
            case .forbidden(let reason, _):
                errorMessage = reason ?? error.errorDescription
            case .server(410, let msg):
                errorMessage = msg
            case .server(429, _):
                errorMessage = String(localized: "joinFlow.error.tooManyUsers", defaultValue: "Trop d'utilisateurs connectes", bundle: .module)
            case .auth:
                errorMessage = error.errorDescription
            default:
                errorMessage = error.errorDescription ?? String(localized: "joinFlow.error.joinFailed", defaultValue: "Erreur lors de la connexion", bundle: .module)
            }
        } catch {
            errorMessage = String(localized: "joinFlow.error.unexpected", defaultValue: "Erreur inattendue", bundle: .module)
        }

        isSubmitting = false
    }

    // MARK: - Helpers

    /// La date de naissance telle qu'elle part vers la passerelle — une
    /// date-heure (`z.iso.datetime()`), seulement quand le lien l'exige.
    nonisolated static func birthdayField(_ birthday: Date, required: Bool) -> String? {
        required ? WireDate.string(from: birthday) : nil
    }

    private func isValidEmail(_ email: String) -> Bool {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return false }
        return trimmed.contains("@") && trimmed.contains(".")
    }
}
