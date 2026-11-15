import SwiftUI
import Combine
import MapKit
import CoreLocation
import MeeshySDK
import MeeshyUI
import os

// MARK: - Location Picker Model

/// `nonisolated` sur le TYPE + `@unchecked Sendable`.
///
/// Le target app compile avec `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` :
/// une classe `@MainActor` sans `deinit` écrite reçoit une deinit ISOLÉE
/// (SE-0466). Sur iOS < 26 cette deinit passe par le shim de rétro-déploiement
/// `swift_task_deinitOnExecutorMainActorBackDeploy`, qui libère DEUX FOIS le
/// scope task-local et tue le processus. Le picker étant une sheet, ce chemin
/// est exercé à CHAQUE fermeture. Même signature que le crash `ScrollOffsetRelay`.
///
/// `@unchecked Sendable` est requis parce que les fermetures de delegate et de
/// complétion capturent `self` depuis un contexte nonisolated. Ce n'est pas une
/// échappatoire : l'invariant est vérifié — le modèle naît dans un `@StateObject`
/// (donc sur le main), `CLLocationManager` créé sur le main rappelle sur le main,
/// `CLGeocoder` et `MKLocalSearch` documentent une complétion sur le main, et
/// toute écriture de propriété publiée est faite depuis le main (les fermetures
/// de complétion repassent explicitement par `Task { @MainActor }`).
/// `objectWillChange` n'est donc jamais émis hors du main. Même patron que
/// `PiPVideoRenderer`.
nonisolated final class LocationPickerModel: NSObject, ObservableObject, CLLocationManagerDelegate, @unchecked Sendable {
    /// `willSet { objectWillChange.send() }` PLUTÔT que `@Published` : le
    /// compilateur refuse `nonisolated` sur une propriété enveloppée
    /// (« 'nonisolated' is not supported on properties with property wrappers »),
    /// et l'annotation doit vivre sur le TYPE pour désisoler la deinit. C'est
    /// exactement ce que `@Published` fait — publier avant l'écriture.
    var selectedCoordinate: CLLocationCoordinate2D? { willSet { objectWillChange.send() } }
    var addressString: String? { willSet { objectWillChange.send() } }
    /// Nom du POI choisi depuis un résultat de recherche MapKit. `nil` pour un
    /// point posé à la main (déplacement de la carte) — seule l'adresse
    /// géocodée est alors disponible.
    var selectedName: String? { willSet { objectWillChange.send() } }
    /// Catégorie MapKit du POI (`MKPointOfInterestCategory.rawValue`).
    var selectedCategory: String? { willSet { objectWillChange.send() } }
    /// Composants du `CLPlacemark` conservés SÉPARÉMENT. `addressString` les
    /// aplatit pour l'affichage ; la dégradation de précision a besoin de
    /// choisir entre quartier, ville et région, ce qu'une chaîne jointe rend
    /// impossible.
    var selectedCoarseNames: PlaceCoarseNames = .empty { willSet { objectWillChange.send() } }
    var isGeocoding = false { willSet { objectWillChange.send() } }
    var searchResults: [MKMapItem] = [] { willSet { objectWillChange.send() } }
    var userLocation: CLLocationCoordinate2D? {
        willSet {
            objectWillChange.send()
            if let newValue { userLocationUpdates.send(newValue) }
        }
    }
    /// Remplaçant explicite de la projection `$userLocation`, que le dépliage
    /// des `@Published` supprime. La vue en a besoin pour recentrer la carte sur
    /// le PREMIER relevé seulement (iOS 16 n'a pas de mode `.userLocation`) :
    /// `objectWillChange` ne peut pas la servir, il tire avant l'écriture et ne
    /// porte pas la valeur.
    let userLocationUpdates = PassthroughSubject<CLLocationCoordinate2D, Never>()
    /// Statut d'autorisation, publié pour que la vue puisse expliquer un refus
    /// au lieu de laisser l'utilisateur attendre un relevé qui ne viendra pas.
    private(set) var authorization: CLAuthorizationStatus = .notDetermined {
        willSet { objectWillChange.send() }
    }

    var isLocationRefused: Bool {
        authorization == .denied || authorization == .restricted
    }

    /// Lieu complet prêt à être partagé, ou `nil` tant qu'aucun point n'est
    /// choisi. Le nom vient d'un résultat de recherche ; pour un point posé à
    /// la main il reste `nil` et seule l'adresse géocodée est disponible.
    var selectedPlace: SharedPlace? {
        guard let coordinate = selectedCoordinate else { return nil }
        return SharedPlace(latitude: coordinate.latitude, longitude: coordinate.longitude,
                           name: selectedName, address: addressString, category: selectedCategory)
    }

    /// Le lieu tel qu'il PARTIRA, précision appliquée. `selectedPlace` reste
    /// brut : conserver le brut permet de changer de précision sans
    /// re-géocoder.
    func sharedPlace(at precision: LocationPrecision) -> SharedPlace? {
        guard let place = selectedPlace else { return nil }
        return precision.coarsen(place, names: selectedCoarseNames)
    }

    private let manager = CLLocationManager()
    private let geocoder = CLGeocoder()
    private var geocodeTask: Task<Void, Never>?
    private let log = MeeshyLog.logger(.location)

    /// Garde contre deux relevés concurrents. À l'ouverture d'un picker déjà
    /// autorisé, `requestPermission()` et le callback d'autorisation initial
    /// tiraient chacun un `requestLocation()` : CoreLocation annulait alors la
    /// première requête et répondait `kCLErrorLocationUnknown`, laissant l'UI
    /// attendre un relevé qui n'arriverait jamais.
    private var isAwaitingFix = false

    private func requestFixIfIdle() {
        guard !isAwaitingFix else { return }
        isAwaitingFix = true
        manager.requestLocation()
    }

    override init() {
        super.init()
        manager.desiredAccuracy = kCLLocationAccuracyBest
        authorization = manager.authorizationStatus
    }

    /// Appelé à l'ouverture du picker — c'est-à-dire APRÈS le tap explicite sur
    /// « Localisation » dans le composer, le bon moment pour demander.
    ///
    /// Le delegate est câblé ici et non dans `init()` : CoreLocation émet un
    /// callback d'autorisation dès l'assignation, et le recevoir avant que
    /// SwiftUI ait installé le `@StateObject` publie une modification en
    /// plein cycle de rendu. `if manager.delegate == nil` rend le câblage
    /// idempotent puisque `requestPermission()` peut être rappelé.
    ///
    /// `requestLocation()` n'est plus lancé tant que l'autorisation n'est pas
    /// acquise : l'appeler sur un statut refusé ne produisait qu'un
    /// `didFailWithError` silencieux. Sur un octroi,
    /// `locationManagerDidChangeAuthorization` déclenche le relevé.
    func requestPermission() {
        if manager.delegate == nil { manager.delegate = self }
        authorization = manager.authorizationStatus
        log.info("breadcrumb.request status=\(self.authorization.rawValue, privacy: .public)")
        switch authorization {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            requestFixIfIdle()
        default:
            break
        }
    }

    func updateSelectedLocation(_ coordinate: CLLocationCoordinate2D) {
        // Idempotence : sans cette garde, un callback caméra qui republie la
        // MÊME coordonnée (`onMapCameraChange` peut ré-émettre avec un centre
        // identique à la dérive flottante près) écrit `selectedCoordinate`,
        // ce qui tire `objectWillChange`, ce qui re-rend `mapView` →
        // `ModernInteractiveMap.body`, ce qui fait rappeler `updateUIView`
        // par SwiftUI — un chemin de ré-entrance dans MapKit qui gèle le
        // main thread. Preuve par process sampling: deux
        // occurrences imbriquées de
        // `-[MKMapView _performActionAsIfGoingToDefaultLocation:]` sur la
        // même pile.
        if let current = selectedCoordinate, CoordinateEquivalence.isApproximatelyEqual(current, coordinate) {
            return
        }
        selectedCoordinate = coordinate
        // Déplacer la carte après avoir choisi un POI ne doit pas conserver le
        // nom d'un point qu'on a quitté — sinon un point posé à la main
        // hériterait du nom du dernier résultat de recherche sélectionné.
        //
        // Le nettoyage est CONDITIONNEL : `willSet` publie à chaque
        // affectation, sans comparer. Écrire `nil` sur une valeur déjà `nil`
        // tirait donc deux `objectWillChange` de plus par mise à jour — trois
        // émissions pour un seul point choisi, donc trois re-renders de la
        // carte au lieu d'un. C'est exactement le chemin de ré-entrance
        // MapKit que la garde d'idempotence ci-dessus ferme ; le laisser
        // ouvert ici l'aurait rouvert en trois exemplaires.
        if selectedName != nil { selectedName = nil }
        if selectedCategory != nil { selectedCategory = nil }
        if selectedCoarseNames != .empty { selectedCoarseNames = .empty }
        geocodeTask?.cancel()
        // Hop `@MainActor` explicite : le type est désormais nonisolated, donc
        // ce `Task` n'hérite plus du main actor comme avant. Le géocodage écrit
        // `isGeocoding`/`addressString`, donc `objectWillChange` — SwiftUI exige
        // que ces émissions restent sur le main.
        geocodeTask = Task { @MainActor [weak self] in
            guard await cancellableSleep(for: .milliseconds(300)), !Task.isCancelled else { return }
            self?.reverseGeocode(coordinate)
        }
    }

    func reverseGeocode(_ coordinate: CLLocationCoordinate2D) {
        isGeocoding = true
        addressString = nil
        geocoder.cancelGeocode()

        let location = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        geocoder.reverseGeocodeLocation(location) { [weak self] placemarks, _ in
            let placemark = placemarks?.first
            let address = placemark.map { mark in
                let parts = [mark.name, mark.thoroughfare, mark.locality, mark.country]
                    .compactMap { $0 }
                return parts.reduce(into: [String]()) { acc, part in
                    if !acc.contains(part) { acc.append(part) }
                }.joined(separator: ", ")
            }
            // Composants captés dans le MÊME callback — la dégradation de
            // précision en a besoin séparés, et une seconde requête de
            // géocodage pour les obtenir serait gratuite.
            let names = PlaceCoarseNames(
                subLocality: placemark?.subLocality,
                locality: placemark?.locality,
                administrativeArea: placemark?.administrativeArea,
                country: placemark?.country
            )
            Task { @MainActor [weak self] in
                self?.isGeocoding = false
                self?.selectedCoarseNames = names
                if let address { self?.addressString = address }
            }
        }
    }

    func search(query: String) {
        guard !query.isEmpty else { searchResults = []; return }
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        request.resultTypes = [.address, .pointOfInterest]
        if let loc = userLocation {
            request.region = MKCoordinateRegion(center: loc,
                                                latitudinalMeters: LocationSearchPlan.searchRegionMeters,
                                                longitudinalMeters: LocationSearchPlan.searchRegionMeters)
        }
        // `.start` retains its completion closure until the request finishes.
        // Without `[weak self]` the closure strongly captures `self`, and if
        // the picker is dismissed while the search is in flight the model
        // leaks — worse, the implicit main-actor hop can outlive the scene
        // and write into a zombie `searchResults`. Capture weakly and bail
        // early if the picker was torn down.
        MKLocalSearch(request: request).start { [weak self] response, _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.searchResults = Array(response?.mapItems.prefix(LocationSearchPlan.maxResults) ?? [])
            }
        }
    }

    /// **Autour de moi** : les lieux nommés dans un rayon d'un kilomètre, les
    /// plus proches d'abord, rendus dans la même liste que la recherche.
    func searchNearby() {
        guard let centre = userLocation else {
            requestPermission()
            return
        }
        let requête = MKLocalPointsOfInterestRequest(center: centre, radius: LocationSearchPlan.nearbyRadiusMeters)
        let origine = CLLocation(latitude: centre.latitude, longitude: centre.longitude)
        MKLocalSearch(request: requête).start { [weak self] response, _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let proches = (response?.mapItems ?? []).sorted {
                    $0.placemark.location?.distance(from: origine) ?? .infinity
                        < $1.placemark.location?.distance(from: origine) ?? .infinity
                }
                self.searchResults = Array(proches.prefix(LocationSearchPlan.maxResults))
            }
        }
    }

    func centerOnUser() {
        requestFixIfIdle()
    }

    // Les trois callbacks de delegate ne portent plus `nonisolated` : le TYPE
    // entier l'est désormais, l'annotation par méthode serait redondante.
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        isAwaitingFix = false
        log.info("breadcrumb.fix count=\(locations.count, privacy: .public)")
        guard let loc = locations.last else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.userLocation = loc.coordinate
            if self.selectedCoordinate == nil {
                self.selectedCoordinate = loc.coordinate
                self.reverseGeocode(loc.coordinate)
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // A silent no-op here swallows denied permissions, airplane mode and
        // transient CoreLocation errors. Log so we can diagnose why the
        // picker never surfaces a result, and clear the pending geocoding
        // state so the UI does not spin forever.
        isAwaitingFix = false
        log.error("breadcrumb.failure \(error.localizedDescription, privacy: .public)")
        Task { @MainActor [weak self] in
            self?.isGeocoding = false
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        log.info("breadcrumb.authorization status=\(status.rawValue, privacy: .public)")
        Task { @MainActor [weak self] in
            self?.authorization = status
        }
        if status == .authorizedWhenInUse || status == .authorizedAlways {
            requestFixIfIdle()
        }
    }
}
