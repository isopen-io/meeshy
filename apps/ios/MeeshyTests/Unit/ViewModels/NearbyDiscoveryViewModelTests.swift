import XCTest
import CoreLocation
@testable import Meeshy
@testable import MeeshySDK

/// **Un écran vide DOIT dire pourquoi il est vide.**
///
/// C'est le cœur de ce lot, pas son ornement. `geoPoint` est nul pour tout
/// post publié avant le consentement : « aucun résultat » sera donc le cas
/// NORMAL au démarrage de la fonctionnalité. Rendre une carte vide muette
/// laisserait chaque utilisateur conclure que l'écran est cassé.
///
/// Cinq causes, cinq états DISTINCTS — un `[]` nu les confondrait toutes :
/// pas de position, permission refusée, hors ligne, session anonyme (401,
/// les deux routes exigent un compte), et zéro publication dans le rayon.
///
/// Et deux invariants d'Instant App, vérifiables ici et nulle part ailleurs :
/// le cache est servi AVANT que le réseau ne réponde, et la clé de cache est
/// quantifiée — sans quoi chaque micro-déplacement de carte fabriquerait une
/// clé neuve et le cache ne toucherait jamais.
@MainActor
final class NearbyDiscoveryViewModelTests: XCTestCase {

    // MARK: - Doubles

    private final class FakeNearbyService: NearbyDiscoveryServiceProviding, @unchecked Sendable {
        var pins: [NearbyPost] = []
        var nextCursor: String?
        var cells: [NearbyDensityCell] = []
        var errorToThrow: Error?
        var densityErrorToThrow: Error?
        private(set) var nearbyCallCount = 0
        private(set) var densityCallCount = 0
        private(set) var lastRadiusKm: Double?
        private(set) var lastCursor: Int?
        private(set) var lastCellSize: NearbyDensityCellSize?
        private(set) var lastCoordinate: CLLocationCoordinate2D?
        /// Exécuté À L'INTÉRIEUR de l'appel réseau : c'est le seul instant où
        /// l'on peut observer ce que l'écran affichait DÉJÀ.
        var duringNearby: (@Sendable () async -> Void)?

        func nearby(
            latitude: Double, longitude: Double, radiusKm: Double, cursor: Int, limit: Int
        ) async throws -> PaginatedAPIResponse<[NearbyPost]> {
            nearbyCallCount += 1
            lastRadiusKm = radiusKm
            lastCursor = cursor
            lastCoordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
            await duringNearby?()
            if let errorToThrow { throw errorToThrow }
            return PaginatedAPIResponse(
                success: true,
                data: pins,
                pagination: CursorPagination(nextCursor: nextCursor, hasMore: nextCursor != nil, limit: 20),
                error: nil
            )
        }

        func density(
            latitude: Double, longitude: Double, radiusKm: Double, cellSize: NearbyDensityCellSize
        ) async throws -> [NearbyDensityCell] {
            densityCallCount += 1
            lastCellSize = cellSize
            if let densityErrorToThrow { throw densityErrorToThrow }
            if let errorToThrow { throw errorToThrow }
            return cells
        }
    }

    private final class FakeLocationProvider: NearbyLocationProviding, @unchecked Sendable {
        var authorizationStatus: CLAuthorizationStatus
        var coordinate: CLLocationCoordinate2D?
        /// Le statut ET la coordonnée tels qu'ils seront APRÈS la décision de
        /// l'utilisateur. Le vrai fournisseur attend cette décision dans
        /// `currentCoordinate()` ; ce double la simule au même endroit.
        var statusAfterPrompt: CLAuthorizationStatus?
        var coordinateAfterPrompt: CLLocationCoordinate2D?
        private(set) var authorizationRequestCount = 0
        private(set) var fixRequestCount = 0

        init(status: CLAuthorizationStatus = .authorizedWhenInUse, coordinate: CLLocationCoordinate2D? = nil) {
            self.authorizationStatus = status
            self.coordinate = coordinate
        }

        func requestAuthorization() { authorizationRequestCount += 1 }

        func currentCoordinate() async -> CLLocationCoordinate2D? {
            fixRequestCount += 1
            if let statusAfterPrompt {
                authorizationStatus = statusAfterPrompt
                coordinate = coordinateAfterPrompt
            }
            return coordinate
        }
    }

    private final class FakeNearbyCache: NearbyPostCaching, @unchecked Sendable {
        var stored: [String: CacheResult<[FeedPost]>] = [:]
        private(set) var loadedKeys: [String] = []
        private(set) var savedKeys: [String] = []

