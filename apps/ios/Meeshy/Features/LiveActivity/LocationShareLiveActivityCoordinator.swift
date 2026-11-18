import Combine
import CoreLocation
import Foundation
import MeeshySDK

/// Le nom d'un lieu servi, à sa précision (`LocationShareActivityLaw.Place.named`).
protocol LocationSharePlaceNaming {
    func label(latitude: Double, longitude: Double, precision: SharedLocationPrecision) async -> LocationShareActivityLaw.Place.Label?
}

/// Le géocodeur du système, sur la coordonnée TELLE QUE SERVIE (déjà floutée par la passerelle).
struct GeocoderPlaceNaming: LocationSharePlaceNaming {
    func label(latitude: Double, longitude: Double, precision: SharedLocationPrecision) async -> LocationShareActivityLaw.Place.Label? {
        let location = CLLocation(latitude: latitude, longitude: longitude)
        guard let placemark = try? await CLGeocoder().reverseGeocodeLocation(location).first else { return nil }
        let label = LocationShareActivityLaw.Place.named(
            subLocality: placemark.subLocality,
            locality: placemark.locality ?? placemark.administrativeArea,
            precision: precision
        )
        return label.name == nil ? nil : label
    }
}

/// **Exécute `LocationShareActivityLaw`** : ouvre, met à jour, remplace et ferme l'activité en direct d'une position
/// qu'on me partage (planche `Hors-App`, vues 1 et 2, #19524).
///
/// Il lit le magasin des positions du compte connecté (`SharedLocationsLiveHolder`), nomme les personnes par
/// l'annuaire des cercles et leur lieu par le géocodeur, puis laisse la loi décider. ActivityKit est l'affaire de
/// `LiveActivityHost` (#11524). À la déconnexion, l'activité se ferme sans s'afficher.
@MainActor
final class LocationShareLiveActivityCoordinator {
    nonisolated deinit {}

    static let shared = LocationShareLiveActivityCoordinator()

    private var host: (any LiveActivityHostProviding<LocationShareActivitySnapshot>)?
    private var boundUserId: String?
    private var cancellable: AnyCancellable?
    private var accountWatch: AnyCancellable?
    private var shares: [String: SharedLocationEntry] = [:]
    private var shown: LocationShareActivityLaw.Shown?
    private var people: [String: CirclePerson] = [:]
    private var places: [String: LocationShareActivityLaw.Place] = [:]
    private var asking = Set<String>()
    private let resolver: CirclePeopleResolving
    private let naming: LocationSharePlaceNaming
    private let now: () -> Date

    init(
        resolver: CirclePeopleResolving = CirclePeopleDirectory.shared,
        naming: LocationSharePlaceNaming = GeocoderPlaceNaming(),
        now: @escaping () -> Date = { Date() }
    ) {
        self.resolver = resolver
        self.naming = naming
        self.now = now
    }

    /// Suit le compte connecté : un compte branche SON magasin, la déconnexion ferme l'activité.
    func followAccounts(_ accounts: AnyPublisher<String?, Never> = AuthManager.shared.$currentUser.map { $0?.id }.eraseToAnyPublisher()) {
        guard accountWatch == nil else { return }
        accountWatch = accounts
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] userId in
                guard let userId, !userId.isEmpty else {
                    self?.stop()
                    return
                }
                self?.start(userId: userId)
            }
    }

    /// Branche le magasin du compte connecté ; rebranche si le compte a changé.
    func start(userId: String?) {
        #if canImport(ActivityKit)
        guard let userId, !userId.isEmpty, userId != boundUserId else { return }
        guard #available(iOS 16.1, *) else { return }
        stop()
        boundUserId = userId
        let host = LiveActivityHost<LocationShareActivityAttributes, LocationShareActivitySnapshot> { [weak self] in
            LocationShareLiveActivityCoordinator.attributes(for: self?.shown?.identity)
        }
        self.host = host
        host.endOrphans()
        cancellable = SharedLocationsLiveHolder.live().$byUser
            .receive(on: DispatchQueue.main)
            .sink { [weak self] byUser in
                self?.receive(byUser)
            }
        #endif
    }

    /// Déconnexion : plus rien n'est montré, rien ne survit au compte.
    func stop() {
        cancellable = nil
        boundUserId = nil
        if shown != nil, let host {
            host.end(LocationShareActivitySnapshot(deadline: now(), precision: "", place: nil, city: nil), dismissAfter: 0)
        }
        shown = nil
        shares = [:]
        people = [:]
        places = [:]
        asking = []
    }

    // MARK: - Interne

    private func receive(_ byUser: [String: SharedLocationEntry]) {
        shares = byUser
        apply()
        let unnamed = byUser.keys.filter { people[$0] == nil && !asking.contains($0) }
        if !unnamed.isEmpty {
            asking.formUnion(unnamed)
            Task { [weak self] in await self?.name(Array(unnamed)) }
        }
        byUser.forEach { userId, entry in locate(userId, entry) }
    }

    private func name(_ ids: [String]) async {
        let found = await resolver.people(for: ids)
        asking.subtract(ids)
        guard !found.isEmpty else { return }
        people.merge(found) { _, new in new }
        apply()
    }

    private func locate(_ userId: String, _ entry: SharedLocationEntry) {
        if let known = places[userId], known.names(entry) { return }
        let key = "place:\(userId)"
        guard !asking.contains(key) else { return }
        asking.insert(key)
        Task { [weak self, naming] in
            let label = await naming.label(latitude: entry.latitude, longitude: entry.longitude, precision: entry.precision)
            self?.named(userId, entry, label, key: key)
        }
    }

    private func named(_ userId: String, _ entry: SharedLocationEntry, _ label: LocationShareActivityLaw.Place.Label?, key: String) {
        asking.remove(key)
        guard let label, shares[userId] == entry else { return }
        places[userId] = LocationShareActivityLaw.Place(latitude: entry.latitude, longitude: entry.longitude,
                                                        name: label.name, city: label.city)
        apply()
    }

    private func apply() {
        let step = LocationShareActivityLaw.step(shown: shown, shares: shares, people: people, places: places, now: now())
        let previous = shown
        shown = step.shown
        perform(step.action, previous: previous)
    }

    private func perform(_ action: LocationShareActivityLaw.Action, previous: LocationShareActivityLaw.Shown?) {
        guard let host else { return }
        switch action {
        case .none:
            return
        case .start(let next):
            host.start(next.snapshot)
        case .update(let next):
            host.update(next.snapshot)
        case .replace(let next):
            if let previous { host.end(previous.snapshot, dismissAfter: 0) }
            host.start(next.snapshot)
        case .end:
            if let previous { host.end(previous.snapshot, dismissAfter: 0) }
        }
    }

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private static func attributes(for identity: LocationShareActivityLaw.Identity?) -> LocationShareActivityAttributes {
        LocationShareActivityAttributes(
            sharerId: identity?.userId ?? "",
            name: identity?.name ?? "",
            initials: identity?.initials ?? "",
            accentHex: identity?.accentHex ?? "",
            username: identity?.username
        )
    }
    #endif
}
