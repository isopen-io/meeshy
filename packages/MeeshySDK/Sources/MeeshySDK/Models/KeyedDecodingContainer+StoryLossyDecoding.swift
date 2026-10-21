import CoreGraphics
import Foundation

/// Consumes exactly one element from an unkeyed container without inspecting
/// it — used to advance the cursor past a malformed element during lossy decode.
private struct _StorySkippedElement: Decodable {
    init(from decoder: Decoder) throws {}
}

extension KeyedDecodingContainer {
    /// Decodes `[T]` element-by-element, skipping any element that fails to
    /// decode instead of throwing the whole array. A single malformed story
    /// object in another user's payload is dropped rather than blanking the
    /// entire story. Returns `nil` when the key is absent or not an array
    /// (parity with `decodeIfPresent`), `[]` when present but empty/all-invalid.
    func decodeLossyArrayIfPresent<T: Decodable>(_ type: [T].Type, forKey key: Key) -> [T]? {
        guard contains(key),
              var unkeyed = try? nestedUnkeyedContainer(forKey: key) else { return nil }
        var result: [T] = []
        while !unkeyed.isAtEnd {
            if let element = try? unkeyed.decode(T.self) {
                result.append(element)
            } else {
                // A failed `decode(T.self)` leaves the JSONDecoder cursor in
                // place; decoding a throwaway element advances past the bad one.
                _ = try? unkeyed.decode(_StorySkippedElement.self)
            }
        }
        return result
    }
}
