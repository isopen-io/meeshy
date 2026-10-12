import Foundation
import MeeshySDK

/// Le troisième contrat du jeu (`GameArchiveServiceProviding`, #10018) : des résultats posés par le test, des appels comptés.
final class MockGameArchiveService: GameArchiveServiceProviding, @unchecked Sendable {
    private static var down: Error { URLError(.notConnectedToInternet) }

    var seasonResult: Result<GameSeasonArchive, Error> = .failure(down)
    var weekResult: Result<GameLeagueWeekArchive, Error> = .failure(down)

    private(set) var seasonCalls: [Int] = []
    private(set) var weekCalls: [String] = []

    func fetchSeasonArchive(number: Int) async throws -> GameSeasonArchive {
        seasonCalls.append(number)
        return try seasonResult.get()
    }

    func fetchLeagueWeekArchive(weekKey: String) async throws -> GameLeagueWeekArchive {
        weekCalls.append(weekKey)
        return try weekResult.get()
    }

    func reset() {
        seasonResult = .failure(Self.down)
        weekResult = .failure(Self.down)
        seasonCalls = []
        weekCalls = []
    }
}
