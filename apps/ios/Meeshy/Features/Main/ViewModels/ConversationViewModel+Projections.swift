import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

// Extrait de `ConversationViewModel.swift` (#4942, D-MAINT-01), qui portait
// 4 832 lignes — quatre fois le plafond DUR de 1 200 de la directive
// 2026-09-02, que `FileSizeBudgetGuardTests` mesure et qui interdit d'AJOUTER
// à un fichier hors budget. Un chantier de fluidité qui doit toucher le
// chargement, l'envoi et l'observation du magasin ne pouvait pas commencer
// avant : on extrait d'abord, on ajoute ensuite. Le découpage suit une
// RESPONSABILITÉ, jamais une tranche de lignes, et ne change AUCUN
// comportement — les corps sont déplacés à l'identique.
//
// `private` est de portée FICHIER en Swift : les membres de l'hôte que cette
// extension consomme se sont élargis en interne par la découpe, pas par un
// choix de visibilité. Les propriétés STOCKÉES restent chez l'hôte — une
// extension ne peut pas en déclarer.
//
// Responsabilité tenue ici : les PROJECTIONS — tout ce qui se DÉDUIT de l'état
// sans jamais le modifier : index O(1) des messages, derniers messages reçu et
// envoyé, phase de pagination, roster de frappe, avatar déjà connu, identité de
// la conversation pour le mini-player, groupes par date, médias et vocaux de
// toute la conversation, légendes, mentions et membres les plus actifs.
//
// Les ARDOISES de cache (`_messagesByDate`, `_allAudioItems`, …) restent chez
// l'hôte, où `invalidateCaches(previousMessages:)` les efface : ce sont des
// propriétés stockées, et leur invalidation est une propriété du CHAMP, pas une
// discipline d'appelant.

extension ConversationViewModel {

    // MARK: - Sentinelle de cache d'index

    /// Two-state cache sentinel for Int? properties where both `nil` (absent)
    /// and a concrete index are valid computed results. Replaces the `Int??`
    /// pattern (`nil` = uncomputed, `.some(nil)` = absent) with explicit cases
    /// that are immediately readable without knowing Swift nested-optional semantics.
    enum IndexCache {
        case uncomputed
        case resolved(Int?)

        var index: Int? {
            if case .resolved(let i) = self { return i }
            return nil
        }
    }

    // MARK: - Derniers messages reçu / envoyé

    var cachedLastReceivedIndex: Int? {
        if case .resolved(let cached) = _cachedLastReceivedIndex { return cached }
        let result = messages.indices.last(where: { !messages[$0].isMe })
        _cachedLastReceivedIndex = .resolved(result)
        return result
    }

    var cachedLastSentIndex: Int? {
        if case .resolved(let cached) = _cachedLastSentIndex { return cached }
        let result = messages.indices.last(where: { messages[$0].isMe })
        _cachedLastSentIndex = .resolved(result)
        return result
    }

    var lastReceivedMessageId: String? {
        cachedLastReceivedIndex.map { messages[$0].id }
    }
    var lastSentMessageId: String? {
        cachedLastSentIndex.map { messages[$0].id }
    }

    // MARK: - Phase de pagination

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

    // MARK: - Frappe en cours (adossée au stateStore)

    /// Users currently typing in this conversation.
    /// Backed by stateStore — changes fire stateStore.objectWillChange, NOT self.objectWillChange.
    /// This prevents the full conversation view graph from re-evaluating on every keystroke.
    var typingParticipants: [TypingParticipant] {
        get { stateStore.typingParticipants }
        set { stateStore.typingParticipants = newValue }
    }

    /// Projection en noms seuls — libellés d'accessibilité et empreinte de
    /// roster. Dérivée, jamais stockée : une seconde copie divergerait du
    /// roster dès qu'un frappeur entre ou sort.
    var typingUsernames: [String] { typingParticipants.displayNames }

    /// Combine publisher for the typing roster — used by UIKit consumers (MessageListViewController).
    var typingParticipantsPublisher: AnyPublisher<[TypingParticipant], Never> {
        stateStore.$typingParticipants.eraseToAnyPublisher()
    }

    // MARK: - Avatar connu localement

    /// Avatar déjà connu de cet auteur — lu dans les messages EN MÉMOIRE, comme
    /// `mentionCandidates` et `topActiveMembersList` le font déjà. Le plus
    /// récent gagne : un membre qui vient de changer de photo ne réapparaît pas
    /// avec l'ancienne. `nil` quand il n'a rien écrit dans ce fil — la vue
    /// retombe alors sur ses initiales.
    func localAvatarURL(forSender userId: String) -> String? {
        guard !userId.isEmpty else { return nil }
        return messages.last { $0.senderId == userId && $0.senderAvatarURL != nil }?.senderAvatarURL
    }

    // MARK: - Identité de la conversation (mini-player audio)

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

    // MARK: - Mention Forwarding (backwards compat for ConversationView)

    var mentionSuggestions: [MentionCandidate] { mentionController.suggestions }
    var activeMentionQuery: String? { mentionController.activeQuery }

    // MARK: - O(1) Message Index

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

    var allVisualAttachments: [MessageAttachment] {
        if let cached = _allVisualAttachments { return cached }
        let result = messages.flatMap { msg in
            msg.attachments.filter { [.image, .video].contains($0.type) }
        }
        _allVisualAttachments = result
        return result
    }

    // MARK: - Audio Items for Fullscreen Gallery

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

    // MARK: - Mention Display Names (username → displayName) — cached

    var mentionDisplayNames: [String: String] {
        if let cached = _mentionDisplayNames { return cached }
        UserDisplayNameCache.shared.trackFromMessages(messages)
        let map = UserDisplayNameCache.shared.allMappings()
        _mentionDisplayNames = map
        return map
    }

    // MARK: - Mention Autocomplete Logic — cached

    var mentionCandidates: [MentionCandidate] {
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
}
