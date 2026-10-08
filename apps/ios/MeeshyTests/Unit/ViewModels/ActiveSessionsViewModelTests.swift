import XCTest
@testable import Meeshy
import MeeshySDK

/// Sécurité > Sessions (#9612) — le contrat de `ActiveSessionsViewModel` :
/// cache-first (la liste connue d'abord, le serveur ensuite, en silence),
/// révocation optimiste avec retour arrière, jamais la session courante, et
/// l'attribution du lieu que la licence DB-IP exige.
@MainActor
final class ActiveSessionsViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        service: MockSessionService? = nil,
        cache: InMemorySessionsCache? = nil,
        isOnline: Bool = true
    ) -> (sut: ActiveSessionsViewModel, service: MockSessionService) {
        let svc = service ?? MockSessionService()
        let sut = ActiveSessionsViewModel(
            sessionService: svc,
            cacheProvider: { cache },
            networkMonitor: FakeNetworkMonitor(isOnline: isOnline)
        )
        return (sut, svc)
    }

    private static func makeSession(
        id: String,
        deviceName: String? = "iPhone",
        isCurrent: Bool = false,
        lastActivityAt: String? = nil,
        extra: String = ""
    ) -> UserSession {
        let name = deviceName.map { "\"\($0)\"" } ?? "null"
        let last = lastActivityAt.map { "\"\($0)\"" } ?? "null"
        return JSONStub.decode("""
        {
          "id": "\(id)",
          "deviceName": \(name),
          "ipAddress": "10.0.0.1",
          "lastActivityAt": \(last),
          "createdAt": "2026-01-01T00:00:00.000Z",
          "isCurrentSession": \(isCurrent)\(extra)
        }
        """)
    }

    // MARK: - loadSessions

    func test_loadSessions_success_populatesSessions_andMarksLoaded() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([
            Self.makeSession(id: "s1", isCurrent: true),
            Self.makeSession(id: "s2")
        ])

        await sut.loadSessions()

        XCTAssertEqual(sut.sessions.map(\.id), ["s1", "s2"])
        XCTAssertEqual(sut.loadState, .loaded)
        XCTAssertFalse(sut.showError, "le chargement ne lève plus d'alerte : l'écran dessine ses états")
        XCTAssertEqual(mock.listSessionsCallCount, 1)
    }

    func test_loadSessions_failureOnline_drawsTheErrorState() async {
        let (sut, mock) = makeSUT(isOnline: true)
        mock.listSessionsResult = .failure(URLError(.timedOut))

        await sut.loadSessions()

        guard case .error(let message) = sut.loadState else {
            return XCTFail("attendu .error, obtenu \(sut.loadState)")
        }
        XCTAssertFalse(message.isEmpty)
        XCTAssertTrue(sut.sessions.isEmpty)
    }

    func test_loadSessions_failureOffline_drawsTheOfflineState() async {
        let (sut, mock) = makeSUT(isOnline: false)
        mock.listSessionsResult = .failure(URLError(.notConnectedToInternet))

        await sut.loadSessions()

        XCTAssertEqual(sut.loadState, .offline)
        XCTAssertTrue(sut.sessions.isEmpty)
    }

    // MARK: - Cache-first

    /// La liste connue s'affiche SANS attendre le réseau — et reste lisible
    /// hors ligne : jamais un écran vide quand le cache a des données.
    func test_loadSessions_offline_keepsTheCachedList() async {
        let cache = InMemorySessionsCache(seed: [
            Self.makeSession(id: "s2"),
            Self.makeSession(id: "s1", isCurrent: true)
        ])
        let (sut, mock) = makeSUT(cache: cache, isOnline: false)
        mock.listSessionsResult = .failure(URLError(.notConnectedToInternet))

        await sut.loadSessions()

        XCTAssertEqual(sut.sessions.map(\.id), ["s1", "s2"], "la courante en tête, même tirée du cache")
        XCTAssertEqual(sut.loadState, .offline)
    }

    func test_loadSessions_withCache_revalidatesSilently_andSavesTheServedList() async {
        let cache = InMemorySessionsCache(seed: [Self.makeSession(id: "old", isCurrent: true)])
        let (sut, mock) = makeSUT(cache: cache)
        mock.listSessionsResult = .success([Self.makeSession(id: "s1", isCurrent: true), Self.makeSession(id: "s2")])

        await sut.loadSessions()

        XCTAssertEqual(sut.sessions.map(\.id), ["s1", "s2"])
        XCTAssertEqual(sut.loadState, .loaded)
        let stored = await cache.stored()
        XCTAssertEqual(stored?.map(\.id), ["s1", "s2"])
    }

    // MARK: - Ordre

    func test_ordered_putsTheCurrentFirst_thenTheMostRecentlyActive() {
        let ordered = ActiveSessionsViewModel.ordered([
            Self.makeSession(id: "ancienne", lastActivityAt: "2026-09-01T00:00:00.000Z"),
            Self.makeSession(id: "recente", lastActivityAt: "2026-10-07T00:00:00.000Z"),
            Self.makeSession(id: "courante", isCurrent: true, lastActivityAt: "2026-08-01T00:00:00.000Z")
        ])

        XCTAssertEqual(ordered.map(\.id), ["courante", "recente", "ancienne"])
    }

    // MARK: - Attribution du lieu (CC-BY DB-IP)

    func test_attribution_isTheServedOne_andDefaultsToDBIP() async {
        let (sut, mock) = makeSUT()
        XCTAssertEqual(sut.attribution, .dbIP, "une liste tirée du cache a été servie avec la même attribution")
        let served = GeolocationAttribution(provider: "DB-IP", text: "IP Geolocation by DB-IP", url: "https://db-ip.com/", license: "CC-BY-4.0", approximate: true)
        mock.geolocation = served
        mock.listSessionsResult = .success([Self.makeSession(id: "s1", isCurrent: true, extra: #", "city": "Lyon", "country": "FR""#)])

        await sut.loadSessions()

        XCTAssertEqual(sut.attribution, served)
        XCTAssertTrue(sut.showsGeolocation, "un lieu est montré : l'attribution est due")
    }

    func test_showsGeolocation_isFalseWithoutAnyPlace() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([Self.makeSession(id: "s1", isCurrent: true)])

        await sut.loadSessions()

        XCTAssertFalse(sut.showsGeolocation)
    }

    // MARK: - revokeSession

    func test_revokeSession_success_removesSessionFromList_andPersists() async {
        let cache = InMemorySessionsCache()
        let (sut, mock) = makeSUT(cache: cache)
        mock.listSessionsResult = .success([
            Self.makeSession(id: "s1", isCurrent: true),
            Self.makeSession(id: "s2"),
            Self.makeSession(id: "s3")
        ])
        await sut.loadSessions()

        await sut.revokeSession(sessionId: "s2")

        XCTAssertEqual(sut.sessions.map(\.id), ["s1", "s3"])
        XCTAssertEqual(mock.revokeSessionCallCount, 1)
        XCTAssertEqual(mock.lastRevokedSessionId, "s2")
        XCTAssertFalse(sut.isRevoking)
        let stored = await cache.stored()
        XCTAssertEqual(stored?.map(\.id), ["s1", "s3"], "le cache ne doit pas rendre l'appareil déconnecté à la prochaine ouverture")
    }

    func test_revokeSession_failure_rollsBack_andSetsErrorState() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([Self.makeSession(id: "s1", isCurrent: true), Self.makeSession(id: "s2")])
        await sut.loadSessions()
        mock.revokeSessionResult = .failure(URLError(.timedOut))

        await sut.revokeSession(sessionId: "s2")

        XCTAssertEqual(sut.sessions.map(\.id), ["s1", "s2"], "la ligne retirée de façon optimiste revient")
        XCTAssertTrue(sut.showError)
        XCTAssertFalse(sut.isRevoking)
    }

    /// La session courante ne se ferme jamais d'ici — se déconnecter passe par
    /// Réglages, avec son propre nettoyage.
    func test_revokeSession_neverTouchesTheCurrentSession() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([Self.makeSession(id: "s1", isCurrent: true)])
        await sut.loadSessions()

        await sut.revokeSession(sessionId: "s1")
        sut.requestRevoke(sut.sessions[0])

        XCTAssertEqual(mock.revokeSessionCallCount, 0)
        XCTAssertNil(sut.pendingRevocation)
        XCTAssertEqual(sut.sessions.map(\.id), ["s1"])
    }

    /// Le geste DEMANDE ; rien ne part avant la confirmation.
    func test_requestRevoke_asksForConfirmation_withoutCallingTheServer() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([Self.makeSession(id: "s1", isCurrent: true), Self.makeSession(id: "s2")])
        await sut.loadSessions()

        sut.requestRevoke(sut.sessions[1])

        XCTAssertEqual(sut.pendingRevocation?.id, "s2")
        XCTAssertEqual(mock.revokeSessionCallCount, 0)
    }

    // MARK: - revokeAllOtherSessions

    func test_revokeAllOtherSessions_success_keepsOnlyCurrentSession() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([
            Self.makeSession(id: "s1", isCurrent: true),
            Self.makeSession(id: "s2"),
            Self.makeSession(id: "s3")
        ])
        await sut.loadSessions()

        await sut.revokeAllOtherSessions()

        XCTAssertEqual(sut.sessions.map(\.id), ["s1"])
        XCTAssertEqual(mock.revokeAllOtherSessionsCallCount, 1)
        XCTAssertFalse(sut.isRevoking)
    }

    func test_revokeAllOtherSessions_failure_rollsBack_andSetsErrorState() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([Self.makeSession(id: "s1", isCurrent: true), Self.makeSession(id: "s2")])
        await sut.loadSessions()
        mock.revokeAllOtherSessionsResult = .failure(URLError(.timedOut))

        await sut.revokeAllOtherSessions()

        XCTAssertEqual(sut.sessions.count, 2)
        XCTAssertTrue(sut.showError)
        XCTAssertFalse(sut.isRevoking)
    }

    func test_requestRevokeAll_withoutOtherSessions_asksNothing() async {
        let (sut, mock) = makeSUT()
        mock.listSessionsResult = .success([Self.makeSession(id: "s1", isCurrent: true)])
        await sut.loadSessions()

        sut.requestRevokeAll()

        XCTAssertFalse(sut.isConfirmingRevokeAll)
    }

    // MARK: - dependency injection contract

    func test_init_acceptsServiceInjection_doesNotForceSingleton() {
        let vm = ActiveSessionsViewModel(sessionService: MockSessionService(), cacheProvider: { nil })
        XCTAssertNotNil(vm)
    }
}

