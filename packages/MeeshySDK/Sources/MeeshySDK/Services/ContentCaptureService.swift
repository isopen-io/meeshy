import Foundation

/// #9617 — déclarer une capture à la passerelle. Protocole à part, comme
/// `AfterReadConsuming` : les faux de `MessageServiceProviding` n'ont pas à
/// connaître un geste que seule la détection de capture déclenche.
public protocol ContentCaptureSending: Sendable {
    /// Rend les messages pour lesquels un avis EXISTE désormais.
    func sendContentCapture(_ report: ContentCaptureReport) async throws -> [String]
}

/// Le socket d'abord (`message:capture-detected`), le jumeau REST
/// (`POST /conversations/:id/messages/capture`) quand le socket est absent ou
/// muet. Le même `captureId` voyage sur les deux : la passerelle dédoublonne,
/// un repli après une échéance ne crée rien de plus. Un refus FINAL du socket
/// (non-participant, budget dépassé…) ne se rejoue pas en REST.
public final class ContentCaptureService: ContentCaptureSending, @unchecked Sendable {
    public static let shared = ContentCaptureService()

    private let api: APIClientProviding
    private let socket: @concurrent @Sendable (ContentCaptureReport) async throws -> [String]

    public struct Noticed: Decodable, Sendable {
        public let noticedMessageIds: [String]
    }

    init(
        api: APIClientProviding = APIClient.shared,
        socket: @escaping @concurrent @Sendable (ContentCaptureReport) async throws -> [String] = { report in
            try await MessageSocketManager.shared.emitContentCapture(report)
        }
    ) {
        self.api = api
        self.socket = socket
    }

    public func sendContentCapture(_ report: ContentCaptureReport) async throws -> [String] {
        do {
            return try await socket(report)
        } catch let refusal as ContentCaptureRefusal where refusal.isFinal {
            throw refusal
        } catch {
            let response: APIResponse<Noticed> = try await api.post(
                ConversationsEndpoint.byIdMessagesCapture(id: report.conversationId), body: report.body
            )
            return response.data.noticedMessageIds
        }
    }
}
