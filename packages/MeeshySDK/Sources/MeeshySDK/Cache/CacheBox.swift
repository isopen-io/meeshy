import Foundation

/// NSCache requires reference-type values. This wraps any Sendable value.
final class CacheBox<T: Sendable>: NSObject {
    let value: T
    init(_ value: T) { self.value = value }
}
