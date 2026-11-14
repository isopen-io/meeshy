import SwiftUI
import MapKit
import MeeshySDK
import MeeshyUI

/// La section « Positions partagées avec toi » de « Mes cercles » (#16983, iso de l'onglet Cercles du web #16984) : une
/// carte qui ne se montre que si quelqu'un me partage sa position, chaque épingle posée là où le serveur l'a servie,
/// entourée du cercle de flou que son émetteur a choisi.
struct SharedLocationsMapSection: View {
    @ObservedObject var viewModel: SharedLocationsMapViewModel
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        if !viewModel.pins.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                header
                SharedLocationsMapRepresentable(pins: viewModel.pins) { bounds in
                    viewModel.regionChanged(bounds)
                }
                .frame(height: 240)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .accessibilityElement(children: .contain)
                .accessibilityLabel(String(localized: "circles.locations.map", defaultValue: "Carte des positions partagées", bundle: .main))
                Text(String(localized: "circles.locations.footnote", defaultValue: "Chacun choisit sa précision et sa durée ; tout s'efface à l'échéance.", bundle: .main))
                    .font(.caption)
                    .foregroundStyle(theme.textMuted)
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.top, MeeshySpacing.md)
        }
    }

    private var header: some View {
        let title = String(localized: "circles.locations.title", defaultValue: "Positions partagées avec toi", bundle: .main)
        return HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "location.circle.fill").foregroundStyle(MeeshyColors.indigo500).accessibilityHidden(true)
            Text(title).font(.subheadline.weight(.bold)).foregroundStyle(theme.textPrimary)
            Text("\(viewModel.pins.count)").font(.caption.weight(.semibold)).foregroundStyle(theme.textMuted)
            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .accessibilityLabel("\(title), \(viewModel.pins.count)")
    }
}

/// `MKMapView` natif, comme la carte des publications (`PostsMapRepresentable`) : le plancher iOS 16 n'offre ni
/// annotations riches ni cercles de rayon métrique avec l'API SwiftUI `Map`.
struct SharedLocationsMapRepresentable: UIViewRepresentable {
    let pins: [SharedLocationPin]
    let onRegionChange: (SharedLocationBounds?) -> Void

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.pointOfInterestFilter = .excludingAll
        map.showsCompass = false
        map.register(MKMarkerAnnotationView.self, forAnnotationViewWithReuseIdentifier: MKMapViewDefaultAnnotationViewReuseIdentifier)
        context.coordinator.apply(pins, to: map)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.onRegionChange = onRegionChange
        context.coordinator.apply(pins, to: map)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onRegionChange: onRegionChange)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        nonisolated deinit {}
        var onRegionChange: (SharedLocationBounds?) -> Void
        private var applied: [SharedLocationPin] = []
        private var fitted = false

        init(onRegionChange: @escaping (SharedLocationBounds?) -> Void) {
            self.onRegionChange = onRegionChange
        }

        /// Ne repose les épingles et les cercles que si les positions servies ont changé : une sélection ou un nouveau
        /// rendu ne fait pas clignoter la carte.
        func apply(_ pins: [SharedLocationPin], to map: MKMapView) {
            guard pins != applied else { return }
            applied = pins
            map.removeAnnotations(map.annotations)
            map.removeOverlays(map.overlays)
            let annotations = pins.map(SharedLocationAnnotation.init)
            map.addAnnotations(annotations)
            map.addOverlays(pins.map {
                MKCircle(center: CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude), radius: $0.radiusMeters)
            })
            guard !fitted, !annotations.isEmpty else { return }
            fitted = true
            map.showAnnotations(annotations, animated: false)
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let pin = annotation as? SharedLocationAnnotation else { return nil }
            let view = mapView.dequeueReusableAnnotationView(
                withIdentifier: MKMapViewDefaultAnnotationViewReuseIdentifier,
                for: annotation
            ) as? MKMarkerAnnotationView
            view?.glyphText = pin.initials
            view?.markerTintColor = UIColor(pin.presence?.dotColor ?? MeeshyColors.indigo500)
            view?.titleVisibility = .adaptive
            view?.displayPriority = .required
            view?.isAccessibilityElement = true
            view?.accessibilityLabel = pin.spokenLabel
            return view
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let circle = overlay as? MKCircle else { return MKOverlayRenderer(overlay: overlay) }
            let renderer = MKCircleRenderer(circle: circle)
            renderer.fillColor = UIColor(MeeshyColors.indigo500).withAlphaComponent(0.14)
            renderer.strokeColor = UIColor(MeeshyColors.indigo500).withAlphaComponent(0.45)
            renderer.lineWidth = 1
            return renderer
        }

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            onRegionChange(SharedLocationsMapRegion.bounds(of: mapView.region))
        }
    }
}

/// L'emprise d'une région de carte, au format que la passerelle lit. Une emprise qui franchit l'antiméridien ne se dit
/// pas en un rectangle : elle rend `nil`, et le rattrapage couvre alors le monde.
enum SharedLocationsMapRegion {
    static func bounds(of region: MKCoordinateRegion) -> SharedLocationBounds? {
        let halfLat = region.span.latitudeDelta / 2
        let halfLon = region.span.longitudeDelta / 2
        return SharedLocationBounds(
            minLongitude: region.center.longitude - halfLon,
            minLatitude: max(-90, region.center.latitude - halfLat),
            maxLongitude: region.center.longitude + halfLon,
            maxLatitude: min(90, region.center.latitude + halfLat)
        )
    }
}

/// Une épingle : la position servie, le nom en titre, la précision et l'échéance en sous-titre.
private final class SharedLocationAnnotation: NSObject, MKAnnotation {
    nonisolated deinit {}
    let coordinate: CLLocationCoordinate2D
    let title: String?
    let subtitle: String?
    let initials: String
    let presence: PresenceState?
    let spokenLabel: String

    init(_ pin: SharedLocationPin) {
        coordinate = CLLocationCoordinate2D(latitude: pin.latitude, longitude: pin.longitude)
        title = pin.name
        subtitle = pin.detail
        initials = pin.initials
        presence = pin.presence
        spokenLabel = pin.accessibilityLabel
    }
}
