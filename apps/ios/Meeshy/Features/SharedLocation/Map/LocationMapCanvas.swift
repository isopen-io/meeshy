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
/// et l'avatar qui voyage (K29) se posent au-dessus, en SwiftUI, là où la projection les met. Jamais d'inclinaison :
/// la projection reste celle de Mercator, à plat. La rotation n'est permise qu'à l'hôte qui porte la boussole
/// (`allowsRotation`, #19622) : la projection porte alors le cap, et `northToken` remet le nord en haut.
struct LocationMapCanvas: UIViewRepresentable {
    let focus: LocationMapFocus?
    var style: LocationMapStyle = .standard
    var allowsRotation = false
    var northToken = 0
    var animatesNorth = true
    let onViewport: (LocationMapViewport) -> Void
    var onRegionSettled: ((LocationMapViewport) -> Void)? = nil

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.pointOfInterestFilter = .excludingAll
        map.showsCompass = false
        map.isRotateEnabled = allowsRotation
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
        if map.isRotateEnabled != allowsRotation { map.isRotateEnabled = allowsRotation }
        context.coordinator.apply(focus, to: map)
        context.coordinator.applyNorth(northToken, animated: animatesNorth, to: map)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onViewport: onViewport)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        nonisolated deinit {}
        var onViewport: (LocationMapViewport) -> Void
        var onRegionSettled: ((LocationMapViewport) -> Void)?
        private var appliedToken: Int?
        private var appliedNorthToken = 0

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
        }

        /// La boussole a été touchée : la carte revient au nord, sur le même centre et à la même hauteur.
        func applyNorth(_ token: Int, animated: Bool, to map: MKMapView) {
            guard token != appliedNorthToken else { return }
            appliedNorthToken = token
            guard map.camera.heading != 0 else { return }
            let camera = MKMapCamera(lookingAtCenter: map.centerCoordinate,
                                     fromDistance: map.camera.centerCoordinateDistance, pitch: 0, heading: 0)
            map.setCamera(camera, animated: animated)
        }

        /// La carte a sa taille : elle dit ce qu'elle montre, l'hôte peut alors poser sa région et ses épingles.
        func mapViewDidFinishLoadingMap(_ mapView: MKMapView) {
            publish(mapView)
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
            if map.camera.heading != 0 { return turnedViewport(of: map, size: size) }
            let region = map.region
            return LocationMapViewport(
                centerLatitude: region.center.latitude, centerLongitude: region.center.longitude,
                latitudeDelta: region.span.latitudeDelta, longitudeDelta: region.span.longitudeDelta,
                width: Double(size.width), height: Double(size.height)
            )
        }

        /// Une carte tournée : `region` couvre alors ses coins, pas son écran. Elle se lit depuis son centre et le
        /// milieu de son bord droit, avec son cap.
        private static func turnedViewport(of map: MKMapView, size: CGSize) -> LocationMapViewport {
            let center = map.centerCoordinate
            let edge = map.convert(CGPoint(x: size.width, y: size.height / 2), toCoordinateFrom: map)
            return LocationMapViewport.reading(
                centerLatitude: center.latitude, centerLongitude: center.longitude,
                edgeLatitude: edge.latitude, edgeLongitude: edge.longitude,
                width: Double(size.width), height: Double(size.height), heading: map.camera.heading
            )
        }
    }
}

extension LocationMapViewport {
    /// L'emprise que la passerelle lit (`bbox`), ou `nil` quand la carte franchit l'antiméridien. Une carte tournée
    /// demande l'emprise qui couvre ses quatre coins.
    var bounds: SharedLocationBounds? {
        SharedLocationBounds(
            minLongitude: centerLongitude - visibleLongitudeDelta / 2,
            minLatitude: max(-90, centerLatitude - visibleLatitudeDelta / 2),
            maxLongitude: centerLongitude + visibleLongitudeDelta / 2,
            maxLatitude: min(90, centerLatitude + visibleLatitudeDelta / 2)
        )
    }
}
