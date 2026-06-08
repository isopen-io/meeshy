import Foundation

// MARK: - Protocol

public protocol MessageServiceProviding: Sendable {
    func list(conversationId: String, offset: Int, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse
    func listBefore(conversationId: String, before: String, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse
    func listAfter(conversationId: String, after: Date, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse
    func listAround(conversationId: String, around: String, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse
    func send(conversationId: String, request: SendMessageRequest) async throws -> SendMessageResponseData
    func edit(messageId: String, content: String) async throws -> APIMessage
    func delete(conversationId: String, messageId: String) async throws
    func pin(conversationId: String, messageId: String) async throws
    func unpin(conversationId: String, messageId: String) async throws
    func consumeViewOnce(conversationId: String, messageId: String) async throws -> ConsumeViewOnceResponse
    func search(conversationId: String, query: String, limit: Int) async throws -> MessagesAPIResponse
    func searchWithCursor(conversationId: String, query: String, cursor: String) async throws -> MessagesAPIResponse
}

public final class MessageService: MessageServiceProviding, @unchecked Sendable {
    public static let shared = MessageService()
    private let api: APIClientProviding

    /// ISO8601 with fractional seconds so a millisecond-precise watermark is
    /// not truncated to the whole second on the wire — the gateway compares
    /// with strict `createdAt > after`, so losing the milliseconds would
    /// re-surface (or, worse, skip) boundary messages.
    /// `nonisolated(unsafe)` is safe here: the formatter is configured once and
    /// only ever read from (`string(from:)`), which Foundation guarantees is
    /// thread-safe for ISO8601DateFormatter. Same pattern as other shared
    /// read-only statics in the SDK.
    nonisolated(unsafe) private static let watermarkFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    /// - Parameter includeTranslations: when `false`, the gateway omits the
    ///   `translations` Json field from each message in the response — used by
    ///   warm-cache refreshes (GRDB already holds them, the socket pushes
    ///   future updates). Defaults to `true` so first-open / cold-start
    ///   call sites keep their existing behaviour.
    /// - Parameter languages: E3 — Prisme filter. When provided, the gateway
    ///   returns only translations for those language codes, reducing payload
    ///   for clients that only display 1–4 languages. Pass `nil` to get all
    ///   translations (legacy behaviour). Typically sourced from
    ///   `MeeshyUser.preferredContentLanguages`.
    public func list(conversationId: String, offset: Int = 0, limit: Int = 30, includeReplies: Bool = true, includeTranslations: Bool = true, languages: [String]? = nil) async throws -> MessagesAPIResponse {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "include_replies", value: "\(includeReplies)"),
            URLQueryItem(name: "include_translations", value: "\(includeTranslations)"),
        ]
        if let langs = languages, !langs.isEmpty {
            items.append(URLQueryItem(name: "languages", value: langs.joined(separator: ",")))
        }
        return try await api.request(endpoint: "/conversations/\(conversationId)/messages", queryItems: items)
    }

    public func listBefore(conversationId: String, before: String, limit: Int = 30, includeReplies: Bool = true, includeTranslations: Bool = true, languages: [String]? = nil) async throws -> MessagesAPIResponse {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "before", value: before),
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "include_replies", value: "\(includeReplies)"),
            URLQueryItem(name: "include_translations", value: "\(includeTranslations)"),
        ]
        if let langs = languages, !langs.isEmpty {
            items.append(URLQueryItem(name: "languages", value: langs.joined(separator: ",")))
        }
        return try await api.request(endpoint: "/conversations/\(conversationId)/messages", queryItems: items)
    }

    /// Forward watermark backfill (local-first gap recovery, T9). Returns
    /// messages created strictly *after* `after`, oldest-first (ascending) per
    /// the gateway contract (`buildAfterWatermarkClause`, T8). Unlike
    /// `list(offset:)`, which can only ever surface the newest `limit`
    /// messages, paging this method forward by the high-water mark fills a
    /// missed-message gap of any size contiguously. The instant is serialized
    /// with fractional seconds so a millisecond-precise watermark survives the
    /// round trip.
    public func listAfter(conversationId: String, after: Date, limit: Int = 30, includeReplies: Bool = true, includeTranslations: Bool = true, languages: [String]? = nil) async throws -> MessagesAPIResponse {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "after", value: Self.watermarkFormatter.string(from: after)),
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "include_replies", value: "\(includeReplies)"),
            URLQueryItem(name: "include_translations", value: "\(includeTranslations)"),
        ]
        if let langs = languages, !langs.isEmpty {
            items.append(URLQueryItem(name: "languages", value: langs.joined(separator: ",")))
        }
        return try await api.request(endpoint: "/conversations/\(conversationId)/messages", queryItems: items)
    }

    public func listAround(conversationId: String, around: String, limit: Int = 30, includeReplies: Bool = true, includeTranslations: Bool = true, languages: [String]? = nil) async throws -> MessagesAPIResponse {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "around", value: around),
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "include_replies", value: "\(includeReplies)"),
            URLQueryItem(name: "include_translations", value: "\(includeTranslations)"),
        ]
        if let langs = languages, !langs.isEmpty {
            items.append(URLQueryItem(name: "languages", value: langs.joined(separator: ",")))
        }
        return try await api.request(endpoint: "/conversations/\(conversationId)/messages", queryItems: items)
    }

    public func send(conversationId: String, request: SendMessageRequest) async throws -> SendMessageResponseData {
        let response: APIResponse<SendMessageResponseData> = try await api.post(
            endpoint: "/conversations/\(conversationId)/messages", body: request
        )
        return response.data
    }

    public func edit(messageId: String, content: String) async throws -> APIMessage {
        struct EditBody: Encodable { let content: String }
        let response: APIResponse<APIMessage> = try await api.put(endpoint: "/messages/\(messageId)", body: EditBody(content: content))
        return response.data
    }

    public func delete(conversationId: String, messageId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/conversations/\(conversationId)/messages/\(messageId)")
    }

    public func pin(conversationId: String, messageId: String) async throws {
        struct Empty: Encodable {}
        let _: APIResponse<[String: String]> = try await api.put(endpoint: "/conversations/\(conversationId)/messages/\(messageId)/pin", body: Empty())
    }

    public func unpin(conversationId: String, messageId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/conversations/\(conversationId)/messages/\(messageId)/pin")
    }

    public func consumeViewOnce(conversationId: String, messageId: String) async throws -> ConsumeViewOnceResponse {
        struct Empty: Encodable {}
        let response: APIResponse<ConsumeViewOnceResponse> = try await api.post(
            endpoint: "/conversations/\(conversationId)/messages/\(messageId)/consume", body: Empty()
        )
        return response.data
    }

    public func search(conversationId: String, query: String, limit: Int = 20) async throws -> MessagesAPIResponse {
        try await api.request(
            endpoint: "/conversations/\(conversationId)/messages/search",
            queryItems: [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "limit", value: "\(limit)"),
            ]
        )
    }

    public func searchWithCursor(conversationId: String, query: String, cursor: String) async throws -> MessagesAPIResponse {
        try await api.request(
            endpoint: "/conversations/\(conversationId)/messages/search",
            queryItems: [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "cursor", value: cursor),
            ]
        )
    }
}