        func load(key: String) async -> CacheResult<[FeedPost]> {
            loadedKeys.append(key)
            return stored[key] ?? .empty
        }

        func save(_ posts: [FeedPost], key: String) async {
            savedKeys.append(key)
            stored[key] = .fresh(posts, age: 0)
        }
    }

    private final class Box: @unchecked Sendable {
        var ids: [String] = []
        var coldStart = true
        var fired = false
    }

    // MARK: - Fabriques

    private static let paris = CLLocationCoordinate2D(latitude: 48.8583736, longitude: 2.2944813)

    private func makeAPIPost(id: String, lat: Double = 48.86, lng: Double = 2.29) -> APIPost {
        JSONStub.decode("""
        {"id":"\(id)","type":"POST","content":"Ici","createdAt":"2026-08-24T10:00:00.000Z",
         "author":{"id":"a1","username":"alice"},
         "location":{"latitude":\(lat),"longitude":\(lng),"name":"Lieu"}}
        """)
    }

    private func makeSUT(
        initialCoordinate: CLLocationCoordinate2D? = nil,
        service: FakeNearbyService = FakeNearbyService(),
        location: FakeLocationProvider = FakeLocationProvider(coordinate: paris),
        network: FakeNetworkMonitor = FakeNetworkMonitor(isOnline: true),
        cache: FakeNearbyCache = FakeNearbyCache()
    ) -> (
        sut: NearbyDiscoveryViewModel,
        service: FakeNearbyService,
        location: FakeLocationProvider,
        cache: FakeNearbyCache
    ) {
        let sut = NearbyDiscoveryViewModel(
            initialCoordinate: initialCoordinate,
            service: service,
            location: location,
            network: network,
            cache: cache,
            languageProvider: MockLanguageProvider(preferredLanguages: [])
        )
        return (sut, service, location, cache)
    }

    // MARK: - Les cinq raisons d'être vide

    func test_load_whenLocationDenied_reasonIsPermission() async {
        let denied = FakeLocationProvider(status: .denied, coordinate: nil)
        let (sut, service, _, _) = makeSUT(location: denied)

        await sut.load()

        XCTAssertEqual(sut.emptyReason, .locationDenied)
        XCTAssertEqual(
            service.nearbyCallCount, 0,
            "sans point de départ, interroger le serveur ne peut rien rendre d'utile"
        )
        XCTAssertFalse(sut.isColdStart, "l'écran a fini de se poser : il montre une explication, pas un squelette")
    }

    /// Permission ACCORDÉE mais aucun relevé : état distinct d'un refus. Le
    /// premier se lève en ouvrant les Réglages, le second en attendant ou en
    /// déplaçant la carte à la main — deux phrases, deux actions.
    func test_load_whenAuthorizedWithoutFix_reasonIsAwaitingLocation() async {
        let pending = FakeLocationProvider(status: .authorizedWhenInUse, coordinate: nil)
        let (sut, _, _, _) = makeSUT(location: pending)

        await sut.load()

        XCTAssertEqual(sut.emptyReason, .awaitingLocation)
        XCTAssertNotEqual(sut.emptyReason, .locationDenied)
    }

    /// **Le tout premier usage ne doit pas rendre un écran d'ERREUR.**
    ///
    /// L'alerte système est asynchrone : au retour immédiat de la demande, le
    /// statut est encore `.notDetermined`. Le fournisseur attend désormais la
    /// décision, et l'octroi lance la recherche SANS aucun geste — au lieu
    /// d'annoncer « Position introuvable » derrière une alerte que
    /// l'utilisateur n'avait pas encore fermée.
    func test_load_whenPermissionIsGrantedAtThePrompt_searchesWithoutAnyFurtherGesture() async {
        let fresh = FakeLocationProvider(status: .notDetermined, coordinate: nil)
        fresh.statusAfterPrompt = .authorizedWhenInUse
        fresh.coordinateAfterPrompt = Self.paris
        let (sut, service, location, _) = makeSUT(location: fresh)

        await sut.load()

        XCTAssertEqual(location.authorizationRequestCount, 1)
        XCTAssertEqual(service.nearbyCallCount, 1, "l'octroi doit relancer la recherche tout seul")
        XCTAssertNotEqual(sut.emptyReason, .awaitingLocation)
    }

