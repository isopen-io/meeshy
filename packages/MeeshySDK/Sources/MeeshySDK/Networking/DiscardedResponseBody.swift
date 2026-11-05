import Foundation

/// `Decodable` placeholder for endpoints whose REST response body the caller
/// does not consume. Its decoder succeeds against ANY JSON value (object,
/// array, scalar, null) without inspecting it, so a change in the server's
/// response shape can never make the call throw a `DecodingError`.
///
/// A 2xx IS the acknowledgement for these calls. Typing their payload as
/// `[String: String]` turned every success whose values were not all strings
/// into a thrown error — the reactions first, then the like, bookmark and
/// share of a post (#15994), then every other write acknowledgement of the
/// SDK and of the app, including the durable queue's replays (#15996).
public struct DiscardedResponseBody: Decodable, Sendable {
    public init() {}
    public init(from decoder: Decoder) throws {}
}
