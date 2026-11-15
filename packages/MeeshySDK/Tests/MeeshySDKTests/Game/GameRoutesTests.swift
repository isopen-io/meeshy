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

    /// Le chemin de l'adresse du CATALOGUE généré, sans le préfixe public : ce que `GAME_ROUTES` écrit.
    private static func publicPath(_ endpoint: any MeeshyEndpoint) -> String {
        let prefix = "/api/v1"
        return endpoint.path.hasPrefix(prefix) ? String(endpoint.path.dropFirst(prefix.count)) : endpoint.path
    }

    private static let mid = "65a1b2c3d4e5f60718293a4b"

    /// Chaque clé de `GAME_ROUTES`, avec l'adresse du catalogue généré qui la sert (segments variables remplis).
    private static func catalogRoutes() -> [(key: String, endpoint: any MeeshyEndpoint, params: [String: String])] {
        [
            ("engagement", MeEndpoint.engagement, [:]),
            ("mint", MeEndpoint.meeshMint, [:]),
            ("missionReroll", MeEndpoint.gameMissionReroll(missionId: mid), [":missionId": mid]),
            ("chestClaim", MeEndpoint.gameChestClaim, [:]),
            ("flameFreezes", MeEndpoint.gameFlameFreezes, [:]),
            ("flameRelight", MeEndpoint.gameFlameRelight, [:]),
            ("guideSeen", MeEndpoint.gameGuideSeen, [:]),
            ("leagueConsent", MeEndpoint.gameLeagueConsent, [:]),
            ("leaguePseudonym", MeEndpoint.gameLeaguePseudonym, [:]),
            ("leagueWeek", MeEndpoint.gameLeagueWeek, [:]),
            ("leagueFriends", MeEndpoint.gameLeagueFriends, [:]),
            ("duoInvite", MeEndpoint.gameDuoInvite, [:]),
            ("duoAccept", MeEndpoint.gameDuoAccept(duoId: mid), [":duoId": mid]),
            ("duoAbandon", MeEndpoint.gameDuoAbandon(duoId: mid), [":duoId": mid]),
            ("seasonClaim", MeEndpoint.gameSeasonClaim(step: 12), [":step": "12"]),
            ("seasonSeal", MeEndpoint.gameSeasonSeal, [:]),
            ("showcaseOrder", MeEndpoint.gameShowcaseOrder, [:]),
            ("showcaseVisibility", MeEndpoint.gameVisibility, [:]),
            ("userShowcase", UsersEndpoint.gameShowcaseOf(userId: mid), [":userId": mid]),
            ("prestige", MeEndpoint.gamePrestige, [:]),
            ("privacy", MeEndpoint.gamePrivacy, [:]),
        ]
    }

    private static func filled(_ template: String, _ params: [String: String]) -> String {
        params.reduce(template) { $0.replacingOccurrences(of: $1.key, with: $1.value) }
    }

    @Test("le catalogue généré sert, route pour route, les vingt et une entrées de GAME_ROUTES")
    func theCatalogServesEveryRouteOfTheSharedTable() throws {
        let shared = try Self.quotedValues(of: "GAME_ROUTES", in: Self.source())
        let routes = Self.catalogRoutes()
        #expect(shared.count == 21)
        #expect(Set(routes.map(\.key)) == Set(shared.keys), "une route ajoutée côté TS sans adresse du catalogue rougit ici")
        for route in routes {
            let template = try #require(shared[route.key], "GAME_ROUTES ne porte pas \(route.key)")
            #expect(Self.publicPath(route.endpoint) == Self.filled(template, route.params), "\(route.key)")
        }
    }

    @Test("les deux routes de lecture d'intégration sont celles de GAME_INTEGRATION_ROUTES, et GAME_ROUTES garde ses 21 entrées")
    func integrationRoutesMatchTheirOwnSharedTable() throws {
        let shared = try Self.quotedValues(of: "GAME_INTEGRATION_ROUTES", in: Self.source())
        #expect(shared.count == 2)
        #expect(shared["settings"] == "/me/game/privacy")
        #expect(Self.publicPath(MeEndpoint.gamePrivacy) == shared["settings"])
        #expect(Self.publicPath(UsersEndpoint.gameOf(userId: Self.mid))
            == shared["userGame"].map { Self.filled($0, [":userId": Self.mid]) })
        #expect(try Self.quotedValues(of: "GAME_ROUTES", in: Self.source()).count == 21)
    }

    @Test("le jeu d'un autre : l'identifiant est encodé dans son segment, et l'adresse lit sans écrire")
    func userGamePathEncodesItsSegment() {
        #expect(UsersEndpoint.gameOf(userId: "65a1b2c3d4e5f60718293a4b").path == "/api/v1/users/65a1b2c3d4e5f60718293a4b/game")
        #expect(UsersEndpoint.gameOf(userId: "../me?x=1").path == "/api/v1/users/%2E%2E%2Fme%3Fx%3D1/game")
        #expect(MeEndpoint.gamePrivacy.path == "/api/v1/me/game/privacy")
    }

    @Test("les identifiants des routes de la vague 2 sont encodés dans leur segment")
    func wave2PathsEncodeTheirSegment() {
        #expect(MeEndpoint.gameDuoAccept(duoId: "../x?y").path == "/api/v1/me/game/duo/%2E%2E%2Fx%3Fy/accept")
        #expect(MeEndpoint.gameDuoAbandon(duoId: "65a1b2c3d4e5f60718293a4b").path
            == "/api/v1/me/game/duo/65a1b2c3d4e5f60718293a4b/abandon")
        #expect(MeEndpoint.gameSeasonClaim(step: 12).path == "/api/v1/me/game/season/steps/12/claim")
        #expect(UsersEndpoint.gameShowcaseOf(userId: "a/b").path == "/api/v1/users/a%2Fb/game/showcase")
    }

    @Test("les codes de refus Swift sont ceux de GAME_ERROR_CODES")
    func errorCodesMatchTheSharedTable() throws {
        let shared = try Self.quotedValues(of: "GAME_ERROR_CODES", in: Self.source())
        #expect(Set(shared.values) == Set(GameErrorCode.allCases.map(\.rawValue)))
    }

    @Test("un identifiant de mission est encodé : aucun caractère ne sort de son segment")
    func missionIdIsEncodedIntoItsSegment() {
        #expect(MeEndpoint.gameMissionReroll(missionId: "../chest/claim?x=1#y").path
            == "/api/v1/me/game/missions/%2E%2E%2Fchest%2Fclaim%3Fx%3D1%23y/reroll")
        #expect(MeEndpoint.gameMissionReroll(missionId: "65a1b2c3d4e5f60718293a4b").path
            == "/api/v1/me/game/missions/65a1b2c3d4e5f60718293a4b/reroll")
    }

    @Test("les refus du jeu sont typés : l'écran sait POURQUOI")
    func rejectionsAreStructured() {
        let game: [any MeeshyEndpoint] = Self.catalogRoutes()
            .filter { $0.key != "engagement" && $0.key != "mint" }
            .map(\.endpoint) + [UsersEndpoint.gameOf(userId: "u")]
        #expect(game.count == 20)
        for endpoint in game {
            #expect(endpoint.rejectionPolicy == .structured, "\(endpoint.path)")
        }
    }

    @Test("le reste du catalogue garde ses refus opaques : le typage du jeu ne déborde pas")
    func otherEndpointsStayOpaque() {
        #expect(MeEndpoint.engagement.rejectionPolicy == .opaque)
        #expect(MeEndpoint.meeshMint.rejectionPolicy == .opaque)
        #expect(MeEndpoint.preferencesAudio.rejectionPolicy == .opaque)
        #expect(UsersEndpoint.me.rejectionPolicy == .opaque)
    }
}
