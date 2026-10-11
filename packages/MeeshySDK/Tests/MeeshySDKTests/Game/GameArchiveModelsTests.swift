import Foundation
import Testing
@testable import MeeshySDK

/// Ce qu'un lien du Jeu ouvre (#9947, #10018) — une saison n et une semaine de ligue, lues par
/// `GET /me/game/seasons/:number` et `GET /me/game/league/weeks/:weekKey`. Les modèles du SDK sont
/// confrontés au schéma Zod PARTAGÉ (`packages/shared/types/game-archive.ts`) : une clé ajoutée,
/// retirée ou renommée côté TypeScript rougit ici.
@Suite("Jeu Meeshy — les archives d'une saison et d'une semaine de ligue")
struct GameArchiveModelsTests {

    static let pastSeasonJSON = """
    {"number":1,"status":"past","themeKey":"language:fr","startDay":"2026-12-21","endDay":"2027-02-14",
     "weekKeys":["2026-12-21","2026-12-28","2027-01-04","2027-01-11","2027-01-18","2027-01-25","2027-02-01","2027-02-08"],
     "progress":{"stars":160,"steps":40,"claimedSteps":[1,2,3],"sealOwned":true,"completed":true,"settled":true}}
    """

    static let upcomingSeasonJSON = """
    {"number":2,"status":"upcoming","themeKey":"language:es","startDay":"2027-02-15","endDay":"2027-04-11",
     "weekKeys":["2027-02-15","2027-02-22","2027-03-01","2027-03-08","2027-03-15","2027-03-22","2027-03-29","2027-04-05"],
     "progress":null}
    """

    static let pastWeekJSON = """
    {"weekKey":"2026-10-12","status":"past","season":null,"retention":"kept",
     "result":{"league":"jade","finalRank":3,"finalPoints":410,"zone":"promotion","cup":"bronze","settled":true}}
    """

    static let purgedWeekJSON = """
    {"weekKey":"2026-10-12","status":"past","season":null,"retention":"purged","result":null}
    """

    private static func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    @Test("une saison passée se lit avec MA progression")
    func decodesPastSeason() throws {
        let season = try Self.decode(GameSeasonArchive.self, Self.pastSeasonJSON)
        #expect(season.number == 1)
        #expect(season.status == .past)
        #expect(season.weekKeys.count == 8)
        let progress = try #require(season.progress)
        #expect(progress.steps == 40)
        #expect(progress.completed)
        #expect(progress.sealOwned)
        #expect(progress.claimedSteps == [1, 2, 3])
    }

    @Test("une saison future se lit sans progression")
    func decodesUpcomingSeason() throws {
        let season = try Self.decode(GameSeasonArchive.self, Self.upcomingSeasonJSON)
        #expect(season.status == .upcoming)
        #expect(season.startDay == "2027-02-15")
        #expect(season.themeKey == "language:es")
        #expect(season.progress == nil)
    }

    @Test("une semaine passée se lit avec mon résultat gravé")
    func decodesPastWeek() throws {
        let week = try Self.decode(GameLeagueWeekArchive.self, Self.pastWeekJSON)
        #expect(week.status == .past)
        #expect(week.retention == .kept)
        #expect(week.season == nil)
        let result = try #require(week.result)
        #expect(result.league == .jade)
        #expect(result.finalRank == 3)
        #expect(result.zone == .promotion)
        #expect(result.cup == .bronze)
    }

    @Test("une semaine purgée le dit")
    func decodesPurgedWeek() throws {
        let week = try Self.decode(GameLeagueWeekArchive.self, Self.purgedWeekJSON)
        #expect(week.retention == .purged)
        #expect(week.result == nil)
    }

    @Test("un état inconnu d'un serveur plus récent n'est pas lu de travers")
    func rejectsUnknownStatus() {
        let json = Self.upcomingSeasonJSON.replacingOccurrences(of: "\"upcoming\"", with: "\"someday\"")
        #expect(throws: (any Error).self) { try Self.decode(GameSeasonArchive.self, json) }
    }

    // MARK: - Le témoin de contrat : les clés du schéma Zod partagé

    @Test("chaque modèle porte exactement les clés de son schéma Zod")
    func modelsMatchZodSchemas() throws {
        let source = try SharedArchiveSchema.source()
        let season = try Self.decode(GameSeasonArchive.self, Self.pastSeasonJSON)
        let week = try Self.decode(GameLeagueWeekArchive.self, Self.pastWeekJSON)
        #expect(try SharedArchiveSchema.keys(of: "gameSeasonArchiveSchema", in: source) == SharedArchiveSchema.encodedKeys(season))
        #expect(try SharedArchiveSchema.keys(of: "gameSeasonProgressArchiveSchema", in: source) == SharedArchiveSchema.encodedKeys(try #require(season.progress)))
        #expect(try SharedArchiveSchema.keys(of: "gameLeagueWeekArchiveSchema", in: source) == SharedArchiveSchema.encodedKeys(week))
        #expect(try SharedArchiveSchema.keys(of: "gameLeagueWeekResultSchema", in: source) == SharedArchiveSchema.encodedKeys(try #require(week.result)))
    }

