import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

// MARK: - Send Timeout Helper

/// Caps an awaited async operation at `seconds`. On expiry the operation's
/// task is cancelled, so a hung/slow REST send (typical on cellular) throws
/// promptly instead of holding the optimistic `.sending` clock for the full
/// URLSession `timeoutIntervalForRequest` (60s) before the socket/outbox
/// fallback can take over. The send catch path re-emits with the SAME
/// `clientMessageId`, so the gateway dedups — no duplicate row even if the
/// cancelled POST actually landed server-side.
@MainActor
func withSendTimeout<T: Sendable>(
    seconds: Double,
    operation: @escaping () async throws -> T
) async throws -> T {
    let operationTask = Task { try await operation() }
    let watchdog = Task {
        try? await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000))
        operationTask.cancel()
    }
    defer { watchdog.cancel() }
    return try await operationTask.value
}

// MARK: - Real-time Translation Type (text translations, not in SDK)

struct MessageTranslation: Identifiable, Equatable {
    let id: String
    let messageId: String
    let sourceLanguage: String
    let targetLanguage: String
    let translatedContent: String
    let translationModel: String
    let confidenceScore: Double?
}

// MessageTranscription, MessageTranscriptionSegment, MessageTranslatedAudio
// are defined in MeeshySDK.TranscriptionModels — use those directly.

// MARK: - ConversationDependencies

struct ConversationDependencies {
    let dbPool: any DatabaseWriter
    let persistence: MessagePersistenceActor

    @MainActor
    static var live: ConversationDependencies {
        ConversationDependencies(
            dbPool: DependencyContainer.shared.dbPool,
            persistence: DependencyContainer.shared.messagePersistence
        )
    }
}

@MainActor
class ConversationViewModel: ObservableObject {

    // MARK: - Published State

    @Published var messages: [Message] = [] {
        didSet {
            invalidateCaches(previousMessages: oldValue)
        }
    }

    // MARK: - Cache Invalidation

    /// Invalidates all derived caches that depend on `messages`.
    /// Called both from the `messages.didSet` observer (legacy pipeline) and
    /// from the MessageStore observation subscription (GRDB pipeline).
    private func invalidateCaches(previousMessages: [Message]? = nil) {
        let structureChanged: Bool
        if let oldValue = previousMessages {
            structureChanged = messages.count != oldValue.count
                || messages.first?.id != oldValue.first?.id
                || messages.last?.id != oldValue.last?.id
        } else {
            structureChanged = true
        }

        _messageIdIndex = nil
        _cachedLastReceivedIndex = nil
        _cachedLastSentIndex = nil

        if structureChanged {
            _messagesByDate = nil
            _topActiveMembers = nil
            _mediaSenderInfoMap = nil
            _allVisualAttachments = nil
            _mediaCaptionMap = nil
            _allAudioItems = nil
            _replyCountMap = nil
            _mentionDisplayNames = nil
            _mentionCandidates = nil
        }
    }

    // Double-optional: nil = not computed, .some(nil) = computed but no match, .some(.some(N)) = found at N
    private var _cachedLastReceivedIndex: Int?? = nil
    var cachedLastReceivedIndex: Int? {
        if let cached = _cachedLastReceivedIndex { return cached }
        let result = messages.indices.last(where: { !messages[$0].isMe })
        _cachedLastReceivedIndex = .some(result)
        return result
    }

    private var _cachedLastSentIndex: Int?? = nil
    var cachedLastSentIndex: Int? {
        if let cached = _cachedLastSentIndex { return cached }
        let result = messages.indices.last(where: { messages[$0].isMe })
        _cachedLastSentIndex = .some(result)
        return result
    }

    var lastReceivedMessageId: String? {
        cachedLastReceivedIndex.map { messages[$0].id }
    }
    var lastSentMessageId: String? {
        cachedLastSentIndex.map { messages[$0].id }
    }

    @Published var isLoadingInitial = false
    @Published var isLoadingOlder = false
    @Published var isLoadingNewer = false
    /// `true` when we painted stale cache data and a background refresh is
    /// in flight. Drives the subtle "revalidating" sparkle in the header so
    /// the user knows fresher data is on its way without seeing a blocking
    /// spinner (cache-first + stale-while-revalidate discipline).
    @Published var isRevalidating = false

    /// Canonical projection of the 4 message-loading booleans above into
    /// a single mutually-exclusive `ConversationLoadingPhase`. Views and
    /// future refactors should prefer reading this over the booleans —
    /// the boolean state-machine is preserved as the source of truth for
    /// now (additive migration, M2 follow-up to PR #280), but the
    /// invariants (`loadingInitial` excludes `loadingOlder`, etc.) are
    /// expressible only on the enum side. The `hasObservedAnyData` flag
    /// distinguishes `.idle` (cold-open) from `.loaded` (finished load).
    var paginationPhase: ConversationLoadingPhase {
        ConversationLoadingPhase.derive(
            isLoadingInitial: isLoadingInitial,
            isLoadingOlder: isLoadingOlder,
            isLoadingNewer: isLoadingNewer,
            isRevalidating: isRevalidating,
            hasObservedAnyData: !messages.isEmpty
        )
    }

    /// Message ids whose `messageService.edit` round-trip is in flight. The
    /// bubble renders a "Enregistrement…" indicator next to the "Modifie"
    /// badge while the set contains its id so the user never wonders if
    /// their edit actually landed.
    @Published var editInProgress: Set<String> = []
    @Published var hasOlderMessages = true
    @Published var hasNewerMessages = false
    @Published var isSending = false
    /// Number of sends currently awaiting their network round-trip. Backs
    /// `isSending` (true ⇔ ≥1 in flight) WITHOUT gating new sends — DISTINCT
    /// messages send concurrently (2026-06-09). See `sendMessage`'s dedup.
    private var inFlightSendCount = 0
    /// Last (dedupKey, timestamp) accepted by `sendMessage`. Guards against an
    /// accidental double-tap of the SAME logical message within
    /// `Self.duplicateSendDebounce`; DISTINCT messages are never blocked.
    private var lastAcceptedSend: (key: String, at: Date)?
    /// Window within which an identical re-send is treated as a double-tap.
    private static let duplicateSendDebounce: TimeInterval = 0.6
    @Published var error: String?

    /// Set before prepend so the view can restore scroll position
    @Published var scrollAnchorId: String?

    /// Users currently typing in this conversation.
    /// Backed by stateStore — changes fire stateStore.objectWillChange, NOT self.objectWillChange.
    /// This prevents the full conversation view graph from re-evaluating on every keystroke.
    var typingUsernames: [String] {
        get { stateStore.typingUsernames }
        set { stateStore.typingUsernames = newValue }
    }

    /// Combine publisher for typing usernames — used by UIKit consumers (MessageListViewController).
    var typingUsernamesPublisher: AnyPublisher<[String], Never> {
        stateStore.$typingUsernames.eraseToAnyPublisher()
    }

    /// Real-time translation/transcription/audio data keyed by messageId
    @Published var messageTranslations: [String: [MessageTranslation]] = [:] {
        didSet { _mediaCaptionMap = nil }
    }
    @Published var messageTranscriptions: [String: MessageTranscription] = [:] {
        didSet { _allAudioItems = nil }
    }
    /// Per-attachment transcription keyed by `attachmentId`. The per-message
    /// `messageTranscriptions` slot only holds ONE transcription per message —
    /// for a multi-audio message it is overwritten in the hydration loop so
    /// only the LAST track survives. This dict keeps EACH track's own
    /// transcription so the audio carousel can show per-page karaoke.
    /// The single-audio path still reads `messageTranscriptions[msg.id]`.
    @Published var messageTranscriptionsByAttachment: [String: MessageTranscription] = [:] {
        didSet { _allAudioItems = nil }
    }
    @Published var messageTranslatedAudios: [String: [MessageTranslatedAudio]] = [:] {
        didSet { _allAudioItems = nil }
    }
    /// Per-attachment translated audios keyed by `attachmentId`. The per-message
    /// `messageTranslatedAudios` slot only holds ONE attachment's audios per
    /// message — for a multi-audio message it is overwritten in the hydration
    /// loop so only the LAST track survives. This dict keeps EACH track's own
    /// translated audios so the audio carousel can show per-page language
    /// buttons (Prisme Linguistique). The single-audio path still falls back to
    /// `messageTranslatedAudios[msg.id]`. Mirrors `messageTranscriptionsByAttachment`.
    @Published var messageTranslatedAudiosByAttachment: [String: [MessageTranslatedAudio]] = [:] {
        didSet { _allAudioItems = nil }
    }

    /// Manual translation override per message (user selected a specific language in Language tab)
    /// nil value means user chose "show original"
    @Published var activeTranslationOverrides: [String: MessageTranslation?] = [:]

    /// Manual audio language override per message (user selected a language in Language tab for audio)
    /// nil value means user chose "show original audio"
    @Published var activeAudioLanguageOverrides: [String: String?] = [:]

    /// Per-message language selection driven by the bubble's flag strip
    /// (primary display language switch + inline secondary panel). Lifted out
    /// of `ThemedMessageBubble`'s `@State` so the bubble can sit behind an
    /// Equatable re-render gate: as plain inputs these flow through `==`, and
    /// a flag tap publishes here → targeted cell reconfigure → the bubble
    /// re-renders with the new selection. (The former in-bubble `@State` is
    /// exactly what made `.equatable()` unsafe — see b9a39c2c.)
    @Published private(set) var bubbleLanguageSelections: [String: BubbleLanguageSelection] = [:]

    struct BubbleLanguageSelection: Equatable {
        var activeDisplayLangCode: String?
        var secondaryLangCode: String?
    }

    func setBubbleActiveDisplayLanguage(_ code: String?, for messageId: String) {
        var selection = bubbleLanguageSelections[messageId] ?? BubbleLanguageSelection()
        guard selection.activeDisplayLangCode != code else { return }
        selection.activeDisplayLangCode = code
        bubbleLanguageSelections[messageId] = selection
    }

    func setBubbleSecondaryLanguage(_ code: String?, for messageId: String) {
        var selection = bubbleLanguageSelections[messageId] ?? BubbleLanguageSelection()
        guard selection.secondaryLangCode != code else { return }
        selection.secondaryLangCode = code
        bubbleLanguageSelections[messageId] = selection
    }

    /// B2 (Prisme Linguistique) — monotonically increasing counter bumped
    /// every time the viewer's preferred-content languages change (user
    /// edits `systemLanguage` / `regionalLanguage` / `customDestinationLanguage`
    /// in Settings). Consumers (e.g., `MessageListViewController`) observe
    /// this signal to re-snapshot bubbles so the previously-resolved
    /// translation is replaced with the one matching the new preference.
    @Published var preferredLanguageRevision: Int = 0

    /// Resolution cache for `preferredTranslation(for:)` — invalidated on language revision bump.
    /// Uses double-Optional semantics: key absent = not cached, .some(nil) = cached as "show original".
    private var translationResolutionCache: [String: MessageTranslation?] = [:]
    private var cachedRevisionForTranslation: Int = -1

    /// Active live location sessions in this conversation
    @Published var activeLiveLocations: [ActiveLiveLocation] = []

    /// Last unread message from another user (set only via socket, cleared on scroll-to-bottom)
    @Published var lastUnreadMessage: Message?

    /// Total unread across every OTHER conversation (excludes this one).
    /// Drives the cross-conversation pill stuck next to the back button.
    /// Always clamped ≥ 0 — never negative even when our local snapshot
    /// of the current conv is briefly stale relative to the aggregate.
    @Published private(set) var otherConversationsUnread: Int = 0

    /// Updated by the MessageListViewController's scroll delegate via the
    /// `onNearBottomChanged` callback. Drives the anticipatory prefetch:
    /// when the user is NOT near the bottom (scrolling up into history),
    /// `loadOlderMessages` eagerly prefetches the next page after each
    /// successful load so older messages are ready before the user reaches them.
    var isCurrentlyNearBottom: Bool = true

    /// Detailed reaction data for a specific message (used by reaction detail sheet)
    @Published var reactionDetails: [ReactionGroup] = []
    @Published var isLoadingReactions = false

    /// ID of the first unread message (set once after initial load, cleared on scroll to bottom)
    @Published var firstUnreadMessageId: String?

    /// True during programmatic scrolls (initial load, send, scroll-to-bottom tap)
    /// When true, onAppear prefetch triggers are suppressed.
    var isProgrammaticScroll = false

    /// True when the conversation has been closed (no more messages can be sent)
    @Published var isConversationClosed = false

    /// True when the server has revoked access to this conversation (user
    /// removed from the participants list, group disbanded, etc.). The
    /// view must dismiss itself when this flips so the user cannot keep
    /// viewing/sending into a conversation they no longer belong to.
    @Published var accessRevoked: Bool = false

    /// Selected ephemeral duration for next message
    @Published var ephemeralDuration: EphemeralDuration?

    /// When true, next message will be sent with blur (recipient must tap to reveal)
    @Published var isBlurEnabled: Bool = false

    /// When true, next message will be sent as view-once (revealed once, then
    /// burned). Surfaced by the notification preview composer.
    @Published var isViewOnceEnabled: Bool = false

    /// Pending message effects selected via the effects picker
    @Published var pendingEffects: MessageEffects = .none

    /// When true, the effects picker sheet is presented
    @Published var showEffectsPicker: Bool = false

    /// True when the current user has not yet granted voice-cloning consent.
    /// Drives the in-bubble `AudioConsentNotice` nudge on outgoing audio
    /// messages. Set asynchronously after `start()` via a one-shot
    /// `VoiceProfileService` call; default is `false` so a network error
    /// never shows a false positive.
    @Published var voiceConsentMissing: Bool = false

    /// Pure, testable: maps a `hasConsent` fetch to "missing", fail-safe to false.
    nonisolated static func resolveVoiceConsentMissing(_ fetchHasConsent: () async throws -> Bool) async -> Bool {
        do { return try await !fetchHasConsent() } catch { return false }
    }

    private func loadVoiceConsentStatus() {
        Task { [weak self] in
            let missing = await Self.resolveVoiceConsentMissing {
                try await VoiceProfileService.shared.getConsentStatus().hasConsent
            }
            await MainActor.run { self?.voiceConsentMissing = missing }
        }
    }

    // MARK: - Audio Continuous Playback (Phase 4)

    /// Attachments already played to completion. Excluded from the auto-built
    /// queue so a tap on the second audio doesn't replay everything before it.
    ///
    /// Currently runtime-only: enriched when an audio finishes via the
    /// coordinator's `onPlaybackFinished` hook (Phase 5 wiring). Persistence
    /// across cold starts comes when `MeeshyMessageAttachment.listenedAt` is
    /// added to the SDK model (tracked as dette).
    @Published var listenedAttachmentIds: Set<String> = []

    /// Cached metadata for the active conversation, hydrated lazily from the
    /// cache when `loadMessages` runs. Used to feed `playAudio` with the
    /// right `conversationName` / `conversationArtworkURL`.
    @Published private(set) var currentConversation: MeeshyConversation?

    #if DEBUG
    private var _testAudioCoordinator: ConversationAudioCoordinator?
    #endif

    /// Resolves to the test-injected coordinator under DEBUG when present,
    /// otherwise the shared singleton. Pure UX orchestration lives in the
    /// coordinator — the VM only feeds it.
    private var audioCoordinator: ConversationAudioCoordinator {
        #if DEBUG
        return _testAudioCoordinator ?? .shared
        #else
        return .shared
        #endif
    }

    #if DEBUG
    /// Test-only setter to inject a fresh `ConversationAudioCoordinator` so a
    /// test class can assert side-effects without colliding with the global
    /// singleton's state. Must be called BEFORE `playAudio(attachmentId:)` /
    /// any other coordinator-routed call to take effect for that operation.
    ///
    /// Re-subscribes the listened-id observer to the new coordinator so the
    /// PassthroughSubject route works in tests too — without this the
    /// subscription wired in `init` still targets the default singleton
    /// while playback flows through the injected instance.
    func _testSetAudioCoordinator(_ coordinator: ConversationAudioCoordinator) {
        _testAudioCoordinator = coordinator
        subscribeToAudioCoordinatorFinishedEvents()
    }
    #endif

    /// Display name shown in the audio mini-player while playing audios from
    /// this conversation. Falls back to empty string when the conversation
    /// hasn't been hydrated yet (very narrow race; coordinator handles "").
    var currentConversationName: String {
        currentConversation?.name ?? ""
    }

    /// Artwork URL shown in the audio mini-player. `nil` when the conversation
    /// has no avatar or hasn't been hydrated yet — the coordinator falls back
    /// to a placeholder.
    var currentConversationArtworkURL: String? {
        currentConversation?.avatar
    }

    /// Brand accent for the audio mini-player. Defaults to the Meeshy
    /// indigo500 brand hex when the conversation isn't hydrated yet so the
    /// player never paints with a flash of an unrelated color.
    var currentAccentColorHex: String {
        currentConversation?.accentColor ?? "6366F1"
    }

    // MARK: - Mention Autocomplete State

    @Published var mentionController: MentionComposerController = MentionComposerController(context: .conversation(id: ""))

    // MARK: - Mention Forwarding (backwards compat for ConversationView)

    var mentionSuggestions: [MentionCandidate] { mentionController.suggestions }
    var activeMentionQuery: String? { mentionController.activeQuery }

    // MARK: - Search State

    @Published var searchResults: [SearchResultItem] = []
    @Published var isSearching = false
    @Published var searchHasMore = false
    @Published var currentSearchQuery: String?
    var searchNextCursor: String?

    /// True when the user jumped to a search result and messages are loaded around that point
    @Published var isInJumpedState = false

    /// True while the ViewModel is actively searching for a quoted message
    /// that wasn't in the local collection when the user tapped its reply
    /// reference. Drives a pulsing indicator on the scroll-to-bottom button
    /// so the user knows the app is working to find the cited message.
    @Published var isSearchingQuotedMessage = false
    /// The message id the user is trying to jump to. Set alongside
    /// `isSearchingQuotedMessage` and cleared once the jump completes
    /// (or fails). Read by the scroll button to display contextual text.
    @Published var quotedMessageSearchTarget: String? = nil

    // Permanent mapping `optimistic id → server id` for the lifetime of the
    // ViewModel. The optimistic id (`temp_…` / `offline_…` / `retry_…`) is
    // the SwiftUI ForEach key for the row — we NEVER swap it in memory so the
    // bubble doesn't unmount/remount and flash. Backend operations
    // (delete/edit/react/pin) and cache writes resolve the real server id
    // through `serverId(for:)`. The mapping survives until the next reload
    // from cache (which already stores server ids), at which point the
    // optimistic id disappears naturally.
    var pendingServerIds: [String: String] = [:] {
        didSet { pendingServerIdSet = Set(pendingServerIds.values) }
    }
    private var pendingServerIdSet: Set<String> = []

    /// Resolve the authoritative server id for an in-memory message. Falls
    /// back to the supplied id when no mapping exists (the message id is
    /// already a server id, e.g. messages received from other users).
    func serverId(for messageId: String) -> String {
        pendingServerIds[messageId] ?? messageId
    }

    /// Persist the current `messages` snapshot to the cache using server ids
    /// for every reconciled optimistic row, so a future cold-start REST fetch
    /// reconciles cleanly without producing duplicate `temp_…` / server-id
    /// pairs. Called after the socket reconciliation in `ConversationSocketHandler`.
    func persistMessagesUsingServerIds() async {
        let convId = conversationId
        let mapping = pendingServerIds
        // S11 — re-key any "Delete for me" hidden ids from the optimistic temp id
        // to the reconciled server id. The row's display id flips temp→server at
        // ack (toMessage = serverId ?? localId); without this the hidden-set
        // still holds the temp id, the filter (keyed on message.id) stops
        // matching, and the hidden message reappears (in-memory + at cold start).
        for (tempId, serverId) in mapping {
            LocallyHiddenMessagesStore.shared.migrate(from: tempId, to: serverId)
        }
        let snapshot = messages
        let rewritten: [Message] = snapshot.map { msg -> Message in
            guard let serverId = mapping[msg.id] else { return msg }
            // Message.id is `let` — copy via init with overridden id.
            return Message(
                id: serverId,
                conversationId: msg.conversationId,
                senderId: msg.senderId,
                content: msg.content,
                originalLanguage: msg.originalLanguage,
                messageType: msg.messageType,
                messageSource: msg.messageSource,
                isEdited: msg.isEdited,
                editedAt: msg.editedAt,
                deletedAt: msg.deletedAt,
                replyToId: msg.replyToId,
                storyReplyToId: msg.storyReplyToId,
                forwardedFromId: msg.forwardedFromId,
                forwardedFromConversationId: msg.forwardedFromConversationId,
                expiresAt: msg.expiresAt,
                effects: msg.effects,
                maxViewOnceCount: msg.maxViewOnceCount,
                viewOnceCount: msg.viewOnceCount,
                pinnedAt: msg.pinnedAt,
                pinnedBy: msg.pinnedBy,
                isEncrypted: msg.isEncrypted,
                encryptionMode: msg.encryptionMode,
                createdAt: msg.createdAt,
                updatedAt: msg.updatedAt,
                attachments: msg.attachments,
                reactions: msg.reactions,
                replyTo: msg.replyTo,
                forwardedFrom: msg.forwardedFrom,
                senderName: msg.senderName,
                senderUsername: msg.senderUsername,
                senderColor: msg.senderColor,
                senderAvatarURL: msg.senderAvatarURL,
                senderUserId: msg.senderUserId,
                deliveryStatus: msg.deliveryStatus,
                isMe: msg.isMe,
                deliveredToAllAt: msg.deliveredToAllAt,
                readByAllAt: msg.readByAllAt,
                deliveredCount: msg.deliveredCount,
                readCount: msg.readCount
            )
        }
        try? await CacheCoordinator.shared.messages.save(rewritten, for: convId)
    }

