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
    /// Conversation chiffrée de bout en bout : rien n'est parti, rien n'est
    /// mis en file en clair (#11379). La bulle reste en échec, renvoyable.
    case endToEndUnsealed(EndToEndSendRefusal)
    /// Le participant n'a pas le droit de joindre ce type de pièce (#16053) :
    /// la bulle reste en échec avec sa raison, rien n'est rejoué.
    case attachmentRightRefused
}
