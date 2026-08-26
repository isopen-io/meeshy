import Foundation
import Combine
import CoreLocation
import MeeshySDK
import os

// MARK: - Les trois lectures d'un même jeu de résultats

/// Densité, pins, liste — la bascule de la spec §4.
///
/// Ce n'est pas un filtre : les trois montrent le MÊME rayon autour du MÊME
/// point. Ce qui change est la granularité de lecture — une chaleur par zone,
/// un point par publication, une rangée par publication.
enum NearbyDiscoveryMode: String, CaseIterable, Sendable {
    case density
    case pins
    case list
    /// **Les publications du fil sur la carte** — l'ancienne carte « Posts sur
    /// la carte » du header du feed, fusionnée ici (directive du 2026-08-26).
    /// Elle plante le LIEU AFFICHÉ de chaque publication, pas le point
    /// consenti : c'est pourquoi elle est réservée au staff de la plateforme
    /// (`NearbyDiscoverAccess`).
    case discover
}

// MARK: - Qui peut voir Discover

/// Le staff de la plateforme, et lui seul : modérateurs, admins, bigboss.
/// Même famille que `ConversationView.isCurrentUserAdminOrMod`, mais le rôle
/// de CONVERSATION n'y entre pas — Discover est une vue de plateforme.
///
/// `nonisolated` sur le TYPE : la cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, le bundle de tests sous
/// `nonisolated`.
nonisolated enum NearbyDiscoverAccess {
    static let staffRoles: Set<String> = ["BIGBOSS", "ADMIN", "MODERATOR"]

    static func isAllowed(role: String?) -> Bool {
        guard let role else { return false }
        return staffRoles.contains(role.uppercased())
    }
}

// MARK: - Pourquoi c'est vide

/// **La raison pour laquelle il n'y a rien à voir — jamais un `[]` nu.**
///
/// `Post.geoPoint` est nul pour toute publication antérieure au consentement,
/// et la spec exclut toute rétro-indexation : « aucun résultat » sera donc le
/// cas NORMAL pendant les premières semaines. Un utilisateur qui voit une
/// carte vide sans explication conclut que l'écran est cassé — c'est
/// exactement le défaut que ce chantier existe pour éviter.
///
/// Les six cas sont DISJOINTS et se lèvent par des gestes différents : ouvrir
/// les Réglages, attendre un relevé, se reconnecter, se connecter à un compte,
/// réessayer, élargir le rayon. Les fondre en un seul état rendrait chacune de
/// ces actions impossible à proposer.
enum NearbyEmptyReason: Equatable, Sendable {
    /// Permission refusée ou restreinte. Se lève dans les Réglages système.
    case locationDenied
    /// Permission accordée (ou pas encore demandée) mais aucun relevé. Se lève
    /// en attendant, ou en déplaçant la carte à la main.
    case awaitingLocation
    /// Aucun réseau ET aucun cache. Se lève à la reconnexion.
    case offline
    /// Les deux routes exigent un compte : un visiteur entré par lien reçoit
    /// 401. Cause d'écran vide que la spec §5 n'énumère pas et qu'il faut
    /// quand même savoir dire.
    case signInRequired
    /// Le serveur n'a pas pu répondre : 500, 400, corps illisible. Se lève en
    /// réessayant.
    ///
    /// **Sans ce cas, un échec serveur s'habillait en « aucun résultat dans ce
    /// rayon »** et envoyait l'utilisateur élargir un rayon qui n'y était pour
    /// rien — le « repli trompeur » que la spec §5 interdit nommément, et que
    /// l'énumération existe précisément pour éviter.
    case serviceUnavailable
    /// Le serveur a répondu, et il n'y a rien. Se lève en élargissant le
    /// rayon — ou pas du tout, tant que personne n'a publié de contenu
    /// découvrable ici.
    case noneInRadius
    /// Mode Discover : aucune publication du fil ne porte de lieu. Ne dépend
    /// ni de la position, ni du réseau — seulement du cache du fil. Se lève en
    /// relisant.
    case nothingOnTheMap
}

// MARK: - Où planter un pin

