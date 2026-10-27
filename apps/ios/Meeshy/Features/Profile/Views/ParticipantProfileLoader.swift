import Foundation
import Combine
import MeeshySDK

// MARK: - La fiche d'un participant, ouverte depuis le cache (#10111)
//
// Même règle que la fiche d'un profil (#10093, `CacheFirst`) : ce que le cache garde se peint tout de suite, la
// synchronisation part dès l'ouverture, cache frais compris, et le chargement ne se montre que sur un cache vide. Un
// échec de synchronisation ne retire jamais la fiche. Le départ du participant (404) n'est pas une panne : c'est un
// fait de conversation, il efface la copie et la feuille le dit.

@MainActor
protocol ParticipantProfileDataProviding: AnyObject {
    func cachedProfile(for key: String) async -> CacheResult<[ConversationParticipantProfile]>
    func fetchProfile(conversationId: String, participantId: String) async throws -> ConversationParticipantProfile
    func storeProfile(_ profile: ConversationParticipantProfile, for key: String) async
    func invalidateProfile(for key: String) async
}

@MainActor
final class ParticipantProfileLoader: ObservableObject {
    @Published private(set) var profile: ConversationParticipantProfile?
    @Published private(set) var isLoading = false
    @Published private(set) var loadFailed = false
    @Published private(set) var hasLeft = false

    private let conversationId: String
    private let participantId: String
    private let data: ParticipantProfileDataProviding

    private var key: String { "\(conversationId)/\(participantId)" }

    init(conversationId: String, participantId: String, data: ParticipantProfileDataProviding? = nil) {
        self.conversationId = conversationId
        self.participantId = participantId
        self.data = data ?? LiveParticipantProfileData()
    }

    nonisolated deinit {}

    /// Ce que le cache garde, peint sans attendre le réseau.
    func paintFromCache() async {
        if let cached = CacheFirst.paintable(await data.cachedProfile(for: key)) {
            profile = cached
        }
        isLoading = profile == nil
    }

    /// Peint le cache, puis synchronise la fiche.
    func open() async {
        await paintFromCache()
        defer { isLoading = false }
        do {
            let fresh = try await data.fetchProfile(conversationId: conversationId, participantId: participantId)
            profile = fresh
            loadFailed = false
            hasLeft = false
            await data.storeProfile(fresh, for: key)
        } catch APIError.serverError(404, _) {
            // Le gateway ne rend 404 sur cette route que pour un participant qu'il ne sert plus : la copie gardée
            // décrirait quelqu'un qui n'est plus là.
            profile = nil
            hasLeft = true
            loadFailed = true
            await data.invalidateProfile(for: key)
        } catch {
            loadFailed = profile == nil
        }
    }

    /// Une écriture de l'hôte ou un événement temps réel a changé la fiche : on la repeint et le cache la garde.
    func update(_ mutate: (inout ConversationParticipantProfile) -> Void) async {
        guard var changed = profile else { return }
        mutate(&changed)
        profile = changed
        await data.storeProfile(changed, for: key)
    }
}

// MARK: - Le cache et le réseau réels

@MainActor
final class LiveParticipantProfileData: ParticipantProfileDataProviding {

    nonisolated deinit {}

    func cachedProfile(for key: String) async -> CacheResult<[ConversationParticipantProfile]> {
        await CacheCoordinator.shared.participantProfiles.load(for: key)
    }

    func fetchProfile(conversationId: String, participantId: String) async throws -> ConversationParticipantProfile {
        try await ConversationService.shared.getParticipantProfile(conversationId: conversationId, participantId: participantId)
    }

    func storeProfile(_ profile: ConversationParticipantProfile, for key: String) async {
        await bestEffort("participantProfileLoader.participantProfiles.save", category: .cache) { try await CacheCoordinator.shared.participantProfiles.save([profile], for: key) }
    }

    func invalidateProfile(for key: String) async {
        await CacheCoordinator.shared.participantProfiles.invalidate(for: key)
    }
}
