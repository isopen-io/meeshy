import SwiftUI
import MapKit
import CoreLocation
import MeeshyUI

struct LocationPickerView: View {
    let accentColor: String
    let onSelect: (CLLocationCoordinate2D, String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = LocationPickerModel()
    @State private var searchText = ""
    @State private var cameraPosition: MapCameraPosition = .userLocation(fallback: .automatic)

    var body: some View {
        NavigationStack {
            ZStack {
                mapView

                VStack(spacing: 0) {
                    searchBar
                    Spacer()
                    bottomCard
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                        .foregroundColor(Color(hex: accentColor))
                }
                ToolbarItem(placement: .principal) {
                    Text("Choisir un lieu")
                        .font(.system(size: 16, weight: .bold))
                }
            }
            .onAppear { viewModel.requestPermission() }
        }
    }

    // MARK: - Map

    private var mapView: some View {
        Map(position: $cameraPosition, interactionModes: .all) {
            if let coord = viewModel.selectedCoordinate {
                Annotation("", coordinate: coord) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(Color(hex: accentColor), Color(hex: accentColor).opacity(0.3))
                        .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 6, y: 3)
                }
            }
        }
        .onMapCameraChange(frequency: .onEnd) { context in
            let center = context.camera.centerCoordinate
            viewModel.updateSelectedLocation(center)
        }
        .mapControls {
            MapUserLocationButton()
            MapCompass()
        }
        .ignoresSafeArea(edges: .bottom)
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)

            TextField("Rechercher un lieu...", text: $searchText)
                .font(.system(size: 14))
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
                .onSubmit { viewModel.search(query: searchText) }

            if !searchText.isEmpty {
                Button {
                    searchText = ""
                    viewModel.searchResults.removeAll()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.1), radius: 8, y: 2)
        )
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
                    cameraPosition = .region(MKCoordinateRegion(
                        center: coord,
                        latitudinalMeters: 500,
                        longitudinalMeters: 500
                    ))
                    searchText = item.name ?? ""
                    viewModel.searchResults.removeAll()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "mappin")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(hex: accentColor))
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(Color(hex: accentColor).opacity(0.1)))

                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name ?? "Lieu inconnu")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                                .lineLimit(1)

                            if let subtitle = item.placemark.title {
                                Text(subtitle)
                                    .font(.system(size: 11))
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
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
        )
        .padding(.horizontal, 16)
    }

    // MARK: - Bottom Card

    private var bottomCard: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "location.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))

                VStack(alignment: .leading, spacing: 2) {
                    if let address = viewModel.addressString {
                        Text(address)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(2)
                    } else if viewModel.isGeocoding {
                        HStack(spacing: 6) {
                            ProgressView()
                                .scaleEffect(0.7)
                            Text("Recherche de l'adresse...")
                                .font(.system(size: 12))
                                .foregroundColor(theme.textSecondary)
                        }
                    } else {
                        Text("Deplacez la carte pour choisir")
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                    }

                    if let coord = viewModel.selectedCoordinate {
                        Text(String(format: "%.5f, %.5f", coord.latitude, coord.longitude))
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundColor(theme.textMuted)
                    }
                }

                Spacer()
            }

            HStack(spacing: 12) {
                Button {
                    viewModel.centerOnUser()
                    if let loc = viewModel.userLocation {
                        cameraPosition = .region(MKCoordinateRegion(
                            center: loc, latitudinalMeters: 500, longitudinalMeters: 500
                        ))
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "location.circle.fill")
                            .font(.system(size: 14))
                        Text("Ma position")
                            .font(.system(size: 12, weight: .semibold))
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
                            .font(.system(size: 14, weight: .bold))
                        Text("Confirmer")
                            .font(.system(size: 13, weight: .bold))
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
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.1), radius: 12, y: -4)
        )
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

    private let manager = CLLocationManager()
    private let geocoder = CLGeocoder()
    private var geocodeTask: Task<Void, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func requestPermission() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        manager.requestLocation()
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
            guard let self else { return }
            self.isGeocoding = false
            if let placemark = placemarks?.first {
                let parts = [placemark.name, placemark.thoroughfare, placemark.locality, placemark.country]
                    .compactMap { $0 }
                let unique = parts.reduce(into: [String]()) { acc, part in
                    if !acc.contains(part) { acc.append(part) }
                }
                self.addressString = unique.joined(separator: ", ")
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
        MKLocalSearch(request: request).start { [weak self] response, _ in
            self?.searchResults = Array(response?.mapItems.prefix(5) ?? [])
        }
    }

    func centerOnUser() {
        manager.requestLocation()
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in
            userLocation = loc.coordinate
            if selectedCoordinate == nil {
                selectedCoordinate = loc.coordinate
                reverseGeocode(loc.coordinate)
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
            manager.requestLocation()
        }
    }
}
