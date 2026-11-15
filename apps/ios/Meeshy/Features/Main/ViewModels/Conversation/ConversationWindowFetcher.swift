import Foundation
import MeeshySDK

nonisolated protocol APIMessageUpserting {
    func upsertFromAPIMessages(_ apiMessages: [APIMessage], preferredLanguages: [String]) async throws
}

extension MessagePersistenceActor: APIMessageUpserting {}

protocol ConversationWindowFetcherProviding {
    func around(_ messageId: String, in conversationId: String, limit: Int, readerPrism: [String], label: StaticString) async throws -> MessagesAPIResponse
    func fetchAfter(_ watermark: Date, in conversationId: String, limit: Int) async throws -> MessagesAPIResponse
    func upsert(_ response: MessagesAPIResponse, readerPrism: [String], label: StaticString) async
}

/// Lecture réseau puis écriture GRDB d'une fenêtre SAUTÉE : la page centrée sur
/// un message, ou la page qui suit le filigrane. `fetchAfter` et `upsert` sont
/// séparés pour que l'appelant garde sa garde « toujours sauté » ENTRE l'appel
/// et l'écriture (#9304).
struct ConversationWindowFetcher: ConversationWindowFetcherProviding {
    let messageService: MessageServiceProviding
    let persistence: any APIMessageUpserting

    func around(_ messageId: String, in conversationId: String, limit: Int, readerPrism: [String], label: StaticString) async throws -> MessagesAPIResponse {
        let response = try await messageService.listAround(
            conversationId: conversationId, around: messageId, limit: limit, includeReplies: true, includeTranslations: true
        )
        await upsert(response, readerPrism: readerPrism, label: label)
        return response
    }

    func fetchAfter(_ watermark: Date, in conversationId: String, limit: Int) async throws -> MessagesAPIResponse {
        try await messageService.listAfter(
            conversationId: conversationId, after: watermark.addingTimeInterval(-0.001), limit: limit,
            includeReplies: true, includeTranslations: true, languages: nil
        )
    }

    /// Upsert the API batch into GRDB so the window has fresh content.
    func upsert(_ response: MessagesAPIResponse, readerPrism: [String], label: StaticString) async {
        let persistence = persistence
        await bestEffort(label, category: .grdb) {
            try await persistence.upsertFromAPIMessages(response.data, preferredLanguages: readerPrism)
        }
    }
}
