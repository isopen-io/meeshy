import SwiftUI
import MapKit
import CoreLocation

// MARK: - Map target (version-neutral bridge type)

/// A version-neutral description of where a map should be centered.
///
/// `MapCameraPosition` (iOS 17) cannot appear in a public API compiled for
/// iOS 16. Callers express recentering with `MapTarget` instead; each adaptive
/// map subview converts it to the camera/region type its OS provides.
public struct MapTarget: Equatable {
    public var center: CLLocationCoordinate2D
    public var latitudinalMeters: CLLocationDistance
    public var longitudinalMeters: CLLocationDistance

    public init(
        center: CLLocationCoordinate2D,
        latitudinalMeters: CLLocationDistance = 1000,
        longitudinalMeters: CLLocationDistance = 1000
    ) {
        self.center = center
        self.latitudinalMeters = latitudinalMeters
        self.longitudinalMeters = longitudinalMeters
    }

    public var region: MKCoordinateRegion {
        MKCoordinateRegion(
            center: center,
            latitudinalMeters: latitudinalMeters,
            longitudinalMeters: longitudinalMeters
        )
    }

    public static func == (lhs: MapTarget, rhs: MapTarget) -> Bool {
        lhs.center.latitude == rhs.center.latitude
            && lhs.center.longitude == rhs.center.longitude
            && lhs.latitudinalMeters == rhs.latitudinalMeters
            && lhs.longitudinalMeters == rhs.longitudinalMeters
    }
}

// MARK: - Adaptive interactive map

/// An interactive, pannable map with a single optional pin.
///
/// iOS 17+ uses the current `Map(position:)` API — including `mapControls`
/// and `onMapCameraChange` — so behaviour on current OS versions is unchanged.
/// When `target` is `nil`, iOS 17 keeps `.userLocation(fallback: .automatic)`
/// verbatim; a non-`nil` `target` recenters the camera.
///
/// iOS 16 falls back to the (now-deprecated) `Map(coordinateRegion:)` API.
/// Caveats on iOS 16: no `MapCompass`, and the camera-change callback fires
/// continuously during a pan rather than only on release (callers should
/// debounce expensive work — the location picker already does).
public struct AdaptiveInteractiveMap<PinContent: View>: View {
    private let target: MapTarget?
    private let annotationCoordinate: CLLocationCoordinate2D?
    private let onRegionChange: (CLLocationCoordinate2D) -> Void
    private let pin: () -> PinContent

    /// - Parameters:
    ///   - target: where to recenter the map; `nil` opens on the user's
    ///     location (iOS 17) or a world view (iOS 16).
    ///   - annotationCoordinate: coordinate of the single pin, or `nil`.
    ///   - onRegionChange: called with the map center after the camera moves.
    ///   - pin: builds the pin view.
    public init(
        target: MapTarget?,
        annotationCoordinate: CLLocationCoordinate2D?,
        onRegionChange: @escaping (CLLocationCoordinate2D) -> Void,
        @ViewBuilder pin: @escaping () -> PinContent
    ) {
        self.target = target
        self.annotationCoordinate = annotationCoordinate
        self.onRegionChange = onRegionChange
        self.pin = pin
    }

    public var body: some View {
        if #available(iOS 17.0, *) {
            ModernInteractiveMap(
                target: target,
                annotationCoordinate: annotationCoordinate,
                onRegionChange: onRegionChange,
                pin: pin
            )
        } else {
            LegacyInteractiveMap(
                target: target,
                annotationCoordinate: annotationCoordinate,
                onRegionChange: onRegionChange,
                pin: pin
            )
        }
    }
}

// MARK: - iOS 17 implementation

@available(iOS 17.0, *)
private struct ModernInteractiveMap<PinContent: View>: View {
    private let target: MapTarget?
    private let annotationCoordinate: CLLocationCoordinate2D?
    private let onRegionChange: (CLLocationCoordinate2D) -> Void
    private let pin: () -> PinContent

    @State private var position: MapCameraPosition

    init(
        target: MapTarget?,
        annotationCoordinate: CLLocationCoordinate2D?,
        onRegionChange: @escaping (CLLocationCoordinate2D) -> Void,
        @ViewBuilder pin: @escaping () -> PinContent
    ) {
        self.target = target
        self.annotationCoordinate = annotationCoordinate
        self.onRegionChange = onRegionChange
        self.pin = pin
        self._position = State(
            initialValue: target.map { .region($0.region) }
                ?? .userLocation(fallback: .automatic)
        )
    }

    var body: some View {
        Map(position: $position, interactionModes: .all) {
            if let annotationCoordinate {
                Annotation("", coordinate: annotationCoordinate) { pin() }
            }
        }
        .onMapCameraChange(frequency: .onEnd) { context in
            onRegionChange(context.camera.centerCoordinate)
        }
        .mapControls {
            MapUserLocationButton()
            MapCompass()
        }
        .onChange(of: target) { _, newTarget in
            if let newTarget { position = .region(newTarget.region) }
        }
    }
}

// MARK: - iOS 16 implementation

private struct LegacyInteractiveMap<PinContent: View>: View {
    private let target: MapTarget?
    private let annotationCoordinate: CLLocationCoordinate2D?
    private let onRegionChange: (CLLocationCoordinate2D) -> Void
    private let pin: () -> PinContent

    @State private var region: MKCoordinateRegion

    private static var worldRegion: MKCoordinateRegion {
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 20, longitude: 0),
            span: MKCoordinateSpan(latitudeDelta: 120, longitudeDelta: 120)
        )
    }

    init(
        target: MapTarget?,
        annotationCoordinate: CLLocationCoordinate2D?,
        onRegionChange: @escaping (CLLocationCoordinate2D) -> Void,
        @ViewBuilder pin: @escaping () -> PinContent
    ) {
        self.target = target
        self.annotationCoordinate = annotationCoordinate
        self.onRegionChange = onRegionChange
        self.pin = pin
        self._region = State(initialValue: target?.region ?? Self.worldRegion)
    }

    var body: some View {
        Map(
            coordinateRegion: $region,
            interactionModes: .all,
            showsUserLocation: true,
            annotationItems: pinItems
        ) { item in
            MapAnnotation(coordinate: item.coordinate) { pin() }
        }
        .onChange(of: RegionKey(region)) { _ in
            onRegionChange(region.center)
        }
        .onChange(of: target) { newTarget in
            if let newTarget { region = newTarget.region }
        }
    }

    private var pinItems: [PinItem] {
        annotationCoordinate.map { [PinItem(coordinate: $0)] } ?? []
    }
}

private struct PinItem: Identifiable {
    let id = UUID()
    let coordinate: CLLocationCoordinate2D
}

/// `MKCoordinateRegion` is not `Equatable`; this key lets `onChange` observe
/// region movement on iOS 16.
private struct RegionKey: Equatable {
    let latitude: Double
    let longitude: Double
    let latitudeDelta: Double
    let longitudeDelta: Double

    init(_ region: MKCoordinateRegion) {
        latitude = region.center.latitude
        longitude = region.center.longitude
        latitudeDelta = region.span.latitudeDelta
        longitudeDelta = region.span.longitudeDelta
    }
}
