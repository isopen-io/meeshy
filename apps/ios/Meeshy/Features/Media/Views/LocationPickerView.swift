//
//  LocationPickerView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI
import MapKit

struct LocationPickerView: View {
    @StateObject private var viewModel = LocationPickerViewModel()
    @Environment(\.dismiss) private var dismiss
    let onSelect: (CLLocationCoordinate2D, String) -> Void

    @available(iOS 17.0, *)
    private var cameraPositionBinding: Binding<MapCameraPosition> {
        Binding(
            get: { self.viewModel.cameraPosition },
            set: { self.viewModel.cameraPosition = $0 }
        )
    }

    var body: some View {
        NavigationView {
            ZStack {
                // Map
                if #available(iOS 17.0, *) {
                    Map(position: cameraPositionBinding, selection: $viewModel.selectedLocation) {
                        if let userLocation = viewModel.userLocation {
                            Marker("Your Location", coordinate: userLocation)
                                .tint(.blue)
                        }

                        if let selectedCoordinate = viewModel.selectedCoordinate {
                            Marker("Selected Location", coordinate: selectedCoordinate)
                                .tint(.red)
                        }
                    }
                    .mapStyle(.standard)
                    .onTapGesture { location in
                        // Handle map tap
                    }
                } else {
                    // iOS 16 fallback
                    Map(coordinateRegion: $viewModel.region, showsUserLocation: true, annotationItems: viewModel.annotations) { annotation in
                        MapMarker(coordinate: annotation.coordinate, tint: annotation.isUser ? .blue : .red)
                    }
                    .onTapGesture { location in
                        // Handle map tap
                    }
                }

                // Search Bar
                VStack {
                    searchBar
                        .padding()

                    Spacer()

                    // Action Buttons
                    VStack(spacing: 12) {
                        if viewModel.userLocation != nil {
                            Button {
                                sendCurrentLocation()
                            } label: {
                                HStack {
                                    Image(systemName: "location.fill")
                                    Text("Send Current Location")
                                        .fontWeight(.semibold)
                                }
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .background(Color.blue)
                                .cornerRadius(12)
                            }
                        }

                        if viewModel.selectedCoordinate != nil {
                            Button {
                                sendSelectedLocation()
                            } label: {
                                HStack {
                                    Image(systemName: "mappin.and.ellipse")
                                    Text("Send Selected Location")
                                        .fontWeight(.semibold)
                                }
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .background(Color.green)
                                .cornerRadius(12)
                            }
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Share Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .alert("Location Access Required", isPresented: $viewModel.showPermissionAlert) {
                Button("Open Settings") {
                    PermissionManager.shared.openSettings()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Please allow location access in Settings to share your location.")
            }
        }
        .onAppear {
            viewModel.requestLocation()
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)

            TextField("Search for a place", text: $viewModel.searchText)
                .textFieldStyle(.plain)

            if !viewModel.searchText.isEmpty {
                Button {
                    viewModel.searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(12)
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(radius: 2)
    }

    // MARK: - Actions

    private func sendCurrentLocation() {
        guard let location = viewModel.userLocation else { return }
        onSelect(location, "Current Location")
        dismiss()
    }

    private func sendSelectedLocation() {
        guard let location = viewModel.selectedCoordinate else { return }
        onSelect(location, viewModel.selectedAddress)
        dismiss()
    }
}

// MARK: - Location Picker ViewModel

@MainActor
final class LocationPickerViewModel: NSObject, ObservableObject {
    @Published var cameraPositionStorage: Any?
    @Published var selectedLocation: MKMapItem?
    @Published var userLocation: CLLocationCoordinate2D?
    @Published var selectedCoordinate: CLLocationCoordinate2D?
    @Published var selectedAddress = "Selected Location"

    @available(iOS 17.0, *)
    var cameraPosition: MapCameraPosition {
        get {
            (cameraPositionStorage as? MapCameraPosition) ?? .automatic
        }
        set {
            cameraPositionStorage = newValue
        }
    }
    @Published var searchText = ""

    // iOS 16 fallback properties
    @Published var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194),
        span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
    )

    struct MapAnnotation: Identifiable {
        let id = UUID()
        let coordinate: CLLocationCoordinate2D
        let isUser: Bool
    }

    var annotations: [MapAnnotation] {
        var result: [MapAnnotation] = []
        if let user = userLocation {
            result.append(MapAnnotation(coordinate: user, isUser: true))
        }
        if let selected = selectedCoordinate {
            result.append(MapAnnotation(coordinate: selected, isUser: false))
        }
        return result
    }
    @Published var showPermissionAlert = false

    private let locationManager = CLLocationManager()

    override init() {
        super.init()
        locationManager.delegate = self
    }

    func requestLocation() {
        Task {
            guard await PermissionManager.shared.requestLocationAccess() else {
                showPermissionAlert = true
                return
            }

            locationManager.requestLocation()
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension LocationPickerViewModel: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        Task { @MainActor in
            userLocation = location.coordinate
            if #available(iOS 17.0, *) {
                cameraPosition = .region(MKCoordinateRegion(
                    center: location.coordinate,
                    span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                ))
            } else {
                // Fallback on earlier versions
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Location error: \(error)")
    }
}
