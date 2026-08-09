import SwiftUI
import Combine
import MapKit
import CoreLocation
import MeeshySDK
import MeeshyUI
import os

struct LocationPickerView: View {
    let accentColor: String
    /// Émet un lieu COMPLET (coordonnées + nom + adresse + catégorie POI),
    /// pas de simples coordonnées nues : c'est ce que jetait l'ancienne
    /// signature `(CLLocationCoordinate2D, String?) -> Void` aux quatre call
    /// sites, dont un littéral `{ coordinate, _ in }`.
    let onSelect: (SharedPlace) -> Void
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @StateObject private var viewModel = LocationPickerModel()
    @State private var searchText = ""
    @State private var mapTarget: MapTarget?
    @State private var didCenterOnUser = false

    var body: some View {
        NavigationStack {
            ZStack {
                mapView

                VStack(spacing: 0) {
                    searchBar
                    if viewModel.isLocationRefused {
                        locationDeniedBanner
                    }
                    Spacer()
                    bottomCard
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) { dismiss() }
                        .foregroundColor(Color(hex: accentColor))
                }
                ToolbarItem(placement: .principal) {
                    Text(String(localized: "location.title", defaultValue: "Choisir un lieu", bundle: .main))
                        .font(MeeshyFont.relative(16, weight: .bold))
                        .accessibilityAddTraits(.isHeader)
                }
            }
            .onAppear { viewModel.requestPermission() }
            .onReceive(viewModel.userLocationUpdates) { loc in
                // The adaptive map opens on a fixed neutral region on EVERY OS
                // version now — `.userLocation(fallback: .automatic)` resolved
                // synchronously on the main thread inside `updateUIView` and
                // could re-enter itself through `onMapCameraChange`, freezing
                // the picker (see `AdaptiveMapInitialRegion` in the SDK). So
                // every version recenters explicitly on the first fix only.
                guard !didCenterOnUser else { return }
                didCenterOnUser = true
                mapTarget = MapTarget(center: loc, latitudinalMeters: 1000, longitudinalMeters: 1000)
            }
        }
    }

    // MARK: - Permission

    /// Refus de localisation : le picker restait muet (l'échec CoreLocation ne
    /// produisait qu'un log) et l'utilisateur attendait un recentrage qui
    /// n'arriverait jamais. Le bandeau explique et renvoie aux Réglages ; la
    /// sélection manuelle sur la carte reste parfaitement utilisable, donc on
    /// n'obstrue rien.
    private var locationDeniedBanner: some View {
        Button {
            MediaPermissionCoordinator.openSettings()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "location.slash.fill")
                    .font(MeeshyFont.relative(13, weight: .semibold))
                Text(MediaPermissionCoordinator.locationDeniedMessage)
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .foregroundColor(MeeshyColors.warning)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(MeeshyColors.warning.opacity(0.15))
            )
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    // MARK: - Map

    private var mapView: some View {
        AdaptiveInteractiveMap(
            target: mapTarget,
            annotationCoordinate: viewModel.selectedCoordinate,
            onRegionChange: { center in
                viewModel.updateSelectedLocation(center)
            }
        ) {
            // Fixed: MapKit annotation marker anchored to a coordinate — system-pin
            // chrome rendered at a fixed screen size, not reading text. Scaling it
            // with Dynamic Type would detach it from the point it marks (74i/86i).
            Image(systemName: "mappin.circle.fill")
                .font(.system(size: 36))
                .foregroundStyle(Color(hex: accentColor), Color(hex: accentColor).opacity(0.3))
                .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 6, y: 3)
        }
        .ignoresSafeArea(edges: .bottom)
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            TextField(String(localized: "location.search-placeholder", defaultValue: "Rechercher un lieu...", bundle: .main), text: $searchText)
                .font(MeeshyFont.relative(14))
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
                .onSubmit { viewModel.search(query: searchText) }

            if !searchText.isEmpty {
                Button {
                    searchText = ""
                    viewModel.searchResults.removeAll()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(MeeshyFont.relative(14))
                        .foregroundColor(theme.textMuted)
                }
                .accessibilityLabel(String(localized: "common.clear-search", defaultValue: "Clear search", bundle: .main))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        // iOS 26 Liquid Glass — floating search bar over the map. The SDK
        // Compatibility wrapper owns the gating + the .ultraThinMaterial fallback.
        // Neutral (no tint): a search bar reads as OS chrome, not conversation content.
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.1), radius: 8, y: 2)
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .overlay(alignment: .top) {
            if !viewModel.searchResults.isEmpty {
                searchResultsList
                    .padding(.top, 52)
            }
        }
    }

    // MARK: - Search Results

    private var searchResultsList: some View {
        VStack(spacing: 0) {
            ForEach(viewModel.searchResults, id: \.self) { item in
                Button {
                    let coord = item.placemark.coordinate
                    viewModel.updateSelectedLocation(coord)
                    // Après `updateSelectedLocation` (qui les remet à `nil`) :
                    // MapKit connaît déjà le nom et la catégorie POI du
                    // résultat choisi, inutile d'attendre le géocodage inverse.
                    viewModel.selectedName = item.name
                    // `pointOfInterestCategory` vit sur `MKMapItem` lui-même
                    // depuis iOS 13 — PAS sur `MKPlacemark`/`CLPlacemark`, qui
                    // ne l'expose pas.
                    viewModel.selectedCategory = item.pointOfInterestCategory?.rawValue
                    viewModel.reverseGeocode(coord)
                    mapTarget = MapTarget(
                        center: coord,
                        latitudinalMeters: 500,
                        longitudinalMeters: 500
                    )
                    searchText = item.name ?? ""
                    viewModel.searchResults.removeAll()
                } label: {
                    HStack(spacing: 10) {
                        // Glyph constrained in a fixed 28×28 badge — a scalable
                        // font would overflow the frame. Kept fixed + hidden from
                        // VoiceOver (the result name carries the meaning; doctrine 86i).
                        Image(systemName: "mappin")
                            // Fixed: glyph centered in a fixed 28×28 circle badge;
                            // a scalable font would overflow the frame (doctrine 86i).
                            // Decorative — the place name carries the meaning.
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(hex: accentColor))
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(Color(hex: accentColor).opacity(0.1)))
                            .accessibilityHidden(true)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name ?? String(localized: "location.unknown", defaultValue: "Lieu inconnu", bundle: .main))
                                .font(MeeshyFont.relative(13, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                                .lineLimit(1)

                            if let subtitle = item.placemark.title {
                                Text(subtitle)
                                    .font(MeeshyFont.relative(11))
                                    .foregroundColor(theme.textSecondary)
                                    .lineLimit(1)
                            }
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                if item != viewModel.searchResults.last {
                    Divider().padding(.leading, 50)
                }
            }
        }
        // Neutral Liquid Glass: a search-results dropdown floating over the map
        // is suggestion chrome, not content — kept neutral for the same reason
        // as the @mention autocomplete bar (no accent tint on chrome surfaces).
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
        .padding(.horizontal, 16)
    }

    // MARK: - Bottom Card

    private var bottomCard: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "location.fill")
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    if let address = viewModel.addressString {
                        Text(address)
                            .font(MeeshyFont.relative(13, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(2)
                    } else if viewModel.isGeocoding {
                        HStack(spacing: 6) {
                            ProgressView()
                                .scaleEffect(0.7)
                            Text(String(localized: "location.geocoding", defaultValue: "Recherche de l'adresse...", bundle: .main))
                                .font(MeeshyFont.relative(12))
                                .foregroundColor(theme.textSecondary)
                        }
                    } else {
                        Text(String(localized: "location.move-prompt", defaultValue: "Deplacez la carte pour choisir", bundle: .main))
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textMuted)
                    }

                    if let coord = viewModel.selectedCoordinate {
                        Text(String(format: "%.5f, %.5f", coord.latitude, coord.longitude))
                            .font(MeeshyFont.relative(10, weight: .medium, design: .monospaced))
                            .foregroundColor(theme.textMuted)
                    }
                }

                Spacer()
            }
            // VoiceOver reads the selected-location summary (address + coordinates)
            // as a single element instead of three disjoint fragments.
            .accessibilityElement(children: .combine)

            HStack(spacing: 12) {
                Button {
                    viewModel.centerOnUser()
                    if let loc = viewModel.userLocation {
                        mapTarget = MapTarget(
                            center: loc, latitudinalMeters: 500, longitudinalMeters: 500
                        )
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "location.circle.fill")
                            .font(MeeshyFont.relative(14))
                        Text(String(localized: "location.my-position", defaultValue: "Ma position", bundle: .main))
                            .font(MeeshyFont.relative(12, weight: .semibold))
                    }
                    .foregroundColor(Color(hex: accentColor))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color(hex: accentColor).opacity(0.1))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color(hex: accentColor).opacity(0.3), lineWidth: 1)
                            )
                    )
                }

                Button {
                    guard let place = viewModel.selectedPlace else { return }
                    Logger(subsystem: "me.meeshy.app", category: "location")
                        .info("breadcrumb.selection hasName=\(place.name != nil, privacy: .public)")
                    onSelect(place)
                    HapticFeedback.success()
                    dismiss()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark")
                            .font(MeeshyFont.relative(14, weight: .bold))
                        Text(String(localized: "common.confirm", defaultValue: "Confirmer", bundle: .main))
                            .font(MeeshyFont.relative(13, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.8)],
                                    startPoint: .leading, endPoint: .trailing
                                )
                            )
                            .shadow(color: Color(hex: accentColor).opacity(0.3), radius: 6, y: 3)
                    )
                }
                .disabled(viewModel.selectedCoordinate == nil)
                .opacity(viewModel.selectedCoordinate == nil ? 0.5 : 1)
            }
        }
        .padding(16)
        // iOS 26 Liquid Glass — floating bottom action card over the map. Neutral
        // glass; the inner accent CTA + secondary button stay as fills ON the glass.
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.1), radius: 12, y: -4)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }
}

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
    private let log = Logger(subsystem: "me.meeshy.app", category: "location")

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
        // main thread. Preuve par process sampling (2026-07-30) : deux
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
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
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
        if let loc = userLocation {
            request.region = MKCoordinateRegion(center: loc, latitudinalMeters: 50000, longitudinalMeters: 50000)
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
                self.searchResults = Array(response?.mapItems.prefix(5) ?? [])
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

// MARK: - Injection dans le composer de story (SDK)

extension View {
    /// Fournit au composer de story (`StoryComposerView`, côté SDK) la fabrique
    /// de CE picker. Le composer expose un point d'injection plutôt qu'un import
    /// direct : `LocationPickerView` dépend de MapKit, CoreLocation et de
    /// `MediaPermissionCoordinator` — de l'orchestration UX produit, donc
    /// app-side (SDK purity). Sans cet appel, le chip « Lieu » du panneau Texte
    /// n'est pas rendu.
    func storyLocationPickerProvided(
        accentColor: String = MeeshyColors.brandPrimaryHex
    ) -> some View {
        environment(\.storyLocationPicker, StoryLocationPickerProvider { onSelect in
            AnyView(LocationPickerView(accentColor: accentColor, onSelect: onSelect))
        })
    }
}
