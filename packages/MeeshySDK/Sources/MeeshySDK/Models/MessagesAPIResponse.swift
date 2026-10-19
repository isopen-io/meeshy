import Foundation

public struct MessagesAPIResponse: Decodable, Sendable {
    public let success: Bool
    public let data: [APIMessage]
    public let pagination: OffsetPagination?
    public let cursorPagination: CursorPagination?
    public let hasNewer: Bool?
    public let meta: MessagesAPIMeta?
}