/// Une publication et le point où il est HONNÊTE de la dessiner.
///
/// Le point n'est pas celui du badge : c'est `Post.geoPoint`, la coordonnée
/// que l'auteur a consenti à rendre trouvable, déjà quantifiée au grain de
/// `precision`. `precision` accompagne le point pour que la carte puisse le
/// CERNER — un point quantifié à 1° dessiné nu se lit comme une adresse.
///
/// `precision` est `nil` sur le seul chemin où le grain est inconnu : une
/// publication servie depuis le CACHE, dont on ne retient que le badge public
/// déjà affiché sur la publication elle-même. Aucun cercle n'est alors dessiné
/// — on ne prétend pas connaître une zone qu'on n'a pas.
struct NearbyMapPin: Identifiable {
    let post: FeedPost
    let latitude: Double
    let longitude: Double
    let precision: DiscoverabilityPrecision?

    var id: String { post.id }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    /// Le point consenti SANS la publication : ce que le ViewModel retient
    /// d'une réponse réseau, indépendamment de la liste affichée.
    struct Placement: Equatable {
        let latitude: Double
        let longitude: Double
        let precision: DiscoverabilityPrecision?
    }
}

// MARK: - Seams

/// Autorisation et relevé de position, injectables.
///
/// Le ViewModel ne crée JAMAIS de `CLLocationManager` : la spec §5 renvoie
/// explicitement à la vigilance d'isolation d'acteur du picker
/// (`LocationPickerModel` est `nonisolated` + `@unchecked Sendable` pour une
/// raison de deinit, pas par confort). Passer par ce protocole rend les cinq
/// états vides testables sans CoreLocation.
protocol NearbyLocationProviding: AnyObject, Sendable {
    var authorizationStatus: CLAuthorizationStatus { get }
    func requestAuthorization()
    /// Le dernier relevé connu, ou `nil` si aucun n'est disponible. Ne demande
    /// jamais l'autorisation elle-même.
    func currentCoordinate() async -> CLLocationCoordinate2D?
}

/// Le cache des résultats, injectable.
///
/// Il ne s'agit pas d'un magasin neuf : l'implémentation réelle passe par
/// `CacheCoordinator.shared.feed`, exactement comme la liste des signets. Le
/// protocole existe pour que les QUATRE cas de `CacheResult` soient exerçables
/// — un `.stale` ne se fabrique pas en attendant cinq minutes dans un test, et
/// c'est précisément le cas qui porte le Stale-While-Revalidate.
protocol NearbyPostCaching: Sendable {
    func load(key: String) async -> CacheResult<[FeedPost]>
    func save(_ posts: [FeedPost], key: String) async
}

/// L'implémentation réelle : le magasin de feed déjà en place, sous une clé
/// préfixée `nearby:` pour ne jamais écraser « main-feed » ni « bookmarks ».
struct NearbyFeedPostCache: NearbyPostCaching {
    private static let log = Logger(subsystem: "me.meeshy.app", category: "nearby-cache")

    func load(key: String) async -> CacheResult<[FeedPost]> {
        await CacheCoordinator.shared.feed.load(for: key)
    }