// MARK: - Backward-compat overloads

/// Legacy 4-arg call sites (every site predating the bandwidth-aware
/// `includeTranslations` flag) keep working without modification : these
/// forwarding overloads default `includeTranslations` to `true`, preserving
/// the historical "always include translations" behaviour. New call sites
/// that are warm-cache aware should call the 5-arg canonical method
/// explicitly with `includeTranslations: false` (e.g. the iOS app's
/// `ConversationViewModel.refreshMessagesFromAPI` after first fetch).
public extension MessageServiceProviding {
    func list(conversationId: String, offset: Int, limit: Int, includeReplies: Bool) async throws -> MessagesAPIResponse {
        try await list(
            conversationId: conversationId, offset: offset, limit: limit,
            includeReplies: includeReplies, includeTranslations: true
        )
    }

    func listBefore(conversationId: String, before: String, limit: Int, includeReplies: Bool) async throws -> MessagesAPIResponse {
        try await listBefore(
            conversationId: conversationId, before: before, limit: limit,
            includeReplies: includeReplies, includeTranslations: true
        )
    }

    func listAfter(conversationId: String, after: Date, limit: Int, includeReplies: Bool) async throws -> MessagesAPIResponse {
        try await listAfter(
            conversationId: conversationId, after: after, limit: limit,
            includeReplies: includeReplies, includeTranslations: true
        )
    }

    func listAround(conversationId: String, around: String, limit: Int, includeReplies: Bool) async throws -> MessagesAPIResponse {
        try await listAround(
            conversationId: conversationId, around: around, limit: limit,
            includeReplies: includeReplies, includeTranslations: true
        )
    }
}
