import Foundation
import Testing
@testable import MeeshySDK

/// Les routes et refus du jeu — comparés à la table PARTAGÉE (#9378), pas
/// recopiés une seconde fois : une route renommée côté TS rougit ici.
@Suite("Jeu Meeshy — routes et codes d'erreur")
struct GameRoutesTests {

    private static var sharedTypesURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("shared/types/game-routes.ts")
    }

    private static func source() throws -> String {
        try String(contentsOf: sharedTypesURL, encoding: .utf8)
    }

    /// Les valeurs entre apostrophes d'un bloc `export const NOM = { … } as const;`.
    private static func quotedValues(of constant: String, in source: String) throws -> [String: String] {
        let pattern = "export const \(constant) = \\{(.*?)\\} as const;"
        let regex = try NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators])
        let range = NSRange(source.startIndex..., in: source)
        let block = try #require(regex.firstMatch(in: source, range: range))
        let body = String(source[try #require(Range(block.range(at: 1), in: source))])
        let pair = try NSRegularExpression(pattern: "(\\w+):\\s*'([^']+)'")
        let bodyRange = NSRange(body.startIndex..., in: body)
        return Dictionary(uniqueKeysWithValues: pair.matches(in: body, range: bodyRange).compactMap { match in
            guard let key = Range(match.range(at: 1), in: body), let value = Range(match.range(at: 2), in: body) else { return nil }
            return (String(body[key]), String(body[value]))
        })
    }

    @Test("les routes Swift sont celles de GAME_ROUTES")
    func routesMatchTheSharedTable() throws {
        let shared = try Self.quotedValues(of: "GAME_ROUTES", in: Self.source())
        #expect(shared.count == 7)
        #expect(shared["engagement"] == GameRoutes.engagement)
        #expect(shared["mint"] == GameRoutes.mint)
        #expect(shared["missionReroll"] == GameRoutes.missionReroll)
        #expect(shared["chestClaim"] == GameRoutes.chestClaim)
        #expect(shared["flameFreezes"] == GameRoutes.flameFreezes)
        #expect(shared["flameRelight"] == GameRoutes.flameRelight)
        #expect(shared["guideSeen"] == GameRoutes.guideSeen)
    }

    @Test("les codes de refus Swift sont ceux de GAME_ERROR_CODES")
    func errorCodesMatchTheSharedTable() throws {
        let shared = try Self.quotedValues(of: "GAME_ERROR_CODES", in: Self.source())
        #expect(Set(shared.values) == Set(GameErrorCode.allCases.map(\.rawValue)))
    }

    @Test("les adresses typées complètent le préfixe public sans rien redéfinir")
    func endpointsPrefixTheSharedRoutes() {
        #expect(GameEndpoint.chestClaim.path == "/api/v1" + GameRoutes.chestClaim)
        #expect(GameEndpoint.flameFreezes.path == "/api/v1" + GameRoutes.flameFreezes)
        #expect(GameEndpoint.flameRelight.path == "/api/v1" + GameRoutes.flameRelight)
        #expect(GameEndpoint.guideSeen.path == "/api/v1" + GameRoutes.guideSeen)
        #expect(GameEndpoint.missionReroll(missionId: "m1").path == "/api/v1" + GameRoutes.missionRerollPath(missionId: "m1"))
    }

    @Test("les refus du jeu sont typés : l'écran sait POURQUOI")
    func rejectionsAreStructured() {
        for endpoint: GameEndpoint in [.chestClaim, .flameFreezes, .flameRelight, .guideSeen, .missionReroll(missionId: "m")] {
            #expect(endpoint.rejectionPolicy == .structured)
        }
    }
}
