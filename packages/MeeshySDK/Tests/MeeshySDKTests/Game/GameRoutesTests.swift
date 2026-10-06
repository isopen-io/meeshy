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
        #expect(shared.count == 21)
        #expect(shared["engagement"] == GameRoutes.engagement)
        #expect(shared["mint"] == GameRoutes.mint)
        #expect(shared["missionReroll"] == GameRoutes.missionReroll)
        #expect(shared["chestClaim"] == GameRoutes.chestClaim)
        #expect(shared["flameFreezes"] == GameRoutes.flameFreezes)
        #expect(shared["flameRelight"] == GameRoutes.flameRelight)
        #expect(shared["guideSeen"] == GameRoutes.guideSeen)
    }

    @Test("les quatorze routes de la vague 2 sont celles de GAME_ROUTES")
    func wave2RoutesMatchTheSharedTable() throws {
        let shared = try Self.quotedValues(of: "GAME_ROUTES", in: Self.source())
        #expect(shared["leagueConsent"] == GameRoutes.leagueConsent)
        #expect(shared["leaguePseudonym"] == GameRoutes.leaguePseudonym)
        #expect(shared["leagueWeek"] == GameRoutes.leagueWeek)
        #expect(shared["leagueFriends"] == GameRoutes.leagueFriends)
        #expect(shared["duoInvite"] == GameRoutes.duoInvite)
        #expect(shared["duoAccept"] == GameRoutes.duoAccept)
        #expect(shared["duoAbandon"] == GameRoutes.duoAbandon)
        #expect(shared["seasonClaim"] == GameRoutes.seasonClaim)
        #expect(shared["seasonSeal"] == GameRoutes.seasonSeal)
        #expect(shared["showcaseOrder"] == GameRoutes.showcaseOrder)
        #expect(shared["showcaseVisibility"] == GameRoutes.showcaseVisibility)
        #expect(shared["userShowcase"] == GameRoutes.userShowcase)
        #expect(shared["prestige"] == GameRoutes.prestige)
        #expect(shared["privacy"] == GameRoutes.privacy)
    }

    @Test("les deux routes de lecture d'intégration sont celles de GAME_INTEGRATION_ROUTES, et GAME_ROUTES garde ses 21 entrées")
    func integrationRoutesMatchTheirOwnSharedTable() throws {
        let shared = try Self.quotedValues(of: "GAME_INTEGRATION_ROUTES", in: Self.source())
        #expect(shared.count == 2)
        #expect(shared["settings"] == GameIntegrationRoutes.settings)
        #expect(shared["userGame"] == GameIntegrationRoutes.userGame)
        #expect(GameIntegrationRoutes.settings == GameRoutes.privacy, "la lecture porte le chemin de l'écriture")
        #expect(try Self.quotedValues(of: "GAME_ROUTES", in: Self.source()).count == 21)
    }

    @Test("le jeu d'un autre : l'identifiant est encodé dans son segment, et l'adresse lit sans écrire")
    func userGamePathEncodesItsSegment() {
        #expect(GameEndpoint.userGame(userId: "65a1b2c3d4e5f60718293a4b").path == "/api/v1/users/65a1b2c3d4e5f60718293a4b/game")
        #expect(GameEndpoint.userGame(userId: "../me?x=1").path == "/api/v1/users/%2E%2E%2Fme%3Fx%3D1/game")
        #expect(GameEndpoint.settings.path == "/api/v1/me/game/privacy")
        #expect(GameEndpoint.settings.rejectionPolicy == .structured)
    }

    @Test("les identifiants des routes de la vague 2 sont encodés dans leur segment")
    func wave2PathsEncodeTheirSegment() {
        #expect(GameEndpoint.duoAccept(duoId: "../x?y").path == "/api/v1/me/game/duo/%2E%2E%2Fx%3Fy/accept")
        #expect(GameEndpoint.duoAbandon(duoId: "65a1b2c3d4e5f60718293a4b").path
            == "/api/v1/me/game/duo/65a1b2c3d4e5f60718293a4b/abandon")
        #expect(GameEndpoint.seasonClaim(step: 12).path == "/api/v1/me/game/season/steps/12/claim")
        #expect(GameEndpoint.userShowcase(userId: "a/b").path == "/api/v1/users/a%2Fb/game/showcase")
    }

    @Test("les codes de refus Swift sont ceux de GAME_ERROR_CODES")
    func errorCodesMatchTheSharedTable() throws {
        let shared = try Self.quotedValues(of: "GAME_ERROR_CODES", in: Self.source())
        #expect(Set(shared.values) == Set(GameErrorCode.allCases.map(\.rawValue)))
    }

    @Test("un identifiant de mission est encodé : aucun caractère ne sort de son segment")
    func missionIdIsEncodedIntoItsSegment() {
        #expect(GameEndpoint.missionReroll(missionId: "../chest/claim?x=1#y").path
            == "/api/v1/me/game/missions/%2E%2E%2Fchest%2Fclaim%3Fx%3D1%23y/reroll")
        #expect(GameEndpoint.missionReroll(missionId: "65a1b2c3d4e5f60718293a4b").path
            == "/api/v1/me/game/missions/65a1b2c3d4e5f60718293a4b/reroll")
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
        for endpoint: GameEndpoint in [.chestClaim, .flameFreezes, .flameRelight, .guideSeen, .missionReroll(missionId: "m"),
                                       .leagueConsent, .leaguePseudonym, .leagueWeek, .leagueFriends, .duoInvite,
                                       .duoAccept(duoId: "d"), .duoAbandon(duoId: "d"), .seasonClaim(step: 1), .seasonSeal,
                                       .showcaseOrder, .showcaseVisibility, .userShowcase(userId: "u"), .prestige, .privacy] {
            #expect(endpoint.rejectionPolicy == .structured)
        }
    }
}
