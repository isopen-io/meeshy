import Foundation
import MeeshySDK

/// Le SEUL point qui assemble les trois lois WS-8 (`EpisodeSegmenter`,
/// `DeterministicDigestBuilder`, `FaceRampRanking`) contre de VRAIS messages
/// `MeeshyMessage` — pour que `ConversationView.swift` (câblage `.summary`,
/// WS-9) n'ait qu'un appel à faire, jamais de logique de digest en ligne.
/// Aucune loi n'est réécrite ici : ce fichier ne fait QUE des conversions de
/// type entre le monde `MeeshyMessage`/`PresenceManager` et les entrées
/// pures de WS-8.
///
/// **Roster = expéditeurs réels** : `MeeshyMessage` porte déjà
/// `senderName`/`senderUsername`/`senderColor`/`senderAvatarURL` PAR MESSAGE
/// (dénormalisé par le serveur) — `participants` est donc dérivé
/// directement des messages plutôt que d'exiger une seconde source
/// (roster complet de la conversation, non nécessaire ici : le digest ne
/// compte QUE les personnes réellement actives dans la fenêtre, §WS-8).
///
/// **`mentionsViewer` — heuristique volontairement ÉTROITE** (RE-PREUVE :
/// aucun mirroir Swift de `packages/shared/utils/mention-parser.ts` n'existe
/// dans ce dépôt ; `MessageTextRenderer.mentionRegex`, la seule regex de
/// mention côté Swift, est `private` et sert le RENDU, pas la détection
/// sémantique). Plutôt que fabriquer une seconde loi de mention
/// approximative, ce fichier détecte UNIQUEMENT `@<mon propre username>`
/// comme sous-chaîne du contenu — un signal réel, jamais un mot inventé,
/// délibérément biaisé vers le FAUX NÉGATIF (une mention par nom d'affichage
/// sans `@`, ou par une variante non gérée, ne sera pas comptée) plutôt que
/// vers le FAUX POSITIF. Documenté comme écart connu au rapport de tâche —
/// un futur miroir Swift de `mention-parser.ts` le remplacera avantageusement.
nonisolated enum LivingSummaryAssembly {

    struct Input {
        let messages: [MeeshyMessage]
        let viewerId: String
        let viewerUsername: String?
        let windowCoversUnread: Bool
        let analysisProvider: ConversationAnalysisProviding?
        let conversationId: String
        let calendar: Calendar
        let locale: Locale
        let now: Date
    }

    @MainActor
    static func makeViewModel(_ input: Input) -> LivingSummaryViewModel {
        let episodeInputs = input.messages.map(episodeInput)
        let episodes = EpisodeSegmenter.segment(messages: episodeInputs, calendar: input.calendar, locale: input.locale)

        let digestInputs = input.messages.map { digestInput($0, viewerUsername: input.viewerUsername) }
        let participants = deriveParticipants(from: input.messages)

        let digest = DeterministicDigestBuilder.build(
            messages: digestInputs,
            participants: participants,
            viewerId: input.viewerId,
            episodes: episodes,
            windowCoversUnread: input.windowCoversUnread
        )

        let rampInputs = FaceRampRanking.makeInputs(awaitingYou: digest.awaitingYou, participants: participants)
        let faceRamp = FaceRampRanking.rank(entries: rampInputs, now: input.now)

        return LivingSummaryViewModel(
            digest: digest,
            faceRamp: faceRamp,
            analysisProvider: input.analysisProvider,
            conversationId: input.conversationId
        )
    }

    // MARK: - Conversions

    private static func episodeInput(_ message: MeeshyMessage) -> EpisodeInputMessage {
        EpisodeInputMessage(
            id: message.id,
            senderId: message.senderId,
            createdAt: message.createdAt,
            replyToId: message.replyToId,
            isSystem: message.messageSource == .system
        )
    }

    private static func digestInput(_ message: MeeshyMessage, viewerUsername: String?) -> DigestInputMessage {
        DigestInputMessage(
            base: episodeInput(message),
            content: message.content,
            languageCode: message.originalLanguage,
            attachmentKinds: message.attachments.compactMap { DigestMediaKind(rawValue: $0.type.rawValue) },
            linkCount: message.trackedLinkMap.count,
            mentionsViewer: mentionsViewer(message: message, viewerUsername: viewerUsername)
        )
    }

    /// Voir doc de tête — sous-chaîne `@<username>` (insensible à la casse),
    /// jamais rien de plus. `nil`/vide ⇒ jamais de faux positif.
    private static func mentionsViewer(message: MeeshyMessage, viewerUsername: String?) -> Bool {
        guard let viewerUsername, !viewerUsername.isEmpty else { return false }
        return message.content.range(of: "@\(viewerUsername)", options: .caseInsensitive) != nil
    }

    /// `@MainActor` — override explicite du `nonisolated` par défaut de ce
    /// type : `PresenceManager.shared` est implicitement `@MainActor` (cible
    /// app, `SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor`, SE-0466 — même note
    /// d'isolation que `FocalMetrics.swift`).
    @MainActor
    private static func deriveParticipants(from messages: [MeeshyMessage]) -> [DigestParticipant] {
        var seen = Set<String>()
        var participants: [DigestParticipant] = []
        for message in messages where !seen.contains(message.senderId) {
            seen.insert(message.senderId)
            participants.append(
                DigestParticipant(
                    id: message.senderId,
                    displayName: message.senderName ?? message.senderUsername ?? message.senderId,
                    avatarURL: message.senderAvatarURL,
                    colorHex: message.senderColor ?? "#31B6BA",
                    presence: PresenceManager.shared.presenceState(for: message.senderId)
                )
            )
        }
        return participants
    }
}
