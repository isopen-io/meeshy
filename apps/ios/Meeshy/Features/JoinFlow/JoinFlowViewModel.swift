import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

@MainActor
final class JoinFlowViewModel: ObservableObject, JoinFlowModeling {
    nonisolated deinit {}

    typealias Phase = JoinFlowPhase
    typealias Entry = JoinFlowEntry

    @Published var linkInfo: ShareLinkInfo?
    @Published var joinResult: AnonymousJoinResponse?
    @Published var phase: JoinFlowPhase = .loading
    @Published var errorMessage: String?

    @Published var firstName = ""
    @Published var lastName = ""
    @Published var username = ""
    @Published var email = ""
    @Published var birthday = Date()
    @Published var language: String
    @Published var isSubmitting = false

    let entry: JoinFlowEntry

    private let identifier: String
    private let links: JoinFlowLinkProviding

    #if DEBUG
    /// Vitrine App Store (#8855, DEBUG uniquement) : prévenue quand l'aperçu d'un lien est servi,
    /// pour que la capture attende l'accueil RENDU (#8921). `nil` hors vitrine.
    nonisolated(unsafe) static var debugOnPreviewShown: (@MainActor @Sendable () -> Void)?
    /// Vitrine (#9904, DEBUG uniquement) : le même instant, avec le parcours lui-même — la scène y fait le choix
    /// « sans compte » qu'un toucher ferait (`proceedToForm`). `nil` hors vitrine.
    nonisolated(unsafe) static var debugOnPreviewServed: (@MainActor @Sendable (JoinFlowViewModel) -> Void)?
    #endif

    init(
        identifier: String,
        entry: JoinFlowEntry = .landing,
        deviceLanguages: [String] = Locale.preferredLanguages + [Locale.current.identifier],
        links: JoinFlowLinkProviding = ShareLinkService.shared
    ) {
        self.identifier = identifier
        self.entry = entry
        self.links = links
        self.language = JoinFlowLanguages.defaultLanguage(for: deviceLanguages)
    }

    func loadLinkInfo() async {
        phase = .loading
        errorMessage = nil

        do {
            let info = try await links.getLinkInfo(identifier: identifier)
            linkInfo = info
            phase = entry == .anonymousForm ? .form : .preview
            announcePreviewIfServed()
        } catch {
            let message = JoinFlowCopy.loadFailure(error)
            errorMessage = message
            phase = .error(message)
        }
    }

    func proceedToForm() {
        phase = .form
    }

    var isFormValid: Bool {
        guard IdentityRules.meetsMinimum(firstName, for: .firstName) else { return false }
        guard IdentityRules.meetsMinimum(lastName, for: .lastName) else { return false }
        guard !IdentityRules.isGuestPseudoTooShort(username) else { return false }
        guard let info = linkInfo else { return true }
        if info.requireNickname && !IdentityRules.meetsGuestPseudoMinimum(username) { return false }
        if info.requireEmail && !isValidEmail(email) { return false }
        return true
    }

    func minimumLengthMessage(for field: IdentityRules.Field) -> String? {
        let tooShort: Bool
        switch field {
        case .firstName: tooShort = IdentityRules.isTooShort(firstName, for: .firstName)
        case .lastName: tooShort = IdentityRules.isTooShort(lastName, for: .lastName)
        case .pseudo: tooShort = IdentityRules.isGuestPseudoTooShort(username)
        case .displayName: return nil
        }
        return tooShort ? SignupViewModel.minimumLengthMessage(for: field) : nil
    }

    func submitJoin() async {
        guard let info = linkInfo, isFormValid else { return }

        isSubmitting = true
        errorMessage = nil

        do {
            let result = try await links.joinAnonymously(linkId: info.linkId, request: makeRequest(for: info))
            joinResult = result
            phase = .success
        } catch {
            errorMessage = JoinFlowCopy.joinFailure(error)
        }

        isSubmitting = false
    }

    private func makeRequest(for info: ShareLinkInfo) -> AnonymousJoinRequest {
        let trimmedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return AnonymousJoinRequest(
            firstName: firstName.trimmingCharacters(in: .whitespacesAndNewlines),
            lastName: lastName.trimmingCharacters(in: .whitespacesAndNewlines),
            username: trimmedUsername.isEmpty ? nil : trimmedUsername,
            email: trimmedEmail.isEmpty ? nil : trimmedEmail,
            birthday: JoinFlowWire.birthdayField(birthday, required: info.requireBirthday),
            language: language
        )
    }

    private func announcePreviewIfServed() {
        #if DEBUG
        guard phase == .preview else { return }
        JoinFlowViewModel.debugOnPreviewShown?()
        JoinFlowViewModel.debugOnPreviewServed?(self)
        #endif
    }

    private func isValidEmail(_ email: String) -> Bool {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        return trimmed.contains("@") && trimmed.contains(".")
    }
}