    func save(_ posts: [FeedPost], key: String) async {
        do {
            try await CacheCoordinator.shared.feed.save(posts, for: key)
        } catch {
            // Un cache non écrit dégrade l'écran suivant ; il ne casse pas
            // celui-ci. Mais un échec muet rend le symptôme (« ça repart
            // toujours d'un squelette ») introuvable.
            Self.log.error("nearby cache save failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}

/// Le fournisseur réel de position pour l'écran de découverte.
///
/// `nonisolated` sur le TYPE + `@unchecked Sendable`, MÊME raison que
/// `LocationPickerModel` : la cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, et une classe `@MainActor`
/// sans deinit écrite reçoit une deinit ISOLÉE dont le shim de
/// rétro-déploiement libère deux fois le scope task-local sur iOS < 26.
///
/// L'invariant `@unchecked` est vérifié : `CLLocationManager` est créé sur le
/// main (le singleton naît au premier accès depuis la vue), ses callbacks de
/// delegate reviennent sur le fil qui l'a créé, et les continuations en
/// attente sont protégées par un verrou et reprises UNE seule fois.
nonisolated final class NearbyLocationProvider: NSObject, CLLocationManagerDelegate,
                                                NearbyLocationProviding, @unchecked Sendable {
    static let shared = NearbyLocationProvider()

    private let manager = CLLocationManager()
    private let lock = NSLock()
    private var waiters: [CheckedContinuation<CLLocationCoordinate2D?, Never>] = []
    private var isAwaitingFix = false

    override init() {
        super.init()
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    var authorizationStatus: CLAuthorizationStatus {
        manager.authorizationStatus
    }

    func requestAuthorization() {
        if manager.delegate == nil { manager.delegate = self }
        guard manager.authorizationStatus == .notDetermined else { return }
        manager.requestWhenInUseAuthorization()
    }

    /// **L'octroi est un ÉVÉNEMENT, pas un instant.**
    ///
    /// La boîte de dialogue système est asynchrone : au retour immédiat de
    /// `requestWhenInUseAuthorization()`, le statut est encore
    /// `.notDetermined`. Rendre `nil` là-dessus faisait annoncer un échec —
    /// « Position introuvable » — DERRIÈRE l'alerte que l'utilisateur n'avait
    /// pas encore fermée, et rien ne rattrapait le « Autoriser » qu'il tapait
    /// ensuite. Le tout premier usage de la fonctionnalité rendait donc un
    /// écran en erreur.
    ///
    /// On ATTEND donc la décision, et c'est
    /// `locationManagerDidChangeAuthorization` qui reprend les attentes : soit
    /// en demandant le relevé (accordé), soit en rendant `nil` (refusé), et
    /// l'appelant relit alors le statut pour nommer la bonne raison.
    func currentCoordinate() async -> CLLocationCoordinate2D? {
        if let known = manager.location?.coordinate { return known }
        if manager.delegate == nil { manager.delegate = self }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways, .notDetermined:
            break
        default:
            return nil
        }
        return await withCheckedContinuation { continuation in
            lock.lock()
            waiters.append(continuation)
            let shouldRequest = !isAwaitingFix
            isAwaitingFix = true
            lock.unlock()
            // Deux `requestLocation()` concurrents font annuler le premier par
            // CoreLocation, qui répond alors `kCLErrorLocationUnknown` — le
            // même piège que le picker a déjà payé. Et tant que la permission
            // n'est pas tranchée, il n'y a rien à demander : `requestLocation`
            // y échouerait, et c'est le delegate d'autorisation qui relancera.
            guard shouldRequest, Self.isAuthorized(manager.authorizationStatus) else { return }
            manager.requestLocation()
        }
    }

    private static func isAuthorized(_ status: CLAuthorizationStatus) -> Bool {
        status == .authorizedWhenInUse || status == .authorizedAlways
    }

    private func resumeWaiters(with coordinate: CLLocationCoordinate2D?) {
        lock.lock()
        let pending = waiters
        waiters.removeAll()
        isAwaitingFix = false
        lock.unlock()
        pending.forEach { $0.resume(returning: coordinate) }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        resumeWaiters(with: locations.last?.coordinate)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        resumeWaiters(with: nil)
    }

    /// La moitié qui manquait : sans elle, une permission ACCORDÉE ne
    /// déclenchait rien du tout et l'écran restait sur son état d'erreur
    /// jusqu'à ce que l'utilisateur le quitte et y revienne.
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        if Self.isAuthorized(status) {
            lock.lock()
            let hasWaiters = !waiters.isEmpty
            lock.unlock()
            guard hasWaiters else { return }
            manager.requestLocation()
            return
        }
        guard status != .notDetermined else { return }
        // Refus explicite : il n'y aura pas de relevé, et faire patienter
        // indéfiniment serait pire qu'un « non ».
        resumeWaiters(with: nil)
    }
}

// MARK: - ViewModel

/// L'état de l'écran « À proximité » (spec du 2026-08-02 §4).
///
/// Trois principes Instant App y sont tenus, et chacun est vérifiable :
///
/// - **Cache-first** : les résultats connus sont publiés AVANT le moindre
///   appel réseau. Le squelette n'apparaît qu'au démarrage à froid, quand il
///   n'y a réellement rien.
/// - **Stale-while-revalidate** : les quatre cas de `CacheResult` sont
///   traités séparément ; `.value` n'est jamais lu (il écraserait le signal de
///   fraîcheur).
/// - **Dégradation hors ligne** : la lecture est toujours servie depuis le
///   cache, et l'absence de réseau se DIT au lieu de vider la carte.
///
/// Ce qui n'est délibérément PAS fait : aucune mise à jour optimiste en
/// lecture. Un jeu de résultats à proximité est calculé par le serveur
/// (`$geoNear` + distances) ; le deviner localement afficherait des voisins
/// faux. Mieux vaut le dire que d'inventer une optimisation qui mentirait.
@MainActor
final class NearbyDiscoveryViewModel: ObservableObject {

    /// Rayon de départ. Assez large pour qu'une ville dense rende quelque
    /// chose, assez étroit pour que « à proximité » veuille encore dire
    /// quelque chose.
    static let defaultRadiusKm: Double = 25
    /// Les rayons offerts. Bornés : le gateway rejette au-delà de 20 000 km,
    /// et un curseur libre n'apporterait rien qu'une chance de 400.
    static let offeredRadiiKm: [Double] = [5, 25, 100, 500]

    private static let pageLimit = 30

    /// Le mode Discover ne se pose que si le rôle le permet : un état
    /// restauré ou un geste hors picker retombe sur la densité.
    @Published var mode: NearbyDiscoveryMode = .density {
        didSet {
            if mode == .discover, !canDiscover { mode = .density }
        }
    }
    @Published private(set) var posts: [FeedPost] = []
    /// **Discover** : les publications du fil qui portent un lieu affiché,
    /// servies depuis le cache `main-feed` — la source même de l'ancienne
    /// carte du header. Jamais lues pour un rôle non autorisé.
    @Published private(set) var discoverPosts: [FeedPost] = []
    /// Le rôle du lecteur tranche UNE fois, à la construction.
    let canDiscover: Bool

    static let discoverSourceKey = "main-feed"

    var availableModes: [NearbyDiscoveryMode] {
        NearbyDiscoveryMode.allCases.filter { $0 != .discover || canDiscover }
    }

    /// L'écran vide du mode Discover, distinct des raisons de proximité : une
    /// position refusée n'empêche pas de voir le fil sur la carte.
    var discoverEmptyReason: NearbyEmptyReason? {
        guard canDiscover, mode == .discover, discoverPosts.isEmpty else { return nil }
        return .nothingOnTheMap
    }
    @Published private(set) var cells: [NearbyDensityCell] = []
    @Published private(set) var center: CLLocationCoordinate2D?
    @Published private(set) var radiusKm: Double = NearbyDiscoveryViewModel.defaultRadiusKm
    @Published private(set) var emptyReason: NearbyEmptyReason?
    /// `true` tant qu'aucune donnée — cache comprise — n'a été posée. C'est le
    /// SEUL état qui autorise un squelette.
    @Published private(set) var isColdStart = true
    /// Une revalidation silencieuse est en cours par-dessus des données déjà
    /// affichées. Rend une pastille discrète, jamais un voile.
    @Published private(set) var isRevalidating = false
    @Published private(set) var isOffline = false
    /// Âge des données servies depuis le cache, en secondes. `nil` quand elles
    /// viennent du réseau.
    @Published private(set) var cacheAge: TimeInterval?

    private let service: NearbyDiscoveryServiceProviding
    private let location: NearbyLocationProviding
    private let network: NetworkMonitorProviding
    private let cache: NearbyPostCaching
    private let languageProvider: LanguageProviding

    private var distancesByPostId: [String: Double] = [:]
    /// Le point CONSENTI de chaque publication, par identifiant — jamais son
    /// badge. Rempli depuis la réponse réseau, vidé quand l'écran est servi
    /// depuis le cache : le grain d'une publication ne se devine pas.
    private var placementsByPostId: [String: NearbyMapPin.Placement] = [:]
    /// Densité par clé de cache, pour la SESSION seulement.
    ///
    /// Elle n'est pas persistée, et c'est assumé : un comptage par cellule
    /// n'est qu'un agrégat, il se refait en une requête, et le persister
    /// aurait demandé un magasin de plus. Hors ligne, la carte retombe sur les
    /// pins du cache et le dit — jamais une carte vide.
    private var densityByKey: [String: [NearbyDensityCell]] = [:]
    private var nextOffset: Int?
    private var isLoading = false
    /// La demande de rechargement arrivée PENDANT un chargement, à rejouer.
    ///
    /// Le garde `!isLoading` protégeait d'un double appel réseau, mais il
    /// JETAIT la demande — alors que `setRadius` et `recenter` avaient déjà
    /// muté l'état publié. La barre de rayon s'allumait sur 100 km pendant que
    /// les données restaient celles de 25, définitivement : aucun geste des
    /// surfaces carte ne pouvait rattraper l'écart.
    private var pendingForceRefresh: Bool?
    private var cancellables = Set<AnyCancellable>()

    private static let log = Logger(subsystem: "me.meeshy.app", category: "nearby")

    init(
        initialCoordinate: CLLocationCoordinate2D? = nil,
        service: NearbyDiscoveryServiceProviding = NearbyDiscoveryService.shared,
        location: NearbyLocationProviding = NearbyLocationProvider.shared,
        network: NetworkMonitorProviding = NetworkMonitor.shared,
        cache: NearbyPostCaching = NearbyFeedPostCache(),
        languageProvider: LanguageProviding = AuthManagerLanguageProvider(),
        viewerRole: String? = AuthManager.shared.currentUser?.role
    ) {
        self.service = service
        self.location = location
        self.network = network
        self.cache = cache
        self.languageProvider = languageProvider
        self.canDiscover = NearbyDiscoverAccess.isAllowed(role: viewerRole)
        // La coordonnée d'entrée n'est qu'une GRAINE — voir `resolveCenter`.
        self.center = initialCoordinate
        self.isOffline = !network.isOnline
        observeNetwork()
    }

    /// La moitié « revalidate » du Stale-While-Revalidate : sans déclencheur,
    /// le retour du réseau ne relançait RIEN, et les surfaces carte n'offrent
    /// aucun tirer-pour-rafraîchir. L'écran restait sur ses dernières données
    /// et sur son bandeau hors ligne jusqu'à ce qu'on le quitte.
    ///
    /// **Le saut sur le main n'est pas décoratif.** `isOfflinePublisher`
    /// débounce sur `DispatchQueue.global(qos: .utility)` et LIVRE sur cette
    /// file ; la fermeture du `sink` appartient à une classe `@MainActor`, et
    /// le runtime vérifie l'exécuteur à son entrée. Sans `receive(on:)`, la
    /// première transition réseau après l'ouverture de l'écran trappait
    /// (`SIGTRAP`, `_dispatch_assert_queue_fail`) — le crash « Find nearby »
    /// du 2026-08-25, quelques secondes après le tap. Même forme que
    /// `SyncPillViewModel`, l'autre abonné de ce publisher.
    private func observeNetwork() {
        network.isOfflinePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] offline in
                Task { @MainActor in
                    guard let self else { return }
                    self.isOffline = offline
                    guard !offline else { return }
                    await self.load()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Lecture

    func distanceMeters(for postId: String) -> Double? {
        distancesByPostId[postId]
    }

    /// **Les pins de la carte, plantés sur le point CONSENTI.**
    ///
    /// `Post.geoPoint` d'abord — la coordonnée quantifiée au grain que
    /// l'auteur a choisi, celle-là même depuis laquelle le serveur a mesuré la
    /// distance affichée à côté. Planter le badge (`post.location`) à sa place
    /// situait au mètre près quelqu'un qui avait choisi « Région », et faisait
    /// dire deux choses différentes au même écran.
    ///
    /// Le badge ne sert de repli que pour une publication servie depuis le
    /// CACHE, où le point consenti n'a pas été retenu : c'est alors le lieu
    /// que la publication affiche déjà publiquement, et le seul point
    /// disponible — l'alternative étant une carte vide. Aucun cercle n'y est
    /// dessiné, faute de grain connu.
    var mappablePins: [NearbyMapPin] {
        posts.compactMap { post in
            if let placement = placementsByPostId[post.id] {
                return NearbyMapPin(
                    post: post,
                    latitude: placement.latitude,
                    longitude: placement.longitude,
                    precision: placement.precision
                )
            }
            guard let badge = post.location else { return nil }
            return NearbyMapPin(
                post: post,
                latitude: badge.latitude,
                longitude: badge.longitude,
                precision: nil
            )
        }
    }

    var hasContent: Bool {
        !posts.isEmpty || !cells.isEmpty
    }

    var hottestCellCount: Int {
        cells.map(\.count).max() ?? 0
    }

    var cellSize: NearbyDensityCellSize {
        NearbyDensityCellSize.forRadius(kilometers: radiusKm)
    }

    /// **Ce que la carte dessine — et pourquoi elle n'est JAMAIS vide.**
    ///
    /// En densité, les cellules remplacent les points : un pin par publication
    /// par-dessus une carte de chaleur est illisible. Mais quand il n'y a
    /// AUCUNE cellule — hors ligne, ou densité pas encore revenue — masquer
    /// aussi les points laisserait une carte vide alors que le cache tient des
    /// publications parfaitement affichables. La densité n'est pas persistée
    /// (c'est un agrégat, il se refait en une requête) ; les publications, si.
    ///
    /// Un écran qui a quelque chose à montrer le montre.
    var showsIndividualPins: Bool {
        mode != .density || cells.isEmpty
    }

    // MARK: - Gestes

    /// **Une demande arrivée pendant un chargement est REJOUÉE, jamais
    /// jetée.** `setRadius` et `recenter` publient leur nouvel état AVANT
    /// d'appeler : l'avaler laissait l'écran affirmer un rayon ou un centre
    /// que les données ne servaient pas, sans aucun geste pour en sortir.
    func load(forceRefresh: Bool = false) async {
        guard !isLoading else {
            // Un rafraîchissement forcé l'emporte sur une simple relecture :
            // les deux demandes se fondent, la plus exigeante gagne.
            pendingForceRefresh = (pendingForceRefresh ?? false) || forceRefresh
            return
        }
        isLoading = true
        defer { isLoading = false }

        await performLoad(forceRefresh: forceRefresh)
        while let queued = pendingForceRefresh {
            pendingForceRefresh = nil
            await performLoad(forceRefresh: queued)
        }
    }

    private func performLoad(forceRefresh: Bool) async {
        // La vérité du réseau n'a pas à attendre une réponse HTTP : sans cette
        // ligne, une clé fraîche servie EN LIGNE sortait par le retour anticipé
        // ci-dessous sans jamais effacer un `isOffline` posé au tour précédent,
        // et l'écran affichait « Hors ligne » à un utilisateur connecté.
        isOffline = !network.isOnline

        // AVANT la position : Discover ne dépend ni d'un relevé ni du réseau,
        // et un modérateur qui a refusé la localisation doit quand même voir
        // le fil sur la carte.
        await serveDiscoverPosts()

        guard let coordinate = await resolveCenter() else { return }
        center = coordinate
        let key = NearbyDiscoveryQuery.cacheKey(
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            radiusKm: radiusKm
        )

        var servedFromCache = false
        if !forceRefresh {
            switch await cache.load(key: key) {
            case .fresh(let cached, let age):
                serve(cached: cached, age: age)
                servedFromCache = true
                if let known = densityByKey[key] {
                    cells = known
                    isRevalidating = false
                    settle()
                    return
                }
            case .stale(let cached, let age):
                serve(cached: cached, age: age)
                servedFromCache = true
            case .expired, .empty:
                break
            }
        }

        guard network.isOnline else {
            isOffline = true
            settle()
            return
        }

        isRevalidating = servedFromCache
        await fetch(coordinate: coordinate, key: key)
    }

    /// Pull-to-refresh : court-circuite la lecture de cache. L'écriture qui
    /// suit remet la clé au frais.
    func refresh() async {
        await load(forceRefresh: true)
    }

    func setRadius(kilometers: Double) async {
        guard kilometers != radiusKm else { return }
        radiusKm = kilometers
        nextOffset = nil
        await load()
    }

    func recenter(on coordinate: CLLocationCoordinate2D) async {
        center = coordinate
        nextOffset = nil
        await load()
    }

    /// Taper une cellule de densité : on descend au niveau des publications,
    /// centré sur cette cellule (spec §4 — « zoomer ou taper une cellule
    /// bascule vers les pins individuels »).
    func focus(on cell: NearbyDensityCell) async {
        mode = .pins
        await recenter(on: CLLocationCoordinate2D(latitude: cell.cellLat, longitude: cell.cellLng))
    }

    func loadMore() async {
        guard !isLoading, let coordinate = center, let offset = nextOffset else { return }
        guard network.isOnline else {
            isOffline = true
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let page = try await service.nearby(
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
                radiusKm: radiusKm,
                cursor: offset,
                limit: Self.pageLimit
            )
            append(page: page.data)
            nextOffset = NearbyDiscoveryPage.nextOffset(from: page.pagination?.nextCursor)
        } catch {
            apply(failure: error)
        }
    }

    // MARK: - Résolution du point de départ

    /// Rend la coordonnée de travail, ou `nil` après avoir posé la raison
    /// exacte pour laquelle il n'y en a pas.
    ///
    /// **Un centre déjà connu l'emporte sur CoreLocation, et c'est le SEUL
    /// court-circuit.** La coordonnée d'entrée (« Voir près d'ici ») sert de
    /// GRAINE, posée sur `center` à la construction : c'est ce qui fait marcher
    /// l'écran permission refusée. La relire ici la ferait GAGNER à chaque
    /// chargement, et tout geste de déplacement — recentrage, appui sur une
    /// cellule de densité — serait silencieusement annulé au tour suivant.
    /// Un point d'entrée est un point de DÉPART, pas une ancre.
    private func resolveCenter() async -> CLLocationCoordinate2D? {
        if let center { return center }

        switch location.authorizationStatus {
        case .denied, .restricted:
            isColdStart = false
            emptyReason = .locationDenied
            return nil
        case .notDetermined:
            location.requestAuthorization()
        default:
            break
        }

        // `currentCoordinate()` ATTEND la décision quand elle n'est pas encore
        // prise : au retour, le statut est tranché. C'est pourquoi la raison se
        // relit ICI et non avant — annoncer « Position introuvable » pendant que
        // l'alerte système est encore à l'écran nommait un échec que personne
        // n'avait causé, et un refus s'y serait affiché sous la mauvaise phrase.
        guard let fix = await location.currentCoordinate() else {
            isColdStart = false
            emptyReason = Self.reasonForMissingFix(status: location.authorizationStatus)
            return nil
        }
        return fix
    }

    private static func reasonForMissingFix(status: CLAuthorizationStatus) -> NearbyEmptyReason {
        switch status {
        case .denied, .restricted: return .locationDenied
        default:                   return .awaitingLocation
        }
    }

    // MARK: - Réseau

    /// **Les deux routes sont INDÉPENDANTES, et leurs échecs aussi.**
    ///
    /// Les attendre dans un même `do` faisait qu'un échec de la densité — une
    /// agrégation `$group`, un index pas encore posé — jetait une page de pins
    /// déjà décodée : l'écran se vidait entièrement et annonçait « aucune
    /// publication dans ce rayon » alors que le serveur venait d'en rendre
    /// trente. Rien côté serveur ne lie ces deux handlers ; rien ici non plus.
    ///
    /// Seul l'échec des PINS est une raison d'écran vide. La densité qui
    /// manque n'en est pas une : `showsIndividualPins` sait déjà retomber sur
    /// les points.
    private func fetch(coordinate: CLLocationCoordinate2D, key: String) async {
        async let pins = service.nearby(
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            radiusKm: radiusKm,
            cursor: 0,
            limit: Self.pageLimit
        )
        async let density = service.density(
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            radiusKm: radiusKm,
            cellSize: cellSize
        )

        do {
            let grid = try await density
            cells = grid
            densityByKey[key] = grid
        } catch {
            Self.log.error(
                "nearby density failed: \(error.localizedDescription, privacy: .public)"
            )
        }

        do {
            let page = try await pins
            replace(page: page.data)
            nextOffset = NearbyDiscoveryPage.nextOffset(from: page.pagination?.nextCursor)
            isOffline = false
            cacheAge = nil
            await cache.save(posts, key: key)
            isRevalidating = false
            settle()
        } catch {
            apply(failure: error)
        }
    }

    /// Traduit un échec en RAISON affichable.
    ///
    /// **Le type filtré est `MeeshyError`, et c'est tout le sujet.** Le
    /// transport de ces deux routes passe par `APIClient.request`, qui ne lève
    /// QUE des `MeeshyError` : filtrer sur `APIError` faisait échouer le cast
    /// à tous les coups en production, rendait mortes les branches 401 et
    /// réseau, et faisait retomber TOUT échec — y compris un 500 — sur
    /// « aucune publication dans ce rayon », avec un bouton « Élargir le
    /// rayon » qui ne pouvait rien y faire. Trois tests le prouvaient vert en
    /// injectant un type que le transport ne produit jamais.
    ///
    /// `MeeshyError.from` normalise les deux familles, donc un double qui lève
    /// encore un `APIError` reste correctement nommé.
    ///
    /// Un 401 est terminal et se pose directement : le faire retomber dans
    /// `settle()` le remplacerait par « aucun résultat dans ce rayon », qui
    /// enverrait l'utilisateur élargir un rayon alors qu'il lui manque un
    /// compte. C'est exactement la confusion que l'énumération existe pour
    /// éviter.
    private func apply(failure: Error) {
        isRevalidating = false

        switch MeeshyError.from(failure) {
        case .auth:
            isColdStart = false
            emptyReason = .signInRequired
        case .server(let statusCode, _) where statusCode == 401:
            isColdStart = false
            emptyReason = .signInRequired
        case .network:
            isOffline = true
            settle()
        case let other:
            Self.log.error(
                "nearby fetch failed: \(other.localizedDescription, privacy: .public)"
            )
            settle(reason: .serviceUnavailable)
        }
    }

    // MARK: - Publication de l'état

    /// Cache-first et cache-SEUL : le fil est déjà chargé et persisté par
    /// `FeedViewModel` sous `main-feed` ; ne retenir que ce qui porte un lieu.
    /// Un cache expiré ou vide rend une carte vide qui le DIT
    /// (`discoverEmptyReason`), jamais un appel réseau de plus.
    private func serveDiscoverPosts() async {
        guard canDiscover else { return }
        switch await cache.load(key: Self.discoverSourceKey) {
        case .fresh(let feed, _), .stale(let feed, _):
            discoverPosts = feed.filter { $0.location != nil }
        case .expired, .empty:
            discoverPosts = []
        }
    }

    private func serve(cached: [FeedPost], age: TimeInterval) {
        posts = cached
        // Une distance servie depuis le cache n'existe pas : elle a été
        // calculée depuis une position que le lecteur a quittée. Mieux vaut ne
        // rien dire qu'afficher un chiffre faux. Le point consenti part avec
        // elle, pour la raison jumelle : le cache ne retient que la
        // publication, pas le grain auquel son auteur l'a rendue trouvable.
        distancesByPostId = [:]
        placementsByPostId = [:]
        cacheAge = age
        isColdStart = false
        emptyReason = nil
    }

    private func replace(page: [NearbyPost]) {
        let preferred = languageProvider.preferredLanguages
        posts = page.map { $0.post.toFeedPost(preferredLanguages: preferred) }
        distancesByPostId = distances(in: page)
        placementsByPostId = placements(in: page)
        isColdStart = false
    }

    private func append(page: [NearbyPost]) {
        let preferred = languageProvider.preferredLanguages
        let known = Set(posts.map(\.id))
        posts += page
            .filter { !known.contains($0.id) }
            .map { $0.post.toFeedPost(preferredLanguages: preferred) }
        distancesByPostId.merge(distances(in: page)) { _, new in new }
        placementsByPostId.merge(placements(in: page)) { _, new in new }
        isColdStart = false
    }

    private func distances(in page: [NearbyPost]) -> [String: Double] {
        page.reduce(into: [String: Double]()) { partial, item in
            guard let meters = item.distanceMeters else { return }
            partial[item.id] = meters
        }
    }

    private func placements(in page: [NearbyPost]) -> [String: NearbyMapPin.Placement] {
        page.reduce(into: [String: NearbyMapPin.Placement]()) { partial, item in
            guard let point = item.geoPoint else { return }
            partial[item.id] = NearbyMapPin.Placement(
                latitude: point.latitude,
                longitude: point.longitude,
                precision: item.geoPrecision
            )
        }
    }

    /// Un état vide N'EST vide que lorsqu'il n'y a réellement rien à montrer.
    /// Tant qu'un cache tient l'écran, le hors-ligne est un BANDEAU, pas un
    /// état vide.
    private func settle(reason: NearbyEmptyReason? = nil) {
        isColdStart = false
        guard !hasContent else {
            emptyReason = nil
            return
        }
        emptyReason = reason ?? (isOffline ? .offline : .noneInRadius)
    }
}
