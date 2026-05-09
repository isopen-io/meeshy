import Foundation
import Combine
import MeeshySDK

/// Cross-ViewModel notifier so a successful preferences update from the
/// `ConversationOptionsViewModel` (sheet) immediately propagates to every
/// observer — most notably `ConversationListViewModel` so the row reflects
/// the new pin/mute/reaction/customName state without waiting for a refetch.
///
/// Lightweight singleton + Combine subject — no persistence here. Cache
/// snapshot updates remain the responsibility of the list VM.
@MainActor
final class ConversationPreferencesBroadcaster {
    static let shared = ConversationPreferencesBroadcaster()

    struct Event: Sendable {
        let conversationId: String
        let prefs: APIConversationPreferences
    }

    let updates = PassthroughSubject<Event, Never>()

    private init() {}

    func broadcast(conversationId: String, prefs: APIConversationPreferences) {
        updates.send(Event(conversationId: conversationId, prefs: prefs))
    }
}
