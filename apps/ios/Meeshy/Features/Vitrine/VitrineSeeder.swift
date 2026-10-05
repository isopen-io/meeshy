#if DEBUG
import Foundation
import MeeshySDK

nonisolated enum VitrineSeederErreur: Error, Equatable {
    case listeRefusee
    case mediaAbsent(String)
}

/// Là où la vitrine écrit : les VRAIES bases de l'app en direct, des doublures en test.
@MainActor
protocol VitrineSeedTargets {
    func enregistrerConversations(_ conversations: [MeeshyConversation]) async throws
    func enregistrerMessages(_ messages: [APIMessage], langues: [String]) async throws
    func enregistrerProgression(_ progression: APIEngagementProgress, cle: String) async throws
    func fixerModeDeLecture(_ mode: ReadingModeOrchestrator.ConversationReadingMode, conversationId: String, userId: String)
    func enregistrerMedia(_ fichier: URL, genre: VitrineFixtures.Media.Genre, cle: String) async
    func enregistrerFil(_ posts: [FeedPost], cle: String) async throws
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

    func enregistrerMedia(_ fichier: URL, genre: VitrineFixtures.Media.Genre, cle: String) async {
        switch genre {
        case .image: await VitrineSeeder.remplacer(fichier, dans: CacheCoordinator.shared.images, cle: cle)
        case .audio: await VitrineSeeder.remplacer(fichier, dans: CacheCoordinator.shared.audio, cle: cle)
        }
    }

    func enregistrerFil(_ posts: [FeedPost], cle: String) async throws {
        try await CacheCoordinator.shared.feed.save(posts, for: cle)
    }
}

@MainActor
enum VitrineSeeder {
    static let cleDuFil = "main-feed"

    /// La clé sous laquelle les vues lisent un média (`CachedAsyncImage`, `AudioPlaybackManager`,
    /// l'atelier Imagine) : face à l'hôte mort, l'URL relative elle-même.
    static func cleDeCache(_ url: String) -> String {
        MeeshyConfig.resolveMediaURL(url)?.absoluteString ?? url
    }

    /// Un média resynthétisé garde son URL : le cache doit servir le NOUVEAU fichier. `seed` seul est
    /// idempotent et garderait l'ancien, que l'écran jouerait sous la durée et le karaoké du nouveau.
    static func remplacer(_ fichier: URL, dans store: DiskCacheStore, cle: String) async {
        await store.invalidate(for: cle)
        await store.seed(copyingLocalFile: fichier, for: cle)
    }

    /// AVANT la restauration de la session : ce que les racines lisent dès leur montage — les
    /// médias et le fil de l'iPad (#8922). Un média manquant arrête la vitrine : l'écran irait le
    /// chercher sur l'hôte mort et montrerait une vignette vide.
    static func remplirLesCaches(_ fixtures: VitrineFixtures, medias dossier: URL, dans cibles: some VitrineSeedTargets) async throws {
        for media in fixtures.medias {
            let fichier = dossier.appendingPathComponent(media.fichier)
            guard FileManager.default.fileExists(atPath: fichier.path) else { throw VitrineSeederErreur.mediaAbsent(media.fichier) }
            await cibles.enregistrerMedia(fichier, genre: media.genre, cle: cleDeCache(media.url))
        }
        let langues = [fixtures.lang]
        try await cibles.enregistrerFil(fixtures.posts.map { $0.toFeedPost(preferredLanguages: langues) }, cle: cleDuFil)
    }

    static func remplir(_ fixtures: VitrineFixtures, dans cibles: some VitrineSeedTargets) async throws {
        let userId = fixtures.lecteur.id
        try await cibles.enregistrerConversations(fixtures.conversationsServies())
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
