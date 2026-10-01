#if DEBUG
import Foundation
import MeeshySDK

nonisolated enum VitrineSeederErreur: Error, Equatable {
    case listeRefusee
}

/// Là où la vitrine écrit : les VRAIES bases de l'app en direct, des doublures en test.
@MainActor
protocol VitrineSeedTargets {
    func enregistrerConversations(_ conversations: [MeeshyConversation]) async throws
    func enregistrerMessages(_ messages: [APIMessage], langues: [String]) async throws
    func enregistrerProgression(_ progression: APIEngagementProgress, cle: String) async throws
    func fixerModeDeLecture(_ mode: ReadingModeOrchestrator.ConversationReadingMode, conversationId: String, userId: String)
}

/// Les écritures EXISTANTES de l'app — celles qu'emprunte le réseau réel. La liste passe par le
/// point d'écriture réconcilié du moteur de synchronisation, comme après un `fullSync`.
@MainActor
struct VitrineSeedTargetsReels: VitrineSeedTargets {
    func enregistrerConversations(_ conversations: [MeeshyConversation]) async throws {
        guard await ConversationSyncEngine.shared.debugVitrineSaveList(conversations) else {
            throw VitrineSeederErreur.listeRefusee
        }
    }

    func enregistrerMessages(_ messages: [APIMessage], langues: [String]) async throws {
        try await DependencyContainer.shared.messagePersistence.upsertFromAPIMessages(messages, preferredLanguages: langues)
    }

    func enregistrerProgression(_ progression: APIEngagementProgress, cle: String) async throws {
        try await CacheCoordinator.shared.engagementProgress.save([progression], for: cle)
    }

    func fixerModeDeLecture(_ mode: ReadingModeOrchestrator.ConversationReadingMode, conversationId: String, userId: String) {
        ReadingModePreferenceStore().setMode(mode, for: conversationId, scope: .registered(userId: userId))
    }
}

@MainActor
enum VitrineSeeder {
    static func remplir(_ fixtures: VitrineFixtures, dans cibles: some VitrineSeedTargets) async throws {
        let userId = fixtures.lecteur.id
        try await cibles.enregistrerConversations(fixtures.conversations.map { $0.toConversation(currentUserId: userId) })
        for conversationId in fixtures.messages.keys.sorted() {
            try await cibles.enregistrerMessages(fixtures.messages[conversationId] ?? [], langues: [fixtures.lang])
        }
        try await cibles.enregistrerProgression(fixtures.progression, cle: "engagement:\(userId)")
        for (conversationId, brut) in fixtures.modesDeLecture.sorted(by: { $0.key < $1.key }) {
            guard let mode = ReadingModeOrchestrator.ConversationReadingMode(rawValue: brut) else { continue }
            cibles.fixerModeDeLecture(mode, conversationId: conversationId, userId: userId)
        }
    }
}
#endif