    /// Et un REFUS pris à l'invite se nomme par ce qu'il est. Poser
    /// « Position introuvable » sur un refus enverrait l'utilisateur attendre
    /// un relevé qui n'arrivera jamais, au lieu des Réglages.
    func test_load_whenPermissionIsDeniedAtThePrompt_reasonIsLocationDenied() async {
        let fresh = FakeLocationProvider(status: .notDetermined, coordinate: nil)
        fresh.statusAfterPrompt = .denied
        let (sut, _, location, _) = makeSUT(location: fresh)

        await sut.load()

        XCTAssertEqual(location.authorizationRequestCount, 1)
        XCTAssertEqual(sut.emptyReason, .locationDenied)
        XCTAssertNotEqual(sut.emptyReason, .awaitingLocation)
    }

    func test_load_whenCacheEmptyAndOffline_reasonIsOffline() async {
        let (sut, service, _, _) = makeSUT(
            initialCoordinate: Self.paris,
            network: FakeNetworkMonitor(isOnline: false)
        )

        await sut.load()

        XCTAssertEqual(sut.emptyReason, .offline)
        XCTAssertTrue(sut.isOffline)
        XCTAssertEqual(service.nearbyCallCount, 0)
    }

    /// Hors ligne AVEC un cache : ce n'est plus un état vide du tout. La carte
    /// rend ce qu'elle a et un bandeau dit son âge — jamais une carte vide
    /// muette.
    func test_load_whenOfflineWithCachedPosts_showsTheCacheAndFlagsOffline() async {
        let cache = FakeNearbyCache()
        let key = NearbyDiscoveryQuery.cacheKey(
            latitude: Self.paris.latitude, longitude: Self.paris.longitude, radiusKm: 25
        )
        cache.stored[key] = .stale([makeAPIPost(id: "cached-1").toFeedPost()], age: 900)
        let (sut, _, _, _) = makeSUT(
            initialCoordinate: Self.paris,
            network: FakeNetworkMonitor(isOnline: false),
            cache: cache
        )

        await sut.load()

        XCTAssertEqual(sut.posts.map(\.id), ["cached-1"])
        XCTAssertNil(sut.emptyReason, "il y a quelque chose à montrer : ce n'est pas un état vide")
        XCTAssertTrue(sut.isOffline)
        XCTAssertEqual(sut.cacheAge, 900)
    }

    func test_load_whenServerReturnsEmptyArray_reasonIsNoDiscoverablePostsInRadius() async {
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris)

        await sut.load()

