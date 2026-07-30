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

/// Pure decision, extracted so it's unit-testable without instantiating any
/// SwiftUI view state: which region an adaptive map opens on when `target`
/// is absent.
///
/// MUST NEVER resolve a `nil` target into `.userLocation(fallback:
/// .automatic)` on iOS 17 (`MapCameraPosition`). MapKit resolves that mode
/// SYNCHRONOUSLY on the main thread from inside `updateUIView`
/// (`-[MKMapView _performActionAsIfGoingToDefaultLocation:]` →
/// `_didChangeRegionMidstream:` → `mapLayerDidChangeRegionAnimated:`).
/// Paired with `.onMapCameraChange(frequency: .onEnd)` writing back into the
/// SAME `@State` driving `updateUIView`, that resolution re-enters itself —
/// two nested `_performActionAsIfGoingToDefaultLocation:` frames on the same
/// stack, main thread pinned at 60-99% CPU with no crash. Proven by process
/// sampling on the location picker (2026-07-30). An explicit region
/// initializes synchronously and cannot re-enter.
enum AdaptiveMapInitialRegion {
    static let neutral = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 20, longitude: 0),
        span: MKCoordinateSpan(latitudeDelta: 120, longitudeDelta: 120)
    )

    static func resolve(for target: MapTarget?) -> MKCoordinateRegion {
        target?.region ?? neutral
    }
}

// MARK: - Coordinate tolerance

/// Pure, stateless rule engine: is a coordinate close enough to another to
/// be treated as "the same point"?
///
/// MapKit's `.onMapCameraChange` callback can re-report a center that
/// drifted by float noise (as small as ~1e-9°) between frames without any
/// real user pan. Callers that write an `@Published`/`willSet`-observed
/// coordinate unconditionally on every callback republish an unchanged
/// value, which notifies `objectWillChange`, re-renders the map, and can
/// re-enter MapKit's synchronous camera resolution (see
/// `AdaptiveMapInitialRegion`) — the proven cause of the location-picker
/// main-thread freeze. Guarding the write with this predicate breaks that
/// loop at its second ingredient.
nonisolated public enum CoordinateEquivalence {
    /// 1e-7° ≈ 1cm on the ground — tight enough to never mask a genuine
    /// map pan, loose enough to absorb MapKit's floating-point drift.
    public static func isApproximatelyEqual(
        _ lhs: CLLocationCoordinate2D,
        _ rhs: CLLocationCoordinate2D,
        tolerance: CLLocationDegrees = 1e-7
    ) -> Bool {
        abs(lhs.latitude - rhs.latitude) < tolerance && abs(lhs.longitude - rhs.longitude) < tolerance
    }
}

/// An interactive, pannable map with a single optional pin.
///
/// iOS 17+ uses the current `Map(position:)` API — including `mapControls`
/// and `onMapCameraChange`. When `target` is `nil`, the map opens on
/// `AdaptiveMapInitialRegion.neutral` — a fixed, explicit region — instead
/// of `.userLocation(fallback: .automatic)` (see that type's doc for why).
/// Callers that want the map to center on the user must set `target`
/// explicitly once a location fix arrives.
///
/// iOS 16 falls back to the (now-deprecated) `Map(coordinateRegion:)` API,
/// opening on the same neutral region when `target` is `nil`. Caveats on
/// iOS 16: no `MapCompass`, and the camera-change callback fires
/// continuously during a pan rather than only on release (callers should
/// debounce expensive work — the location picker already does).
public struct AdaptiveInteractiveMap<PinContent: View>: View {
    private let target: MapTarget?
    private let annotationCoordinate: CLLocationCoordinate2D?
    private let onRegionChange: (CLLocationCoordinate2D) -> Void
    private let pin: () -> PinContent

    /// - Parameters:
    ///   - target: where to recenter the map; `nil` opens on a fixed neutral
    ///     region (`AdaptiveMapInitialRegion.neutral`) on every OS version —
    ///     callers that want auto-centering on the user must set `target`
    ///     once a location fix arrives.
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
        self._position = State(initialValue: .region(AdaptiveMapInitialRegion.resolve(for: target)))
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
        self._region = State(initialValue: AdaptiveMapInitialRegion.resolve(for: target))
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

/// Identité dérivée des coordonnées, PAS un `UUID()` neuf à chaque
/// construction : `annotationItems` est reconstruit à chaque rendu, et sur
/// iOS 16 `onChange(of: RegionKey(region))` tire en continu pendant une
/// animation de région. Une identité aléatoire faisait donc détruire et
/// recréer l'annotation à chaque frame. Même parade que le cache d'items de
/// `LocationFullscreenView`.
struct PinItem: Identifiable {
    let coordinate: CLLocationCoordinate2D
    var id: String { "\(coordinate.latitude),\(coordinate.longitude)" }
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
