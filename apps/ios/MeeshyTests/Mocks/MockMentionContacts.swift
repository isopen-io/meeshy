import Foundation
import MeeshySDK
@testable import Meeshy

/// **Le magasin des contacts de la liste `@`, en double de test** (#7847).
///
/// `snapshot` est ce que la frappe sert à l'instant ; `cached` ce que le cache
/// rend sans réseau ; `refreshed` ce que le réchauffement rend. Les compteurs
/// répondent aux deux questions qu'on pose à cette couture : « le `@` a-t-il
/// réchauffé ? » et « combien de fois ? ».
@MainActor
final class MockMentionContacts: MentionContactsProviding {
    nonisolated deinit {}

    var snapshot: [MentionCandidate]
    var cached: [MentionCandidate]
    var refreshed: [MentionCandidate]?
    private(set) var loadCachedCallCount = 0
    private(set) var refreshCallCount = 0

    init(snapshot: [MentionCandidate] = [],
         cached: [MentionCandidate]? = nil,
         refreshed: [MentionCandidate]? = nil) {
        self.snapshot = snapshot
        self.cached = cached ?? snapshot
        self.refreshed = refreshed
    }

    func loadCached() async -> [MentionCandidate] {
        loadCachedCallCount += 1
        if snapshot.isEmpty { snapshot = cached }
        return snapshot
    }

    func refreshIfNeeded() async -> [MentionCandidate] {
        refreshCallCount += 1
        if let refreshed { snapshot = refreshed }
        return snapshot
    }
}
