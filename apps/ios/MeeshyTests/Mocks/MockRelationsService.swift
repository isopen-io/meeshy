import Foundation
import MeeshySDK
@testable import Meeshy

final class MockRelationsService: RelationsProviding, @unchecked Sendable {
    init() {}

    struct RitualCall: Equatable {
        let userId: String
        let phase: RelationRitualPhase
        let token: String?
        let consents: RelationRitualConsents?
    }

    var linksResult: Result<[RelationLink], Error> = .success([])
    var configResult: Result<RelationsConfig, Error> = .success(RelationsConfig(levels: []))
    /// Une réponse par phase ; une phase non posée échoue, ce qui force le témoin à dire ce qu'il attend.
    var ritualResults: [RelationRitualPhase: Result<RelationRitualStep, Error>] = [:]

    var linksCallCount = 0
    var configCallCount = 0
    var ritualCalls: [RitualCall] = []

    func ritualCallCount(_ phase: RelationRitualPhase) -> Int {
        ritualCalls.filter { $0.phase == phase }.count
    }

    func links() async throws -> [RelationLink] {
        linksCallCount += 1
        return try linksResult.get()
    }

    func config() async throws -> RelationsConfig {
        configCallCount += 1
        return try configResult.get()
    }

    func ritual(
        userId: String,
        phase: RelationRitualPhase,
        token: String?,
        consents: RelationRitualConsents?
    ) async throws -> RelationRitualStep {
        ritualCalls.append(RitualCall(userId: userId, phase: phase, token: token, consents: consents))
        guard let result = ritualResults[phase] else {
            throw NSError(domain: "MockRelationsService", code: 0, userInfo: [NSLocalizedDescriptionKey: "phase non posée : \(phase)"])
        }
        return try result.get()
    }
}

final class FakeCirclePeople: CirclePeopleResolving, @unchecked Sendable {
    var directory: [String: CirclePerson]

    init(_ people: [CirclePerson] = []) {
        self.directory = Dictionary(uniqueKeysWithValues: people.map { ($0.id, $0) })
    }

    func people(for ids: [String]) async -> [String: CirclePerson] {
        directory.filter { ids.contains($0.key) }
    }
}