    @Test("les états et les rétentions sont ceux du contrat")
    func enumsMatchContract() throws {
        let source = try SharedArchiveSchema.source()
        #expect(try SharedArchiveSchema.strings(of: "GAME_ARCHIVE_STATUSES", in: source) == GameArchiveStatus.allCases.map(\.rawValue))
        #expect(try SharedArchiveSchema.strings(of: "GAME_ARCHIVE_RETENTIONS", in: source) == GameArchiveRetention.allCases.map(\.rawValue))
    }

    @Test("les chemins du catalogue sont ceux de la table partagée")
    func pathsMatchSharedRoutes() throws {
        let source = try SharedArchiveSchema.source()
        #expect(source.contains("season: '/me/game/seasons/:number'"))
        #expect(source.contains("leagueWeek: '/me/game/league/weeks/:weekKey'"))
        #expect(MeEndpoint.gameSeasonArchive(number: 3).path == "/api/v1/me/game/seasons/3")
        #expect(MeEndpoint.gameLeagueWeekArchive(weekKey: "2026-10-12").path == "/api/v1/me/game/league/weeks/2026-10-12")
        #expect(MeEndpoint.gameLeagueWeekArchive(weekKey: "../x").path == "/api/v1/me/game/league/weeks/%2E%2E%2Fx")
    }

    @Test("une copie « à venir » gardée hors ligne bascule d'elle-même le jour de son ouverture (#10131)")
    func upcomingCopyTurnsCurrentOnOpeningDay() throws {
        let copy = try Self.decode(GameSeasonArchive.self, Self.upcomingSeasonJSON)
        #expect(copy.liveStatus(at: LeagueMoment(dayKey: "2027-02-14", minuteOfDay: 1199)) == .upcoming)
        #expect(copy.liveStatus(at: LeagueMoment(dayKey: "2027-02-14", minuteOfDay: 1200)) == .current)
        #expect(copy.liveStatus(at: LeagueMoment(dayKey: "2027-02-15", minuteOfDay: 600)) == .current)
        #expect(copy.liveStatus(at: LeagueMoment(dayKey: "2027-05-01", minuteOfDay: 0)) == .past)
    }

    @Test("une horloge en retard ne fait jamais reculer l'état servi (#10131)")
    func lateClockNeverRewinds() throws {
        let past = try Self.decode(GameSeasonArchive.self, Self.pastSeasonJSON)
        #expect(past.liveStatus(at: LeagueMoment(dayKey: "2026-12-01", minuteOfDay: 0)) == .past)
    }

    @Test("l'instant local : le jour civil et la minute depuis minuit, dans le calendrier donné (#10131)")
    func localMomentReadsTheCalendar() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "Europe/Paris"))
        let date = try #require(ISO8601DateFormatter().date(from: "2027-02-14T19:05:00Z"))
        #expect(LeagueMoment.local(date, calendar: calendar) == LeagueMoment(dayKey: "2027-02-14", minuteOfDay: 20 * 60 + 5))
    }

}

/// Lecture du contrat que la passerelle valide : `packages/shared/types/game-archive.ts` (les schémas Zod) et
/// `game-archive-routes.ts` (sa partie sans Zod : routes, états, rétentions).
private enum SharedArchiveSchema {
    static func source() throws -> String {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        let types = url.appendingPathComponent("shared/types")
        return try ["game-archive.ts", "game-archive-routes.ts"]
            .map { try String(contentsOf: types.appendingPathComponent($0), encoding: .utf8) }
            .joined(separator: "\n")
    }

    /// Les clés de premier niveau d'un `export const NOM = z.object({ … })`.
    static func keys(of schema: String, in source: String) throws -> Set<String> {
        let pattern = "export const \(schema) = z\\s*\\.object\\(\\{(.*?)\\n  \\}\\)"
        let regex = try NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators])
        let match = try #require(regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)))
        let body = String(source[try #require(Range(match.range(at: 1), in: source))])
        let key = try NSRegularExpression(pattern: "^    (\\w+):", options: [.anchorsMatchLines])
        return Set(key.matches(in: body, range: NSRange(body.startIndex..., in: body)).compactMap { m in
            Range(m.range(at: 1), in: body).map { String(body[$0]) }
        })
    }

    /// Les chaînes d'un `export const NOM = ['a', 'b'] as const;`, dans l'ordre.
    static func strings(of constant: String, in source: String) throws -> [String] {
        let regex = try NSRegularExpression(pattern: "export const \(constant) = \\[(.*?)\\] as const;")
        let match = try #require(regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)))
        let body = String(source[try #require(Range(match.range(at: 1), in: source))])
        return body.split(separator: ",").map { $0.trimmingCharacters(in: CharacterSet(charactersIn: " '")) }
    }

    /// Les clés qu'un modèle ENCODE — `null` compris (un `nil` doit sortir comme clé).
    static func encodedKeys<T: Encodable>(_ value: T) throws -> Set<String> {
        let object = try JSONSerialization.jsonObject(with: try JSONEncoder().encode(value)) as? [String: Any]
        return Set(try #require(object).keys)
    }
}
