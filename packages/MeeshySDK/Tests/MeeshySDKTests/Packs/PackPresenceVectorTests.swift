import Foundation
import Testing
@testable import MeeshySDK

/// Rejeu iOS de `packages/shared/design/packs/presence-vectors.json`, la présence
/// d'un pack sur l'appareil (#10148, § 5.10.6) : le MÊME fichier que le web
/// rejoue, lu, jamais copié.
@Suite("Packs — la présence rejouée sur les vecteurs partagés")
struct PackPresenceVectorTests {

    private struct Vector: Decodable {
        let name: String
        let from: PackPresence
        let event: PackPresenceEvent
        let context: PackPresenceContext
        let to: PackPresence
        let effects: [PackPresenceEffect]
    }

    private struct Vectors: Decodable {
        let vectors: [Vector]
    }

    /// `packages/MeeshySDK/Tests/MeeshySDKTests/Packs/…` : **5** composants à retirer pour atteindre `packages/`.
    private static var vectorsURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("shared/design/packs/presence-vectors.json")
    }

    private static func load() throws -> [Vector] {
        try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: vectorsURL)).vectors
    }

    @Test("chaque transition rend l'état et les effets ordonnés des vecteurs")
    func everyTransitionMatches() throws {
        let vectors = try Self.load()
        #expect(vectors.count > 30)
        let failures = vectors.compactMap { vector -> String? in
            let actual = PackPresenceMachine.transition(vector.from, on: vector.event, in: vector.context)
            guard actual.presence != vector.to || actual.effects != vector.effects else { return nil }
            return "« \(vector.name) » : \(actual.presence) \(actual.effects.map(\.rawValue))"
        }
        #expect(failures.isEmpty, "\(failures.count) transition(s) divergente(s) :\n\(failures.joined(separator: "\n"))")
    }

    @Test("seuls ready et stale se peignent")
    func onlyReadyAndStalePaint() {
        #expect(PackPresence.ready(version: 1).isPaintable)
        #expect(PackPresence.stale(version: 1, next: 2).isPaintable)
        #expect(!PackPresence.absent.isPaintable)
        #expect(!PackPresence.queued(.wifi).isPaintable)
        #expect(!PackPresence.downloading(doneBytes: 1, totalBytes: 2).isPaintable)
        #expect(!PackPresence.failed(.integrity, retryAt: .nextSession).isPaintable)
    }

    @Test("un pack peint ne cesse de l'être que par un retrait")
    func paintedPackStaysPaintedUnlessRemoved() throws {
        let lost = try Self.load().filter { vector in
            guard vector.from.isPaintable, !vector.to.isPaintable else { return false }
            if case .remove = vector.event { return false }
            return true
        }
        #expect(lost.map(\.name).isEmpty)
    }

    @Test("une présence illisible ne se décode pas — fail-closed")
    func invalidPresenceIsRejected() {
        let invalid = [
            #"{"state":"downloading","doneBytes":3,"totalBytes":2}"#,
            #"{"state":"stale","version":2,"next":2}"#,
            #"{"state":"ready","version":0}"#,
            #"{"state":"queued","reason":"later"}"#,
            #"{"state":"gone"}"#,
        ]
        for json in invalid {
            #expect(throws: (any Error).self, "\(json)") { try JSONDecoder().decode(PackPresence.self, from: Data(json.utf8)) }
        }
    }

    @Test("une présence s'encode et se relit à l'identique")
    func presenceRoundTrips() throws {
        let presences: [PackPresence] = [
            .absent, .queued(.user), .downloading(doneBytes: 800, totalBytes: 2000),
            .ready(version: 2), .stale(version: 1, next: 3), .failed(.space, retryAt: .spaceFreed),
        ]
        for presence in presences {
            let data = try JSONEncoder().encode(presence)
            #expect(try JSONDecoder().decode(PackPresence.self, from: data) == presence)
        }
    }
}
