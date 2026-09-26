import Foundation
import MeeshySDK
import os

// Extrait de `ConversationViewModel.swift` (4 992 lignes, hors budget 800-1100
// de la directive 2026-08-28, qui interdit d'AJOUTER à un fichier hors
// budget). Le lot #4823 ajoute le sticker à `sendMessage` : on extrait
// d'abord, on ajoute ensuite. Responsabilité tenue ici : SAUTER vers un
// message hors fenêtre (citation tapée, résultat de recherche) et revenir au
// présent — la fenêtre GRDB centrée et le
// retour à la dernière page. Rien d'autre.
//
// Membres de l'hôte ouverts (`private` → interne) pour cette extension :
// `limit`, `nextMessageCursor`, `messageService`,
// `userFacingMessage(for:)`, `extractTextTranslations(from:)`,
// `extractAttachmentTranscriptions(from:)`.

extension ConversationViewModel {

    // MARK: - Jump to Message (load messages around a specific message)

    func loadMessagesAround(messageId: String) async {
        do {
            let response = try await messageService.listAround(
                conversationId: conversationId, around: messageId, limit: limit, includeReplies: true, includeTranslations: true
            )

            // Upsert the API batch into GRDB so the window has fresh content.
            try? await messagePersistence.upsertFromAPIMessages(response.data, preferredLanguages: preferredLanguages)

            await applyJumpedWindow(response, around: messageId)
        } catch {
            self.error = userFacingMessage(for: error)
        }
    }

    /// Fenêtre centrée sur `messageId` + état de pagination — le corps commun
    /// de `loadMessagesAround` et `jumpToQuotedMessage`, à l'identique.
    private func applyJumpedWindow(_ response: MessagesAPIResponse, around messageId: String) async {
        let targetDate = response.data.first(where: { $0.id == messageId })?.createdAt
            ?? response.data.last?.createdAt
            ?? Date()
        await messageStore.loadWindow(around: targetDate)
        extractAttachmentTranscriptions(from: response.data)
        extractTextTranslations(from: response.data)
        nextMessageCursor = response.cursorPagination?.nextCursor
        hasOlderMessages = response.cursorPagination?.hasMore ?? !response.data.isEmpty
        hasNewerMessages = response.hasNewer ?? false
        isInJumpedState = true
    }

    /// Outcome of `jumpToQuotedMessage`.
    enum JumpResult {
        /// The message was already present in the local store — caller should
        /// perform an instant scroll + highlight.
        case foundLocally
        /// The message was fetched from the server and loaded into the store.
        /// Caller should scroll + highlight after the snapshot settles.
        case loadedFromServer
        /// The message could not be found (deleted, not accessible, network error).
        case notFound
    }

    /// High-level "jump to a quoted message" flow called when the user taps
    /// a reply reference. If the message is already in the local store's
    /// snapshot, returns `.foundLocally` immediately. Otherwise sets
    /// `isSearchingQuotedMessage = true` (driving the pulsing scroll-button
    /// indicator), fetches from the server via `loadMessagesAround`, and
    /// returns `.loadedFromServer` or `.notFound`.
    func jumpToQuotedMessage(messageId: String) async -> JumpResult {
        // Fast path: message is already visible — instant scroll
        if messageStore.messages.contains(where: {
            $0.localId == messageId || $0.serverId == messageId
        }) {
            return .foundLocally
        }

        // Slow path: need to fetch from server
        isSearchingQuotedMessage = true

        defer {
            isSearchingQuotedMessage = false
        }

        do {
            let response = try await messageService.listAround(
                conversationId: conversationId, around: messageId, limit: limit, includeReplies: true, includeTranslations: true
            )

            // Upsert the API batch into GRDB so the window has fresh content.
            try? await messagePersistence.upsertFromAPIMessages(response.data, preferredLanguages: preferredLanguages)

            // Check if the target message was in the response
            let found = response.data.contains(where: { $0.id == messageId })
            guard found else { return .notFound }

            await applyJumpedWindow(response, around: messageId)

            // Small delay to let the diffable datasource apply the new snapshot
            // before the caller triggers scroll — otherwise the index path
            // won't exist yet.
            try? await Task.sleep(for: .milliseconds(150))

            return .loadedFromServer
        } catch {
            Logger.messages.error("[JumpToQuoted] Failed to load messages around \(messageId): \(error.localizedDescription)")
            return .notFound
        }
    }

    func returnToLatest() async {
        guard isInJumpedState else { return }

        isInJumpedState = false
        hasNewerMessages = false
        // Also clear any active in-conversation search state so the results
        // banner / filter never linger after returning to the latest window.
        currentSearchQuery = nil
        stateStore.currentSearchQuery = nil
        searchResults = []
        stateStore.searchResults = []
        searchHasMore = false

        // Restore the latest window from GRDB; the store observation surfaces
        // the updated messages slice automatically — no snapshot-restore needed.
        await messageStore.restoreLatestWindow()

        // nextMessageCursor will be lazily re-fetched on the next loadOlderMessages
        // call; hasOlderMessages defaults to true until corrected by the first page.
        nextMessageCursor = nil
        hasOlderMessages = true
    }
}