    // MARK: - O(1) Message Index

    private var _messageIdIndex: [String: Int]?

    private var messageIdIndex: [String: Int] {
        if let cached = _messageIdIndex { return cached }
        var index = [String: Int](minimumCapacity: messages.count)
        for (i, msg) in messages.enumerated() {
            index[msg.id] = i
        }
        _messageIdIndex = index
        return index
    }

    func messageIndex(for id: String) -> Int? {
        messageIdIndex[id]
    }

    func containsMessage(id: String) -> Bool {
        messageIdIndex[id] != nil || pendingServerIdSet.contains(id)
    }

    // MARK: - Date-Grouped Messages

    struct DateGroup: Identifiable {
        let id: String
        let date: Date
        let messages: [Message]
    }

    private var _messagesByDate: [DateGroup]?

    var messagesByDate: [DateGroup] {
        if let cached = _messagesByDate { return cached }
        // Exclude rows the user deleted locally (WhatsApp "Delete for me"
        // behaviour) so they never reappear across cache reloads, REST
        // refreshes, or new socket arrivals of older messages.
        let hiddenIds = LocallyHiddenMessagesStore.shared.allHiddenIds
        let visible = hiddenIds.isEmpty ? messages : messages.filter { !hiddenIds.contains($0.id) }
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: visible) { msg -> DateComponents in
            calendar.dateComponents([.year, .month, .day], from: msg.createdAt)
        }
        let result = grouped.map { (comps, msgs) in
            let dateKey = "\(comps.year ?? 0)-\(comps.month ?? 0)-\(comps.day ?? 0)"
            let representativeDate = msgs.first?.createdAt ?? Date()
            return DateGroup(id: dateKey, date: representativeDate, messages: msgs)
        }
        .sorted { $0.date < $1.date }
        _messagesByDate = result
        return result
    }

    // MARK: - Conversation-Wide Media

    struct MediaSenderInfo {
        let senderName: String
        let senderAvatarURL: String?
        let senderColor: String
        let sentAt: Date
    }

    private var _mediaSenderInfoMap: [String: MediaSenderInfo]?
    var mediaSenderInfoMap: [String: MediaSenderInfo] {
        if let cached = _mediaSenderInfoMap { return cached }
        var map = [String: MediaSenderInfo](minimumCapacity: messages.count)
        for msg in messages {
            let info = MediaSenderInfo(
                senderName: msg.senderName ?? "?",
                senderAvatarURL: msg.senderAvatarURL,
                senderColor: msg.senderColor ?? "#999",
                sentAt: msg.createdAt
            )
            for att in msg.attachments {
                map[att.id] = info
            }
        }
        _mediaSenderInfoMap = map
        return map
    }

    /// All visual attachments (images + videos) across every loaded message, in chronological order.
    private var _allVisualAttachments: [MessageAttachment]?
    var allVisualAttachments: [MessageAttachment] {
        if let cached = _allVisualAttachments { return cached }
        let result = messages.flatMap { msg in
            msg.attachments.filter { [.image, .video].contains($0.type) }
        }
        _allVisualAttachments = result
        return result
    }

    // MARK: - Audio Items for Fullscreen Gallery

    struct AudioItem: Identifiable {
        let id: String // attachment.id
        let attachment: MessageAttachment
        let message: Message
        let transcription: MessageTranscription?
        let translatedAudios: [MessageTranslatedAudio]
    }

    private var _allAudioItems: [AudioItem]?
    var allAudioItems: [AudioItem] {
        if let cached = _allAudioItems { return cached }
        let result = messages.flatMap { msg in
            msg.attachments
                .filter { $0.type == .audio }
                .map { att in
                    AudioItem(
                        id: att.id,
                        attachment: att,
                        message: msg,
                        transcription: messageTranscriptionsByAttachment[att.id] ?? messageTranscriptions[msg.id],
                        translatedAudios: messageTranslatedAudiosByAttachment[att.id]
                            ?? (messageTranslatedAudios[msg.id] ?? []).filter { $0.attachmentId == att.id }
                    )
                }
        }
        _allAudioItems = result
        return result
    }

    /// Maps attachment.id -> caption text for the fullscreen gallery.
    /// Priority: 1) attachment.caption  2) message text (only if single visual attachment)
    private var _mediaCaptionMap: [String: String]?
    var mediaCaptionMap: [String: String] {
        if let cached = _mediaCaptionMap { return cached }
        var map: [String: String] = [:]
        for msg in messages {
            let visuals = msg.attachments.filter { [.image, .video].contains($0.type) }
            for att in visuals {
                if let caption = att.caption, !caption.isEmpty {
                    map[att.id] = caption
                } else if visuals.count == 1 && !msg.content.isEmpty {
                    // Single visual + message text -> show as caption
                    // Use translation if available, otherwise original content
                    if let preferred = preferredTranslation(for: msg.id) {
                        map[att.id] = preferred.translatedContent
                    } else {
                        map[att.id] = msg.content
                    }
                }
            }
        }
        _mediaCaptionMap = map
        return map
    }

    // MARK: - Reply Count Map (cached, O(1) lookup per message)

    private var _replyCountMap: [String: Int]?
    var replyCountMap: [String: Int] {
        if let cached = _replyCountMap { return cached }
        var map = [String: Int]()
        for msg in messages {
            if let parentId = msg.replyToId {
                map[parentId, default: 0] += 1
            }
        }
        _replyCountMap = map
        return map
    }

    // MARK: - Private

    let conversationId: String
    let memberJoinedAt: Date?
    private let isDirect: Bool
    private let participantUserId: String?
    private let initialUnreadCount: Int
    private let limit = 30
    private var nextMessageCursor: String?
    private var cancellables = Set<AnyCancellable>()
    private var messagesPersistCancellable: AnyCancellable?
    /// Subscription that mirrors `MessageStore.messagesDidChange` into the
    /// `messages` array.  Established once in `init` after `messageStore` is ready.
    private var storeObservation: AnyCancellable?
    private var socketHandler: ConversationSocketHandler?

    // MARK: - Split Orchestrators (incremental migration scaffold)
    //
    // The 3000-line legacy here is being progressively split into focused
    // handlers under `ViewModels/Conversation/`. For now the legacy keeps
    // owning `@Published var messages` and friends; the handlers mirror that
    // state into `stateStore.messages` so that the delegated methods
    // (currently `searchMessages`, `prefetchRecentMedia`, …) work against
    // the same source of truth. See `[[project_conversation_vm_split_staged]]`.
    /// Exposed so ConversationView and MessageListViewController can observe typing
    /// state independently — avoids triggering the full VM objectWillChange on every keystroke.
    let stateStore: ConversationStateStore
    private let commandHandler: ConversationCommandHandler
    private let mediaHandler: ConversationMediaHandler
    private let searchHandler: ConversationSearchHandler

    // MARK: - GRDB Persistence (additive — parallel data source alongside @Published messages)

    /// GRDB-backed observable store for UICollectionView bridge.
    /// Created eagerly in init so it is available at first paint.
    private(set) var messageStore: MessageStore

    /// Actor for optimistic inserts and state-machine transitions.
    private(set) var messagePersistence: MessagePersistenceActor
    private var lastOlderPaginationTime: Date = .distantPast
    private var lastNewerPaginationTime: Date = .distantPast
    private static let paginationDebounceInterval: TimeInterval = 0.3
    private static let paginationRetryCount: Int = 3
    private static let paginationRetryDelay: UInt64 = 500_000_000

    private let authManager: AuthManaging
    private let messageService: MessageServiceProviding
    private let conversationService: ConversationServiceProviding
    private let reactionService: ReactionServiceProviding
    private let reportService: ReportServiceProviding
    private let syncEngine: ConversationSyncEngineProviding
    private let mentionService: MentionServiceProviding
    private let messageSocket: MessageSocketProviding
    private let networkMonitor: NetworkMonitorProviding
    private let offlineQueue: OfflineMessageQueueing
    private let decryptionActor = DecryptionActor(provider: LiveSessionProvider())

    /// Captured at init so the heavy side-effects (DB observation, initial
    /// load, Combine subscriptions, singleton mutations) can be deferred out
    /// of `init` into `start()`. `init` MUST stay side-effect-free: SwiftUI
    /// reconstructs `ConversationView` — and therefore eagerly allocates a
    /// throwaway `ConversationViewModel` (discarded by `@StateObject`) — on
    /// every parent re-evaluation. Running the GRDB window read / observation
    /// registration / singleton thrash in `init` turned that into a constant
    /// main-thread storm (device trace: ~57% of a P-core, battery heating).
    /// See `start()`.
    private let startupDependencies: ConversationDependencies
    private let anonymousSession: AnonymousSessionContext?
    private var hasStarted = false

    private var currentUserId: String { authManager.currentUser?.id ?? "" }
    /// Public read-only accessor for the view layer (UIKit bridge needs the user id).
    var currentUserIdForView: String { currentUserId }
    private var currentUsername: String? { authManager.currentUser?.username }

    // Token bucket rate limiter for reaction spam prevention.
    // Allows burst of 10, refills at 3 tokens/second.
    private var reactionTokens: Double = 10
    private var reactionLastRefill: Date = Date()
    private static let reactionMaxTokens: Double = 10
    private static let reactionRefillRate: Double = 3

    private func consumeReactionToken() -> Bool {
        let now = Date()
        let elapsed = now.timeIntervalSince(reactionLastRefill)
        reactionTokens = min(Self.reactionMaxTokens, reactionTokens + elapsed * Self.reactionRefillRate)
        reactionLastRefill = now
        guard reactionTokens >= 1 else { return false }
        reactionTokens -= 1
        return true
    }

    // MARK: - Mention Display Names (username → displayName) — cached

    private var _mentionDisplayNames: [String: String]?

    var mentionDisplayNames: [String: String] {
        if let cached = _mentionDisplayNames { return cached }
        UserDisplayNameCache.shared.trackFromMessages(messages)
        let map = UserDisplayNameCache.shared.allMappings()
        _mentionDisplayNames = map
        return map
    }

    // MARK: - Mention Autocomplete Logic — cached

    private var _mentionCandidates: [MentionCandidate]?

    private var mentionCandidates: [MentionCandidate] {
        if let cached = _mentionCandidates { return cached }
        var seen = Set<String>()
        var candidates: [MentionCandidate] = []
        for msg in messages {
            guard let username = msg.senderUsername, !seen.contains(username) else { continue }
            seen.insert(username)
            candidates.append(MentionCandidate(
                id: msg.senderId.isEmpty ? username : msg.senderId,
                username: username,
                displayName: msg.senderName ?? username,
                avatarURL: msg.senderAvatarURL
            ))
        }
        _mentionCandidates = candidates
        return candidates
    }

    // MARK: - Mention Delegation

    /// Delegates to the controller. Called from `onTextChanged`.
    func handleMentionQuery(in text: String) {
        mentionController.handleQuery(in: text)
    }

    func clearMentionSuggestions() {
        mentionController.clearSuggestions()
    }

    /// Delegates insertion to the controller and returns the updated text.
    func insertMention(_ candidate: MentionCandidate, into text: String) -> String {
        mentionController.insertMention(candidate, into: text)
    }

    // MARK: - Top Active Members (cached)

    private var _topActiveMembers: [ConversationActiveMember]?

    func topActiveMembersList(accentColor: String) -> [ConversationActiveMember] {
        if let cached = _topActiveMembers { return cached }
        var counts: [String: (name: String, color: String, avatarURL: String?, count: Int)] = [:]
        for msg in messages where !msg.isMe {
            let id = msg.senderId
            guard !id.isEmpty else { continue }
            if var existing = counts[id] {
                existing.count += 1
                counts[id] = existing
            } else {
                counts[id] = (
                    name: msg.senderName ?? "?",
                    color: msg.senderColor ?? accentColor,
                    avatarURL: msg.senderAvatarURL,
                    count: 1
                )
            }
        }
        let result = counts
            .sorted { $0.value.count > $1.value.count }
            .prefix(3)
            .map { ConversationActiveMember(id: $0.key, name: $0.value.name, color: $0.value.color, avatarURL: $0.value.avatarURL) }
        _topActiveMembers = result
        return result
    }

    // MARK: - Init

    init(
        conversationId: String,
        unreadCount: Int = 0,
        isDirect: Bool = false,
        participantUserId: String? = nil,
        memberJoinedAt: Date? = nil,
        closedAt: Date? = nil,
        anonymousSession: AnonymousSessionContext? = nil,
        authManager: AuthManaging = AuthManager.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        reactionService: ReactionServiceProviding = ReactionService.shared,
        reportService: ReportServiceProviding = ReportService.shared,
        syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared,
        mentionService: MentionServiceProviding = MentionService.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        dependencies: ConversationDependencies = .live,
        networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared,
        offlineQueue: OfflineMessageQueueing = OfflineQueue.shared
    ) {
        self.conversationId = conversationId
        self.memberJoinedAt = memberJoinedAt
        self.initialUnreadCount = unreadCount
        self.isDirect = isDirect
        self.participantUserId = participantUserId
        self.isConversationClosed = closedAt != nil
        self.authManager = authManager
        self.messageService = messageService
        self.conversationService = conversationService
        self.reactionService = reactionService
        self.reportService = reportService
        self.syncEngine = syncEngine
        self.mentionService = mentionService
        self.messageSocket = messageSocket
        self.networkMonitor = networkMonitor
        self.offlineQueue = offlineQueue
        // Eagerly create GRDB persistence so messageStore is available at first paint.
        self.messagePersistence = dependencies.persistence
        self.startupDependencies = dependencies
        self.anonymousSession = anonymousSession

        // Split-handler scaffolding — see ConversationStateStore et al.
        // Built before MessageStore/socket so subsequent delegations always
        // have a non-nil handler to call. The handlers don't drive any state
        // yet; they mirror the legacy @Published values via the messages
        // sink below so `searchHandler` / `mediaHandler` can read off
        // `stateStore.messages` without forking the source of truth.
        let stateStore = ConversationStateStore()
        self.stateStore = stateStore
        self.commandHandler = ConversationCommandHandler(
            state: stateStore,
            conversationId: conversationId,
            messageService: messageService,
            persistence: dependencies.persistence
        )
        self.mediaHandler = ConversationMediaHandler(state: stateStore)
        self.searchHandler = ConversationSearchHandler(
            state: stateStore,
            conversationId: conversationId,
            messageService: messageService,
            persistence: dependencies.persistence
        )
        let store = MessageStore(
            conversationId: conversationId,
            persistence: dependencies.persistence
        )
        self.messageStore = store
        // Wire up the mention controller for this conversation.
        // localCandidates closure is evaluated lazily when a mention query fires,
        // so mentionCandidates (which depend on messages) is always up-to-date.
        // messageStore is initialized first: the localCandidates closure
        // transitively reads it through `mentionCandidates` -> `messages`,
        // so forming it before messageStore is set is a use-before-init error.
        self.mentionController = MentionComposerController(
            context: .conversation(id: conversationId),
            localCandidates: { [weak self] in self?.mentionCandidates ?? [] },
            service: mentionService
        )
        let handler = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: authManager.currentUser?.id ?? ""
        )
        handler.delegate = self
        handler.persistence = dependencies.persistence
        self.socketHandler = handler
    }

    /// Activates the conversation: registers the GRDB window observation,
    /// kicks off the initial DB load, wires every Combine subscription, and
    /// declares the conversation as currently-open on the sync engine.
    ///
    /// CRITICAL — this MUST NOT run from `init`. `ConversationView` is
    /// reconstructed by SwiftUI on every parent re-evaluation (RootView's
    /// `navigationDestination` closure reads `router.pendingReplyContext`),
    /// and each reconstruction eagerly allocates a throwaway VM that
    /// `@StateObject` immediately discards. When this work lived in `init`,
    /// every throwaway allocation paid for a full SQLite window read+decode on
    /// the main actor and thrashed `syncEngine.setCurrentlyOpenConversation`
    /// (`init` set it, the throwaway `deinit` cleared it), whose published
    /// recompute re-rendered RootView → reconstructed ConversationView → a
    /// self-sustaining main-thread storm (device trace: constant ~57% of a
    /// P-core, thermal state Nominal→Fair). Driven once from the view's
    /// `.task` (one run per `.id(conversationId)` identity); the `hasStarted`
    /// guard makes re-entry (background→foreground re-task) a no-op.
    func start() {
        guard !hasStarted else { return }
        hasStarted = true
        // Declare this conversation as currently visible so the sync engine
        // forces its `unreadCount` to 0 on every server broadcast (the user
        // IS reading it) and excludes it from the cross-conversation
        // aggregator. Cleared in `deinit`.
        syncEngine.setCurrentlyOpenConversation(conversationId)
        // Open side-effects (socket room join + active-conversation publish to
        // the notification singletons). Lives here — NOT in the handler's init
        // — so the throwaway VMs SwiftUI allocates on every parent
        // re-evaluation never fire them (only the installed VM runs start()).
        socketHandler?.activate()
        messageStore.startObserving(dbPool: startupDependencies.dbPool)
        Task { await messageStore.loadInitial() }
        messagesPersistCancellable = $messages
            .dropFirst()
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] snapshot in
                guard let self, !snapshot.isEmpty else { return }
                // Route through the id-mapping persister so any reconciled
                // optimistic rows land in cache under their server ids.
                Task { [weak self] in await self?.persistMessagesUsingServerIds() }
            }
        subscribeToMessageStore()
        subscribeToQueueReconciliation()
        subscribeToLanguagePreferenceChanges()
        subscribeToMessagesForAudioQueue()
        subscribeToAudioCoordinatorFinishedEvents()
        mirrorMessagesIntoStateStore()
        hydrateCurrentConversationFromCache()
        loadVoiceConsentStatus()
        // Cross-conversation unread aggregator powers the back-button pill.
        // `setCurrentlyOpenConversation(conversationId)` (called above) makes the
        // sync engine EXCLUDE this conversation from `totalConversationsUnread`,
        // so the published aggregate is ALREADY "other conversations only" — we
        // mirror it directly. Subtracting this conversation's own unread here
        // would remove it a second time and under-shoot the pill to 0 while other
        // conversations still have unread (the engine is the single source of
        // truth for cross-conversation unread; the VM must not re-derive it).
        // `max(0, …)` is a defensive clamp — the engine already clamps ≥ 0.
        syncEngine.totalConversationsUnread
            .receive(on: DispatchQueue.main)
            .sink { [weak self] total in
                self?.otherConversationsUnread = max(0, total)
            }
            .store(in: &cancellables)
        if let session = anonymousSession {
            APIClient.shared.anonymousSessionToken = session.sessionToken
            MessageSocketManager.shared.connectAnonymous(sessionToken: session.sessionToken)
        }
    }

    /// Reconcile optimistic messages with their server-assigned ids when the
    /// unified `OfflineQueue` finally lands the send, and flip rows to
    /// `.failed` when the retry budget is exhausted. Without this mapping a
    /// `message:new` socket broadcast arrives with an unknown id and the
    /// optimistic row would stay stuck in `.sending` forever while a duplicate
    /// appears.
    ///
    /// Wave 1 Task 3.6 — collapsed onto the unified `OfflineQueue.retrySucceeded` /
    /// `.retryExhausted` / `.retryDropped` signals, replacing the legacy
    /// per-queue publishers from `MessageRetryQueue` and `ReactionQueue`.
    // MARK: - MessageStore Observation (Task 1.3)

    /// Subscribes to `messageStore.messagesDidChange` so that GRDB-driven
    /// inserts/updates (optimistic sends, offline queue reconciliation) are
    /// reflected in `messages` without an explicit assignment at the call site.
    ///
    /// When the store emits a change, this method maps the `[MessageRecord]`
    /// snapshot to `[MeeshyMessage]`, replaces `messages`, and calls
    /// `objectWillChange` so SwiftUI re-renders.
    /// Monotonic token bumped on every store-driven refresh. An async
    /// decryption pass that finishes after a newer refresh started checks this
    /// before assigning, so a stale snapshot never overwrites a fresher one.
    private var storeRefreshGeneration: Int = 0

    private func subscribeToMessageStore() {
        storeObservation = messageStore.messagesDidChange
            .sink { [weak self] in
                // Defer to a fresh runloop tick via DispatchQueue.main.async — a
                // synchronous .receive(on: DispatchQueue.main) handler can fire
                // mid-view-update on the SwiftUI render runloop, which trips
                // "Publishing changes from within view updates" when @Published
                // self.messages is mutated. async-dispatch from any thread
                // guarantees the @Published mutation lands on a fresh runloop
                // iteration AFTER the current view body evaluation completes.
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.storeRefreshGeneration &+= 1
                    let generation = self.storeRefreshGeneration
                    let userId = self.currentUserId
                    let mapped = self.messageStore.domainMessages(currentUserId: userId)
                    // E2EE: encrypted DMs are persisted as ciphertext — the
                    // socket and REST ingestion paths both store `api.content`
                    // verbatim, so cleartext never touches disk. Decrypt the
                    // mapped snapshot in memory so every store-driven refresh
                    // surfaces readable content. Meeshy E2EE uses a per-peer
                    // symmetric key, so re-decrypting the same ciphertext on
                    // each refresh is idempotent and cheap.
                    let needsDecryption = self.isDirect
                        && mapped.contains { $0.isEncrypted && !$0.content.isEmpty }
                    guard needsDecryption else {
                        self.messages = self.mergeIntoMessages(mapped)
                        return
                    }
                    Task { @MainActor [weak self] in
                        guard let self else { return }
                        var decrypted = mapped
                        await self.decryptMessagesIfNeeded(&decrypted)
                        // Drop a stale decrypt that lost the race to a newer refresh.
                        guard generation == self.storeRefreshGeneration else { return }
                        self.messages = self.mergeIntoMessages(decrypted)
                    }
                }
            }
    }

    /// Merges `incoming` messages into the current `messages` array, preserving
    /// any in-memory messages not yet reflected in the GRDB snapshot (e.g., a
    /// socket delivery that raced the REST load). Deduplicates by `id` so a
    /// message received from both the initial REST response and the socket
    /// never appears twice. Result is sorted by `createdAt`.
    ///
    /// Duplicate prevention: when a server ACK flips a message's display id from
    /// localId (e.g. "cid_…") to serverId (e.g. "mongo_…"), `incoming` contains
    /// the server-id version but the OLD optimistic row is still in `messages`
    /// under its original id. Without correction, the preserve-logic keeps the
    /// old row alongside the new one → duplicate bubble. `pendingServerIds`
    /// maps localId → serverId synchronously before `applyEvent` fires the GRDB
    /// refresh, so it is always populated in time.
    private func mergeIntoMessages(_ incoming: [Message]) -> [Message] {
        let incomingIds = Set(incoming.map(\.id))

        // Detect optimistic rows superseded by a server-ack id-flip:
        // if pendingServerIds maps msg.id → some id that IS in incoming, the
        // old optimistic row must not be preserved (it would duplicate the
        // acked row, which is already in incoming under the server id).
        let supersededIds = Set(messages.compactMap { msg -> String? in
            guard let sid = pendingServerIds[msg.id], incomingIds.contains(sid) else { return nil }
            return msg.id
        })

        let preserved = messages.filter { !incomingIds.contains($0.id) && !supersededIds.contains($0.id) }
        let result = preserved.isEmpty ? incoming : (incoming + preserved).sorted { $0.createdAt < $1.createdAt }

        // Diagnostic: log when a message disappears from the display unexpectedly.
        // Superseded rows (known id-flip) are EXPECTED drops and logged at info.
        // Unknown drops are bugs and logged at error.
        let beforeIds = Set(messages.map(\.id))
        let resultIds = Set(result.map(\.id))
        let allDroppedIds = beforeIds.subtracting(resultIds)
        if !allDroppedIds.isEmpty {
            let trueDrops = allDroppedIds.subtracting(supersededIds)
            if !trueDrops.isEmpty {
                let inFlight = messages.filter { trueDrops.contains($0.id) }
                    .filter { m in
                        let s = String(describing: m.deliveryStatus)
                        return s.contains("sending") || s.contains("clock") || s.contains("failed") || s.contains("sent") || s.contains("queued")
                    }
                Logger.messages.error("[ConversationViewModel][BUG1] merge DROPPED \(trueDrops.count) display row(s) before=\(self.messages.count) incoming=\(incoming.count) result=\(result.count) inFlightOrSent=\(inFlight.count) ids=\(trueDrops.sorted().prefix(8).joined(separator: ","))")
            }
            if !supersededIds.isEmpty {
                Logger.messages.info("[ConversationViewModel] merge suppressed \(supersededIds.count) superseded optimistic row(s) after server-ack id-flip ids=\(supersededIds.sorted().prefix(8).joined(separator: ","))")
            }
        }
        return result
    }

    private func subscribeToQueueReconciliation() {
        // Wave 1 Task 3.6 — unified `OfflineQueue.retrySucceeded` covers both
        // message-centric (sendMessage/edit/delete) and reaction
        // (sendReaction) outbox kinds. We only act on `.sendMessage` here
        // because that's the only kind that produces a server-assigned id
        // worth reconciling with the optimistic local id. Reaction success
        // is a no-op at the ViewModel level — the `reaction:added` /
        // `reaction:removed` socket broadcast keeps every client in sync.
        OfflineQueue.shared.retrySucceeded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self, payload.conversationId == self.conversationId else { return }
                guard payload.kind == .sendMessage else { return }
                pendingServerIds[payload.tempId] = payload.serverId
                let localId = payload.tempId
                let serverId = payload.serverId
                Task { [weak self] in
                    _ = try? await self?.messagePersistence.applyEvent(
                        localId: localId,
                        event: .serverAck(serverId: serverId, at: Date())
                    )
                }
            }
            .store(in: &cancellables)

        // Unified terminal-failure signal — fires both for message sends
        // exhausted by `OutboxFlusher` (5 attempts) and for reactions that
        // the dispatcher rejected permanently (404/409/410). We dispatch on
        // `kind` to apply the right rollback strategy.
        OfflineQueue.shared.retryExhausted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                Task { [weak self] in await self?.handleRetryExhausted(payload) }
            }
            .store(in: &cancellables)
    }

    /// Reconcile an outbox row that the `OutboxFlusher` escalated to
    /// `.exhausted` (5 attempts, or a permanent dispatcher rejection). We
    /// dispatch on `kind` to apply the right rollback so the optimistic local
    /// state does not diverge from the server forever. Scoped to THIS
    /// conversation. Extracted from the Combine sink so it is directly
    /// awaitable in tests.
    func handleRetryExhausted(_ payload: OfflineRetryExhausted) async {
        guard payload.conversationId == self.conversationId else { return }
        switch payload.kind {
        case .sendMessage:
            _ = try? await messagePersistence.applyEvent(
                localId: payload.tempId, event: .retryExhausted
            )
        case .sendReaction:
            guard let reaction = payload.reaction else { return }
            // Same canonical sentinel the optimistic add used (see toggleReaction):
            // the rollback must match the key that was actually written.
            let participantId = currentUserId
            let localId = reaction.messageId
            let emoji = reaction.emoji
            switch reaction.action {
            case .add:
                // Optimistic add failed permanently — remove the reaction we wrote.
                try? await messagePersistence.removeReaction(
                    localId: localId, emoji: emoji, participantId: participantId
                )
            case .remove:
                // Optimistic remove failed permanently — restore the reaction we erased.
                let remoteId = serverId(for: localId)
                try? await messagePersistence.appendReaction(
                    localId: localId, reactionId: UUID().uuidString,
                    messageId: remoteId, participantId: participantId, emoji: emoji
                )
            }
        case .editMessage:
            // S3 — an offline edit that exhausted its retries never reached the
            // server; restore the pre-edit content (captured in EditHistoryStore
            // when the edit was applied) and drop the phantom revision. Mirrors
            // the online edit rollback in `editMessage`.
            let localId = payload.tempId
            let canonicalId = serverId(for: localId)
            if let original = EditHistoryStore.shared.revisions(for: canonicalId).last?.content {
                try? await messagePersistence.markEdited(
                    localId: localId, newContent: original, editedAt: Date()
                )
                EditHistoryStore.shared.removeHistory(for: canonicalId)
            }
        case .deleteMessage:
            // S3 — an offline delete that exhausted never reached the server;
            // un-delete locally so the message stops showing as deleted on this
            // device only. Mirrors the online delete rollback (`markUndeleted`).
            try? await messagePersistence.markUndeleted(localId: payload.tempId)
        default:
            // Other outbox kinds (blockUser, friendRequest, etc.) reconcile
            // through their own dedicated ViewModels.
            break
        }
    }

    /// Mirror the legacy `@Published var messages` into the new
    /// `ConversationStateStore.messages` so the split handlers
    /// (`searchHandler`, `mediaHandler`) can read
    /// off the shared store while the legacy ViewModel still owns the
    /// canonical source. Removed once the migration of the message
    /// pipeline (init/load/send/edit/delete) into `commandHandler` is
    /// complete and the legacy `@Published messages` retired.
    private func mirrorMessagesIntoStateStore() {
        stateStore.messages = messages
        $messages
            .receive(on: DispatchQueue.main)
            .sink { [weak self] snapshot in
                self?.stateStore.messages = snapshot
            }
            .store(in: &cancellables)
    }

    private func subscribeToLanguagePreferenceChanges() {
        authManager.currentUserPublisher
            .removeDuplicates { old, new in
                old?.systemLanguage == new?.systemLanguage
                && old?.regionalLanguage == new?.regionalLanguage
                && old?.customDestinationLanguage == new?.customDestinationLanguage
            }
            .dropFirst()
            .sink { [weak self] _ in
                // P4.2: cache invalidation follows the same rename that
                // moved `preferredLanguages` into ``ConversationLanguagePreferences``;
                // the old `_cachedPreferredLanguages` / `_cachedPreferredLanguagesUserId`
                // pair was collapsed into a single Equatable cache slot.
                self?._cachedLanguagePreferences = nil
                // B2 (Prisme Linguistique) — bump the revision so any
                // subscriber that selected a translation based on the
                // previous preferred languages can re-resolve. Without
                // this, the bubble keeps showing the old translation
                // until a new translation event arrives.
                self?.preferredLanguageRevision &+= 1
            }
            .store(in: &cancellables)
    }

    deinit {
        // socketHandler deinit handles room leave & typing cleanup
        socketHandler = nil
        // Only undo the singleton mutations `start()` performed. A throwaway VM
        // (eagerly allocated by `ConversationView.init`, never activated because
        // `@StateObject` discarded it before its `.task` ran) MUST NOT clear the
        // anonymous token or the currently-open gate — doing so cancelled what
        // the live VM's `start()` had just set and fed the re-render storm.
        guard hasStarted else { return }
        APIClient.shared.anonymousSessionToken = nil
        // Relinquish the currently-open conversation gate so cross-conversation
        // surfaces (back-button pill on other screens) resume counting it — but
        // ONLY if the gate still points at THIS conversation. On a fast A→B
        // switch the next VM's `start()` may set the gate to B before A's
        // `deinit` runs (ARC teardown order is not guaranteed vs the async
        // `.task`); an unconditional clear would then blank the gate while B is
        // on screen — phantom unread on B + B re-counted in the back-button pill.
        // Clearing by identity makes deinit order-safe.
        if syncEngine.currentlyOpenConversationId == conversationId {
            syncEngine.setCurrentlyOpenConversation(nil)
        }
    }

    // MARK: - Typing Emission (delegated to socketHandler)

    func onTextChanged(_ text: String) {
        socketHandler?.onTextChanged(text)
        mentionController.handleQuery(in: text)
    }

    func stopTypingEmission() {
        socketHandler?.stopTypingEmission()
    }

    // MARK: - Programmatic Scroll Guard

    /// Call before any programmatic scroll. Resets after a short delay.
    func markProgrammaticScroll() {
        isProgrammaticScroll = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.isProgrammaticScroll = false
        }
    }

    // MARK: - Message Processing Pipeline

    private func processAPIMessages(_ apiMessages: [APIMessage]) async -> [Message] {
        let userId = currentUserId
        let username = currentUsername
        // Decode + map the API payload off the main actor. `toMessage` decodes
        // each message's translations / attachments / reactions; for a
        // multi-hundred-message conversation load that is real CPU that would
        // otherwise stutter the UI. `[APIMessage]` in and `[MeeshyMessage]` out
        // are both Sendable, so the hop is clean.
        var msgs = await Task.detached(priority: .userInitiated) {
            apiMessages.reversed().map { $0.toMessage(currentUserId: userId, currentUsername: username) }
        }.value
        await decryptMessagesIfNeeded(&msgs)
        extractAttachmentTranscriptions(from: apiMessages)
        extractTextTranslations(from: apiMessages)
        return msgs
    }

    // MARK: - Load Messages (initial)

    /// REST send timeout (seconds). Far below `APIClient.timeoutIntervalForRequest`
    /// (60s): a slow/failing POST must fall through to the socket fallback +
    /// durable outbox quickly instead of pinning the optimistic `.sending`
    /// clock for a full minute on a single hung cellular attempt.
    static let sendRESTTimeoutSeconds: Double = 12

    /// Phase 2 — seeds the local `MediaConsumptionStore` from the server-synced
    /// per-user consumption surfaced on freshly loaded attachments, so the
    /// in-bubble waveform tint (audio) / progress bar (video) reflect progress
    /// made on other devices the moment the conversation opens. The store merges
    /// with MAX semantics, so a further-along LOCAL position is never regressed
    /// by a staler server value (and vice-versa). App-side orchestration: it
    /// derives the playback fraction from the attachment duration and decides
    /// when to seed — the store itself stays an opaque building block.
    private func seedMediaConsumption(from messages: [Message]) {
        for message in messages {
            for attachment in message.attachments {
                guard let consumption = attachment.currentUserConsumption else { continue }
                let durationMs = attachment.duration ?? 0
                let positionMs: Int?
                let complete: Bool
                switch attachment.type {
                case .audio:
                    positionMs = consumption.lastPlayPositionMs
                    complete = consumption.listenedComplete
                case .video:
                    positionMs = consumption.lastWatchPositionMs
                    complete = consumption.watchedComplete
                default:
                    continue
                }
                // Nothing to seed without either completion or a measurable position.
                guard complete || (positionMs != nil && durationMs > 0) else { continue }
                // `record` floors `complete` to fraction 1, so 0 here is safe
                // when only completion is known (no position/duration).
                let fraction: Double
                if durationMs > 0, let pos = positionMs {
                    fraction = Double(pos) / Double(durationMs)
                } else {
                    fraction = 0
                }
                MediaConsumptionStore.shared.record(fraction: fraction, complete: complete, for: attachment.id)
            }
        }
    }

    func loadMessages() async {
        guard !isLoadingInitial else { return }
        isLoadingInitial = true
        error = nil

        // Réconcilie les messages bloqués en .sending/.queued dont le record
        // outbox est épuisé → .failed. Couvre le cas « conversation rouverte
        // après épuisement des tentatives » : la bulle affiche alors la barre
        // « Échec · Réessayer · Supprimer » au lieu d'un spinner figé.
        await messagePersistence.reconcileFailedFromOutbox(conversationId: conversationId)
        // Et les lignes optimistes ORPHELINES (process tué / Task annulée
        // entre l'insert optimiste et serverAck/sendFailed, AUCUN outbox
        // vivant pour les rejouer) : sans ça l'horloge `.sending` réapparaît
        // à chaque réouverture, pour toujours.
        await messagePersistence.reconcileOrphanedSendingRows(conversationId: conversationId)

        // Drain any push-prefetched messages the NSE wrote to the App Group
        // BEFORE reading the GRDB snapshot. A message received while the app
        // was backgrounded (the "j'ai reçu la notif" case) is otherwise only
        // merged on `resumeFromBackground`, never on the conversation-open
        // path — so it stayed absent from the thread until a network refresh.
        // `consumeAll` now persists synchronously (awaited upsert), so the
        // snapshot below picks the message up locally — no REST round-trip.
        await NSEPendingMessageConsumer.shared.consumeAll()

        let cached = await CacheCoordinator.shared.messages.load(for: conversationId)
        switch cached {
        case .fresh:
            // Surface GRDB data immediately (fast path for returning to a conversation).
            // Pré-hydrate les traductions AVANT loadInitial : les bulles
            // s'affichent dès le premier rendu avec le Prisme Linguistique.
            // Overlap the two independent pre-paint GRDB reads instead of
            // awaiting them in series: persisted translations (must land before
            // `apply` so bubbles paint with the Prisme already applied — no
            // untranslated flash) and the message snapshot. They touch disjoint
            // state (the translations dict vs the message store) and are pure
            // reads on the WAL pool, so they run concurrently; awaiting BOTH
            // before `apply` keeps the exact ordering invariant while cutting the
            // sequential read latency when reopening a cached conversation.
            async let translationsHydrated: Void = hydratePersistedTranslations()
            // Atomic publish — read off-MainActor, then apply messages +
            // dependent metadata in a single MainActor slice so no
            // intermediate frame ever renders audio bubbles without their
            // transcription / translated audios dictionaries.
            let freshSnapshot = await messageStore.loadInitialSnapshot()
            await translationsHydrated
            // Merge the volatile (CacheCoordinator) translations for THESE exact
            // messages into the dict BEFORE apply. `hydratePersistedTranslations`
            // only pre-loads GRDB-persisted rows, so freshly-received translations
            // that haven't been persisted yet would otherwise land only in the
            // post-apply pass — popping the language flags in a frame AFTER the
            // bubbles paint. Hydrating here makes the first paint carry the flags.
            await hydrateTranslationsFromCache(messageIds: freshSnapshot.map(\.localId))
            messageStore.apply(records: freshSnapshot)
            hydrateMetadataFromGRDB(from: freshSnapshot)
            // Background revalidation — catches anything the local store missed
            // while the conversation was closed (edits, reactions, translations,
            // and any received message not already surfaced locally). The common
            // gaps are now closed before this snapshot: the global SyncEngine
            // sink (`handleNewMessage` → `apiMessagePersistor`) persists received
            // messages into GRDB even for CLOSED conversations while connected,
            // and `consumeAll()` above drains background-push messages from the
            // App Group synchronously — so the just-notified message renders from
            // local data on open, not after this round-trip. This refresh stays
            // unconditional as the authoritative backstop for the foreground race
            // (the sink's write still in flight) and offline-delivered deltas.
            isRevalidating = !messageStore.messages.isEmpty
            Task { [weak self] in
                guard let self else { return }
                await self.refreshMessagesFromAPI()
                await MainActor.run { self.isRevalidating = false }
            }

        case .stale:
            // Surface GRDB data immediately, then revalidate in background.
            // Pré-hydrate les traductions AVANT loadInitial (cf. .fresh).
            // Lectures GRDB indépendantes parallélisées (cf. branche .fresh).
            async let translationsHydrated: Void = hydratePersistedTranslations()
            let staleSnapshot = await messageStore.loadInitialSnapshot()
            await translationsHydrated
            // Pre-apply volatile-cache merge (see .fresh) so the language flags
            // paint with the bubbles instead of a frame later.
            await hydrateTranslationsFromCache(messageIds: staleSnapshot.map(\.localId))
            messageStore.apply(records: staleSnapshot)
            hydrateMetadataFromGRDB(from: staleSnapshot)
            if messageStore.messages.isEmpty {
                // GRDB cold for this conversation — fetch synchronously to render now.
                await refreshMessagesFromAPI()
                await hydrateTranslationsFromCache()
            } else {
                isRevalidating = true
                Task { [weak self] in
                    guard let self else { return }
                    await self.refreshMessagesFromAPI()
                    await MainActor.run { self.isRevalidating = false }
                }
            }

        case .expired, .empty:
            // Fetch from API; refreshMessagesFromAPI upserts to GRDB and the store
            // observation surfaces the result automatically.
            await refreshMessagesFromAPI()
        }

        // If the refresh discovered we no longer have access, the View is
        // already dismissing via the `accessRevoked` observer — skip the
        // socket arming, mark-as-read calls, and media prefetch which would
        // all just fire 403s of their own.
        if accessRevoked {
            isLoadingInitial = false
            return
        }

        // Calculate first unread message position
        if initialUnreadCount > 0 && messages.count >= initialUnreadCount {
            let unreadStartIndex = messages.count - initialUnreadCount
            let candidate = messages[unreadStartIndex]
            if !candidate.isMe {
                firstUnreadMessageId = candidate.id
            }
        }

        // Arm socket subscriptions now that messages are loaded — deferred
        // from SocketHandler.init to avoid 10-16ms of synchronous Combine
        // subscription setup blocking the first render.
        socketHandler?.armSocketSubscriptions()

        // Mark conversation as read + received (fire-and-forget)
        markAsRead()
        markAsReceived()

        // Prefetch media for visible messages
        prefetchRecentMedia()

        isLoadingInitial = false
    }

    /// Bandwidth optimization (Niveau 1 — Bug F) : flip to `true` once the
    /// first REST refresh has succeeded so subsequent refreshes can opt out
    /// of having the gateway return `translations` (text + audio metadata is
    /// already persisted in GRDB and the socket pushes future deltas live).
    /// First fetch (cold-start, GRDB empty) still requests them in full.
    private var hasCompletedInitialFetch = false

    private func refreshMessagesFromAPI() async {
        do {
            // Warm cache means: we already have at least one message hydrated
            // from GRDB AND a previous fetch has succeeded. In that case we
            // ask the gateway to omit `translations` from the payload — they
            // are already in `translation_cache` GRDB and the live socket
            // (`translationReceived`) catches up any deltas. Cold-start keeps
            // the default `true` so the first paint has every translation.
            let warmCache = hasCompletedInitialFetch && !messageStore.messages.isEmpty
            let response = try await messageService.list(
                conversationId: conversationId,
                offset: 0,
                limit: 30,
                includeReplies: true,
                includeTranslations: !warmCache,
                languages: nil
            )

            // Upsert authoritative server data into GRDB; the MessageStore observation
            // surfaces new/updated rows to `messages` automatically — no direct assignment.
            try? await messagePersistence.upsertFromAPIMessages(response.data)
            hasCompletedInitialFetch = true
            // Extrait transcriptions/traductions AVANT que les messages ne
            // soient surface : `messageTranscriptions` est prêt au premier
            // rendu, la transcription audio ne « pop » plus en second temps.
            // `extractAttachmentTranscriptions` lit `response.data`
            // directement, il n'a pas besoin du store.
            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)
            // Atomic publish — same pattern as .fresh / .stale in
            // loadMessages. upsertFromAPIMessages has persisted the API rows
            // into GRDB, so loadInitialSnapshot picks them up; apply them in
            // the same MainActor slice as a defensive hydrateMetadataFromGRDB
            // call so a background revalidation never re-introduces a pop-in.
            // `forceOverwrite: true` because this is the AUTHORITATIVE refresh:
            // a server-side re-transcription must propagate to the UI even if
            // the message already had a (stale) cached transcription.
            let refreshSnapshot = await messageStore.loadInitialSnapshot()
            messageStore.apply(records: refreshSnapshot)
            hydrateMetadataFromGRDB(from: refreshSnapshot, forceOverwrite: true)

            // Keep legacy CacheCoordinator in sync so other parts of the app
            // (ConversationList preview, unread badge) that still read from it remain correct.
            let freshMessages = await processAPIMessages(response.data)
            // Phase 2 — seed the local consumption store from the server-synced
            // per-user progress so the waveform tint / video progress bar reflect
            // cross-device consumption at a glance (MAX-merged with local).
            seedMediaConsumption(from: freshMessages)
            scheduleTranscriptionRetry(for: response.data)
            let snapshot = freshMessages
            await CacheCoordinator.shared.messages.mergeUpdate(for: conversationId) { cached in
                let snapshotIds = Set(snapshot.map(\.id))
                let fromCacheOnly = cached.filter { !snapshotIds.contains($0.id) }
                return (snapshot + fromCacheOnly).sorted { $0.createdAt < $1.createdAt }
            }
        } catch let error as MeeshyError {
            switch error {
            case .forbidden(let reason, _):
                // 403: still authenticated, but no longer authorised on
                // THIS resource (kicked, group dissolved, blocked, etc.).
                await handleAccessRevoked(reason: reason)
                return
            case .server(404, let message), .server(410, let message):
                // 404/410: the conversation no longer exists (deleted by
                // owner, expired share-link target, hard-purged on the
                // server side). Same effect as a revoked access from the
                // user's perspective — the cached messages can no longer
                // be displayed, and we must dismiss the view rather than
                // leave stale content on screen for a conversation that
                // is gone. Without this branch the catch-all would treat
                // it as transient and the user would see ghost messages.
                await handleAccessRevoked(
                    reason: message.isEmpty
                        ? String(localized: "Cette conversation n'existe plus", defaultValue: "Cette conversation n'existe plus")
                        : message
                )
                return
            default:
                // Other server / network / unknown errors are transient —
                // keep cached data on screen, user retries on reload.
                break
            }
        } catch {
            // Cancellation / unknown — keep cached data displayed.
        }
    }

    /// Per-conversation cache scrub run when the server returns 403 on a
    /// messages fetch. Wipes only this conversation's footprint — other
    /// conversations the user still has access to remain hot.
    private func handleAccessRevoked(reason: String?) async {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        await CacheCoordinator.shared.conversations.invalidate(for: conversationId)
        await CacheCoordinator.shared.participants.invalidate(for: conversationId)

        // Wipe GRDB rows; the store observation fires with an empty result,
        // clearing `messages` through the single legitimate write site.
        try? await messagePersistence.deleteAll(conversationId: conversationId)

        error = reason ?? "Vous n'avez plus acces a cette conversation"
        accessRevoked = true
    }

    // MARK: - Media Prefetch (delegated to ConversationMediaHandler)

    private var mediaPrefetchDebounce: Task<Void, Never>?

    /// Prefetch media for the most recent messages with attachments. The
    /// debounce stays here (300 ms collapses bursts of socket updates) and
    /// the actual cache warming is delegated to `mediaHandler`, which owns
    /// the in-flight task / cancellation contract.
    func prefetchRecentMedia() {
        mediaPrefetchDebounce?.cancel()
        mediaPrefetchDebounce = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, !Task.isCancelled else { return }
            self.mediaHandler.prefetchRecentMedia()
        }
    }

    // MARK: - Sync Engine Observation

    /// Slot dédié (et non `cancellables`) : `.task` re-fire à chaque
    /// ré-apparition de l'écran — la ré-assignation remplace l'abonnement
    /// précédent au lieu d'en accumuler N (chaque signal sync déclenchait
    /// sinon N reloads cache + reconciliations redondants).
    private var syncCancellable: AnyCancellable? {
        willSet { syncCancellable?.cancel() }
    }

    func observeSync() {
        let targetId = conversationId
        let publisher = syncEngine.messagesDidChange
        syncCancellable = publisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] changedId in
                guard changedId == targetId else { return }
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    let cached = await CacheCoordinator.shared.messages.load(for: targetId)
                    switch cached {
                    case .fresh(let data, _), .stale(let data, _):
                        // Update delivery counters on existing own-message records via GRDB;
                        // the store observation surfaces the changes to `messages` automatically.
                        let persistence = self.messagePersistence
                        let ownMessages = self.messages.filter(\.isMe)
                        for existing in ownMessages {
                            guard let fresh = data.first(where: { $0.id == existing.id }),
                                  fresh.deliveryStatus.isBetterThan(existing.deliveryStatus)
                            else { continue }
                            try? await persistence.updateDeliveryCounters(
                                localId: existing.id,
                                deliveredCount: fresh.deliveredCount,
                                readCount: fresh.readCount,
                                deliveredToAllAt: fresh.deliveredToAllAt,
                                readByAllAt: fresh.readByAllAt
                            )
                        }
                        // Surface any messages in the cache that aren't yet in GRDB.
                        let currentIds = Set(self.messages.map(\.id))
                        let newFromCache = data.filter { !currentIds.contains($0.id) }
                        if !newFromCache.isEmpty {
                            // Convert domain messages back to IncomingMessageData for GRDB upsert.
                            let incoming = newFromCache.map { msg in
                                MessagePersistenceActor.IncomingMessageData(
                                    id: msg.id,
                                    conversationId: msg.conversationId,
                                    senderId: msg.senderId,
                                    content: msg.content.isEmpty ? nil : msg.content,
                                    createdAt: msg.createdAt,
                                    computedState: .delivered
                                )
                            }
                            await self.messagePersistence.bufferIncoming(incoming)
                            self.prefetchRecentMedia()
                        }
                    case .expired, .empty:
                        break
                    }
                }
            }
    }

    // MARK: - Load Older Messages (infinite scroll)

    func loadOlderMessages() async {
        // Defensive reset: isProgrammaticScroll can get stuck true when a
        // programmatic scroll is interrupted (e.g. view transition cancellation).
        // Since loadOlderMessages is only invoked by manual user scrolling,
        // it is always safe to clear the flag here.
        if isProgrammaticScroll { isProgrammaticScroll = false }

        guard hasOlderMessages, !isLoadingOlder, !isLoadingInitial else { return }
        guard let oldestMsg = messages.first else { return }
        let oldestId = oldestMsg.id
        let oldestCreatedAt = oldestMsg.createdAt

        // Debounce: ignore calls that arrive too soon after the last one
        let now = Date()
        guard now.timeIntervalSince(lastOlderPaginationTime) >= Self.paginationDebounceInterval else { return }
        lastOlderPaginationTime = now

        isLoadingOlder = true
        // Save anchor BEFORE prepend so the view can restore scroll position
        scrollAnchorId = oldestId

        let beforeValue = nextMessageCursor ?? oldestId

        do {
            // Direct REST + GRDB persistence path. We DO NOT route through
            // ConversationSyncEngine.fetchOlderMessages because it only writes
            // to the legacy CacheCoordinator. MessageStore reads MessageRecord
            // rows from GRDB, so going through the sync engine would leave the
            // GRDB window stuck on the initial load and latch
            // hasOlderMessages to false on the very first scroll trigger.
            let response = try await messageService.listBefore(
                conversationId: conversationId,
                before: beforeValue,
                limit: 50,
                includeReplies: true,
                includeTranslations: true
            )

            // GRDB write and legacy CacheCoordinator processing are
            // independent — race them so the slower path (network-bound
            // GRDB on a background actor) doesn't gate the legacy cache
            // coherence path that the unread badge / preview rely on.
            async let persistTask: Void? = try? messagePersistence.upsertFromAPIMessages(response.data)
            async let olderProcessedTask = processAPIMessages(response.data)
            _ = await persistTask
            let olderProcessed = await olderProcessedTask

            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)
            scheduleTranscriptionRetry(for: response.data)
            await CacheCoordinator.shared.messages.mergeUpdate(for: conversationId) { existing in
                let existingIds = Set(existing.map(\.id))
                let newOnly = olderProcessed.filter { !existingIds.contains($0.id) }
                return (newOnly + existing).sorted { $0.createdAt < $1.createdAt }
            }

            // Slide the GRDB window anchor backwards; store observation
            // surfaces the prepended older rows to `messages` automatically.
            let didLoad = await messageStore.loadOlder(before: oldestCreatedAt)
            if didLoad { prefetchRecentMedia() }

            // Server is the source of truth for pagination state.
            nextMessageCursor = response.cursorPagination?.nextCursor
            hasOlderMessages = response.cursorPagination?.hasMore ?? false
        } catch {
            // Transient failure — keep hasOlderMessages so the next scroll
            // retries. Debounce prevents tight retry loops.
            Logger.messages.error("loadOlderMessages failed: \(error.localizedDescription)")
        }

        isLoadingOlder = false

        // Anticipatory prefetch: if the server has more pages AND the user
        // is still scrolled away from the bottom (likely scrolling fast),
        // immediately kick off the NEXT page in the background so it's
        // ready by the time the scroll reaches the new edge. This eliminates
        // the "hit the wall and wait" stutter on fast scrolls.
        if hasOlderMessages, !isCurrentlyNearBottom {
            Task { [weak self] in
                // Small delay to let the current batch render and the
                // scroll position stabilize before we start the next fetch.
                try? await Task.sleep(for: .seconds(0.15))
                guard let self, !self.isLoadingOlder else { return }
                await self.loadOlderMessages()
            }
        }
    }

    // MARK: - Decryption

    func decryptMessagesIfNeeded(_ msgs: inout [Message]) async {
        guard isDirect else { return }

        let payloads: [DecryptionPayload] = msgs.compactMap { msg in
            guard msg.isEncrypted, !msg.senderId.isEmpty,
                  !msg.content.isEmpty,
                  let data = Data(base64Encoded: msg.content)
            else { return nil }
            return DecryptionPayload(messageId: msg.id, senderId: msg.senderId, ciphertext: data)
        }
        guard !payloads.isEmpty else { return }

        let results = await decryptionActor.decrypt(payloads)
        let resultsByMessageId = Dictionary(uniqueKeysWithValues: results.map { ($0.messageId, $0) })

        for i in msgs.indices {
            if let plaintext = resultsByMessageId[msgs[i].id]?.plaintext {
                msgs[i].content = plaintext
            }
        }
    }

    // MARK: - Audio Continuous Playback (Phase 4)

    /// Re-initiate ("call back") a call from a tapped call-summary notice.
    /// Mirrors the conversation header's call entry point: direct (1:1) calls
    /// only, re-using the SAME media type (audio/video) as the summarized call.
    /// The peer display name is resolved best-effort from a received message so
    /// the CallKit / in-app outgoing UI shows a name, not a raw id.
    func callBack(for summary: CallSummaryMetadata) {
        guard isDirect, let peerUserId = participantUserId, !peerUserId.isEmpty else { return }
        let displayName = resolvedPeerDisplayName
            ?? String(localized: "call.peer.fallback", defaultValue: "Appel", bundle: .main)
        CallManager.shared.startCall(
            conversationId: conversationId,
            userId: peerUserId,
            displayName: displayName,
            isVideo: summary.callType == .video
        )
    }

    /// Best-effort peer display name from the most recent received message in
    /// the current snapshot (sender differs from the current user).
    private var resolvedPeerDisplayName: String? {
        messageStore.messages
            .last { $0.senderId != currentUserId && !($0.senderName ?? "").isEmpty }?
            .senderName
    }

    /// Kicks off conversation-wide audio playback starting at `attachmentId`.
    ///
    /// Resolves the message/attachment in the current `messages` snapshot,
    /// asks `AudioQueueBuilder` for the unlistened, non-self tail of audios
    /// strictly after this one, then routes the whole queue through the app
    /// coordinator (which gates on CallKit + auth and exposes the mini-player
    /// state to the rest of the app).
    func playAudio(attachmentId: String) {
        guard let (message, attachment) = findAudioAttachment(id: attachmentId),
              attachment.type == .audio,
              let currentUserId = authManager.currentUser?.id else { return }

        let current = QueuedAudio(
            attachmentId: attachment.id,
            messageId: message.id,
            conversationId: message.conversationId,
            fileUrl: attachment.fileUrl,
            durationMs: attachment.duration ?? 0,
            senderName: message.senderName ?? "",
            senderAvatarURL: message.senderAvatarURL,
            receivedAt: message.createdAt
        )

        let tail = AudioQueueBuilder.build(
            from: messages,
            startingAfterAttachmentId: attachment.id,
            currentUserId: currentUserId,
            listenedAttachmentIds: listenedAttachmentIds
        )

        audioCoordinator.play(
            current: current,
            tail: tail,
            conversationName: currentConversationName,
            conversationArtworkURL: currentConversationArtworkURL
        )
    }

    /// O(n) scan over `messages` for the message that owns `attachmentId`.
    /// `messages` rarely exceeds a few hundred rows in memory; an index would
    /// have to invalidate on every attachment update for negligible gain.
    private func findAudioAttachment(id: String) -> (Message, MessageAttachment)? {
        for message in messages {
            if let att = message.attachments.first(where: { $0.id == id && $0.type == .audio }) {
                return (message, att)
            }
        }
        return nil
    }

    /// Subscribes to `$messages` and forwards any newly-inserted audio messages
    /// — from someone else, in the conversation currently being played by the
    /// coordinator — into the active playback queue via `appendUpcoming`.
    ///
    /// Uses a snapshot of seen message ids to detect genuinely new inserts and
    /// ignore re-orderings or in-place mutations (edits, reactions, etc.).
    private var seenMessageIdsForAudioQueue: Set<String> = []
    private var didSeedAudioQueueSnapshot = false

    private func subscribeToMessagesForAudioQueue() {
        // Hot-path filter: `$messages` fires on EVERY mutation (insert,
        // delete, edit, reaction, translation update, …). On a busy
        // conversation with reactions in burst, that can be 20-50 emissions
        // per second. The handler only cares about inserts/deletes (those
        // are the only mutations that change the message-id set), so we
        // dedupe on the id sequence to skip in-place mutations cheaply.
        //
        // Trade-off: an edit that REPLACES a message in place with a new
        // audio attachment would not refire here. That case is rare in
        // practice — audio attachments are not typically added to an
        // existing message — and the seenMessageIdsForAudioQueue set below
        // would still skip it correctly if the id is preserved.
        $messages
            .map { $0.map(\.id) }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                self.processMessagesForAudioQueueAppend(self.messages)
            }
            .store(in: &cancellables)
    }

    /// Subscribes to the shared `ConversationAudioCoordinator`'s
    /// `attachmentFinishedPublisher` so this VM records each natural-end /
    /// failed-load event in `listenedAttachmentIds`. Filters by
    /// `event.conversationId == self.conversationId` so a coordinator owned
    /// by another conversation (the singleton is process-wide) NEVER
    /// pollutes this VM's listened set with foreign attachment ids.
    /// The subscription auto-cleans on `deinit` via `cancellables`.
    private func subscribeToAudioCoordinatorFinishedEvents() {
        let ownConversationId = conversationId
        audioCoordinator.attachmentFinishedPublisher
            .filter { event in event.conversationId == ownConversationId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.listenedAttachmentIds.insert(event.attachmentId)
            }
            .store(in: &cancellables)
    }

    private func processMessagesForAudioQueueAppend(_ snapshot: [Message]) {
        // First emission (and any emission while no coordinator session is
        // active for THIS conversation) just refreshes the baseline so the
        // backlog never replays as "new" once playback starts.
        guard didSeedAudioQueueSnapshot,
              let activeConvId = audioCoordinator.activeContext?.conversationId,
              activeConvId == conversationId,
              let currentUserId = authManager.currentUser?.id else {
            seenMessageIdsForAudioQueue = Set(snapshot.map(\.id))
            didSeedAudioQueueSnapshot = true
            return
        }

        for message in snapshot where !seenMessageIdsForAudioQueue.contains(message.id) {
            seenMessageIdsForAudioQueue.insert(message.id)
            guard message.senderId != currentUserId,
                  message.conversationId == activeConvId else { continue }
            for attachment in message.attachments
                where attachment.type == .audio
                && !listenedAttachmentIds.contains(attachment.id) {
                audioCoordinator.appendUpcoming(QueuedAudio(
                    attachmentId: attachment.id,
                    messageId: message.id,
                    conversationId: message.conversationId,
                    fileUrl: attachment.fileUrl,
                    durationMs: attachment.duration ?? 0,
                    senderName: message.senderName ?? "",
                    senderAvatarURL: message.senderAvatarURL,
                    receivedAt: message.createdAt
                ))
            }
        }
    }

    /// Pulls the conversation row out of the cache so the mini-player can
    /// display its name + artwork + accent color. Best-effort — if the row
    /// isn't cached yet, the fallback constants kick in.
    private func hydrateCurrentConversationFromCache() {
        let convId = conversationId
        Task { [weak self] in
            let cached = await CacheCoordinator.shared.conversations.load(for: "list")
            guard let self else { return }
            let list: [MeeshyConversation]
            switch cached {
            case .fresh(let data, _), .stale(let data, _):
                list = data
            case .expired, .empty:
                return
            }
            if let match = list.first(where: { $0.id == convId }) {
                self.currentConversation = match
            }
        }
    }

    // MARK: - Send Message

    /// Langue de composition : détectée depuis le contenu (on-device), repli sur la
    /// langue primaire de l'utilisateur puis "fr". Pure → testable sans authManager.
    nonisolated static func composeLanguage(for content: String, preferred: [String]) -> String {
        LanguageDetection.detectLanguageCode(for: content, fallback: preferred.first)
            ?? preferred.first ?? "fr"
    }

    /// Stable identity of a logical message, used to dedup an accidental
    /// double-tap. Two taps producing the same key within
    /// `duplicateSendDebounce` are the same message fired twice; distinct
    /// messages produce distinct keys and never block each other.
    private static func sendDedupKey(
        content: String,
        replyToId: String?,
        storyReplyToId: String?,
        forwardedFromId: String?,
        attachmentIds: [String]?
    ) -> String {
        [
            content,
            replyToId ?? "",
            storyReplyToId ?? "",
            forwardedFromId ?? "",
            (attachmentIds ?? []).sorted().joined(separator: ",")
        ].joined(separator: "\u{1F}")
    }

    /// Shared post-ACK finalization for a successful send, used by BOTH the
    /// socket-first fast path and the REST path so the two stay in lockstep:
    /// records the tempId→serverId mapping, drives the `.serverAck` state
    /// transition (⏱→✓), bumps the conversation to the top, persists the
    /// server-id mapping for cold-start reconciliation, and clears the
    /// ephemeral/blur/effect compose state + mention draft. `transport` only
    /// tags the perf signpost (`perf:ios.send.ack ... transport=…`) so a device
    /// trace can A/B socket-first vs rest.
    private func finalizeSuccessfulSend(
        tempId: String,
        serverId: String,
        serverCreatedAt: Date,
        text: String,
        sendStartedAt: Date,
        transport: String
    ) async {
        // Register tempId → serverId so the `message:new` broadcast reconciles
        // without creating a duplicate row. UI update (sent state) flows through
        // persistence → store observation.
        pendingServerIds[tempId] = serverId

        // GRDB server ack — state machine transitions to .sent. `try?` swallows
        // both errors AND a nil return (state machine rejected / record missing),
        // logged so the ⏱→✓ transition is observable.
        let ackResult = try? await messagePersistence.applyEvent(
            localId: tempId,
            event: .serverAck(serverId: serverId, at: serverCreatedAt)
        )
        Logger.messages.info("SendFlow PENDING->SENT tempId=\(tempId, privacy: .public) serverId=\(serverId, privacy: .public) resultState=\(ackResult.map { String(describing: $0) } ?? "nil", privacy: .public) transport=\(transport, privacy: .public)")
        let ackElapsedMs = Int(Date().timeIntervalSince(sendStartedAt) * 1000)
        Logger.messages.info("perf:ios.send.ack clientMessageId=\(tempId, privacy: .public) serverId=\(serverId, privacy: .public) transport=\(transport, privacy: .public) durationMs=\(ackElapsedMs, privacy: .public)")

        let convId = conversationId
        let msgContent = text
        let msgTime = serverCreatedAt

        // Persist server-id mapping so a cold-start REST fetch reconciles without
        // duplicate temp_…/server-id pairs.
        Task { [weak self] in
            await self?.persistMessagesUsingServerIds()
        }
        let sentSenderName = authManager.currentUser?.displayName ?? authManager.currentUser?.username
        Task {
            await ConversationSyncEngine.shared.updateConversationAfterSend(
                conversationId: convId,
                messagePreview: msgContent,
                messageAt: msgTime,
                senderName: sentSenderName
            )
        }

        if ephemeralDuration != nil { ephemeralDuration = nil }
        if isBlurEnabled { isBlurEnabled = false }
        if isViewOnceEnabled { isViewOnceEnabled = false }
        if pendingEffects.hasAnyEffect { pendingEffects = .none }
        mentionController.clearDraft()
    }

    /// French preview shown in the conversation list for an OPTIMISTIC message:
    /// the caption when present, else a short media label (mirrors the server's
    /// last-message preview wording). Used to surface a just-sent message in the
    /// list before any server ACK. `nonisolated static` so the media path can
    /// compute it for a `Task.detached`.
    nonisolated static func optimisticListPreview(text: String, messageType: Message.MessageType) -> String {
        if !text.isEmpty { return text }
        switch messageType {
        case .image: return "📷 Photo"
        case .video: return "🎥 Vidéo"
        case .audio: return "🎙️ Message vocal"
        case .file: return "📎 Fichier"
        case .location: return "📍 Position"
        default: return ""
        }
    }

    @discardableResult
    func sendMessage(content: String, replyToId: String? = nil, storyReplyToId: String? = nil, storyReplyReference: ReplyReference? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil, localAttachments: [MeeshyMessageAttachment]? = nil, expiresAt: Date? = nil, isViewOnce: Bool? = nil, maxViewOnceCount: Int? = nil, isBlurred: Bool? = nil, originalLanguage: String? = nil, existingTempId: String? = nil) async -> Bool {
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        Logger.messages.info("SendFlow enter convId=\(self.conversationId, privacy: .public) textLen=\(text.count, privacy: .public) attachmentIds=\((attachmentIds ?? []).count, privacy: .public) existingTempId=\(existingTempId ?? "nil", privacy: .public) isSending=\(self.isSending, privacy: .public)")
        guard !text.isEmpty || !(attachmentIds ?? []).isEmpty else {
            Logger.messages.error("SendFlow EARLY-RETURN guard=emptyContent convId=\(self.conversationId, privacy: .public)")
            return false
        }
        // Debounce: a fast double-tap on the send button used to trigger two
        // concurrent `sendMessage` runs, both inserting their own optimistic
        // record with a fresh `tempId`, both POSTing the request — the user
        // saw the same content twice in the bubble list. Lifted ABOVE the
        // offline branch so a second tap while the first send is still
        // `await`-ing on the outbox write exits early instead of inserting
        // a parallel optimistic row + enqueuing twice.
        //
        // Phase 4 §6.1 fix (Bug 1 — 2026-05-26): the legacy code ran the
        // offline branch BEFORE the guard with a fire-and-forget
        // `Task { try? await OfflineQueue.shared.enqueue(...) }`, so two
        // rapid taps while offline could both reach the queue *or* the
        // second one could be lost when the actor's pending-state machine
        // observed a duplicate `clientMessageId` mid-enqueue. The guard
        // now serializes both paths and the offline enqueue is awaited.
        // Double-tap dedup — replaces the old global `isSending` mutex.
        //
        // The legacy `guard !isSending` serialized ALL sends: while one send
        // held the lock (the whole REST POST `await`, up to ~30 s on a slow
        // network), every subsequent tap returned false silently — the
        // "impossible d'envoyer plusieurs messages à la suite quand le 1er est
        // sur l'horloge" bug (root-caused 2026-06-09, trace in
        // apps/ios/logs/sendflow-pending-lock-2026-06-09.log).
        //
        // A real messenger lets DISTINCT messages fly concurrently, each with
        // its own optimistic bubble + clock. We keep the guard's original
        // intent — kill accidental double-taps of the SAME message — by deduping
        // on message identity within a short window instead of locking the whole
        // send path. The check-and-set runs BEFORE the first `await`, so the
        // @MainActor serialization of the synchronous prefix makes it atomic
        // against a concurrent burst (no duplicate optimistic row). Retries
        // (`existingTempId != nil`) are a deliberate re-send and bypass the
        // debounce (the gateway dedups them by clientMessageId).
        if existingTempId == nil {
            let dedupKey = Self.sendDedupKey(content: text, replyToId: replyToId, storyReplyToId: storyReplyToId, forwardedFromId: forwardedFromId, attachmentIds: attachmentIds)
            if let last = lastAcceptedSend, last.key == dedupKey, Date().timeIntervalSince(last.at) < Self.duplicateSendDebounce {
                Logger.messages.error("SendFlow BLOCKED guard=duplicate-debounce convId=\(self.conversationId, privacy: .public) textLen=\(text.count, privacy: .public) — identical message re-fired within \(Self.duplicateSendDebounce, privacy: .public)s; deduped")
                return false
            }
            lastAcceptedSend = (dedupKey, Date())
        }
        inFlightSendCount += 1
        isSending = true
        Logger.messages.info("SendFlow LOCK inFlight=\(self.inFlightSendCount, privacy: .public) convId=\(self.conversationId, privacy: .public) textLen=\(text.count, privacy: .public)")
        defer {
            inFlightSendCount = max(0, inFlightSendCount - 1)
            isSending = inFlightSendCount > 0
            Logger.messages.info("SendFlow UNLOCK inFlight=\(self.inFlightSendCount, privacy: .public) convId=\(self.conversationId, privacy: .public)")
        }

        // Stop typing emission on send
        socketHandler?.stopTypingEmission()

        // Offline: enqueue for later delivery + show optimistic message.
        // NOTE: we only gate on network availability here — NOT on socket
        // connection state. The send path is a plain REST POST which works
        // regardless of socket status. Routing through the offline queue when
        // the socket is still handshaking (common at startup) caused the clock
        // indicator to stay visible for seconds while waiting for retryAll().
        if !networkMonitor.isOnline {
            let offlineClientMessageId = existingTempId ?? ClientMessageId.generate()
            // Spec §4.2 — record the AttachmentKind of each attachment so the
            // SyncPill mapper picks .video / .file icons instead of always
            // falling back to .image. Aligned with attachmentIds by index.
            let offlineKinds = localAttachments?.map { $0.kind.rawValue }
            let queueItem = OfflineQueueItem(
                conversationId: conversationId,
                content: text,
                clientMessageId: offlineClientMessageId,
                originalLanguage: originalLanguage,
                replyToId: replyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                attachmentIds: attachmentIds,
                attachmentKinds: offlineKinds
            )

            let offlineTempId = queueItem.tempId
            let offlineMessage = Message(
                id: offlineTempId,
                conversationId: conversationId,
                senderId: currentUserId,
                content: text,
                messageType: .text,
                replyToId: replyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                createdAt: Date(),
                updatedAt: Date(),
                deliveryStatus: .sending,
                isMe: true
            )
            // Persist offline message to GRDB; store observation surfaces the row
            // automatically — no direct messages.append needed.
            let offlineRecord = MessageRecord(
                localId: offlineTempId, serverId: nil,
                conversationId: conversationId, senderId: currentUserId,
                content: text.isEmpty ? nil : text,
                originalLanguage: "fr",
                messageType: "text", messageSource: "user", contentType: "text",
                state: .sending, retryCount: 0, lastError: nil,
                isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                replyToId: replyToId, storyReplyToId: nil,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                replyToJson: nil, forwardedFromJson: nil,
                expiresAt: nil, effectFlags: 0,
                maxViewOnceCount: nil, viewOnceCount: 0,
                isEdited: false, editedAt: nil, deletedAt: nil,
                pinnedAt: nil, pinnedBy: nil,
                senderName: authManager.currentUser?.displayName,
                senderUsername: authManager.currentUser?.username,
                senderColor: nil, senderAvatarURL: authManager.currentUser?.avatar,
                deliveredCount: 0, readCount: 0,
                deliveredToAllAt: nil, readByAllAt: nil,
                createdAt: Date(), sentAt: nil,
                deliveredAt: nil, readAt: nil, updatedAt: Date(),
                attachmentsJson: nil, reactionsJson: nil,
                reactionCount: 0, currentUserReactionsJson: nil,
                mentionedUsersJson: nil,
                cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                cachedLastLineWidth: nil, cachedLineCount: nil,
                cachedTimestampInline: nil,
                layoutVersion: 0, layoutMaxWidth: nil,
                changeVersion: 0
            )

            // `insertOptimistic` is a synchronous actor-isolated throw (no
            // suspension point inside), so `try await` lands the GRDB write
            // before the next runloop turn. The bubble is therefore in GRDB
            // BEFORE we await the queue enqueue below — pixel repaint follows
            // SwiftUI's next coalesced redraw, but the data is durable. If
            // the queue throws, the catch path flips this row to `.failed`.
            do {
                try await messagePersistence.insertOptimistic(offlineRecord)
            } catch {
                Logger.messages.error("offline insertOptimistic failed: \(error.localizedDescription, privacy: .public)")
                // Persistence is best-effort here — the outbox row below is
                // the actual source of truth. Continue.
            }

            let convId = conversationId
            let offlineMsgForCache = offlineMessage
            Task.detached(priority: .utility) {
                await CacheCoordinator.shared.messages.mergeUpdate(for: convId) { cached in
                    let cachedIds = Set(cached.map(\.id))
                    guard !cachedIds.contains(offlineMsgForCache.id) else { return cached }
                    return (cached + [offlineMsgForCache]).sorted { $0.createdAt < $1.createdAt }
                }
            }

            // Bump the conversation preview locally so the list shows the
            // just-typed message — with the correct author name — even before
            // the network returns. Without this the preview keeps the previous
            // author/content while the user waits for connectivity.
            let previewContent = text
            let previewAt = offlineMessage.createdAt
            let senderName = authManager.currentUser?.displayName ?? authManager.currentUser?.username
            Task {
                await ConversationSyncEngine.shared.updateConversationAfterSend(
                    conversationId: convId,
                    messagePreview: previewContent,
                    messageAt: previewAt,
                    senderName: senderName
                )
            }

            // AWAITED enqueue (Bug 1 fix). If the outbox write throws, flip
            // the optimistic bubble to `.failed` so the user can retry — the
            // old fire-and-forget `Task { try? ... }` silently dropped the
            // message on disk-full / coding errors.
            do {
                try await offlineQueue.enqueue(queueItem)
                Logger.messages.info("Message enqueued for offline delivery")
                return true
            } catch {
                Logger.messages.error("offline enqueue failed: \(error.localizedDescription, privacy: .public)")
                try? await messagePersistence.markOptimisticFailed(
                    localId: offlineTempId,
                    reason: error.localizedDescription
                )
                return false
            }
        }

        // Resolve ephemeral: use explicit param or ViewModel state
        let resolvedExpiresAt = expiresAt ?? ephemeralDuration?.expiresAt
        let resolvedEphemeralDuration = ephemeralDuration?.rawValue

        // Resolve view-once: explicit param, else the ViewModel toggle state
        // (surfaced by the notification preview composer).
        let resolvedIsViewOnce = isViewOnce ?? isViewOnceEnabled
        let resolvedMaxViewOnceCount = maxViewOnceCount

        // Resolve blur: use explicit param or ViewModel state
        let resolvedBlur = isBlurred ?? (isBlurEnabled ? true : nil)

        // Build ReplyReference from quoted message or story via la helper
        // unifiee — meme logique que `insertOptimisticMediaMessage` pour
        // garantir que la quoted-reply card apparait identiquement quel que
        // soit le chemin d'envoi (texte-seul vs media).
        let replyRef = makeReplyReference(
            storyReplyReference: storyReplyReference,
            replyToId: replyToId
        )

        // Optimistic insert.
        // Phase 4 §6.1 — local id is the canonical `cid_<uuid v4 lowercase>`
        // sent end-to-end so the gateway can dedup via the unique
        // `(conversationId, clientMessageId)` index and the iOS reconciliation
        // by-cid path can match the server-assigned record without ambiguity.
        // The legacy `temp_/offline_/retry_*` prefix scheme is gone — every
        // local id (online send, offline queue, retry queue) now flows through
        // `ClientMessageId.generate()`.
        let tempId = existingTempId ?? ClientMessageId.generate()
        // Phase A real-time instrumentation: chronometer the send → ACK delta
        // so we can correlate it with the gateway-side `perf:http.message.post`
        // / `perf:messaging.handleMessage` logs through the same cmid.
        let sendStartedAt = Date()
        Logger.messages.info("perf:ios.send.start clientMessageId=\(tempId, privacy: .public) conversationId=\(self.conversationId, privacy: .public) existingTempId=\(existingTempId != nil, privacy: .public)")
        let resolvedAttachments = localAttachments ?? []
        let optimisticMessageType: Message.MessageType = {
            guard let first = resolvedAttachments.first else { return .text }
            switch first.type {
            case .image: return .image
            case .video: return .video
            case .audio: return .audio
            case .file: return .file
            case .location: return .location
            }
        }()
        // GRDB optimistic insert — the store observation surfaces the row in `messages`
        // automatically (Task 1.5: no direct messages.append here).
        if existingTempId == nil {
            let persistence = messagePersistence
            let optimisticRecord = MessageRecord(
                localId: tempId, serverId: nil,
                conversationId: conversationId, senderId: currentUserId,
                content: text.isEmpty ? nil : text,
                originalLanguage: originalLanguage ?? "fr",
                messageType: optimisticMessageType.rawValue,
                messageSource: "user", contentType: "text",
                state: .sending, retryCount: 0, lastError: nil,
                isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                replyToId: replyToId, storyReplyToId: storyReplyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                replyToJson: replyRef.flatMap { try? JSONEncoder().encode($0) }, forwardedFromJson: nil,
                expiresAt: resolvedExpiresAt, effectFlags: pendingEffects.hasAnyEffect ? pendingEffects.flags.rawValue : 0,
                maxViewOnceCount: resolvedMaxViewOnceCount, viewOnceCount: 0,
                isEdited: false, editedAt: nil, deletedAt: nil,
                pinnedAt: nil, pinnedBy: nil,
                senderName: authManager.currentUser?.displayName,
                senderUsername: authManager.currentUser?.username,
                senderColor: nil, senderAvatarURL: authManager.currentUser?.avatar,
                deliveredCount: 0, readCount: 0,
                deliveredToAllAt: nil, readByAllAt: nil,
                createdAt: Date(), sentAt: nil,
                deliveredAt: nil, readAt: nil, updatedAt: Date(),
                attachmentsJson: nil, reactionsJson: nil,
                reactionCount: 0, currentUserReactionsJson: nil,
                mentionedUsersJson: nil,
                cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                cachedLastLineWidth: nil, cachedLineCount: nil,
                cachedTimestampInline: nil,
                layoutVersion: 0, layoutMaxWidth: nil,
                changeVersion: 0
            )
            Logger.messages.info("SendFlow insertOptimistic START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public)")
            do {
                try await persistence.insertOptimistic(optimisticRecord)
                Logger.messages.debug("SendFlow insertOptimistic OK tempId=\(tempId, privacy: .public) state=.sending convId=\(self.conversationId, privacy: .public)")
                // Local-first: surface the just-sent message in the conversation
                // list IMMEDIATELY (preview + bump to top), before any server ACK
                // — via the same path realtime events use (cache update →
                // conversationsDidChange → reloadFromCache). Previously only the
                // offline branch did this, so an online PENDING message did not
                // appear/reorder in the list until its ACK. finalizeSuccessfulSend
                // refreshes it with the server timestamp at ACK time.
                await ConversationSyncEngine.shared.updateConversationAfterSend(
                    conversationId: conversationId,
                    messagePreview: Self.optimisticListPreview(text: text, messageType: optimisticMessageType),
                    messageAt: optimisticRecord.createdAt,
                    senderName: authManager.currentUser?.displayName ?? authManager.currentUser?.username
                )
            } catch {
                Logger.messages.error("SendFlow insertOptimistic FAILED tempId=\(tempId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
            }
        }

        // Déclarés hors du `do` : le bloc `catch` (repli socket) les relit.
        var finalContent: String? = text.isEmpty ? nil : text
        var isEncrypted = false
        do {
            var encryptionMode: String? = nil

            // E2EE logic for Direct Messages
            if isDirect, let targetUserId = participantUserId, let textContent = finalContent {
                do {
                    let payloadData = Data(textContent.utf8)
                    let encryptedData = try await SessionManager.shared.encryptMessage(payloadData, for: targetUserId, conversationId: conversationId)
                    finalContent = encryptedData.base64EncodedString()
                    isEncrypted = true
                    encryptionMode = "E2EE"
                } catch {
                    Logger.messages.error("Failed to encrypt message: \(error.localizedDescription)")
                    #if DEBUG
                    // Debug-only fallback: log and continue with plaintext so dev builds don't block on E2EE setup issues.
                    #else
                    // Production: never silently downgrade an E2EE session to plaintext.
                    try? await messagePersistence.markOptimisticFailed(localId: tempId, reason: "encryption_failed")
                    throw error
                    #endif
                }
            }

            let body = SendMessageRequest(
                content: finalContent,
                originalLanguage: originalLanguage ?? Self.composeLanguage(for: content, preferred: preferredLanguages),
                replyToId: replyToId,
                storyReplyToId: storyReplyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                attachmentIds: attachmentIds,
                expiresAt: resolvedExpiresAt,
                ephemeralDuration: resolvedEphemeralDuration,
                isViewOnce: resolvedIsViewOnce ? true : nil,
                maxViewOnceCount: resolvedMaxViewOnceCount,
                isBlurred: resolvedBlur,
                effectFlags: pendingEffects.hasAnyEffect ? pendingEffects.flags.rawValue : nil,
                isEncrypted: isEncrypted ? true : nil,
                encryptionMode: encryptionMode,
                clientMessageId: tempId
            )

            // WebSocket-first send (re-enabled 2026-06-11). On a persistent
            // socket the `message:send` ACK returns in ~200 ms, vs the 10-30 s a
            // slow-cellular REST POST + 429/503 retries can pin the optimistic
            // clock. Gated to plain text only — no attachments, no E2EE, no
            // ephemeral/view-once/blur/effects — because `message:send` does not
            // transport those; and only when the socket reports connected. A miss
            // (nil ACK / no socket) falls straight through to the REST POST below
            // with the SAME clientMessageId, so the gateway dedups (no duplicate
            // row). The disabling note below (2026-05-16/17, channel non-functional)
            // is superseded: the gateway handler is wired and ACKs are verified.
            let socketFirstEligible = messageSocket.isConnected
                && !isEncrypted
                && (attachmentIds?.isEmpty ?? true)
                && resolvedExpiresAt == nil
                && !resolvedIsViewOnce
                && resolvedBlur != true
                && !pendingEffects.hasAnyEffect
            if socketFirstEligible {
                Logger.messages.info("SendFlow socket-first START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public) — message:send before REST")
                if let socketAck = await messageSocket.sendViaSocketFallback(
                    conversationId: conversationId,
                    content: finalContent,
                    attachmentIds: [],
                    replyToId: replyToId,
                    storyReplyToId: storyReplyToId,
                    originalLanguage: originalLanguage ?? Self.composeLanguage(for: content, preferred: preferredLanguages),
                    isEncrypted: false,
                    clientMessageId: tempId
                ) {
                    await finalizeSuccessfulSend(
                        tempId: tempId,
                        serverId: socketAck.messageId,
                        serverCreatedAt: socketAck.createdAt ?? Date(),
                        text: text,
                        sendStartedAt: sendStartedAt,
                        transport: "socket-first"
                    )
                    return true
                }
                Logger.messages.info("SendFlow socket-first MISS tempId=\(tempId, privacy: .public) — no ACK, falling through to REST")
            }

            // Send via REST. The WebSocket-first send path (commit 35b399f9,
            // 2026-05-16) was disabled because the `message:send` Socket.IO event
            // did not reach the gateway handler (investigation 2026-05-17). It is
            // now re-enabled above as a fast path; REST remains the fallback and
            // is direct (~25 ms server-side).
            Logger.messages.info("SendFlow POST /messages START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public) — awaiting response (isSending held)")
            // Cap the REST send at `sendRESTTimeoutSeconds` (12s) instead of the
            // 60s URLSession request timeout: on a slow/intermittent cellular
            // link a hung POST otherwise pins the optimistic `.sending` clock for
            // a full minute before the socket fallback + durable outbox can take
            // over. On timeout the throw routes into the catch below (socket
            // re-emit with the SAME clientMessageId → gateway dedups).
            let responseData = try await withSendTimeout(seconds: Self.sendRESTTimeoutSeconds) {
                try await self.messageService.send(
                    conversationId: self.conversationId, request: body
                )
            }
            let serverId = responseData.id
            let serverCreatedAt = responseData.createdAt
            Logger.messages.debug("SendFlow POST OK tempId=\(tempId, privacy: .public) serverId=\(responseData.id, privacy: .public)")

            await finalizeSuccessfulSend(
                tempId: tempId,
                serverId: serverId,
                serverCreatedAt: serverCreatedAt,
                text: text,
                sendStartedAt: sendStartedAt,
                transport: "rest"
            )
            return true
        } catch {
            // Permanent rejection: the other party blocked us (or we blocked
            // them from another device). Retrying never succeeds, so skip the
            // ~10s socket fallback + outbox retry — mark the row failed and tell
            // the user. Outgoing blocks are already gated by the composer zone;
            // this catches incoming blocks the client can't see ahead of time.
            if error.isUserBlockedError {
                Logger.messages.warning("perf:ios.send.fail.blocked clientMessageId=\(tempId, privacy: .public)")
                _ = try? await messagePersistence.applyEvent(localId: tempId, event: .sendFailed(error))
                FeedbackToastManager.shared.showError(
                    String(localized: "conversation.send.blocked", defaultValue: "Vous ne pouvez pas écrire à cet utilisateur.", bundle: .main)
                )
                return false
            }
            let failElapsedMs = Int(Date().timeIntervalSince(sendStartedAt) * 1000)
            Logger.messages.warning("perf:ios.send.fail clientMessageId=\(tempId, privacy: .public) durationMs=\(failElapsedMs, privacy: .public) error=\(error.localizedDescription, privacy: .public)")

            // Repli socket : le POST REST a échoué — réémettre une fois via le
            // socket avec le MÊME clientMessageId (dedup gateway → pas de doublon
            // si l'outbox rejoue le REST ensuite). On exclut les messages à
            // propriétés sensibles (éphémère, vue unique, flou, effets) que le
            // canal socket ne transporte pas intégralement : ceux-là restent sur
            // le retry REST de l'outbox qui, lui, les préserve.
            let hasSpecialProps = resolvedExpiresAt != nil
                || resolvedIsViewOnce
                || resolvedBlur == true
                || pendingEffects.hasAnyEffect
            if !hasSpecialProps {
                Logger.messages.warning("SendFlow socket-fallback START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public) — REST failed, awaiting socket ack up to ~10s (isSending held)")
                let socketAck = await messageSocket.sendViaSocketFallback(
                    conversationId: conversationId,
                    content: finalContent,
                    attachmentIds: attachmentIds ?? [],
                    replyToId: replyToId,
                    storyReplyToId: storyReplyToId,
                    originalLanguage: originalLanguage ?? "fr",
                    isEncrypted: isEncrypted,
                    clientMessageId: tempId
                )
                if let socketAck {
                    pendingServerIds[tempId] = socketAck.messageId
                    _ = try? await messagePersistence.applyEvent(
                        localId: tempId,
                        event: .serverAck(serverId: socketAck.messageId, at: socketAck.createdAt ?? Date())
                    )
                    Logger.messages.info("perf:ios.send.ack clientMessageId=\(tempId, privacy: .public) serverId=\(socketAck.messageId, privacy: .public) transport=socket-fallback durationMs=\(failElapsedMs, privacy: .public)")
                    return true
                }
            }

            // Apply sendFailed — state machine increments retryCount and transitions
            // to .queued (retries remaining) or .failed (budget exhausted).
            // The store observation surfaces the updated state to the view.
            _ = try? await messagePersistence.applyEvent(
                localId: tempId,
                event: .sendFailed(error)
            )

            // Enqueue for persistent auto-retry. The unified outbox
            // (`OfflineQueue` + `OutboxFlusher`) owns the retry loop now —
            // exponential backoff up to 5 attempts (`OutboxFlusher.maxAttempts`)
            // with `retryExhausted` firing on the unified signal at the end.
            // Wave 1 Task 3.6 — the deleted `MessageRetryQueue` used to own a
            // parallel retry loop ; both paths converged on the same outbox
            // table so behavior is preserved while LoC drops by ~600.
            let retryKinds = localAttachments?.map { $0.kind.rawValue }
            let retryItem = OfflineQueueItem(
                conversationId: conversationId,
                content: text,
                clientMessageId: tempId,
                originalLanguage: originalLanguage ?? "fr",
                replyToId: replyToId,
                attachmentIds: attachmentIds,
                attachmentKinds: retryKinds
            )

            // AWAITED enqueue (Bug 1 fix — online retry path, B2 2026-05-27).
            // The legacy `Task { try? await OfflineQueue.shared.enqueue(...) }`
            // fire-and-forgot the outbox write: the function returned before
            // GRDB had committed the retry row, so a process kill or a fast
            // second tap could silently drop the auto-retry. Mirror B1's
            // offline-branch fix here — `await` the injected `offlineQueue`
            // and flip the optimistic bubble to `.failed` on disk-full /
            // coding errors so the user can manually retry.
            do {
                try await offlineQueue.enqueue(retryItem)
            } catch {
                Logger.messages.error("online retry enqueue failed: \(error.localizedDescription, privacy: .public)")
                try? await messagePersistence.markOptimisticFailed(
                    localId: tempId,
                    reason: "online retry enqueue failed: \(error.localizedDescription)"
                )
            }

            return false
        }
    }

    // MARK: - Retry Failed Message

    func retryMessage(messageId: String) async {
        guard let idx = messageIndex(for: messageId) else { return }
        let failedMsg = messages[idx]
        guard failedMsg.deliveryStatus == .failed else { return }

        // Resend IN PLACE — no delete + reinsert, so the bubble never flashes
        // "message supprimé". `.retry` transitions the EXISTING row .failed →
        // .queued (resets the retry budget) while preserving its content and
        // position: the orange retry band disappears and the bubble shows the
        // sending indicator immediately. `sendMessage` then re-drives the fast
        // (socket-first) send reusing the SAME clientMessageId — Phase 4 §6.2,
        // so the gateway dedup contract `(conversationId, clientMessageId)`
        // catches a prior attempt that DID reach the server (lost ACK). Its
        // optimistic insert harmlessly no-ops on the existing row (PK conflict,
        // swallowed by the insert's own catch), and the serverAck reconciles it
        // .queued → .sent. The local id of a Phase 4 optimistic message IS its
        // clientMessageId (no legacy temp_/offline_/retry_ prefix), so passing
        // `messageId` straight through as `existingTempId` is correct.
        let content = failedMsg.content
        let replyToId = failedMsg.replyToId
        _ = try? await messagePersistence.applyEvent(localId: messageId, event: .retry)
        await sendMessage(content: content, replyToId: replyToId, existingTempId: messageId)
    }

    func removeFailedMessage(messageId: String) {
        Task { [weak self] in
            guard let self else { return }
            try? await messagePersistence.markDeleted(localId: messageId, deletedAt: Date())
        }
    }

    /// Insère un MessageRecord optimiste GRDB pour un message média (image,
    /// vidéo, audio, fichier) AVANT que l'upload TUS ne soit terminé. Les
    /// attachments fournis pointent sur les fichiers locaux (file:// URLs)
    /// pour que la bulle affiche l'image / le player audio immédiatement —
    /// y compris hors-ligne. Le store observation surface la nouvelle ligne
    /// dans `messages` automatiquement, donc l'appelant n'a PAS besoin de
    /// faire `messages.append(...)` en parallèle (cela serait écrasé à la
    /// prochaine emission du publisher).
    ///
    /// `tempId` est la clé locale (= `MessageRecord.localId` dans GRDB).
    /// Préfixes attendus : `temp_<UUID>` (envoi en ligne), `offline_<UUID>`
    /// (queue offline), `retry_<UUID>` (queue retry).
    ///
    /// `originalLanguage` doit être la langue du composer (sélectionnée par
    /// l'utilisateur ou détectée). Hardcoder "fr" violerait le Prisme
    /// Linguistique pour les utilisateurs non-francophones — l'affichage
    /// optimiste afficherait le mauvais drapeau de langue jusqu'à la
    /// réconciliation serveur.
    /// Construit le `ReplyReference` riche destine a la bulle optimiste a
    /// partir d'un `replyToId` (message normal) ou d'un `storyReplyReference`
    /// pre-fourni (story reply). Single source of truth pour les deux chemins
    /// d'envoi : texte-seul (sendMessage) et avec attachements
    /// (insertOptimisticMediaMessage).
    ///
    /// L'absence de cette helper laissait `replyToJson` a nil dans le chemin
    /// avec attachements, ce qui faisait que la quoted-reply card n'apparaissait
    /// jamais dans la bulle optimiste pour les replies audio/video/image/galerie.
    private func makeReplyReference(
        storyReplyReference: ReplyReference?,
        replyToId: String?
    ) -> ReplyReference? {
        if let storyRef = storyReplyReference {
            return storyRef
        }
        guard let rid = replyToId,
              let quoted = messages.first(where: { $0.id == rid }) else {
            return nil
        }
        let previewText: String = {
            if !quoted.content.isEmpty { return quoted.content }
            if let first = quoted.attachments.first {
                switch first.type {
                case .image: return "\u{1F4F7} Photo"
                case .video: return "\u{1F3AC} Video"
                case .audio: return "\u{1F3B5} Message vocal"
                case .file: return "\u{1F4CE} Fichier"
                default: return "\u{1F4CE} Piece jointe"
                }
            }
            return ""
        }()
        return ReplyReference(
            messageId: rid,
            authorName: quoted.senderName ?? "Utilisateur",
            previewText: previewText,
            isMe: quoted.isMe,
            authorColor: quoted.senderColor,
            attachmentType: quoted.attachments.first?.type.rawValue,
            attachmentThumbnailUrl: quoted.attachments.first?.thumbnailUrl
        )
    }

    /// S7 — flip an optimistic media bubble to `.failed` so a stuck `.sending`
    /// spinner resolves into a retryable failed state when its upload/send
    /// fails (e.g. an offline visual attachment whose TUS upload threw). Without
    /// this the bubble stays a permanent ghost spinner. Thin passthrough; the
    /// store observation surfaces the new state.
    func markOptimisticMediaFailed(tempId: String, reason: String) async {
        try? await messagePersistence.markOptimisticFailed(localId: tempId, reason: reason)
    }

    func insertOptimisticMediaMessage(
        tempId: String,
        content: String,
        attachments: [MeeshyMessageAttachment],
        messageType: Message.MessageType,
        replyToId: String?,
        storyReplyToId: String? = nil,
        replyReference: ReplyReference? = nil,
        originalLanguage: String? = nil
    ) {
        let now = Date()
        let attachmentsJson = attachments.isEmpty ? nil : try? JSONEncoder().encode(attachments)
        // Construit le ReplyReference riche AVANT l'insert : si `replyReference`
        // est fourni (story reply), on l'utilise ; sinon on resout via
        // `replyToId` depuis `self.messages`. Garantit que `replyToJson` est
        // non-nil des que `replyToId` ou `replyReference` n'est pas nil.
        let resolvedReplyRef = makeReplyReference(
            storyReplyReference: replyReference,
            replyToId: replyToId
        )
        let replyToJson = resolvedReplyRef.flatMap { try? JSONEncoder().encode($0) }
        let resolvedOriginalLanguage = originalLanguage ?? Self.composeLanguage(for: content, preferred: preferredLanguages)
        let record = MessageRecord(
            localId: tempId, serverId: nil,
            conversationId: conversationId, senderId: currentUserId,
            content: content.isEmpty ? nil : content,
            originalLanguage: resolvedOriginalLanguage,
            messageType: messageType.rawValue, messageSource: "user", contentType: messageType.rawValue,
            state: .sending, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: replyToJson, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: authManager.currentUser?.displayName,
            senderUsername: authManager.currentUser?.username,
            senderColor: nil, senderAvatarURL: authManager.currentUser?.avatar,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: now, sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: now,
            attachmentsJson: attachmentsJson, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: 0
        )
        let persistence = messagePersistence
        let recordConversationId = record.conversationId
        let attachmentCount = attachments.count
        // Captured for the conversation-list optimistic update below (computed on
        // the MainActor before the detached insert).
        let listPreview = Self.optimisticListPreview(text: content, messageType: messageType)
        let listSenderName = authManager.currentUser?.displayName ?? authManager.currentUser?.username
        Task.detached(priority: .userInitiated) {
            do {
                try await persistence.insertOptimistic(record)
                Logger.messages.debug("SendFlow insertOptimisticMedia OK tempId=\(tempId, privacy: .public) convId=\(recordConversationId, privacy: .public) attachments=\(attachmentCount, privacy: .public)")
                // Local-first: surface the media message in the conversation list
                // immediately (preview + bump to top), before any server ACK —
                // the media path previously never updated the list optimistically.
                await ConversationSyncEngine.shared.updateConversationAfterSend(
                    conversationId: recordConversationId,
                    messagePreview: listPreview,
                    messageAt: now,
                    senderName: listSenderName
                )
            } catch {
                Logger.messages.error("SendFlow insertOptimisticMedia FAILED tempId=\(tempId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
            }
        }
    }

    // MARK: - Handle Expired Messages

    func removeExpiredMessages() {
        let now = Date()
        let persistence = messagePersistence
        Task.detached(priority: .utility) {
            // Delete expired rows from GRDB; the store observation removes them
            // from `messages` automatically — no direct removeAll needed.
            try? await persistence.deleteExpiredEphemeral(before: now)
        }
    }

    // MARK: - Star / Bookmark

    /// Toggle the starred state for a message. Local-only (the backend
    /// doesn't expose a message-level star endpoint yet); the snapshot
    /// captured here is what the `StarredMessagesView` renders, so the
    /// row survives edits, `.local` deletions, and conversation archives
    /// without needing to re-hydrate the original bubble.
    @discardableResult
    func toggleStar(messageId: String, conversationName: String? = nil, conversationAccentColor: String? = nil) -> Bool {
        guard let idx = messageIndex(for: messageId) else { return false }
        let msg = messages[idx]
        let canonicalId = serverId(for: messageId)

        let attachmentKind = msg.attachments.first.map { att -> String in
            switch att.type {
            case .image: return "image"
            case .video: return "video"
            case .audio: return "audio"
            case .file: return "file"
            case .location: return "location"
            }
        }

        // Prefer the active translation for the user's preferred language so
        // the starred preview matches what the user actually read, not the
        // raw original content.
        let preview: String = {
            if let translation = preferredTranslation(for: messageId),
               !translation.translatedContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return translation.translatedContent
            }
            if msg.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                switch attachmentKind {
                case "image": return "\u{1F4F7} Photo"
                case "video": return "\u{1F3AC} Video"
                case "audio": return "\u{1F3B5} Message vocal"
                case "file": return "\u{1F4CE} Fichier"
                case "location": return "\u{1F4CD} Localisation"
                default: return ""
                }
            }
            return msg.content
        }()

        let snapshot = StarredMessageSnapshot(
            id: canonicalId,
            conversationId: conversationId,
            conversationName: conversationName,
            conversationAccentColor: conversationAccentColor,
            senderUserId: msg.senderUserId,
            senderName: msg.senderName ?? msg.senderUsername,
            contentPreview: String(preview.prefix(280)),
            attachmentKind: attachmentKind,
            starredAt: Date(),
            sentAt: msg.createdAt
        )
        return StarredMessagesStore.shared.toggle(snapshot)
    }

    func isStarred(messageId: String) -> Bool {
        StarredMessagesStore.shared.isStarred(messageId: serverId(for: messageId))
    }

    // MARK: - Toggle Reaction

    func toggleReaction(messageId: String, emoji: String) {
        guard consumeReactionToken() else { return }
        guard let idx = messageIndex(for: messageId) else { return }

        // Own reactions are ALWAYS keyed by the `currentUserId` sentinel — the
        // canonical "my reaction" marker that `summarizeReactions` and
        // `reconstructFromSummary` agree on. Keying the optimistic row by the
        // resolved `Participant.id` instead (the old `_resolvedParticipantId`
        // path) broke the "I reacted" highlight for the 2nd+ reaction in a
        // conversation, because the badge ownership check is `== currentUserId`.
        let participantId = currentUserId
        let alreadyReacted = messages[idx].reactions.contains { $0.emoji == emoji && $0.participantId == participantId }
        let convId = conversationId
        // Resolve the canonical server id so the queue replays against the
        // real backend message, not the optimistic in-memory placeholder.
        let remoteId = serverId(for: messageId)

        if alreadyReacted {
            Task { [weak self] in
                try? await self?.messagePersistence.removeReaction(
                    localId: messageId, emoji: emoji, participantId: participantId
                )
            }
            // Wave 1 Task 3.6 — unified outbox replaces the legacy
            // ReactionQueue. `enqueueReaction` preserves the coalescing state
            // machine (add+remove cancels, idempotent dedup) and the
            // `OutboxFlusher` drives retry on the next reconnect tick.
            Task {
                try? await OfflineQueue.shared.enqueueReaction(
                    messageId: remoteId, emoji: emoji, action: .remove, conversationId: convId
                )
                // Draine l'outbox tout de suite : sans ca la reaction reste
                // `pending` jusqu'au prochain lancement / retour avant-plan de
                // l'app (seuls moments ou le flusher tourne) et n'atteint
                // jamais le serveur.
                await OutboxFlushTrigger.flushNow()
            }
        } else {
            // Marque la reaction comme "nouvelle" AVANT l'ecriture async : quand
            // le store observe l'ajout et re-rend la bulle, la nouvelle pill
            // verra `shouldAnimate == true` et jouera la comete. Un scroll
            // ulterieur (hors fenetre) ne la re-animera pas.
            ReactionAnimationGate.markAdded(messageId: messageId, emoji: emoji)
            let reactionId = UUID().uuidString
            Task { [weak self] in
                try? await self?.messagePersistence.appendReaction(
                    localId: messageId, reactionId: reactionId,
                    messageId: remoteId, participantId: participantId, emoji: emoji
                )
            }
            Task {
                try? await OfflineQueue.shared.enqueueReaction(
                    messageId: remoteId, emoji: emoji, action: .add, conversationId: convId
                )
                // Draine l'outbox tout de suite : sans ca la reaction reste
                // `pending` jusqu'au prochain lancement / retour avant-plan de
                // l'app (seuls moments ou le flusher tourne) et n'atteint
                // jamais le serveur.
                await OutboxFlushTrigger.flushNow()
            }
        }

    }

    // MARK: - Attachment Reactions (BUG2 A')

    /// Réagit à UNE image d'un message multi-images. Optimiste in-memory + emit
    /// direct socket (parité offline-queue différée, cf. spec) ; le cold-load REST
    /// re-fournit les réactions persistées. Cap 1 emoji/user/PJ (miroir
    /// message-level). La mutation de `messages` déclenche le reconfigure diffable
    /// → re-render de la bulle avec le nouveau reactionSummary.
    func toggleAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        guard let mIdx = messageIndex(for: messageId),
              let aIdx = messages[mIdx].attachments.firstIndex(where: { $0.id == attachmentId }) else { return }
        var summary = messages[mIdx].attachments[aIdx].reactionSummary ?? [:]
        var mine = messages[mIdx].attachments[aIdx].currentUserReactions ?? []
        let remoteId = serverId(for: messageId)

        if mine.contains(emoji) {
            summary[emoji] = max(0, (summary[emoji] ?? 1) - 1)
            if summary[emoji] == 0 { summary.removeValue(forKey: emoji) }
            mine.removeAll { $0 == emoji }
            messageSocket.removeAttachmentReaction(attachmentId: attachmentId, messageId: remoteId, emoji: emoji)
        } else {
            // 1 emoji/user/PJ : retirer la réaction précédente de l'utilisateur.
            for old in mine {
                summary[old] = max(0, (summary[old] ?? 1) - 1)
                if summary[old] == 0 { summary.removeValue(forKey: old) }
            }
            mine.removeAll()
            summary[emoji] = (summary[emoji] ?? 0) + 1
            mine.append(emoji)
            messageSocket.addAttachmentReaction(attachmentId: attachmentId, messageId: remoteId, emoji: emoji)
        }
        messages[mIdx].attachments[aIdx].reactionSummary = summary.isEmpty ? nil : summary
        messages[mIdx].attachments[aIdx].currentUserReactions = mine.isEmpty ? nil : mine
        // Persist the optimistic attachment-reaction through GRDB so it survives
        // a cold reload of the conversation — parité avec les réactions
        // message-level (appendReaction/removeReaction). Sans ce write-through la
        // pill optimiste vit uniquement en mémoire et disparaît dès que la conv
        // est rechargée (avant que le serveur ne re-broadcast le delta).
        persistAttachmentReactions(messageId: messageId, attachments: messages[mIdx].attachments)
    }

    /// Applique un delta serveur : remplace le reactionSummary (comptes
    /// autoritaires) de la pièce jointe. `currentUserReactions` reste géré côté
    /// client (optimiste) — limite multi-device connue, comme message-level.
    /// Lookup par `attachmentId` (server-unique), robuste au mapping local/server id.
    func applyAttachmentReactionDelta(attachmentId: String, reactionSummary: [String: Int]) {
        guard let mIdx = messages.firstIndex(where: { $0.attachments.contains { $0.id == attachmentId } }),
              let aIdx = messages[mIdx].attachments.firstIndex(where: { $0.id == attachmentId }) else { return }
        messages[mIdx].attachments[aIdx].reactionSummary = reactionSummary.isEmpty ? nil : reactionSummary
        // Le delta serveur est lui aussi persisté pour que le compte autoritaire
        // soit servi tel quel au prochain cold-load (sans attendre un refetch REST).
        persistAttachmentReactions(messageId: messages[mIdx].id, attachments: messages[mIdx].attachments)
    }

    /// Write-through des réactions par-image vers GRDB. Encode l'array
    /// d'attachments complet (les réactions sont des champs Codable de
    /// `MeeshyMessageAttachment`) et le passe à `updateAttachmentsJson`. Fire-and-forget
    /// (miroir du chemin `appendReaction`/`deleteAttachment`) : un échec d'écriture
    /// retombe sur la source de vérité serveur au prochain refetch.
    private func persistAttachmentReactions(messageId: String, attachments: [MeeshyMessageAttachment]) {
        let json = try? JSONEncoder().encode(attachments)
        Task { [weak self] in
            try? await self?.messagePersistence.updateAttachmentsJson(localId: messageId, attachmentsJson: json)
        }
    }

    // MARK: - Fetch Reaction Details

    func fetchReactionDetails(messageId: String) async {
        isLoadingReactions = true
        defer { isLoadingReactions = false }
        do {
            let result = try await reactionService.fetchDetails(messageId: serverId(for: messageId))
            reactionDetails = result.reactions
        } catch {
            reactionDetails = []
        }
    }

    // MARK: - Delete Message

    /// Matches the WhatsApp semantics: `local` hides the message for this
    /// device only (no server round-trip), `everyone` soft-deletes on the
    /// backend and broadcasts `message:deleted` to all recipients. The UI
    /// gates the `everyone` option on sender+time-window rules via
    /// `canDeleteForEveryone(_:)`.
    enum DeleteMode {
        case local
        case everyone
    }

    /// Pure predicate — delegated to `commandHandler` so the policy
    /// (own message + within the 2h window) lives in one place.
    func canDeleteForEveryone(_ message: Message, window: TimeInterval = 2 * 3600) -> Bool {
        commandHandler.canDeleteForEveryone(message, window: window)
    }

    func deleteMessage(messageId: String, mode: DeleteMode = .everyone) async {
        switch mode {
        case .local:
            // Optimistic: hide locally. LocallyHiddenMessagesStore persists
            // the hidden id; messagesByDate filters it out on next evaluation.
            // Reversible — an "Undo" affordance can call .unhide(messageId)
            // without any network round-trip.
            LocallyHiddenMessagesStore.shared.hide(messageId)
            // Invalidate the date-group cache so the next messagesByDate
            // recomputes without the hidden row.
            _messagesByDate = nil
        case .everyone:
            // Optimistic: mark as deleted locally + blank content
            try? await messagePersistence.markDeleted(localId: messageId, deletedAt: Date())
            // Drop the starred snapshot so the Starred Messages list doesn't keep
            // surfacing a message that was deleted for everyone. Keyed by the
            // server id (StarredMessageSnapshot.id is the canonical message id).
            StarredMessagesStore.shared.remove(messageId: serverId(for: messageId))
            // Offline: route the delete through the durable outbox (flushed on
            // reconnect, T10) instead of losing it. `clientMessageId` is the
            // message's local id so deleting a still-unsent offline message
            // cancels its pending send (no wasted roundtrip). The delete sticks
            // locally and reconciles when online — no rollback on the offline path.
            if !networkMonitor.isOnline {
                try? await offlineQueue.enqueueDelete(OfflineDeletePayload(
                    messageId: serverId(for: messageId),
                    clientMessageId: messageId,
                    conversationId: conversationId
                ))
                return
            }
            do {
                try await messageService.delete(conversationId: conversationId, messageId: serverId(for: messageId))
            } catch {
                // Rollback: restore the message to a non-deleted state
                try? await messagePersistence.markUndeleted(localId: messageId)
                self.error = error.localizedDescription
            }
        }
    }

    // MARK: - Delete Attachment

    func deleteAttachment(messageId: String, attachmentId: String) async {
        guard let msgIdx = messageIndex(for: messageId) else { return }
        let message = messages[msgIdx]
        let isLastAttachment = message.attachments.count <= 1
        let hasTextContent = !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        // If it's the only attachment AND no text content → delete the whole message
        if isLastAttachment && !hasTextContent {
            await deleteMessage(messageId: messageId)
            return
        }

        // Optimistic: remove attachment from local message via persistence
        let originalAttachments = message.attachments
        let updatedAttachments = originalAttachments.filter { $0.id != attachmentId }
        let updatedJson = try? JSONEncoder().encode(updatedAttachments)
        try? await messagePersistence.updateAttachmentsJson(localId: messageId, attachmentsJson: updatedJson)

        do {
            try await AttachmentService.shared.delete(attachmentId: attachmentId)
        } catch {
            // Revert on failure
            let originalJson = try? JSONEncoder().encode(originalAttachments)
            try? await messagePersistence.updateAttachmentsJson(localId: messageId, attachmentsJson: originalJson)
            self.error = error.localizedDescription
        }
    }

    // MARK: - Pin / Unpin Message

    func togglePin(messageId: String) async {
        guard let idx = messageIndex(for: messageId) else { return }
        let wasPinned = messages[idx].pinnedAt != nil
        let previousPinnedAt = messages[idx].pinnedAt
        let previousPinnedBy = messages[idx].pinnedBy

        if wasPinned {
            // Optimistic unpin
            try? await messagePersistence.updatePinned(localId: messageId, pinnedAt: nil, pinnedBy: nil)

            do {
                try await messageService.unpin(conversationId: conversationId, messageId: serverId(for: messageId))
            } catch {
                // Revert
                try? await messagePersistence.updatePinned(localId: messageId, pinnedAt: previousPinnedAt, pinnedBy: previousPinnedBy)
                self.error = error.localizedDescription
            }
        } else {
            // Optimistic pin
            let now = Date()
            let pinnedById = authManager.currentUser?.id
            try? await messagePersistence.updatePinned(localId: messageId, pinnedAt: now, pinnedBy: pinnedById)

            do {
                try await messageService.pin(conversationId: conversationId, messageId: serverId(for: messageId))
            } catch {
                // Revert
                try? await messagePersistence.updatePinned(localId: messageId, pinnedAt: nil, pinnedBy: nil)
                self.error = error.localizedDescription
            }
        }
    }

    // MARK: - Consume View-Once Message

    /// View-once consumption. Delegates to `commandHandler` with the
    /// resolved server id — the handler runs the network call and the
    /// persistence write under one optimistic transaction. Returns `true`
    /// on success so the view can advance its UI (reveal + auto-dismiss
    /// timer); `false` keeps the bubble blurred.
    func consumeViewOnce(messageId: String) async -> Bool {
        await commandHandler.consumeViewOnce(messageId: messageId, serverId: serverId(for: messageId))
    }

    func evictViewOnceMedia(message: Message) {
        for attachment in message.attachments {
            let urls = [attachment.fileUrl, attachment.thumbnailUrl].compactMap { $0 }.filter { !$0.isEmpty }
            for urlStr in urls {
                Task {
                    let resolved = MeeshyConfig.resolveMediaURL(urlStr)?.absoluteString ?? urlStr
                    await CacheCoordinator.shared.images.remove(for: resolved)
                }
            }
        }
    }

    func markMessageAsConsumed(messageId: String) {
        // Write through persistence; the store observation will surface the
        // updated effectFlags (blurred) and cleared content to the view.
        Task { [weak self] in
            try? await self?.messagePersistence.markConsumed(localId: messageId)
        }
    }

    // MARK: - Edit Message

    func editMessage(messageId: String, newContent: String) async {
        let trimmed = newContent.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // Snapshot original content for rollback and edit history before
        // writing the optimistic update through persistence.
        let originalContent: String? = messageIndex(for: messageId).map { messages[$0].content }

        // Record history entry before overwriting (the backend does not
        // expose edit history, so we maintain it locally).
        if let original = originalContent, original != trimmed {
            EditHistoryStore.shared.recordRevision(
                messageId: serverId(for: messageId),
                previousContent: original
            )
        }

        // Optimistic update: write through persistence so the store
        // observation surfaces the change without a direct messages mutation.
        let editedAt = Date()
        try? await messagePersistence.markEdited(localId: messageId, newContent: trimmed, editedAt: editedAt)

        // Offline: route the edit through the durable outbox (flushed on
        // reconnect, T10) instead of losing it on the failed REST call.
        // `clientMessageId` is the message's local id so an edit of a
        // still-unsent offline message merges into its pending send. The
        // optimistic content + recorded history stay applied (no rollback).
        if !networkMonitor.isOnline {
            try? await offlineQueue.enqueueEdit(OfflineEditPayload(
                messageId: serverId(for: messageId),
                clientMessageId: messageId,
                content: trimmed,
                conversationId: conversationId
            ))
            return
        }

        editInProgress.insert(messageId)
        defer { editInProgress.remove(messageId) }

        do {
            _ = try await messageService.edit(messageId: serverId(for: messageId), content: trimmed)
        } catch {
            // Revert on failure — both the persisted content AND the history
            // entry we just wrote (so the user doesn't see a phantom
            // revision that never actually reached the server).
            if let original = originalContent {
                try? await messagePersistence.markEdited(localId: messageId, newContent: original, editedAt: editedAt)
                EditHistoryStore.shared.removeHistory(for: serverId(for: messageId))
            }
            self.error = error.localizedDescription
        }
    }

    /// History of prior revisions for a message, for the MessageDetailSheet
    /// "View edits" list. Resolves through `serverId(for:)` so the history
    /// keyed on the canonical id survives tempId → serverId reconciliation.
    func editRevisions(for messageId: String) -> [EditRevision] {
        EditHistoryStore.shared.revisions(for: serverId(for: messageId))
    }

    func isEditSaving(messageId: String) -> Bool {
        editInProgress.contains(messageId)
    }

    // MARK: - Report Message

    func reportMessage(messageId: String, reportType: String, reason: String?) async -> Bool {
        do {
            try await reportService.reportMessage(messageId: serverId(for: messageId), reportType: reportType, reason: reason)
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    // MARK: - Mark as Read / Received

    func markAsRead() {
        let convId = conversationId
        // 1. Update cache immediately (local-first) — survives reloadFromCache()
        Task { await ConversationSyncEngine.shared.markConversationReadLocally(convId) }
        // 2. Notify ConversationListViewModel to clear badge in current @Published state
        NotificationCenter.default.post(name: .conversationMarkedRead, object: convId)
        // 3. Send to server in background (fire-and-forget, queue on failure)
        guard UserPreferencesManager.shared.privacy.showReadReceipts else { return }
        // Wave 1 Phase C — route through the offline outbox so a read
        // receipt produced while offline survives an app kill and replays
        // on reconnect. The gateway route is naturally idempotent (read
        // cursor only moves forward) so a replay is harmless ; we still
        // tag it with a cmid for instrumentation parity with the other
        // outbox kinds. Fall back to the legacy `PendingStatusQueue` if
        // the outbox enqueue itself fails (e.g. pool not configured).
        let lastMessageId = messages.last?.id ?? ""
        Task {
            let cmid = ClientMutationId.generate()
            let payload = MarkAsReadPayload(
                clientMutationId: cmid,
                conversationId: convId,
                upToMessageId: lastMessageId
            )
            do {
                try await OfflineQueue.shared.enqueue(.markAsRead, payload: payload, conversationId: convId)
                // Mirror of ConversationCommandHandler.markAsRead: without
                // an explicit flushNow() the markAsRead row sits .pending
                // until an unrelated mutation (reaction, send, etc.) wakes
                // the flusher up, leaving "Synchronisation des lus" stuck
                // in the SyncPill indefinitely.
                await OutboxFlushTrigger.flushNow()
            } catch {
                await PendingStatusQueue.shared.enqueue(.init(
                    conversationId: convId, type: "read", timestamp: Date()
                ))
            }
        }
    }

    /// Server-side delivery confirmation. Fully delegated to the command
    /// handler — the legacy variant did the exact same call with an
    /// equally permissive error path.
    func markAsReceived() {
        commandHandler.markAsReceived()
    }


    // MARK: - Reconnection Sync (called by ConversationSocketHandler)

    func syncMissedMessages() async {
        // The high-water mark is the newest message we already hold. With no
        // local messages there is nothing to backfill *from* — a full load
        // happens on conversation open instead, so no-op rather than refetch
        // from the top. `.max()` is order-independent (doesn't assume the
        // store sort).
        guard let newestLocal = messages.map(\.createdAt).max() else { return }

        // Page size and total cap mirror the contiguous-backfill contract: a
        // missed-message gap of any size is filled by paging forward, not just
        // the most recent `limit` messages (the bug in the old offset:0 fetch,
        // which could never recover a gap larger than one page).
        let pageSize = 100
        let maxTotal = 1000

        // Back the watermark off by a sub-millisecond so a missed message that
        // shares the newest local message's exact instant is not excluded by
        // the gateway's strict `createdAt > after`; the boundary message simply
        // re-surfaces and is deduped by id on merge.
        var cursor = newestLocal.addingTimeInterval(-0.001)
        var collected: [APIMessage] = []

        do {
            while collected.count < maxTotal {
                let response = try await messageService.listAfter(
                    conversationId: conversationId, after: cursor, limit: pageSize,
                    includeReplies: true, includeTranslations: true, languages: nil
                )
                let page = response.data  // ascending (oldest-after-watermark first), per gateway contract
                guard !page.isEmpty else { break }

                collected.append(contentsOf: page)

                // Advance the watermark to the newest instant in this page.
                guard let pageNewest = page.compactMap(\.createdAt).max() else { break }
                cursor = pageNewest

                if page.count < pageSize { break }  // last (partial) page → gap filled
            }

            guard !collected.isEmpty else { return }

            // Upsert backfilled messages to GRDB; store observation surfaces them automatically.
            try? await messagePersistence.upsertFromAPIMessages(collected)
            extractAttachmentTranscriptions(from: collected)
            extractTextTranslations(from: collected)

            let userId = currentUserId
            let username = currentUsername
            // `listAfter` already returns ascending — no reversal needed (unlike the old DESC `list`).
            // Map off the main actor (see processAPIMessages) — `toMessage` decode is CPU-bound.
            let fetchedMessages = await Task.detached(priority: .utility) {
                collected.map { $0.toMessage(currentUserId: userId, currentUsername: username) }
            }.value
            let newMessages = fetchedMessages.filter { !self.containsMessage(id: $0.id) }

            if !newMessages.isEmpty {
                let convId = conversationId
                let snapshot = fetchedMessages
                Task.detached(priority: .utility) {
                    await CacheCoordinator.shared.messages.mergeUpdate(for: convId) { cached in
                        let cachedIds = Set(cached.map(\.id))
                        let newOnly = snapshot.filter { !cachedIds.contains($0.id) }
                        guard !newOnly.isEmpty else { return cached }
                        return (cached + newOnly).sorted { $0.createdAt < $1.createdAt }
                    }
                }
                Logger.socket.info("Backfilled \(newMessages.count) missed message(s) via watermark for conversation \(self.conversationId)")
            }
        } catch {
            Logger.socket.error("Failed to sync missed messages: \(error)")
        }
    }

    // MARK: - Search Messages (delegated to ConversationSearchHandler)

    /// First-page search. Delegates to `searchHandler`, then mirrors the
    /// store-side state back onto the legacy `@Published` so the views
    /// keep observing the ViewModel directly during the incremental
    /// split. The local `searchNextCursor` legacy field becomes dead
    /// weight (cursor lives in the handler) but is left assigned to
    /// `nil` for any reader that still peeks at it.
    func searchMessages(query: String) async {
        await searchHandler.searchMessages(query: query)
        searchResults = stateStore.searchResults
        currentSearchQuery = stateStore.currentSearchQuery
        searchHasMore = stateStore.searchHasMore
        isSearching = stateStore.isSearching
        searchNextCursor = nil
        await applySearchFilterWindow()
    }

    func loadMoreSearchResults(query: String) async {
        await searchHandler.loadMoreSearchResults(query: query)
        searchResults = stateStore.searchResults
        searchHasMore = stateStore.searchHasMore
        isSearching = stateStore.isSearching
        await applySearchFilterWindow()
    }

    /// In-situ filtered-conversation search: when a query is active with
    /// matches, the conversation window is filtered to ONLY those messages
    /// (rendered as real bubbles, term highlighted). When the query is empty or
    /// yields nothing, the full window is restored. Idempotent — safe to call
    /// after every search / pagination.
    private func applySearchFilterWindow() async {
        if currentSearchQuery != nil, !searchResults.isEmpty {
            await messageStore.enterSearchMode(ids: searchResults.map(\.id))
        } else if case .search = messageStore.windowMode {
            await messageStore.restoreLatestWindow()
        }
    }

    /// Exits in-conversation search: restores the full conversation window and
    /// clears the search state. Called when the user closes / clears the search.
    func endSearch() async {
        if case .search = messageStore.windowMode {
            await messageStore.restoreLatestWindow()
        }
        currentSearchQuery = nil
        stateStore.currentSearchQuery = nil
        searchResults = []
        stateStore.searchResults = []
        searchHasMore = false
    }

    // MARK: - Jump to Message (load messages around a specific message)

    func loadMessagesAround(messageId: String) async {
        do {
            let response = try await messageService.listAround(
                conversationId: conversationId, around: messageId, limit: limit, includeReplies: true, includeTranslations: true
            )

            // Upsert the API batch into GRDB so the window has fresh content.
            try? await messagePersistence.upsertFromAPIMessages(response.data)

            // Switch the store window to be centered on the target message.
            let targetDate = response.data.first(where: { $0.id == messageId })?.createdAt
                ?? response.data.last?.createdAt
                ?? Date()
            await messageStore.loadWindow(around: targetDate)

            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)
            nextMessageCursor = response.cursorPagination?.nextCursor
            hasOlderMessages = response.cursorPagination?.hasMore ?? false
            hasNewerMessages = response.hasNewer ?? false
            isInJumpedState = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Outcome of `jumpToQuotedMessage`.
    enum JumpResult {
        /// The message was already present in the local store — caller should
        /// perform an instant scroll + highlight.
        case foundLocally
        /// The message was fetched from the server and loaded into the store.
        /// Caller should scroll + highlight after the snapshot settles.
        case loadedFromServer
        /// The message could not be found (deleted, not accessible, network error).
        case notFound
    }

    /// High-level "jump to a quoted message" flow called when the user taps
    /// a reply reference. If the message is already in the local store's
    /// snapshot, returns `.foundLocally` immediately. Otherwise sets
    /// `isSearchingQuotedMessage = true` (driving the pulsing scroll-button
    /// indicator), fetches from the server via `loadMessagesAround`, and
    /// returns `.loadedFromServer` or `.notFound`.
    func jumpToQuotedMessage(messageId: String) async -> JumpResult {
        // Fast path: message is already visible — instant scroll
        if messageStore.messages.contains(where: {
            $0.localId == messageId || $0.serverId == messageId
        }) {
            return .foundLocally
        }

        // Slow path: need to fetch from server
        isSearchingQuotedMessage = true
        quotedMessageSearchTarget = messageId

        defer {
            isSearchingQuotedMessage = false
            quotedMessageSearchTarget = nil
        }

        do {
            let response = try await messageService.listAround(
                conversationId: conversationId, around: messageId, limit: limit, includeReplies: true, includeTranslations: true
            )

            // Upsert the API batch into GRDB so the window has fresh content.
            try? await messagePersistence.upsertFromAPIMessages(response.data)

            // Check if the target message was in the response
            let found = response.data.contains(where: { $0.id == messageId })
            guard found else { return .notFound }

            // Switch the store window to be centered on the target message.
            let targetDate = response.data.first(where: { $0.id == messageId })?.createdAt
                ?? response.data.last?.createdAt
                ?? Date()
            await messageStore.loadWindow(around: targetDate)

            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)
            nextMessageCursor = response.cursorPagination?.nextCursor
            hasOlderMessages = response.cursorPagination?.hasMore ?? false
            hasNewerMessages = response.hasNewer ?? false
            isInJumpedState = true

            // Small delay to let the diffable datasource apply the new snapshot
            // before the caller triggers scroll — otherwise the index path
            // won't exist yet.
            try? await Task.sleep(for: .seconds(0.15))

            return .loadedFromServer
        } catch {
            Logger.messages.error("[JumpToQuoted] Failed to load messages around \(messageId): \(error.localizedDescription)")
            return .notFound
        }
    }

    func loadNewerMessages() async {
        guard isInJumpedState, hasNewerMessages, !isLoadingNewer, !isProgrammaticScroll else { return }
        guard let lastMsg = messages.last else { return }

        // Debounce: ignore calls that arrive too soon after the last one
        let now = Date()
        guard now.timeIntervalSince(lastNewerPaginationTime) >= Self.paginationDebounceInterval else { return }
        lastNewerPaginationTime = now

        isLoadingNewer = true

        var lastError: Error?
        for attempt in 1...Self.paginationRetryCount {
            do {
                let response = try await messageService.listAround(
                    conversationId: conversationId, around: lastMsg.id, limit: limit, includeReplies: true, includeTranslations: true
                )

                // Upsert newer messages into GRDB; the GRDB DatabaseRegionObservation
                // fires automatically and the store refreshes its window — no direct
                // messages mutation needed.
                try? await messagePersistence.upsertFromAPIMessages(response.data)
                extractAttachmentTranscriptions(from: response.data)
                extractTextTranslations(from: response.data)

                hasNewerMessages = response.hasNewer ?? false
                if !hasNewerMessages {
                    isInJumpedState = false
                }
                lastError = nil
                break
            } catch {
                lastError = error
                if attempt < Self.paginationRetryCount {
                    Logger.messages.warning("loadNewerMessages attempt \(attempt) failed, retrying: \(error.localizedDescription)")
                    try? await Task.sleep(nanoseconds: Self.paginationRetryDelay)
                }
            }
        }

        if let lastError {
            Logger.messages.error("loadNewerMessages failed after \(Self.paginationRetryCount) attempts: \(lastError.localizedDescription)")
        }

        isLoadingNewer = false
    }

    func returnToLatest() async {
        guard isInJumpedState else { return }

        isInJumpedState = false
        hasNewerMessages = false
        // Also clear any active in-conversation search state so the results
        // banner / filter never linger after returning to the latest window.
        currentSearchQuery = nil
        stateStore.currentSearchQuery = nil
        searchResults = []
        stateStore.searchResults = []
        searchHasMore = false

        // Restore the latest window from GRDB; the store observation surfaces
        // the updated messages slice automatically — no snapshot-restore needed.
        await messageStore.restoreLatestWindow()

        // nextMessageCursor will be lazily re-fetched on the next loadOlderMessages
        // call; hasOlderMessages defaults to true until corrected by the first page.
        nextMessageCursor = nil
        hasOlderMessages = true
    }

    // MARK: - Extract Text Translations from REST Responses

    private func extractTextTranslations(from apiMessages: [APIMessage]) {
        let prismeLangs = Set(preferredLanguages.map { $0.lowercased() })
        for msg in apiMessages {
            guard let translations = msg.translations, !translations.isEmpty else { continue }
            var existing = messageTranslations[msg.id] ?? []
            for t in translations {
                guard prismeLangs.contains(t.targetLanguage.lowercased()) else { continue }
                let mt = MessageTranslation(
                    id: t.id,
                    messageId: t.messageId,
                    sourceLanguage: t.sourceLanguage ?? msg.originalLanguage ?? "auto",
                    targetLanguage: t.targetLanguage,
                    translatedContent: t.translatedContent,
                    translationModel: t.translationModel,
                    confidenceScore: t.confidenceScore
                )
                if let idx = existing.firstIndex(where: { $0.targetLanguage == mt.targetLanguage }) {
                    existing[idx] = mt
                } else {
                    existing.append(mt)
                }
            }
            messageTranslations[msg.id] = existing
            translationResolutionCache.removeValue(forKey: msg.id)
        }
    }

    private func hydrateTranslationsFromCache(messageIds: [String]? = nil) async {
        let msgIds = messageIds ?? messages.map(\.id)
        let prismeLangs = Set(preferredLanguages.map { $0.lowercased() })

        // 1. In-memory CacheCoordinator (fast, volatile)
        let cached = await CacheCoordinator.shared.cachedTranslations(for: msgIds)
        for (msgId, translations) in cached {
            var existing = messageTranslations[msgId] ?? []
            for t in translations {
                guard prismeLangs.contains(t.targetLanguage.lowercased()) else { continue }
                let mt = MessageTranslation(
                    id: t.id,
                    messageId: t.messageId,
                    sourceLanguage: t.sourceLanguage,
                    targetLanguage: t.targetLanguage,
                    translatedContent: t.translatedContent,
                    translationModel: t.translationModel,
                    confidenceScore: t.confidenceScore
                )
                if let idx = existing.firstIndex(where: { $0.targetLanguage == mt.targetLanguage }) {
                    existing[idx] = mt
                } else {
                    existing.append(mt)
                }
            }
            messageTranslations[msgId] = existing
            translationResolutionCache.removeValue(forKey: msgId)
        }

        // 2. GRDB fallback — for message IDs not covered by the volatile cache,
        //    read persisted TranslationRecords so cold-start shows translations
        //    instantly without waiting for a REST round-trip.
        let uncoveredIds = msgIds.filter { messageTranslations[$0] == nil || messageTranslations[$0]?.isEmpty == true }
        guard !uncoveredIds.isEmpty else { return }
        let reader = messagePersistence.reader
        let grdbTranslations: [String: [TranslationRecord]] = (try? await reader.read { db in
            let records = try TranslationRecord
                .filter(uncoveredIds.contains(Column("messageLocalId")))
                .fetchAll(db)
            return Dictionary(grouping: records, by: \.messageLocalId)
        }) ?? [:]

        for (msgId, records) in grdbTranslations {
            var existing = messageTranslations[msgId] ?? []
            for r in records {
                guard prismeLangs.contains(r.targetLanguage.lowercased()) else { continue }
                let mt = MessageTranslation(
                    id: r.id,
                    messageId: msgId,
                    sourceLanguage: r.sourceLanguage ?? "auto",
                    targetLanguage: r.targetLanguage,
                    translatedContent: r.translatedContent,
                    translationModel: r.translationModel,
                    confidenceScore: r.confidenceScore
                )
                if let idx = existing.firstIndex(where: { $0.targetLanguage == mt.targetLanguage }) {
                    existing[idx] = mt
                } else {
                    existing.append(mt)
                }
            }
            messageTranslations[msgId] = existing
            translationResolutionCache.removeValue(forKey: msgId)
        }
    }

    /// Pré-hydrate `messageTranslations` depuis GRDB AVANT que `messageStore`
    /// ne fasse surfacer les messages. Sans ça, les bulles se rendent une
    /// première fois sans traduction, puis re-rendent quand
    /// `hydrateTranslationsFromCache()` (appelé après `loadInitial`) se termine
    /// — d'où l'apparition « en second temps » des données de langue. En
    /// peuplant le dictionnaire en amont, le tout premier rendu applique déjà
    /// le Prisme Linguistique (contenu traduit affiché comme du natif).
    private func hydratePersistedTranslations() async {
        let convId = conversationId
        let reader = messagePersistence.reader
        let grouped: [String: [TranslationRecord]] = (try? await reader.read { db in
            let localIds = try MessageRecord
                .filter(Column("conversationId") == convId)
                .order(Column("createdAt").desc)
                .limit(80)
                .fetchAll(db)
                .map(\.localId)
            guard !localIds.isEmpty else { return [:] }
            let records = try TranslationRecord
                .filter(localIds.contains(Column("messageLocalId")))
                .fetchAll(db)
            return Dictionary(grouping: records, by: \.messageLocalId)
        }) ?? [:]

        guard !grouped.isEmpty else { return }

        let prismeLangs = Set(preferredLanguages.map { $0.lowercased() })
        for (msgId, records) in grouped {
            var existing = messageTranslations[msgId] ?? []
            for r in records {
                guard prismeLangs.contains(r.targetLanguage.lowercased()) else { continue }
                let mt = MessageTranslation(
                    id: r.id,
                    messageId: msgId,
                    sourceLanguage: r.sourceLanguage ?? "auto",
                    targetLanguage: r.targetLanguage,
                    translatedContent: r.translatedContent,
                    translationModel: r.translationModel,
                    confidenceScore: r.confidenceScore
                )
                if let idx = existing.firstIndex(where: { $0.targetLanguage == mt.targetLanguage }) {
                    existing[idx] = mt
                } else {
                    existing.append(mt)
                }
            }
            messageTranslations[msgId] = existing
            translationResolutionCache.removeValue(forKey: msgId)
        }
    }

    func setActiveTranslation(for messageId: String, translation: MessageTranslation?) {
        activeTranslationOverrides[messageId] = translation
    }

    func setActiveAudioLanguage(for messageId: String, language: String?) {
        activeAudioLanguageOverrides[messageId] = language
    }

    private var _cachedLanguagePreferences: ConversationLanguagePreferences?

    /// Ordered language priority used by `preferredTranslation(for:)`.
    /// Extracted into ``ConversationLanguagePreferences`` (P4.2 step 1)
    /// so the resolution can be unit-tested without spinning up a full
    /// ViewModel + AuthManager + cached message graph. The cache is keyed
    /// on the source `MeeshyUser` rather than just userId so a profile
    /// edit (system/regional language change) is picked up immediately.
    private var preferredLanguages: [String] {
        let prefs = ConversationLanguagePreferences(user: authManager.currentUser)
        if _cachedLanguagePreferences == prefs, let cached = _cachedLanguagePreferences {
            return cached.resolved
        }
        _cachedLanguagePreferences = prefs
        return prefs.resolved
    }

    func preferredTranslation(for messageId: String) -> MessageTranslation? {
        if let override = activeTranslationOverrides[messageId] {
            return override
        }
        if cachedRevisionForTranslation != preferredLanguageRevision {
            translationResolutionCache.removeAll()
            cachedRevisionForTranslation = preferredLanguageRevision
        }
        switch translationResolutionCache[messageId] {
        case .some(let cached):
            return cached
        case .none:
            break
        }
        guard let translations = messageTranslations[messageId], !translations.isEmpty else {
            translationResolutionCache.updateValue(nil, forKey: messageId)
            return nil
        }

        let originalLang = messageIndex(for: messageId)
            .map { messages[$0].originalLanguage.lowercased() }

        let langs = preferredLanguages
        for lang in langs {
            let langLower = lang.lowercased()
            if let orig = originalLang, orig == langLower {
                translationResolutionCache.updateValue(nil, forKey: messageId)
                return nil
            }
            if let match = translations.first(where: { $0.targetLanguage.lowercased() == langLower }) {
                translationResolutionCache[messageId] = match
                return match
            }
        }
        translationResolutionCache.updateValue(nil, forKey: messageId)
        return nil
    }

    // MARK: - Transcription Retry for Audio Messages

    /// When Whisper has not finished transcribing an audio attachment by the
    /// time the REST response arrives, `attachment.transcription` is nil.
    /// This method collects those message IDs and schedules a single retry
    /// fetch after 5 seconds so the transcription is surfaced on the second
    /// attempt (Whisper typically completes within 3–15 s).
    private func scheduleTranscriptionRetry(for apiMessages: [APIMessage]) {
        let audioMissingTranscription = apiMessages.filter { msg in
            msg.attachments?.contains(where: { att in
                guard let mime = att.mimeType, mime.hasPrefix("audio/") else { return false }
                return att.transcription == nil
            }) ?? false
        }
        guard !audioMissingTranscription.isEmpty else { return }

        let msgIds = audioMissingTranscription.map(\.id)
        let convId = conversationId
        Logger.messages.info("[TranscriptionRetry] Scheduling retry for \(msgIds.count) audio message(s) missing transcription")

        Task { [weak self, messageService] in
            try? await Task.sleep(for: .seconds(5)) // 5 seconds
            guard let self, !Task.isCancelled else { return }

            // Re-fetch the same messages from REST; by now Whisper should have
            // finished transcribing. We use `listAround` with the first message
            // to get a window that includes the missing ones.
            for msgId in msgIds {
                guard !Task.isCancelled else { return }
                do {
                    let response = try await messageService.listAround(
                        conversationId: convId,
                        around: msgId,
                        limit: 5,
                        includeReplies: false,
                        includeTranslations: true
                    )
                    await MainActor.run {
                        self.extractAttachmentTranscriptions(from: response.data)
                    }
                } catch {
                    Logger.messages.warning("[TranscriptionRetry] Retry failed for \(msgId): \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - Extract Transcription/Translation Data from REST Responses

    private func extractAttachmentTranscriptions(from apiMessages: [APIMessage]) {
        for msg in apiMessages {
            for att in msg.attachments ?? [] {
                if let t = att.transcription {
                    let segments = (t.segments ?? []).map {
                        MessageTranscriptionSegment(
                            text: $0.text,
                            startTime: $0.startTime,
                            endTime: $0.endTime,
                            speakerId: $0.speakerId
                        )
                    }
                    let transcription = MessageTranscription(
                        attachmentId: att.id,
                        text: t.resolvedText,
                        language: t.language ?? "?",
                        confidence: t.confidence,
                        durationMs: t.durationMs,
                        segments: segments,
                        speakerCount: t.speakerCount
                    )
                    messageTranscriptions[msg.id] = transcription
                    messageTranscriptionsByAttachment[att.id] = transcription
                }
                if let translations = att.translations {
                    var audios: [MessageTranslatedAudio] = []
                    for (lang, trans) in translations {
                        guard let url = trans.url, !url.isEmpty else { continue }
                        let segments = (trans.segments ?? []).map {
                            MessageTranscriptionSegment(
                                text: $0.text,
                                startTime: $0.startTime,
                                endTime: $0.endTime,
                                speakerId: $0.speakerId
                            )
                        }
                        audios.append(MessageTranslatedAudio(
                            id: "\(att.id)_\(lang)",
                            attachmentId: att.id,
                            targetLanguage: lang,
                            url: url,
                            transcription: trans.transcription ?? "",
                            durationMs: trans.durationMs ?? 0,
                            format: trans.format ?? "mp3",
                            cloned: trans.cloned ?? false,
                            quality: trans.quality ?? 0,
                            voiceModelId: trans.voiceModelId,
                            ttsModel: trans.ttsModel ?? "xtts",
                            segments: segments
                        ))
                    }
                    if !audios.isEmpty {
                        messageTranslatedAudios[msg.id] = audios
                        messageTranslatedAudiosByAttachment[att.id] = audios
                    }
                }
            }
        }
    }

    // MARK: - Hydrate metadata from GRDB (instant load)

    /// Reads the embedded transcription/translation metadata from GRDB's
    /// `attachmentsJson` blobs and populates `messageTranscriptions` and
    /// `messageTranslatedAudios` dictionaries **before** any REST call.
    /// This ensures that audio bubbles show transcriptions and language
    /// buttons on the very first render frame.
    ///
    /// - Parameters:
    ///   - records: explicit record list to read from. When nil, falls
    ///     back to `messageStore.messages` (legacy path). Pass an
    ///     explicit list to ensure atomicity with a same-runloop `apply`.
    ///   - forceOverwrite: when `true`, replaces existing entries in
    ///     `messageTranscriptions` / `messageTranslatedAudios`. Default
    ///     `false` preserves any in-memory state already written by a
    ///     concurrent socket delta (`applyAttachmentUpdate`). Pass
    ///     `true` from `refreshMessagesFromAPI` so a server-side
    ///     re-transcription propagates to the UI even when the message
    ///     already had a (stale) transcription cached.
    private func hydrateMetadataFromGRDB(
        from records: [MessageRecord]? = nil,
        forceOverwrite: Bool = false
    ) {
        let decoder = JSONDecoder()
        let source = records ?? messageStore.messages
        for record in source {
            let msgId = record.serverId ?? record.localId
            guard let data = record.attachmentsJson,
                  let attachments = try? decoder.decode([MeeshyMessageAttachment].self, from: data)
            else { continue }

            for att in attachments {
                // Hydrate transcription
                if let t = att.transcription {
                    let segments = (t.segments ?? []).map {
                        MessageTranscriptionSegment(
                            text: $0.text,
                            startTime: $0.startTime,
                            endTime: $0.endTime,
                            speakerId: $0.speakerId
                        )
                    }
                    let transcription = MessageTranscription(
                        attachmentId: att.id,
                        text: t.text,
                        language: t.language,
                        confidence: t.confidence,
                        durationMs: t.durationMs,
                        segments: segments,
                        speakerCount: t.speakerCount
                    )
                    if forceOverwrite || messageTranscriptions[msgId] == nil {
                        messageTranscriptions[msgId] = transcription
                    }
                    if forceOverwrite || messageTranscriptionsByAttachment[att.id] == nil {
                        messageTranscriptionsByAttachment[att.id] = transcription
                    }
                }

                // Hydrate audio translations
                if let translations = att.audioTranslations, !translations.isEmpty {
                    var audios: [MessageTranslatedAudio] = []
                    for (lang, trans) in translations {
                        let segments = (trans.segments ?? []).map {
                            MessageTranscriptionSegment(
                                text: $0.text,
                                startTime: $0.startTime,
                                endTime: $0.endTime,
                                speakerId: $0.speakerId
                            )
                        }
                        audios.append(MessageTranslatedAudio(
                            id: "\(att.id)_\(lang)",
                            attachmentId: att.id,
                            targetLanguage: lang,
                            url: trans.url,
                            transcription: trans.transcription ?? "",
                            durationMs: trans.durationMs ?? 0,
                            format: trans.format ?? "mp3",
                            cloned: trans.cloned ?? false,
                            quality: trans.quality ?? 0,
                            voiceModelId: trans.voiceModelId,
                            ttsModel: trans.ttsModel ?? "xtts",
                            segments: segments
                        ))
                    }
                    if !audios.isEmpty {
                        if forceOverwrite || messageTranslatedAudios[msgId] == nil {
                            messageTranslatedAudios[msgId] = audios
                        }
                        if forceOverwrite || messageTranslatedAudiosByAttachment[att.id] == nil {
                            messageTranslatedAudiosByAttachment[att.id] = audios
                        }
                    }
                }
            }
        }
    }

    // MARK: - Location Sharing

    func shareLocation(latitude: Double, longitude: Double, placeName: String? = nil, address: String? = nil) {
        LocationService.shared.shareLocation(
            conversationId: conversationId,
            latitude: latitude, longitude: longitude,
            placeName: placeName, address: address
        )
    }

    func startLiveLocation(latitude: Double, longitude: Double, durationMinutes: Int) {
        LocationService.shared.startLiveLocation(
            conversationId: conversationId,
            latitude: latitude, longitude: longitude,
            durationMinutes: durationMinutes
        )
    }

    func stopLiveLocation() {
        LocationService.shared.stopLiveLocation(conversationId: conversationId)
    }

    func updateLiveLocation(latitude: Double, longitude: Double, speed: Double? = nil, heading: Double? = nil) {
        LocationService.shared.updateLiveLocation(
            conversationId: conversationId,
            latitude: latitude, longitude: longitude,
            speed: speed, heading: heading
        )
    }
}

// MARK: - ConversationSocketDelegate Conformance

extension ConversationViewModel: ConversationSocketDelegate {
    /// Read-receipt precision gate input: the scroll controller pushes the
    /// near-bottom flag here via `onNearBottomChanged`, so the socket handler can
    /// refuse to auto-mark-read a message that landed off-screen while the user
    /// was reading history.
    var isViewportAtBottom: Bool { isCurrentlyNearBottom }

    func handleParticipantRoleUpdated(participantId: String, newRole: String) {
        Logger.socket.info("Participant \(participantId) role changed to \(newRole)")
        _topActiveMembers = nil
        objectWillChange.send()
    }

    /// Bridge for `ConversationSocketHandler` — reuses the same purge +
    /// dismiss path as the REST 403 case so socket-rejected joins look
    /// identical to API-rejected loads from the user's perspective.
    func handleSocketAccessRevoked(reason: String?) {
        Task { [weak self] in
            await self?.handleAccessRevoked(reason: reason)
        }
    }

    /// Applies a server-pushed attachment delta (transcription / audio
    /// translation finalized) by:
    /// 1. Injecting the enriched metadata directly into
    ///    `messageTranscriptions` / `messageTranslatedAudios` in a
    ///    single MainActor slice (no await between assignments — same
    ///    atomic-publish rule as `hydrateMetadataFromGRDB`).
    /// 2. Fire-and-forget GRDB write-through via
    ///    `MessagePersistenceActor.applyAttachmentEnrichment`, so a
    ///    subsequent open of this conversation surfaces the enrichment
    ///    from cache instead of pop-in-then-replace when
    ///    `refreshMessagesFromAPI` later runs.
    func applyAttachmentUpdate(_ event: AttachmentUpdatedEvent) {
        injectAttachmentMetadata(from: event.attachment, intoMessageId: event.messageId)

        let messageId = event.messageId
        let attachmentId = event.attachment.id
        let transcription = event.attachment.transcription
        let translations = event.attachment.translations
        Task { [persistence = messagePersistence] in
            try? await persistence.applyAttachmentEnrichment(
                messageId: messageId,
                attachmentId: attachmentId,
                transcription: transcription,
                translations: translations
            )
        }
    }

    /// Injects an enriched attachment's transcription + audio translations
    /// directly into the metadata dictionaries (same shape as
    /// `hydrateMetadataFromGRDB` but sourced from a socket payload).
    private func injectAttachmentMetadata(
        from attachment: APIMessageAttachment,
        intoMessageId msgId: String
    ) {
        if let t = attachment.transcription {
            let segments = (t.segments ?? []).map {
                MessageTranscriptionSegment(
                    text: $0.text,
                    startTime: $0.startTime,
                    endTime: $0.endTime,
                    speakerId: $0.speakerId
                )
            }
            let transcription = MessageTranscription(
                attachmentId: attachment.id,
                text: t.transcribedText ?? t.text ?? "",
                language: t.language ?? "?",
                confidence: t.confidence,
                durationMs: t.durationMs,
                segments: segments,
                speakerCount: t.speakerCount
            )
            messageTranscriptions[msgId] = transcription
            messageTranscriptionsByAttachment[attachment.id] = transcription
        }
        if let translations = attachment.translations, !translations.isEmpty {
            var audios: [MessageTranslatedAudio] = []
            for (lang, trans) in translations {
                guard let url = trans.url, !url.isEmpty else { continue }
                let segments = (trans.segments ?? []).map {
                    MessageTranscriptionSegment(
                        text: $0.text,
                        startTime: $0.startTime,
                        endTime: $0.endTime,
                        speakerId: $0.speakerId
                    )
                }
                audios.append(MessageTranslatedAudio(
                    id: "\(attachment.id)_\(lang)",
                    attachmentId: attachment.id,
                    targetLanguage: lang,
                    url: url,
                    transcription: trans.transcription ?? "",
                    durationMs: trans.durationMs ?? 0,
                    format: trans.format ?? "mp3",
                    cloned: trans.cloned ?? false,
                    quality: trans.quality ?? 0,
                    voiceModelId: trans.voiceModelId,
                    ttsModel: trans.ttsModel ?? "xtts",
                    segments: segments
                ))
            }
            if !audios.isEmpty {
                messageTranslatedAudios[msgId] = audios
                messageTranslatedAudiosByAttachment[attachment.id] = audios
            }
        }
    }
}
