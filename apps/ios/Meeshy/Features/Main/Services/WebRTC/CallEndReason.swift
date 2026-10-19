import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Call End Reason

enum CallEndReason: Equatable, Sendable {
    case local
    case remote
    case rejected
    case missed
    case failed(String)
    case connectionLost
}

extension CallEndReason {
    nonisolated static func == (lhs: CallEndReason, rhs: CallEndReason) -> Bool {
        switch (lhs, rhs) {
        case (.local, .local), (.remote, .remote), (.rejected, .rejected),
             (.missed, .missed), (.connectionLost, .connectionLost): return true
        case (.failed(let a), .failed(let b)): return a == b
        default: return false
        }
    }
}
