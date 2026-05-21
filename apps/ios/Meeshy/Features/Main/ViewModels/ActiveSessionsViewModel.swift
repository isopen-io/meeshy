import Foundation
import Combine
import MeeshySDK
import MeeshyUI

/// ViewModel for `ActiveSessionsView`.
///
/// Lists and revokes user sessions (devices currently authenticated).
/// Extracted from `ActiveSessionsView.swift` (A1) so the contract is testable
/// and the View body becomes a pure projection of `@Published` state.
@MainActor
final class ActiveSessionsViewModel: ObservableObject {
    @Published var sessions: [UserSession] = []
    @Published var isLoading = false
    @Published var isRevoking = false
    @Published var showError = false
    @Published var errorMessage = ""

    private let sessionService: SessionServiceProviding

    init(sessionService: SessionServiceProviding = SessionService.shared) {
        self.sessionService = sessionService
    }

    func loadSessions() async {
        isLoading = true
        defer { isLoading = false }
        do {
            sessions = try await sessionService.listSessions()
        } catch {
            errorMessage = String(
                localized: "sessions_load_error",
                defaultValue: "Impossible de charger les sessions"
            )
            showError = true
        }
    }

    func revokeSession(sessionId: String) async {
        isRevoking = true
        defer { isRevoking = false }
        do {
            try await sessionService.revokeSession(sessionId: sessionId)
            HapticFeedback.success()
            sessions.removeAll { $0.id == sessionId }
        } catch {
            HapticFeedback.error()
            errorMessage = String(
                localized: "sessions_revoke_error",
                defaultValue: "Impossible de revoquer la session"
            )
            showError = true
        }
    }

    func revokeAllOtherSessions() async {
        isRevoking = true
        defer { isRevoking = false }
        do {
            try await sessionService.revokeAllOtherSessions()
            HapticFeedback.success()
            sessions.removeAll { !$0.isCurrent }
        } catch {
            HapticFeedback.error()
            errorMessage = String(
                localized: "sessions_revoke_all_error",
                defaultValue: "Impossible de revoquer les sessions"
            )
            showError = true
        }
    }
}
