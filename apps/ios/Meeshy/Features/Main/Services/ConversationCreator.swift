import Foundation
import MeeshySDK

/// Creates new conversations on the gateway. Used by surfaces that need
/// to POST `/conversations` directly — DM start-from-profile, group
/// composer, etc. Wraps `APIClientProviding` so the caller doesn't have
/// to know about the encoding shape, and so tests can drive the failure
/// path through a `MockAPIClientForApp`.
///
/// Why not `ConversationService.create()` from the SDK? That service
/// returns a stripped-down `CreateConversationResponse { id, type, title,
/// createdAt }`. Conversation-context surfaces need the full
/// `APIConversation` (members, encryption mode, language tags…) to
/// navigate into the chat without an extra GET round-trip. We keep the
/// raw-POST shape here in the app layer rather than expanding the SDK
/// service's return type, since the SDK contract is consumed by the
/// list / detail flows that don't need the extras.
protocol ConversationCreating: Sendable {
    func createDirectConversation(with userId: String, currentUserId: String) async throws -> Conversation
}

@MainActor
final class ConversationCreator: ConversationCreating {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    func createDirectConversation(
        with userId: String,
        currentUserId: String
    ) async throws -> Conversation {
        let body = CreateDirectBody(type: "direct", participantIds: [userId])
        let response: APIResponse<APIConversation> = try await api.post(
            ConversationsEndpoint.root,
            body: body
        )
        return response.data.toConversation(currentUserId: currentUserId)
    }

    private struct CreateDirectBody: Encodable {
        let type: String
        let participantIds: [String]
    }
}

// MARK: - Ouverture d'une conversation directe depuis l'annuaire

extension ConversationCreating {
    /// « Lui écrire » — ouvre (ou crée) la conversation directe avec `userId`,
    /// et signale l'échec à l'utilisateur. Renvoie `nil` en cas d'échec, le
    /// site d'appel restant maître de la navigation.
    ///
    /// Partagé par le répertoire et les affiliés : les deux écrans posaient le
    /// même appel, le même `catch` et le même toast.
    @MainActor
    func openDirectConversation(with userId: String, currentUserId: String) async -> Conversation? {
        do {
            return try await createDirectConversation(with: userId, currentUserId: currentUserId)
        } catch {
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(
                String(localized: "contacts.phonebook.open-error", defaultValue: "Impossible d'ouvrir la conversation", bundle: .main)
            )
            return nil
        }
    }
}
