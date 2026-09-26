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
// la conversation pour le mini-player, médias et vocaux de toute la
// conversation, légendes, mentions et membres les plus actifs.
//
// Les ARDOISES de cache (`_allVisualAttachments`, `_allAudioItems`, …) restent
// chez l'hôte, où `invalidateCaches(previousMessages:)` les efface : ce sont des
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

    // MARK: - Mention Forwarding (backwards compat for ConversationView)

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

    // MARK: - Conversation-Wide Media

    /// La fiche d'auteur vient de `ConversationMediaRules.senderInfo(of:)` —
    /// la même règle que l'index des médias (#8095) applique aux porteurs que
    /// la fenêtre n'a pas chargés.
    var mediaSenderInfoMap: [String: MediaSenderInfo] {
        if let cached = _mediaSenderInfoMap { return cached }
        var map = [String: MediaSenderInfo](minimumCapacity: messages.count)
        for msg in messages {
            let info = ConversationMediaRules.senderInfo(of: msg)
            for att in msg.attachments {
                map[att.id] = info
            }
        }
        _mediaSenderInfoMap = map
        return map
    }

    /// #7618 — une vue unique n'entre pas dans le défilement du plein écran :
    /// on ne l'atteint pas en balayant depuis une autre photo. Elle s'ouvre
    /// seule, par sa puce (`ConversationMediaGalleryLayer`).
    var allVisualAttachments: [MessageAttachment] {
        if let cached = _allVisualAttachments { return cached }
        let result = messages.filter { !$0.holdsViewOnce }.flatMap { msg in
            msg.attachments.filter { [.image, .video].contains($0.type) }
        }
        _allVisualAttachments = result
        return result
    }

    // MARK: - Audio Items for Fullscreen Gallery

    var allAudioItems: [AudioItem] {
        if let cached = _allAudioItems { return cached }
        let result = messages.filter { !$0.holdsViewOnce }.flatMap { msg in
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

    /// Les pistes audio d'UN message — la tranche que `ThemedMessageBubble.==`
    /// refiltrait depuis la liste de TOUTE la conversation à chaque comparaison.
    /// Invalidé avec `_allAudioItems` (son `didSet`).
    var audioItemsByMessageId: [String: [AudioItem]] {
        if let cached = _audioItemsByMessageId { return cached }
        let index = Dictionary(grouping: allAudioItems, by: \.message.id)
        _audioItemsByMessageId = index
        return index
    }

    /// La règle de légende est `ConversationMediaRules.captions(of:servedText:)`
    /// (#8095), partagée avec l'index des médias ; le texte servi est celui du
    /// Prisme de la fenêtre, bascules manuelles comprises.
    var mediaCaptionMap: [String: String] {
        if let cached = _mediaCaptionMap { return cached }
        let map = messages.reduce(into: [String: String]()) { map, msg in
            let captions = ConversationMediaRules.captions(
                of: msg,
                servedText: self.preferredTranslation(for: msg.id)?.translatedContent ?? msg.content
            )
            map.merge(captions) { _, latest in latest }
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
        let result = ConversationActiveMember.ranked(from: messages, fallbackColor: accentColor)
        _topActiveMembers = result
        return result
    }
}
