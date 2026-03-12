import Foundation

public enum CacheResult<T: Sendable>: Sendable {
    case fresh(T, age: TimeInterval)
    case stale(T, age: TimeInterval)
    case expired
    case empty

    public var value: T? {
        switch self {
        case .fresh(let v, _), .stale(let v, _): return v
        case .expired, .empty: return nil
        }
    }
}
