import Foundation

/// Pourquoi un envoi n'a pas été acquitté par le serveur.
public enum SendFailure: Error, Equatable, Sendable {
    case ineligible
    case offlineEnqueueFailed(reason: String)
    case writeRestricted(ConversationWriteRestriction)
    case slowMode(NewcomerSlowMode)
    case recipientBlocked
    case queuedForRetry(reason: String)
    case retryEnqueueFailed(reason: String)
}
