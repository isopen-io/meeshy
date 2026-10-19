import Foundation
import MeeshySDK

// MARK: - Delegate Protocol

@MainActor
protocol ConversationSocketDelegate: AnyObject {
    var messages: [Message] { get set }
    var typingParticipants: [TypingParticipant] { get set }

    /// Avatar CONNU LOCALEMENT de cet auteur, ou `nil`.
    ///
    /// `TypingEvent` n'en transporte aucun : c'est au client de le retrouver
    /// dans ce qu'il a déjà. Aucune requête ne doit partir pour afficher une
    /// frappe — d'où le retour synchrone et l'optionnel assumé.
    func localAvatarURL(forSender userId: String) -> String?
    func localRing(forSender userId: String) -> ServedProfileDecorItem?
    var lastUnreadMessage: Message? { get set }
    var messageTranslations: [String: [MessageTranslation]] { get set }
    var messageTranscriptions: [String: MessageTranscription] { get set }
    /// Per-attachment transcription keyed by `attachmentId`. Mirrors
    /// `ConversationViewModel.messageTranscriptionsByAttachment` so the
    /// socket handler can write both dicts atomically in the
    /// `transcription:ready` handler (multi-audio karaoke realtime fix).
    var messageTranscriptionsByAttachment: [String: MessageTranscription] { get set }
    var messageTranslatedAudios: [String: [MessageTranslatedAudio]] { get set }
    /// Per-attachment translated audios keyed by `attachmentId`. Mirrors
    /// `ConversationViewModel.messageTranslatedAudiosByAttachment` so the
    /// socket handler can write both dicts atomically in the audio
    /// translation handler (multi-audio Prisme realtime fix).
    var messageTranslatedAudiosByAttachment: [String: [MessageTranslatedAudio]] { get set }
    var activeLiveLocations: [ActiveLiveLocation] { get set }
    var isConversationClosed: Bool { get set }
    var pendingServerIds: [String: String] { get set }

    /// O(1) index lookup by message ID (backed by dictionary)
    func messageIndex(for id: String) -> Int?
    /// O(1) membership check by message ID
    func containsMessage(id: String) -> Bool

    /// Évince les traductions d'un message dont le CONTENU vient de changer —
    /// dictionnaire en mémoire, cache de résolution du Prisme ET les deux
    /// caches PERSISTANTS (CacheCoordinator, GRDB). Un site unique côté
    /// ViewModel : ne vider que ce que le handler voit (`messageTranslations`)
    /// laisserait l'hydratation réinjecter le texte d'avant l'édition.
    func invalidateTranslations(for messageId: String)
    func handleParticipantRoleUpdated(participantId: String, newRole: String)
    func syncMissedMessages() async
    /// Re-fetch messages this reader had hidden for themselves and has just
    /// restored from another device (`message:restored-for-me`).
    ///
    /// Separate from `syncMissedMessages` on purpose, and NOT expressible by
    /// it: that one is a forward-only watermark backfill (`listAfter(after:
    /// newestLocal)`), while a restored message is almost always OLDER than the
    /// newest message held — it was hidden from somewhere back in the history.
    /// Routing a restore through the watermark would silently no-op.
    func restoreMessagesForMe(ids: [String]) async
    func decryptMessagesIfNeeded(_ msgs: inout [Message]) async
    func persistMessagesUsingServerIds() async
    /// Server rejected `conversation:join` — purge per-conversation cache,
    /// flip the access-revoked flag so the View dismisses, surface a toast.
    /// Mirrors the REST 403 path so socket and HTTP failures converge on
    /// the same UX.
    func handleSocketAccessRevoked(reason: String?)

    /// Apply a server-pushed attachment delta atomically : injects the
    /// enriched transcription / audio translations into the metadata
    /// dictionaries in a single MainActor slice, then schedules the
    /// GRDB upsert so future opens of this conversation render the
    /// enriched attachment from cache without a refetch.
    func applyAttachmentUpdate(_ event: AttachmentUpdatedEvent)
    func applyAttachmentReactionDelta(attachmentId: String, reactionSummary: [String: Int])
}
