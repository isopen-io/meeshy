import Foundation
import os
import MeeshySDK

/// Les cinq derniers messages d'une conversation, lus pour l'aperçu du menu
/// contextuel — cache GRDB d'abord, réseau ensuite. Extrait de
/// `ConversationListViewModel` : l'état (`messages`, requêtes en vol) ne sert
/// qu'à ce chargement. Non publié : seul le menu contextuel le lit.
@MainActor
final class ConversationListPreviewLoader {
    nonisolated deinit {}

    private(set) var messages: [String: [Message]] = [:]
    private var loadingInFlight: Set<String> = []
    private let messageService: MessageServiceProviding

    init(messageService: MessageServiceProviding) {
        self.messageService = messageService
    }

    func load(for conversationId: String, refresh: Bool, currentUserId: @escaping @MainActor @Sendable () -> String) async {
        // `refresh` (appui long) relit toujours : un aperçu servi une fois l'était à vie, messages modifiés ou supprimés compris.
        guard refresh || messages[conversationId] == nil, !loadingInFlight.contains(conversationId) else { return }
        loadingInFlight.insert(conversationId)
        defer { loadingInFlight.remove(conversationId) }
        let cached = await CacheCoordinator.shared.messages.load(for: conversationId)
        switch cached {
        case .fresh(let data, _):
            messages[conversationId] = Array(data.suffix(5))
            if refresh { await refreshPreview(for: conversationId, currentUserId: currentUserId) }
        case .stale(let data, _):
            messages[conversationId] = Array(data.suffix(5))
            Task { [weak self] in await self?.refreshPreview(for: conversationId, currentUserId: currentUserId) }
            return
        case .expired, .empty:
            await refreshPreview(for: conversationId, currentUserId: currentUserId)
        }
    }

    private func refreshPreview(for conversationId: String, currentUserId: @MainActor @Sendable () -> String) async {
        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: 5, includeReplies: false, includeTranslations: true
            )
            let userId = currentUserId()
            let username = AuthManager.shared.currentUser?.username
            let msgs = response.data.reversed().map { $0.toMessage(currentUserId: userId, currentUsername: username, preferredLanguages: AuthManager.shared.currentUser?.preferredContentLanguages ?? []) }
            messages[conversationId] = msgs
        } catch {
            Logger.messages.warning("[ConversationList] previewMessages fetch failed for \(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }
}
