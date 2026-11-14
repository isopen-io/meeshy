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

    /// `GET /relations/:userId` : échoue par défaut — la fiche garde alors sa proposition d'avant.
    var linkResult: Result<RelationLink, Error> = .failure(NSError(domain: "MockRelationsService", code: 404))
    var lowerResult: Result<RelationLink, Error>?
    /// Joué PENDANT l'appel de baisse, avant la réponse : le témoin y lit l'état optimiste.
    var lowerHook: (@Sendable () async -> Void)?

    struct LowerCall: Equatable {
        let userId: String
        let level: RelationLevel
    }

    var linksCallCount = 0
    var linkCallCount = 0
    var lowerCalls: [LowerCall] = []
    var configCallCount = 0
    var ritualCalls: [RitualCall] = []

    func ritualCallCount(_ phase: RelationRitualPhase) -> Int {
        ritualCalls.filter { $0.phase == phase }.count
    }

    func links() async throws -> [RelationLink] {
        linksCallCount += 1
        return try linksResult.get()
    }

    func link(userId: String) async throws -> RelationLink {
        linkCallCount += 1
        return try linkResult.get()
    }

    func lower(userId: String, to level: RelationLevel) async throws -> RelationLink {
        lowerCalls.append(LowerCall(userId: userId, level: level))
        await lowerHook?()
        guard let lowerResult else {
            return RelationLink(userId: userId, effectiveLevel: level, grantedByMe: level)
        }
        return try lowerResult.get()
    }

    func config() async throws -> RelationsConfig {
        configCallCount += 1
        return try configResult.get()
    }

    var nowPlayingResult: Result<[NowPlayingChanged], Error> = .success([])
    var nowPlayingCallCount = 0

    func nowPlaying() async throws -> [NowPlayingChanged] {
        nowPlayingCallCount += 1
        return try nowPlayingResult.get()
    }

    var sharedLocationsResult: Result<[SharedLocationChanged], Error> = .success([])
    var sharedLocationsBounds: [SharedLocationBounds?] = []

    func sharedLocations(within bounds: SharedLocationBounds?) async throws -> [SharedLocationChanged] {
        sharedLocationsBounds.append(bounds)
        return try sharedLocationsResult.get()
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
