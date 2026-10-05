import Foundation
import MeeshySDK

/// **Le gardien de l'e-mail de l'app** (#8365) — le contrat que `APIClient`
/// consulte pour les cinq routes qui exigent une adresse prouvée
/// (`EmailVerificationGate`, SDK).
///
/// - « Connue non prouvée » se lit sur l'utilisateur COURANT, sans aller-retour :
///   `emailVerifiedAt` nul et `activation.missing` qui contient l'adresse
///   (#8238) — ou l'absence d'`activation` (passerelle antérieure).
/// - La validation se présente PAR-DESSUS tout (`EmailVerificationGateScreen`),
///   feuille ouverte comprise : l'écran qui attend sa réponse reste là, son
///   brouillon avec lui.
/// - Toutes les demandes en cours partagent UNE présentation et UN verdict.
/// - L'onboarding garde sa propre carte (#7907) : pendant qu'il est présenté,
///   la demande est refusée sans rien présenter.
@MainActor
final class EmailVerificationGateController: EmailVerificationGating {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    /// Présente la validation (raison, adresse, verdict) ; rend de quoi la
    /// retirer, ou `nil` quand rien ne peut la présenter.
    typealias Present = @MainActor (_ reason: EmailGateReason, _ email: String, _ settle: @escaping (Bool) -> Void) -> (() -> Void)?

    static let shared = EmailVerificationGateController()

    private let currentUser: @MainActor () -> MeeshyUser?
    private let onboardingPresented: @MainActor () -> Bool
    private let present: Present
    private var waiting: [CheckedContinuation<Bool, Never>] = []
    private var dismiss: (() -> Void)?
    private var provenUserId: String?

    init(
        currentUser: @escaping @MainActor () -> MeeshyUser? = { AuthManager.shared.currentUser },
        onboardingPresented: @escaping @MainActor () -> Bool = { OnboardingPresenceSignal.shared.isPresented },
        present: @escaping Present = EmailVerificationGateScreen.present
    ) {
        self.currentUser = currentUser
        self.onboardingPresented = onboardingPresented
        self.present = present
    }

    func emailKnownUnproven() async -> Bool {
        guard let user = currentUser(), user.id != provenUserId, address(of: user) != nil,
              user.emailVerifiedAt == nil else { return false }
        return user.activation.map { $0.missing.contains(.email) } ?? true
    }

    func verifyEmail(for reason: EmailGateReason) async -> Bool {
        guard !onboardingPresented(), let email = currentUser().flatMap(address(of:)) else { return false }
        if waiting.isEmpty {
            guard let dismiss = present(reason, email, { [weak self] verified in self?.settle(verified) }) else { return false }
            self.dismiss = dismiss
        }
        return await withCheckedContinuation { waiting.append($0) }
    }

    private func settle(_ verified: Bool) {
        guard !waiting.isEmpty else { return }
        if verified { provenUserId = currentUser()?.id }
        let answered = waiting
        waiting = []
        dismiss?()
        dismiss = nil
        answered.forEach { $0.resume(returning: verified) }
    }

    private func address(of user: MeeshyUser) -> String? {
        guard let email = user.email?.trimmingCharacters(in: .whitespaces), !email.isEmpty else { return nil }
        return email
    }
}