        XCTAssertEqual(sut.emptyReason, .noneInRadius)
        XCTAssertFalse(sut.isOffline)
    }

    /// **Le type d'erreur est celui que le TRANSPORT lève.**
    ///
    /// `APIClient.request` ne lève que des `MeeshyError` : les trois témoins
    /// suivants injectaient auparavant des `APIError`, un type que ce chemin
    /// ne produit jamais. Ils passaient au vert en mesurant des branches
    /// mortes, pendant qu'en production TOUT échec — 401 compris — retombait
    /// sur « aucune publication dans ce rayon ».
    func test_load_whenServerReturns401_reasonIsSignInRequired() async {
        let service = FakeNearbyService()
        service.errorToThrow = MeeshyError.auth(.sessionExpired)
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()

        XCTAssertEqual(
            sut.emptyReason, .signInRequired,
            "les deux routes exigent un compte : un visiteur sans compte reçoit 401, jamais une page vide"
        )
    }

    func test_load_whenServerReturnsServerError401_reasonIsSignInRequired() async {
        let service = FakeNearbyService()
        service.errorToThrow = MeeshyError.server(statusCode: 401, message: "Authentication required")
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()

        XCTAssertEqual(sut.emptyReason, .signInRequired)
    }

    func test_load_whenTransportFails_reasonIsOffline() async {
        let service = FakeNearbyService()
        service.errorToThrow = MeeshyError.network(.noConnection)
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()

        XCTAssertEqual(sut.emptyReason, .offline)
        XCTAssertTrue(sut.isOffline)
    }

    /// **Le repli trompeur que la spec §5 interdit nommément.**
    ///
    /// Un 500 se lisait « Aucune publication à découvrir dans un rayon de
    /// 25 km », avec un bouton « Élargir le rayon » qui n'y pouvait rien : le
    /// symptôme était indiscernable du cas nominal, et le geste proposé était
    /// faux.
    func test_load_whenServerErrors_isNeverDressedUpAsAnEmptyRadius() async {
        let service = FakeNearbyService()
        service.errorToThrow = MeeshyError.server(statusCode: 500, message: "boom")
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()

        XCTAssertEqual(sut.emptyReason, .serviceUnavailable)
        XCTAssertNotEqual(sut.emptyReason, .noneInRadius)
        XCTAssertFalse(sut.isOffline, "le réseau va bien : c'est le serveur qui a erré")
    }

    /// Le témoin NÉGATIF qui rougirait si le filtre redevenait `APIError` : ce
    /// type-là ne peut plus être le seul reconnu, puisque le transport n'en
    /// lève aucun. `MeeshyError.from` normalise les deux familles.
    func test_load_stillNamesAnAPIErrorCorrectly_becauseTheFilterNormalizesBothFamilies() async {
        let service = FakeNearbyService()
        service.errorToThrow = APIError.unauthorized
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()

        XCTAssertEqual(sut.emptyReason, .signInRequired)
    }

    // MARK: - Les deux routes sont indépendantes

    /// **Une densité en échec ne fait pas disparaître les pins.** Les attendre
    /// dans un même `do` jetait une page de trente publications déjà décodées
    /// parce que l'agrégation de densité avait erré — et l'écran annonçait
    /// alors « rien à découvrir ici ».
    func test_load_whenOnlyTheDensityFails_theyPinsSurvive() async {
        let service = FakeNearbyService()
        service.pins = [NearbyPost(post: makeAPIPost(id: "p1"), distanceMeters: 42)]
        service.densityErrorToThrow = MeeshyError.server(statusCode: 500, message: "no 2dsphere index")
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()

        XCTAssertEqual(sut.posts.map(\.id), ["p1"], "les pins reçus ont été jetés avec la densité")
        XCTAssertTrue(sut.cells.isEmpty)
        XCTAssertNil(sut.emptyReason, "il y avait quelque chose à montrer")
        XCTAssertTrue(sut.showsIndividualPins, "sans cellules, la carte retombe sur les points")
    }

    // MARK: - Le point d'entrée « Voir près d'ici »

    func test_load_whenInitialCoordinateProvided_neverRequestsLocationPermission() async {
        let denied = FakeLocationProvider(status: .denied, coordinate: nil)
        let (sut, service, location, _) = makeSUT(initialCoordinate: Self.paris, location: denied)

        await sut.load()

        XCTAssertEqual(location.authorizationRequestCount, 0)
        XCTAssertEqual(location.fixRequestCount, 0)
        XCTAssertEqual(service.nearbyCallCount, 1, "une coordonnée fournie suffit, permission refusée ou non")
        XCTAssertNotEqual(sut.emptyReason, .locationDenied)
    }

    // MARK: - Instant App

    /// Stale-While-Revalidate PROUVÉ : au moment où l'appel réseau part,
    /// l'écran affiche DÉJÀ le cache et n'est plus en démarrage à froid.
    func test_load_whenCacheStale_emitsCachedThenRefreshed() async {
        let cache = FakeNearbyCache()
        let key = NearbyDiscoveryQuery.cacheKey(
            latitude: Self.paris.latitude, longitude: Self.paris.longitude, radiusKm: 25
        )
        cache.stored[key] = .stale([makeAPIPost(id: "cached-1").toFeedPost()], age: 600)

        let service = FakeNearbyService()
        service.pins = [NearbyPost(post: makeAPIPost(id: "fresh-1"), distanceMeters: 120)]

        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service, cache: cache)

        let observed = Box()
        service.duringNearby = { [weak sut] in
            await MainActor.run {
                observed.ids = sut?.posts.map(\.id) ?? []
                observed.coldStart = sut?.isColdStart ?? true
            }
        }

        await sut.load()

        XCTAssertEqual(observed.ids, ["cached-1"], "le cache est servi AVANT le réseau, sans spinner")
        XCTAssertFalse(observed.coldStart, "un cache servi n'est jamais un démarrage à froid")
        XCTAssertEqual(sut.posts.map(\.id), ["fresh-1"], "puis le réseau remplace, sans vider entre-temps")
        XCTAssertEqual(cache.savedKeys, [key])
    }

    /// Cache FRAIS et densité déjà connue : aucune requête. C'est la seule
    /// forme d'Instant App qui se mesure — un appel réseau de trop se voit,
    /// une absence de spinner ne se voit pas.
    func test_load_whenCacheFreshAndDensityKnown_doesNotHitTheNetworkTwice() async {
        let service = FakeNearbyService()
        service.pins = [NearbyPost(post: makeAPIPost(id: "p1"), distanceMeters: 42)]
        service.cells = [NearbyDensityCell(cellLat: 48.9, cellLng: 2.3, count: 4)]
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()
        XCTAssertEqual(service.nearbyCallCount, 1)

        await sut.load()
        XCTAssertEqual(service.nearbyCallCount, 1, "le second passage est servi par le cache")
        XCTAssertEqual(service.densityCallCount, 1)
        XCTAssertEqual(sut.cells.count, 1)
    }

    func test_refresh_bypassesTheCache() async {
        let service = FakeNearbyService()
        service.pins = [NearbyPost(post: makeAPIPost(id: "p1"), distanceMeters: 42)]
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()
        await sut.refresh()

        XCTAssertEqual(service.nearbyCallCount, 2)
    }

    /// Sans quantification, chaque micro-déplacement fabrique une clé neuve :
    /// le cache ne touche jamais et l'écran repart d'un squelette à chaque
    /// geste.
    func test_recenter_withinTheSameGridCell_reusesTheCacheKey() async {
        let (sut, _, _, cache) = makeSUT(initialCoordinate: Self.paris)

        await sut.load()
        await sut.recenter(on: CLLocationCoordinate2D(latitude: 48.8591, longitude: 2.2951))

        XCTAssertEqual(Set(cache.loadedKeys).count, 1, "deux centres dans la même cellule partagent une clé")
    }

    /// **Un point d'entrée est un point de DÉPART, pas une ancre.**
    ///
    /// Relire la coordonnée d'entrée à chaque chargement la faisait GAGNER sur
    /// toute intention de l'utilisateur : recentrer la carte, ou taper une
    /// cellule de densité, replaçait silencieusement le centre sur le point
    /// d'origine au tour suivant. L'écran paraissait figé sans qu'aucune erreur
    /// ne soit levée — la pire forme de panne.
    func test_recenter_afterEnteringFromAPlaceBadge_actuallyMovesTheCenter() async {
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris)
        let marseille = CLLocationCoordinate2D(latitude: 43.2965, longitude: 5.3698)

        await sut.load()
        await sut.recenter(on: marseille)

        XCTAssertEqual(sut.center?.latitude ?? 0, marseille.latitude, accuracy: 1e-9)
        XCTAssertEqual(sut.center?.longitude ?? 0, marseille.longitude, accuracy: 1e-9)
    }

    /// **Une demande arrivée pendant un chargement ne se jette pas.**
    ///
    /// `setRadius` publie son nouveau rayon AVANT d'appeler : le garde
    /// `!isLoading` avalait l'appel et laissait la barre allumée sur 100 km
    /// pendant que les données restaient celles de 25. En mode carte, aucun
    /// geste ne pouvait rattraper l'écart — il n'y a pas de tirer-pour-
    /// rafraîchir là-bas.
    func test_setRadius_whileALoadIsInFlight_isReplayedInsteadOfDropped() async {
        let service = FakeNearbyService()
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)
        let gate = Box()

        service.duringNearby = { [weak sut] in
            let isFirstCall = await MainActor.run { () -> Bool in
                guard !gate.fired else { return false }
                gate.fired = true
                return true
            }
            guard isFirstCall else { return }
            await sut?.setRadius(kilometers: 100)
        }

        await sut.load()

        XCTAssertEqual(sut.radiusKm, 100)
        XCTAssertEqual(
            service.nearbyCallCount, 2,
            "la demande arrivée pendant le chargement a été jetée au lieu d'être rejouée"
        )
        XCTAssertEqual(
            service.lastRadiusKm, 100,
            "les données servies doivent finir par suivre le rayon AFFICHÉ"
        )
    }

    /// **La vérité du réseau n'attend pas une réponse HTTP.**
    ///
    /// `isOffline` n'était effacé qu'après un aller-retour réussi. Le retour
    /// anticipé « cache frais + densité connue » sortait sans y toucher :
    /// l'écran affichait « Hors ligne — dernières données connues » à un
    /// utilisateur parfaitement connecté, et ne revalidait plus rien.
    func test_load_whenServedFromAFreshCacheWhileOnline_clearsTheOfflineFlag() async {
        let service = FakeNearbyService()
        service.pins = [NearbyPost(post: makeAPIPost(id: "p1"), distanceMeters: 42)]
        service.cells = [NearbyDensityCell(cellLat: 48.9, cellLng: 2.3, count: 4)]
        let network = FakeNetworkMonitor(isOnline: true)
        let (sut, _, _, _) = makeSUT(
            initialCoordinate: Self.paris, service: service, network: network
        )

        await sut.load()
        network.isOnline = false
        await sut.setRadius(kilometers: 100)
        XCTAssertTrue(sut.isOffline, "clé neuve sans cache et sans réseau : c'est bien hors ligne")

        network.isOnline = true
        await sut.setRadius(kilometers: 25)

        XCTAssertFalse(
            sut.isOffline,
            "une clé fraîche servie EN LIGNE doit effacer le drapeau hors-ligne"
        )
    }

    // MARK: - Le pin est planté sur le point CONSENTI

    /// **La carte ne dessine pas le badge.** Le badge est
    /// `metadata.location` : il part au grain du partage de position, donc
    /// souvent au mètre près. Le planter ici situait exactement quelqu'un qui
    /// avait choisi « Région », et contredisait sur le même écran la distance
    /// servie par le serveur — mesurée, elle, depuis `geoPoint`.
    func test_mappablePins_arePlantedOnTheConsentedPoint_notOnTheDisplayedBadge() async throws {
        let service = FakeNearbyService()
        service.pins = [
            NearbyPost(
                post: makeAPIPost(id: "p1", lat: 48.8583736, lng: 2.2944813),
                distanceMeters: 42_000,
                geoPoint: NearbyGeoPoint(latitude: 49, longitude: 2),
                geoPrecision: .region
            )
        ]
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()

        let pin = try XCTUnwrap(sut.mappablePins.first)
        XCTAssertEqual(pin.latitude, 49, accuracy: 1e-9)
        XCTAssertEqual(pin.longitude, 2, accuracy: 1e-9)
        XCTAssertNotEqual(pin.latitude, 48.8583736, accuracy: 1e-9)
        XCTAssertEqual(pin.precision, .region, "sans le grain, la carte ne peut pas cerner le point")
    }

    /// Servie depuis le CACHE, une publication n'a plus son point consenti :
    /// le grain n'est pas retenu, et aucun cercle ne prétend le connaître. Le
    /// badge — déjà public sur la publication elle-même — évite alors une
    /// carte vide, ce qui est la seule alternative.
    func test_mappablePins_fromCache_carryNoPrecisionClaim() async {
        let cache = FakeNearbyCache()
        let key = NearbyDiscoveryQuery.cacheKey(
            latitude: Self.paris.latitude, longitude: Self.paris.longitude, radiusKm: 25
        )
        cache.stored[key] = .stale([makeAPIPost(id: "cached-1").toFeedPost()], age: 900)
        let (sut, _, _, _) = makeSUT(
            initialCoordinate: Self.paris,
            network: FakeNetworkMonitor(isOnline: false),
            cache: cache
        )

        await sut.load()

        XCTAssertEqual(sut.mappablePins.map(\.id), ["cached-1"])
        XCTAssertNil(sut.mappablePins.first?.precision)
    }

    func test_setRadius_changesTheCacheKeyAndRefetches() async {
        let (sut, service, _, cache) = makeSUT(initialCoordinate: Self.paris)

        await sut.load()
        await sut.setRadius(kilometers: 100)

        XCTAssertEqual(sut.radiusKm, 100)
        XCTAssertEqual(service.nearbyCallCount, 2)
        XCTAssertEqual(Set(cache.loadedKeys).count, 2)
        XCTAssertEqual(service.lastCellSize, .region, "le pas de grille suit le rayon, calé sur les paliers serveur")
    }

    // MARK: - Densité → pins

    func test_focusOnCell_switchesToPinsCenteredOnThatCell() async {
        let service = FakeNearbyService()
        service.cells = [NearbyDensityCell(cellLat: 48.9, cellLng: 2.3, count: 7)]
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()
        await sut.focus(on: NearbyDensityCell(cellLat: 48.9, cellLng: 2.3, count: 7))

        XCTAssertEqual(sut.mode, .pins)
        XCTAssertEqual(sut.center?.latitude ?? 0, 48.9, accuracy: 1e-9)
        XCTAssertEqual(sut.center?.longitude ?? 0, 2.3, accuracy: 1e-9)
    }

    func test_distances_areServedByTheServerNeverRecomputed() async {
        let service = FakeNearbyService()
        service.pins = [NearbyPost(post: makeAPIPost(id: "p1"), distanceMeters: 1843.75)]
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()

        XCTAssertEqual(sut.distanceMeters(for: "p1"), 1843.75)
        XCTAssertNil(sut.distanceMeters(for: "inconnu"))
    }

    /// Une distance servie depuis le CACHE n'existe pas : elle a été calculée
    /// depuis une position que le lecteur a quittée. Mieux vaut ne rien dire
    /// que dire un chiffre faux.
    func test_distances_areDroppedWhenServedFromCache() async {
        let cache = FakeNearbyCache()
        let key = NearbyDiscoveryQuery.cacheKey(
            latitude: Self.paris.latitude, longitude: Self.paris.longitude, radiusKm: 25
        )
        cache.stored[key] = .fresh([makeAPIPost(id: "cached-1").toFeedPost()], age: 5)
        let (sut, _, _, _) = makeSUT(
            initialCoordinate: Self.paris,
            network: FakeNetworkMonitor(isOnline: false),
            cache: cache
        )

        await sut.load()

        XCTAssertEqual(sut.posts.map(\.id), ["cached-1"])
        XCTAssertNil(sut.distanceMeters(for: "cached-1"))
    }

    // MARK: - Pagination

    func test_loadMore_usesTheNumericOffsetNotAFeedCursor() async {
        let service = FakeNearbyService()
        service.pins = [NearbyPost(post: makeAPIPost(id: "p1"), distanceMeters: 10)]
        service.nextCursor = "20"
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()
        await sut.loadMore()

        XCTAssertEqual(service.lastCursor, 20)
    }

    func test_loadMore_stopsWhenTheCursorIsNotAnOffset() async {
        let service = FakeNearbyService()
        service.pins = [NearbyPost(post: makeAPIPost(id: "p1"), distanceMeters: 10)]
        service.nextCursor = "eyJjcmVhdGVkQXQi"
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()
        await sut.loadMore()

        XCTAssertEqual(service.nearbyCallCount, 1, "mieux vaut arrêter la pagination que rendre 400")
    }

    // MARK: - La carte n'est jamais vide

    func test_showsIndividualPins_inDensityModeWithCells_isFalse() async {
        let service = FakeNearbyService()
        service.pins = [NearbyPost(post: makeAPIPost(id: "p1"), distanceMeters: 42)]
        service.cells = [NearbyDensityCell(cellLat: 48.9, cellLng: 2.3, count: 4)]
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris, service: service)

        await sut.load()

        XCTAssertEqual(sut.mode, .density)
        XCTAssertFalse(
            sut.showsIndividualPins,
            "un point par publication par-dessus une carte de chaleur est illisible"
        )
    }

    /// **Le cas qui compte** : hors ligne, la densité n'existe pas (elle n'est
    /// pas persistée), mais le cache tient des publications. Masquer les points
    /// laisserait une carte VIDE avec un bandeau — exactement le symptôme que
    /// ce lot existe pour éviter.
    func test_showsIndividualPins_inDensityModeWithoutCells_fallsBackToPins() async {
        let cache = FakeNearbyCache()
        let key = NearbyDiscoveryQuery.cacheKey(
            latitude: Self.paris.latitude, longitude: Self.paris.longitude, radiusKm: 25
        )
        cache.stored[key] = .stale([makeAPIPost(id: "cached-1").toFeedPost()], age: 900)
        let (sut, _, _, _) = makeSUT(
            initialCoordinate: Self.paris,
            network: FakeNetworkMonitor(isOnline: false),
            cache: cache
        )

        await sut.load()

        XCTAssertEqual(sut.mode, .density)
        XCTAssertTrue(sut.cells.isEmpty)
        XCTAssertFalse(sut.posts.isEmpty)
        XCTAssertTrue(sut.showsIndividualPins, "un écran qui a quelque chose à montrer le montre")
    }

    func test_showsIndividualPins_inPinsMode_isTrue() async {
        let (sut, _, _, _) = makeSUT(initialCoordinate: Self.paris)

        sut.mode = .pins

        XCTAssertTrue(sut.showsIndividualPins)
    }

    // MARK: - Le dégradé de densité

    func test_densityPalette_normalizesAgainstTheHottestCell() {
        XCTAssertEqual(NearbyDensityPalette.normalized(count: 5, hottest: 10), 0.5, accuracy: 1e-9)
        XCTAssertEqual(NearbyDensityPalette.normalized(count: 10, hottest: 10), 1, accuracy: 1e-9)
        XCTAssertEqual(
            NearbyDensityPalette.normalized(count: 3, hottest: 0), 0, accuracy: 1e-9,
            "aucune cellule chaude : rien à normaliser, jamais de division par zéro"
        )
    }

    func test_densityPalette_goesFromColdToHot() {
        let cold = NearbyDensityPalette.components(normalized: 0)
        let hot = NearbyDensityPalette.components(normalized: 1)
        XCTAssertGreaterThan(cold.blue, cold.red, "une zone froide penche vers le bleu")
        XCTAssertGreaterThan(hot.red, hot.blue, "une zone chaude penche vers le rouge")
    }

    func test_densityPalette_clampsOutOfRangeInput() {
        XCTAssertEqual(
            NearbyDensityPalette.components(normalized: -3).red,
            NearbyDensityPalette.components(normalized: 0).red,
            accuracy: 1e-9
        )
        XCTAssertEqual(
            NearbyDensityPalette.components(normalized: 42).red,
            NearbyDensityPalette.components(normalized: 1).red,
            accuracy: 1e-9
        )
    }

    // MARK: - Le retour du réseau arrive d'une file de FOND

    /// **Le crash « Find nearby » du 2026-08-25** — `SIGTRAP` dans
    /// `_dispatch_assert_queue_fail`, file `com.apple.root.utility-qos`, trame
    /// `closure #1 in NearbyDiscoveryViewModel.observeNetwork`.
    ///
    /// `NetworkMonitor.isOfflinePublisher` débounce sur
    /// `DispatchQueue.global(qos: .utility)` : il LIVRE sur une file de fond.
    /// La fermeture du `sink` vit dans une classe `@MainActor`, donc le
    /// runtime vérifie l'exécuteur à son entrée — et trappe à la première
    /// transition réseau qui suit l'ouverture de l'écran, quelques secondes
    /// après le tap. Le double par défaut n'émettait JAMAIS (`Empty`) : la
    /// suite était verte par omission.
    ///
    /// Ce témoin émet donc depuis la file du vrai publisher. Sans le saut sur
    /// le main avant le `sink`, il ne rougit pas : il TUE le process de test —
    /// exactement le symptôme utilisateur. La garde de source ci-dessous
    /// existe pour que ce cas rougisse proprement.
    func test_networkComesBackFromABackgroundQueue_reloadsOnTheMainActorInsteadOfTrapping() async {
        let network = FakeNetworkMonitor(isOnline: false)
        let (sut, service, _, _) = makeSUT(initialCoordinate: Self.paris, network: network)
        await sut.load()
        XCTAssertTrue(sut.isOffline)
        XCTAssertEqual(service.nearbyCallCount, 0, "hors ligne : rien ne part")

        network.isOnline = true
        DispatchQueue.global(qos: .utility).async {
            network.offlineTransitions.send(false)
        }

        let reloaded = await waitUntil { service.nearbyCallCount >= 1 && !sut.isOffline }
        XCTAssertTrue(reloaded, "le retour du réseau doit relancer la lecture, depuis le main actor")
    }

    /// Un `sink` qui n'est appelé que depuis une file de fond ne rougit pas —
    /// il crashe. Cette garde fige donc l'invariant à la source : le saut sur
    /// le main précède le `sink` de `observeNetwork`, comme dans
    /// `SyncPillViewModel`, l'autre abonné du même publisher.
    func test_observeNetwork_hopsToTheMainQueueBeforeItsSink() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // ViewModels/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/ViewModels/NearbyDiscoveryViewModel.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        let body = try XCTUnwrap(
            source.range(of: "private func observeNetwork()").map { range in
                String(source[range.lowerBound..<(source.range(of: ".store(in: &cancellables)", range: range.lowerBound..<source.endIndex)?.upperBound ?? source.endIndex)])
            },
            "observeNetwork a disparu de NearbyDiscoveryViewModel"
        )
        let hop = try XCTUnwrap(
            body.range(of: ".receive(on: DispatchQueue.main)"),
            "isOfflinePublisher livre depuis DispatchQueue.global(qos: .utility) : le sink d'une " +
            "classe @MainActor doit être précédé d'un .receive(on: DispatchQueue.main) — sinon " +
            "SIGTRAP (_dispatch_assert_queue_fail) à la première transition réseau."
        )
        let sink = try XCTUnwrap(body.range(of: ".sink"), "observeNetwork doit poser un sink")
        XCTAssertLessThan(hop.lowerBound, sink.lowerBound, "le saut sur le main doit PRÉCÉDER le sink")
    }

    private func waitUntil(
        timeout: TimeInterval = 3,
        _ condition: @escaping @MainActor () -> Bool
    ) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        return condition()
    }
}
