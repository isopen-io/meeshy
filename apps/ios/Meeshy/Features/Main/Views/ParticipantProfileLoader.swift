import Foundation
import Combine
import MeeshySDK

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

    private let data: ParticipantProfileDataProviding

    init(conversationId: String, participantId: String, data: ParticipantProfileDataProviding) {
        self.data = data
    }

    nonisolated deinit {}

    func paintFromCache() async {}
    func open() async {}
    func update(_ mutate: (inout ConversationParticipantProfile) -> Void) async {}
}
