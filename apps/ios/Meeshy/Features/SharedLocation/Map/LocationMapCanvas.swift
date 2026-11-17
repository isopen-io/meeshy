import SwiftUI
import MapKit
import MeeshySDK

/// Un lieu à faire tenir dans la carte : où, et le rayon de son flou.
typealias LocationMapSpot = (latitude: Double, longitude: Double, radiusMeters: Double)

/// Ce que l'hôte demande à la carte : se poser sur une région, une fois par `token`.
struct LocationMapFocus: Equatable {
    let region: LocationMapRegion
    let token: Int
    var animated: Bool = true
}

/// Le fond de la carte : le plan, ou le plan sur l'image satellite.
enum LocationMapStyle: Equatable {
    case standard, hybrid

    var toggled: LocationMapStyle { self == .standard ? .hybrid : .standard }
}

/// LE FOND DE LA CARTE (#18872) : un `MKMapView` NU — ni épingle, ni cercle, ni tracé. Il ne fait que montrer le monde
/// et dire, à chaque image d'un glissé, ce qu'il montre (`LocationMapViewport`) : les épingles (K36), les tracés (K54)
/// et l'avatar qui voyage (K29) se posent au-dessus, en SwiftUI, là où la projection les met. Ni rotation ni
/// inclinaison : la projection reste celle de Mercator, à plat.
struct LocationMapCanvas: UIViewRepresentable {
    let focus: LocationMapFocus?
    var style: LocationMapStyle = .standard
    let onViewport: (LocationMapViewport) -> Void
    var onRegionSettled: ((LocationMapViewport) -> Void)? = nil

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.pointOfInterestFilter = .excludingAll
        map.showsCompass = false
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.showsUserLocation = false
        map.accessibilityElementsHidden = true
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.onViewport = onViewport
        context.coordinator.onRegionSettled = onRegionSettled
        let type: MKMapType = style == .hybrid ? .hybrid : .standard
        if map.mapType != type { map.mapType = type }
        context.coordinator.apply(focus, to: map)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onViewport: onViewport)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        nonisolated deinit {}
        var onViewport: (LocationMapViewport) -> Void
        var onRegionSettled: ((LocationMapViewport) -> Void)?
        private var appliedToken: Int?

        init(onViewport: @escaping (LocationMapViewport) -> Void) {
            self.onViewport = onViewport
        }

        func apply(_ focus: LocationMapFocus?, to map: MKMapView) {
            guard let focus, focus.token != appliedToken, map.bounds.width > 0, map.bounds.height > 0 else { return }
            let isFirst = appliedToken == nil
            appliedToken = focus.token
            let region = MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: focus.region.centerLatitude, longitude: focus.region.centerLongitude),
                span: MKCoordinateSpan(latitudeDelta: focus.region.latitudeDelta, longitudeDelta: focus.region.longitudeDelta)
            )
            map.setRegion(map.regionThatFits(region), animated: focus.animated && !isFirst)
            publish(map)
        }

        func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
            publish(mapView)
        }

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            publish(mapView)
            if let viewport = Self.viewport(of: mapView) { onRegionSettled?(viewport) }
        }

        private func publish(_ map: MKMapView) {
            guard let viewport = Self.viewport(of: map) else { return }
            onViewport(viewport)
        }

        static func viewport(of map: MKMapView) -> LocationMapViewport? {
            let size = map.bounds.size
            guard size.width > 0, size.height > 0 else { return nil }
            let region = map.region
            return LocationMapViewport(
                centerLatitude: region.center.latitude, centerLongitude: region.center.longitude,
                latitudeDelta: region.span.latitudeDelta, longitudeDelta: region.span.longitudeDelta,
                width: Double(size.width), height: Double(size.height)
            )
        }
    }
}

extension LocationMapViewport {
    /// L'emprise que la passerelle lit (`bbox`), ou `nil` quand la carte franchit l'antiméridien.
    var bounds: SharedLocationBounds? {
        SharedLocationBounds(
            minLongitude: centerLongitude - longitudeDelta / 2,
            minLatitude: max(-90, centerLatitude - latitudeDelta / 2),
            maxLongitude: centerLongitude + longitudeDelta / 2,
            maxLatitude: min(90, centerLatitude + latitudeDelta / 2)
        )
    }
}
