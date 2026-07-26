import Foundation
import os

/// Coding helpers that **journalise** a failure instead of swallowing it.
///
/// They exist to replace the `try? encoder.encode(x)` / `try? decoder.decode(T.self, from:)`
/// idiom, whose `nil` is indistinguishable from "there was nothing to encode".
/// When such a `nil` is then written to a database column or handed to a cache,
/// the payload is silently destroyed and nothing points back at the cause.
///
/// The signature is deliberately identical in shape to the `try?` it replaces,
/// so call sites stay one line and no control flow has to be reshaped:
///
/// ```swift
/// let json = encoder.encodeOrLog(attachments, field: "attachmentsJson", id: message.id)
/// ```
///
/// Use `do`/`catch` directly whenever the caller can do something better than
/// degrade — retry, propagate, or pick a different fallback. These helpers are
/// for the cases where `nil` genuinely is the right degraded value and only the
/// silence was wrong.
public extension JSONEncoder {
    /// Encodes `value`, returning `nil` and logging at `.error` on failure.
    ///
    /// - Parameters:
    ///   - field: The destination being written (column, key, payload name).
    ///   - id: Identifier of the owning entity, to make the log actionable.
    ///   - logger: Defaults to the `media`-agnostic `messages` category.
    func encodeOrLog<T: Encodable>(
        _ value: T,
        field: String,
        id: String = "-",
        logger: Logger = .messages
    ) -> Data? {
        do {
            return try encode(value)
        } catch {
            logger.error(
                "Encode failed for \(field, privacy: .public) [id=\(id, privacy: .public)] — field persisted as NULL: \(error.localizedDescription, privacy: .public)"
            )
            return nil
        }
    }
}

public extension JSONDecoder {
    /// Decodes `data`, returning `nil` and logging at `.error` on failure.
    ///
    /// - Parameters:
    ///   - field: The source being read (column, key, payload name).
    ///   - id: Identifier of the owning entity, to make the log actionable.
    ///   - logger: Defaults to the `messages` category.
    func decodeOrLog<T: Decodable>(
        _ type: T.Type,
        from data: Data,
        field: String,
        id: String = "-",
        logger: Logger = .messages
    ) -> T? {
        do {
            return try decode(type, from: data)
        } catch {
            logger.error(
                "Decode failed for \(field, privacy: .public) [id=\(id, privacy: .public)] — value dropped: \(error.localizedDescription, privacy: .public)"
            )
            return nil
        }
    }
}
