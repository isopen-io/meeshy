import Foundation
import os

// MARK: - Le calendrier des saisons, gardé HORS LIGNE (#10232)
//
// `GET /api/v1/me/game/seasons/calendar` → `{ success, data: { revision, seasons } }`, en-tête
// `ETag: "season-schedule-<revision>"`. La lecture est CONDITIONNELLE (`If-None-Match`) : un 304 garde la copie.
// La copie vit sur le disque (Caches), rangée avec sa révision et son ETag ; elle survit au redémarrage. Sans
// réseau ni copie : `SeasonSchedule.default` — la constante de `GameSeason`, jamais un vide, jamais une erreur.
//
// Un calendrier est le même pour tous : rien de la présence de quiconque, rien à purger à la déconnexion.
//
// Le transport est une couture ÉTROITE, comme `SyncDeltaClient` : `APIClientProviding` décode ou jette, ce qui
// fondrait le 304 dans les pannes. Une session SANS cache : c'est le magasin qui porte la revalidation, jamais
// `URLCache`.

/// Une requête part, des octets et une réponse HTTP reviennent.
public protocol GameSeasonScheduleTransporting: Sendable {
    func execute(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

public struct URLSessionGameSeasonScheduleTransport: GameSeasonScheduleTransporting {
    private let session: URLSession

    public init() {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        self.session = URLSession(configuration: config)
    }

    public func execute(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return (data, http)
    }
}

/// L'issue d'une relecture : le calendrier a changé, il est inchangé (304), ou le serveur n'a pas répondu
/// utilement (hors ligne, refus, corps illisible, pas de session) — la copie reste.
public enum GameSeasonScheduleRefresh: Sendable, Equatable {
    case updated
    case unchanged
    case unavailable
}

public protocol GameSeasonScheduleProviding: Sendable {
    /// Le calendrier connu à cet instant — lu sans attendre, la constante tant que rien n'est chargé.
    var current: SeasonSchedule { get }
    /// La copie disque d'abord (une fois), puis la relecture conditionnelle. Ne jette jamais.
    func load() async -> SeasonSchedule
}

public actor GameSeasonScheduleStore: GameSeasonScheduleProviding {
    public static let shared = GameSeasonScheduleStore()

    private struct Stored: Codable {
        let etag: String?
        let schedule: SeasonSchedule
    }

    private let fileURL: URL
    private let transport: any GameSeasonScheduleTransporting
    private let apiBaseURL: @Sendable () -> String
    private let bearerToken: @Sendable () -> String?
    private let snapshot = OSAllocatedUnfairLock<SeasonSchedule>(initialState: .default)
    private var etag: String?
    private var hasCopy = false
    private var primed = false
    private var inFlight: Task<GameSeasonScheduleRefresh, Never>?

    public init(
        fileURL: URL = GameSeasonScheduleStore.defaultFileURL,
        transport: any GameSeasonScheduleTransporting = URLSessionGameSeasonScheduleTransport(),
        apiBaseURL: @escaping @Sendable () -> String = { APIClient.shared.baseURL },
        bearerToken: @escaping @Sendable () -> String? = { APIClient.shared.authToken }
    ) {
        self.fileURL = fileURL
        self.transport = transport
        self.apiBaseURL = apiBaseURL
        self.bearerToken = bearerToken
    }

    public static var defaultFileURL: URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return caches.appendingPathComponent("meeshy-game-season-schedule", isDirectory: true)
            .appendingPathComponent("schedule.json")
    }

    public nonisolated var current: SeasonSchedule {
        snapshot.withLock { $0 }
    }

    public func load() async -> SeasonSchedule {
        primeFromDisk()
        _ = await refresh()
        return current
    }

    /// La relecture conditionnelle ; deux appels simultanés partagent la même requête.
    @discardableResult
    public func refresh() async -> GameSeasonScheduleRefresh {
        primeFromDisk()
        if let inFlight { return await inFlight.value }
        let validator = hasCopy ? (etag ?? current.etag) : nil
        let task = Task { await self.fetch(validator: validator) }
        inFlight = task
        let outcome = await task.value
        inFlight = nil
        return outcome
    }

    // MARK: Le réseau

    private func fetch(validator: String?) async -> GameSeasonScheduleRefresh {
        guard let token = bearerToken(), !token.isEmpty,
              let url = URL(string: MeEndpoint.gameSeasonCalendar.absoluteURLString(apiBaseURL: apiBaseURL())) else {
            return .unavailable
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        for (name, value) in await ClientInfoProvider.shared.buildHeaders() {
            request.setValue(value, forHTTPHeaderField: name)
        }
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let validator { request.setValue(validator, forHTTPHeaderField: "If-None-Match") }

        guard let (data, response) = try? await transport.execute(request) else { return .unavailable }
        if response.statusCode == 304 { return hasCopy ? .unchanged : .unavailable }
        guard (200...299).contains(response.statusCode),
              let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              envelope["success"] as? Bool == true,
              let raw = envelope["data"] as? [String: Any] else { return .unavailable }
        let schedule = SeasonSchedule.normalize(raw)
        // Un corps qui ne se lit pas comme un calendrier rend le repli : il ne remplace jamais une copie.
        guard schedule != .default || raw["revision"] as? Int == 0 else { return .unavailable }
        let served = response.value(forHTTPHeaderField: "ETag")
        if hasCopy && schedule == current && served == etag { return .unchanged }
        adopt(schedule, etag: served)
        persist(Stored(etag: served, schedule: schedule))
        return .updated
    }

    private func adopt(_ schedule: SeasonSchedule, etag: String?) {
        snapshot.withLock { $0 = schedule }
        self.etag = etag
        hasCopy = true
    }

    // MARK: Le disque

    private func primeFromDisk() {
        guard !primed else { return }
        primed = true
        guard let data = try? Data(contentsOf: fileURL),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        // La copie est RELUE par la loi : un fichier abîmé ou écrit par une version antérieure rend le repli.
        let schedule = SeasonSchedule.normalize(object["schedule"])
        guard schedule != .default else { return }
        adopt(schedule, etag: object["etag"] as? String)
    }

    private func persist(_ stored: Stored) {
        guard let data = try? JSONEncoder().encode(stored) else { return }
        let url = fileURL
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: [.atomic])
    }
}
