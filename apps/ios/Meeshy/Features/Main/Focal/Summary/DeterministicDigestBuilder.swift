import Foundation

/// Construit le digest déterministe — contrat Focal §WS-8/§3.7. 100 % des
/// comptes viennent des messages RÉELLEMENT chargés (`messages`, la fenêtre
/// `MessageStore` du client) — jamais extrapolés. `isComplete` est un
/// PASS-THROUGH du paramètre `windowCoversUnread` fourni par l'appelant
/// (même esprit que `LocalBridgeProvider.UnreadWindow.isComplete`,
/// `Lentille/Core/LentilleProviders.swift`, LU jamais modifié) : ce fichier
/// ne DÉCIDE PAS si la fenêtre couvre le non-lu — il transmet honnêtement ce
/// que l'appelant sait déjà.
///
/// **Rôle de `participants`** : le compte "9 personnes" du critère §7
/// (« 312 messages · 9 personnes ») vient des expéditeurs RÉELLEMENT actifs
/// dans `messages` (`Set` des `senderId` non-système) — pas de la taille du
/// roster. `participants` sert à VALIDER ce compte contre l'identité connue
/// (jamais compter un expéditeur fantôme, hors roster, comme une « personne »
/// si le roster est fourni) ; un appelant qui ne le câble pas encore (roster
/// vide) obtient un repli honnête sur les seuls expéditeurs observés — jamais
/// un digest vide par excès de prudence.
nonisolated public enum DeterministicDigestBuilder {

    public static func build(
        messages: [DigestInputMessage],
        participants: [DigestParticipant],
        viewerId: String,
        episodes: [ConversationEpisode],
        windowCoversUnread: Bool
    ) -> DeterministicConversationDigest {
        guard !messages.isEmpty else {
            return DeterministicConversationDigest(
                messageCount: 0, participantCount: 0, start: nil, end: nil,
                topSenders: [], languages: [], media: .empty,
                awaitingYou: [], episodes: episodes, isComplete: windowCoversUnread
            )
        }

        let sorted = messages.sorted { $0.createdAt < $1.createdAt }
        // Les messages système (annonces, résumés d'appel…) n'ont pas
        // d'« expéditeur » au sens conversationnel — exclus de tous les
        // comptes par personne, comme `fromOthers` exclut le lecteur lui-même
        // côté `LentilleBridgeFormatter`.
        let real = sorted.filter { !$0.isSystem }

        let knownIds = Set(participants.map(\.id))
        let activeSenderIds = Set(real.map(\.senderId))
        let countedParticipantIds = knownIds.isEmpty ? activeSenderIds : knownIds.intersection(activeSenderIds)

        let messagesById = Dictionary(uniqueKeysWithValues: sorted.map { ($0.id, $0) })

        return DeterministicConversationDigest(
            messageCount: real.count,
            participantCount: countedParticipantIds.count,
            start: sorted.first?.createdAt,
            end: sorted.last?.createdAt,
            topSenders: buildTopSenders(real),
            languages: buildLanguages(real),
            media: buildMedia(real),
            awaitingYou: buildAwaitingYou(real, messagesById: messagesById, viewerId: viewerId),
            episodes: episodes,
            isComplete: windowCoversUnread
        )
    }

    // MARK: - Auteurs les plus actifs

    /// Tri : compte décroissant, puis dernière activité décroissante, puis
    /// `userId` croissant — déterministe, jamais `hashValue` (contrat §7,
    /// même règle que `FaceRampRanking`).
    private static func buildTopSenders(_ real: [DigestInputMessage]) -> [SenderTally] {
        var counts: [String: Int] = [:]
        var lastAt: [String: Date] = [:]
        for message in real {
            counts[message.senderId, default: 0] += 1
            if let existing = lastAt[message.senderId] {
                if message.createdAt > existing { lastAt[message.senderId] = message.createdAt }
            } else {
                lastAt[message.senderId] = message.createdAt
            }
        }
        return counts
            .map { SenderTally(userId: $0.key, messageCount: $0.value, lastAt: lastAt[$0.key] ?? .distantPast) }
            .sorted { lhs, rhs in
                if lhs.messageCount != rhs.messageCount { return lhs.messageCount > rhs.messageCount }
                if lhs.lastAt != rhs.lastAt { return lhs.lastAt > rhs.lastAt }
                return lhs.userId < rhs.userId
            }
    }

    // MARK: - Langues

    private static func buildLanguages(_ real: [DigestInputMessage]) -> [LanguageTally] {
        var counts: [String: Int] = [:]
        for message in real {
            guard let code = message.languageCode, !code.isEmpty else { continue }
            counts[code, default: 0] += 1
        }
        return counts
            .map { LanguageTally(code: $0.key, messageCount: $0.value) }
            .sorted { lhs, rhs in
                if lhs.messageCount != rhs.messageCount { return lhs.messageCount > rhs.messageCount }
                return lhs.code < rhs.code
            }
    }

    // MARK: - Médias — 6 buckets réels, jamais un comptage inventé

    private static func buildMedia(_ real: [DigestInputMessage]) -> MediaTally {
        var images = 0, videos = 0, audios = 0, files = 0, locations = 0, links = 0
        for message in real {
            for kind in message.attachmentKinds {
                switch kind {
                case .image: images += 1
                case .video: videos += 1
                case .audio: audios += 1
                case .file: files += 1
                case .location: locations += 1
                }
            }
            links += message.linkCount
        }
        return MediaTally(images: images, videos: videos, audios: audios, files: files, locations: locations, links: links)
    }

    // MARK: - « Ils t'attendent »

    /// Une mention/question est « sans réponse » si AUCUN message du lecteur
    /// n'existe APRÈS elle dans la fenêtre fournie — heuristique bornée à ce
    /// que `messages` contient réellement (documentée, pas un fait absolu sur
    /// toute la conversation). Une réponse directe est structurelle
    /// (`replyToId` pointe vers un message DU lecteur) — zéro heuristique.
    private static func buildAwaitingYou(
        _ real: [DigestInputMessage],
        messagesById: [String: DigestInputMessage],
        viewerId: String
    ) -> [AwaitingItem] {
        let viewerLastMessageAt = real
            .filter { $0.senderId == viewerId }
            .map(\.createdAt)
            .max() ?? .distantPast

        var items: [AwaitingItem] = []
        for message in real where message.senderId != viewerId {
            let isUnanswered = message.createdAt > viewerLastMessageAt

            if message.mentionsViewer, isUnanswered,
               let item = AwaitingItem(
                   id: "mention_\(message.id)", kind: .mention, fromUserId: message.senderId,
                   evidenceMessageIds: [message.id], at: message.createdAt
               ) {
                items.append(item)
            }

            if let replyToId = message.replyToId,
               let parent = messagesById[replyToId],
               parent.senderId == viewerId,
               let item = AwaitingItem(
                   id: "reply_\(message.id)", kind: .directReply, fromUserId: message.senderId,
                   evidenceMessageIds: [message.id], at: message.createdAt
               ) {
                items.append(item)
            }

            if message.content.trimmingCharacters(in: .whitespacesAndNewlines).hasSuffix("?"), isUnanswered,
               let item = AwaitingItem(
                   id: "question_\(message.id)", kind: .unansweredQuestion, fromUserId: message.senderId,
                   evidenceMessageIds: [message.id], at: message.createdAt
               ) {
                items.append(item)
            }
        }
        return items.sorted { $0.at < $1.at }
    }
}