// MARK: - Ce qu'une ligne dit d'une session

@MainActor
final class SessionRowPresentationTests: XCTestCase {

    private static func session(_ extra: String, isCurrent: Bool = false) -> UserSession {
        JSONStub.decode("""
        { "id": "s1", "createdAt": "2026-10-01T08:00:00.000Z", "isCurrentSession": \(isCurrent)\(extra) }
        """)
    }

    func test_title_isTheServedName() {
        XCTAssertEqual(SessionRowPresentation.title(of: Self.session(#", "deviceName": "iPhone 15 Pro""#)), "iPhone 15 Pro")
    }

    /// Une session d'un ancien client n'a que le modèle : le nom s'en déduit,
    /// jamais l'identifiant brut (« iPhone16,1 », #6355).
    func test_title_isDerivedFromTheModel_whenNoNameIsServed() {
        XCTAssertEqual(SessionRowPresentation.title(of: Self.session(#", "deviceModel": "iPhone16,1""#)), "iPhone 15 Pro")
    }

    func test_title_fallsBackToUnknownDevice() {
        XCTAssertFalse(SessionRowPresentation.title(of: Self.session("")).isEmpty)
    }

    func test_software_saysVersionBuildAndSystem() throws {
        let row = SessionRowPresentation(Self.session(
            #", "appVersion": "1.2.0", "appBuild": "1874", "platform": "ios", "osName": "iOS", "osVersion": "18.2""#
        ))
        let software = try XCTUnwrap(row.software)
        XCTAssertTrue(software.contains("Meeshy 1.2.0 (1874)"), software)
        XCTAssertTrue(software.contains("iOS 18.2"), software)
    }

    func test_software_ofAWebSession_namesTheBrowser() throws {
        let row = SessionRowPresentation(Self.session(
            #", "platform": "web", "browserName": "Chrome", "browserVersion": "129.0.6668.70", "osName": "macOS""#
        ))
        let software = try XCTUnwrap(row.software)
        XCTAssertTrue(software.contains("Chrome 129"), software)
        XCTAssertTrue(software.contains("macOS"), software)
    }

    func test_place_carriesTheApproximateCityAndTheAddress() throws {
        let row = SessionRowPresentation(
            Self.session(#", "city": "Lyon", "country": "FR", "ipAddress": "203.0.113.4""#),
            locale: Locale(identifier: "fr_FR")
        )
        let place = try XCTUnwrap(row.place)
        XCTAssertTrue(place.contains("Lyon"), place)
        XCTAssertTrue(place.contains("France"), "le pays se dit par son nom, pas par son code : \(place)")
        XCTAssertTrue(place.contains("203.0.113.4"), place)
    }

    func test_place_isAbsentWhenNothingIsKnown() {
        XCTAssertNil(SessionRowPresentation(Self.session("")).place)
    }

    func test_activity_ofTheCurrentSession_isNow_andOthersSayTheirLastActivity() {
        XCTAssertNotNil(SessionRowPresentation(Self.session("", isCurrent: true)).activity)
        XCTAssertNil(SessionRowPresentation(Self.session("")).activity, "sans dernière activité servie, rien n'est inventé")
        XCTAssertNotNil(SessionRowPresentation(Self.session(#", "lastActivityAt": "2026-10-07T08:00:00.000Z""#)).activity)
    }

    func test_loginMethod_isNamed_andAnUnknownMethodSaysNothing() {
        for method in ["password", "two_factor", "magic_link", "registration", "email_verification", "oauth", "anonymous"] {
            XCTAssertNotNil(SessionRowPresentation.loginMethodLabel(method), method)
        }
        XCTAssertNil(SessionRowPresentation.loginMethodLabel("carrier_pigeon"))
        XCTAssertNil(SessionRowPresentation.loginMethodLabel(nil))
    }
}

// MARK: - L'avis de fermeture

@MainActor
final class SessionClosedNoticeCopyTests: XCTestCase {

    func test_everyReason_isExplained() {
        for reason in SessionRevocationReason.allCases {
            let copy = SessionClosedNoticeCopy(reason: reason)
            XCTAssertFalse(copy.title.isEmpty, "\(reason)")
            XCTAssertFalse(copy.message.isEmpty, "\(reason)")
        }
    }

    /// Fermée par l'équipe : on peut lui écrire. Fermée par soi-même depuis un
    /// autre appareil : rien à demander à personne.
    func test_adminRevoke_offersToContactTheTeam_userRevokeDoesNot() {
        XCTAssertTrue(SessionClosedNoticeCopy(reason: .adminRevoke).offersContact)
        XCTAssertFalse(SessionClosedNoticeCopy(reason: .userRevoke).offersContact)
        XCTAssertNotEqual(
            SessionClosedNoticeCopy(reason: .adminRevoke).title,
            SessionClosedNoticeCopy(reason: .userRevoke).title,
            "le membre qui ferme lui-même un appareil ne doit pas lire qu'on l'a déconnecté"
        )
    }
}

// MARK: - Ce que le manifeste de confidentialité déclare (#9645)

/// Le lieu d'une session (pays, ville approximative tirés de l'adresse),
/// l'identifiant d'appareil des sessions et des notifications, l'avis de
/// capture d'écran et les rapports de plantage rattachés au compte : le
/// manifeste doit dire ce que l'app collecte, LIÉ quand c'est lié.
final class SessionPrivacyManifestTests: XCTestCase {

    private func collected() throws -> [String: (linked: Bool, purposes: Set<String>)] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // ViewModels
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .appendingPathComponent("Meeshy/PrivacyInfo.xcprivacy")
        let data = try Data(contentsOf: url)
        let plist = try XCTUnwrap(PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
        let types = try XCTUnwrap(plist["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        return types.reduce(into: [:]) { result, entry in
            guard let type = entry["NSPrivacyCollectedDataType"] as? String else { return }
            let purposes = entry["NSPrivacyCollectedDataTypePurposes"] as? [String] ?? []
            result[type] = (entry["NSPrivacyCollectedDataTypeLinked"] as? Bool ?? false, Set(purposes))
        }
    }

    func test_manifest_declaresWhatSessionsAndCaptureNoticesCollect() throws {
        let types = try collected()
        let functionality = "NSPrivacyCollectedDataTypePurposeAppFunctionality"

        let coarse = try XCTUnwrap(types["NSPrivacyCollectedDataTypeCoarseLocation"])
        XCTAssertTrue(coarse.linked && coarse.purposes.contains(functionality), "lieu approximatif d'une session")

        let interaction = try XCTUnwrap(types["NSPrivacyCollectedDataTypeProductInteraction"], "l'avis de capture d'écran")
        XCTAssertTrue(interaction.linked && interaction.purposes.contains(functionality))

        let device = try XCTUnwrap(types["NSPrivacyCollectedDataTypeDeviceID"])
        XCTAssertTrue(device.linked && device.purposes.contains(functionality), "jeton de notification et sessions, rattachés au compte")

        XCTAssertEqual(types["NSPrivacyCollectedDataTypeCrashData"]?.linked, true, "les rapports de plantage portent l'identifiant du compte")
    }
}

// MARK: - Cache en mémoire

actor InMemorySessionsCache: MutableCacheStore {
    typealias Key = String
    typealias Value = UserSession

    nonisolated let policy: CachePolicy = .participants
    private var entries: [String: [UserSession]] = [:]

    init(seed: [UserSession] = []) {
        if !seed.isEmpty { entries[ActiveSessionsViewModel.cacheKey] = seed }
    }

    func stored() -> [UserSession]? { entries[ActiveSessionsViewModel.cacheKey] }

    func load(for key: String) async -> CacheResult<[UserSession]> {
        guard let items = entries[key] else { return .empty }
        return .stale(items, age: 600)
    }

    func invalidate(for key: String) async { entries[key] = nil }
    func invalidateAll() async { entries.removeAll() }
    func save(_ items: [UserSession], for key: String) async throws { entries[key] = items }
    func update(for key: String, mutate: @Sendable ([UserSession]) -> [UserSession]) async {
        entries[key] = mutate(entries[key] ?? [])
    }
    func mergeUpdate(for key: String, mutate: @Sendable ([UserSession]) -> [UserSession]) async {
        entries[key] = mutate(entries[key] ?? [])
    }
}
