import SwiftUI
import Combine
import MapKit
import CoreLocation
import MeeshyUI
import os

struct LocationPickerView: View {
    let accentColor: String
    let onSelect: (CLLocationCoordinate2D, String?) -> Void
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
            .onReceive(viewModel.$userLocation.compactMap { $0 }) { loc in
                // iOS 17 keeps `.userLocation(fallback:)` inside the adaptive
                // map, so it self-centers. iOS 16 has no such mode — recenter
                // explicitly on the first fix only.
                guard !didCenterOnUser, !Platform.isIOS17OrLater else { return }
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
                    guard let coord = viewModel.selectedCoordinate else { return }
                    onSelect(coord, viewModel.addressString)
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

@MainActor
final class LocationPickerModel: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var selectedCoordinate: CLLocationCoordinate2D?
    @Published var addressString: String?
    @Published var isGeocoding = false
    @Published var searchResults: [MKMapItem] = []
    @Published var userLocation: CLLocationCoordinate2D?
    /// Statut d'autorisation, publié pour que la vue puisse expliquer un refus
    /// au lieu de laisser l'utilisateur attendre un relevé qui ne viendra pas.
    @Published private(set) var authorization: CLAuthorizationStatus = .notDetermined

    var isLocationRefused: Bool {
        authorization == .denied || authorization == .restricted
    }

    private let manager = CLLocationManager()
    private let geocoder = CLGeocoder()
    private var geocodeTask: Task<Void, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        authorization = manager.authorizationStatus
    }

    /// Appelé à l'ouverture du picker — c'est-à-dire APRÈS le tap explicite sur
    /// « Localisation » dans le composer, le bon moment pour demander.
    ///
    /// `requestLocation()` n'est plus lancé tant que l'autorisation n'est pas
    /// acquise : l'appeler sur un statut refusé ne produisait qu'un
    /// `didFailWithError` silencieux. Sur un octroi,
    /// `locationManagerDidChangeAuthorization` déclenche le relevé.
    func requestPermission() {
        authorization = manager.authorizationStatus
        switch authorization {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        default:
            break
        }
    }

    func updateSelectedLocation(_ coordinate: CLLocationCoordinate2D) {
        selectedCoordinate = coordinate
        geocodeTask?.cancel()
        geocodeTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            reverseGeocode(coordinate)
        }
    }

    func reverseGeocode(_ coordinate: CLLocationCoordinate2D) {
        isGeocoding = true
        addressString = nil
        geocoder.cancelGeocode()

        let location = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        geocoder.reverseGeocodeLocation(location) { [weak self] placemarks, _ in
            let address = placemarks?.first.map { placemark in
                let parts = [placemark.name, placemark.thoroughfare, placemark.locality, placemark.country]
                    .compactMap { $0 }
                return parts.reduce(into: [String]()) { acc, part in
                    if !acc.contains(part) { acc.append(part) }
                }.joined(separator: ", ")
            }
            Task { @MainActor [weak self] in
                self?.isGeocoding = false
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
        manager.requestLocation()
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
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

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // A silent no-op here swallows denied permissions, airplane mode and
        // transient CoreLocation errors. Log so we can diagnose why the
        // picker never surfaces a result, and clear the pending geocoding
        // state so the UI does not spin forever.
        Logger(subsystem: "me.meeshy.app", category: "location")
            .error("Location manager failed: \(error.localizedDescription, privacy: .public)")
        Task { @MainActor [weak self] in
            self?.isGeocoding = false
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor [weak self] in
            self?.authorization = status
        }
        if status == .authorizedWhenInUse || status == .authorizedAlways {
            manager.requestLocation()
        }
    }
}
