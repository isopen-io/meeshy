import SwiftUI
import MapKit
import MeeshySDK
import MeeshyUI

// MARK: - Le dégradé de densité

/// Froid → chaud, et rien d'autre.
///
/// La règle est app-side par nature : « quelle couleur pour quelle chaleur »
/// est une décision de produit, pas un atome réutilisable. Le SDK ne rend
/// aucune couleur de densité, et n'a aucune raison d'en connaître.
///
/// `nonisolated` sur le TYPE : la cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, le bundle de tests sous
/// `nonisolated`. Sans cette annotation, ces fonctions pures deviennent
/// isolées au main actor et les tests ne peuvent plus les appeler.
nonisolated enum NearbyDensityPalette {

    struct Components: Equatable {
        let red: Double
        let green: Double
        let blue: Double
    }

    /// Bleu profond : peu de publications dans cette cellule.
    private static let cold = Components(red: 0.16, green: 0.42, blue: 0.94)
    /// Rouge : la cellule la plus dense de la vue.
    private static let hot = Components(red: 0.94, green: 0.24, blue: 0.18)

    /// La chaleur d'une cellule RELATIVEMENT à la plus dense de la vue.
    ///
    /// Normaliser sur la vue et non sur une constante est ce qui rend la carte
    /// lisible partout : trois publications dans un village doivent ressortir
    /// autant que trois cents dans une capitale, sinon toute la campagne est
    /// bleue et toute la ville est rouge, sans nuance nulle part.
    static func normalized(count: Int, hottest: Int) -> Double {
        guard hottest > 0 else { return 0 }
        return min(max(Double(count) / Double(hottest), 0), 1)
    }

    static func components(normalized: Double) -> Components {
        let t = min(max(normalized, 0), 1)
        return Components(
            red: cold.red + (hot.red - cold.red) * t,
            green: cold.green + (hot.green - cold.green) * t,
            blue: cold.blue + (hot.blue - cold.blue) * t
        )
    }

    /// Opacité de remplissage. Une cellule froide reste discrète pour que la
    /// carte dessous demeure lisible ; une cellule chaude s'affirme.
    static func fillAlpha(normalized: Double) -> Double {
        let t = min(max(normalized, 0), 1)
        return 0.18 + 0.42 * t
    }

    @MainActor
    static func color(normalized: Double) -> UIColor {
        let c = components(normalized: normalized)
        return UIColor(red: CGFloat(c.red), green: CGFloat(c.green), blue: CGFloat(c.blue), alpha: 1)
    }
}

// MARK: - Une cellule dessinable

/// La chaleur d'un cercle est tenue DANS UNE TABLE, pas dans une sous-classe
/// de `MKCircle`.
///
/// `MKCircle(center:radius:)` est importé d'une fabrique Objective-C, et rien
/// ne garantit qu'elle alloue la sous-classe plutôt qu'un `MKCircle` nu :
/// hériter d'elle marcherait peut-être aujourd'hui et rendrait demain un objet
/// dont les propriétés ajoutées n'existent pas. Une table d'identité coûte une
/// ligne et ne dépend d'aucune promesse.
///
/// `MKCircle` plutôt qu'un polygone : la spec demande des cercles
/// semi-transparents, et un disque se lit mieux qu'une mosaïque de carrés
/// jointifs quand les cellules voisines se recouvrent.
enum NearbyDensityDisc {
    static func circle(for cell: NearbyDensityCell, cellSize: NearbyDensityCellSize) -> MKCircle {
        // Rayon = demi-cellule : les disques se touchent sans se noyer.
        MKCircle(
            center: CLLocationCoordinate2D(latitude: cell.cellLat, longitude: cell.cellLng),
            radius: cellSize.kilometers * 500
        )
    }
}

// MARK: - Un pin de publication

/// **Le pin est planté sur le point CONSENTI, jamais sur le badge.**
///
/// `NearbyMapPin` porte déjà l'arbitrage (`geoPoint` d'abord, badge en repli
/// de cache) : cette annotation ne fait que le rendre. Recalculer la
/// coordonnée depuis `post.location` ici ramènerait exactement le défaut que
/// le ViewModel vient de fermer — une carte qui situe au mètre près quelqu'un
/// qui a choisi « Région ».
final class NearbyPostAnnotation: NSObject, MKAnnotation {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    let postId: String
    let coordinate: CLLocationCoordinate2D
    let title: String?
    let subtitle: String?

    init(pin: NearbyMapPin) {
        self.postId = pin.post.id
        self.coordinate = pin.coordinate
        self.title = pin.post.author
        self.subtitle = pin.post.location.flatMap { $0.name ?? $0.address }
    }
}

// MARK: - Le halo d'imprécision

/// Le cercle qui dit « quelque part dans cette zone » autour d'un pin
/// quantifié.
///
/// Sans lui, un point arrondi à 1° se lit comme une adresse : la carte
/// affirmerait une précision que l'auteur a refusé de donner. `nil` pour
/// `.exact` — il n'y a rien à cerner — et pour une publication servie depuis
/// le cache, dont le grain n'est pas connu.
enum NearbyPrecisionHalo {
    static func circle(for pin: NearbyMapPin) -> MKCircle? {
        guard let radius = pin.precision?.haloRadiusMeters else { return nil }
        return MKCircle(center: pin.coordinate, radius: radius)
    }
}

// MARK: - La carte

/// La carte de l'écran « À proximité » — densité ET pins, un seul
/// `MKMapView`.
///
/// `MKMapView` natif plutôt que `AdaptiveMap` : `MKOverlay` n'a aucun
/// équivalent dans l'API SwiftUI `Map` sous le plancher iOS de l'app, et
/// l'exposer via `AdaptiveMap` demanderait un `@ViewBuilder` enveloppant un
/// `if #available` — précisément le motif qui a déjà coûté un débordement de
/// pile par profondeur de type dans ce dépôt. Le même choix a déjà été fait
/// pour la carte des posts du feed.
struct NearbyDiscoveryMapView: UIViewRepresentable {
    let mode: NearbyDiscoveryMode
    /// Décidé par le ViewModel (`showsIndividualPins`), pas redérivé ici : la
    /// règle « la carte n'est jamais vide » doit avoir UN seul site, et un
    /// site testable.
    let showsPins: Bool
    /// Les pins déjà arbitrés par le ViewModel — point consenti d'abord. La
    /// carte ne relit aucun badge.
    let pins: [NearbyMapPin]
    let cells: [NearbyDensityCell]
    let cellSize: NearbyDensityCellSize
    let hottestCellCount: Int
    let center: CLLocationCoordinate2D?
    let radiusKm: Double
    let onSelectPost: (String) -> Void
    let onSelectCell: (NearbyDensityCell) -> Void
    /// **Ce qui rend vraie la phrase « déplacez la carte ».** Les deux états
    /// vides liés à la position proposent ce geste ; sans ce relais, le geste
    /// n'avait aucun effet et l'écran affirmait une action qu'il ne servait
    /// pas. Appelé sur geste UTILISATEUR seulement, et seulement quand le
    /// déplacement est significatif devant le rayon regardé.
    let onRecenter: (CLLocationCoordinate2D) -> Void

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.pointOfInterestFilter = .excludingAll
        map.showsCompass = false
        map.register(
            MKMarkerAnnotationView.self,
            forAnnotationViewWithReuseIdentifier: MKMapViewDefaultAnnotationViewReuseIdentifier
        )
        map.register(
            MKMarkerAnnotationView.self,
            forAnnotationViewWithReuseIdentifier: MKMapViewDefaultClusterAnnotationViewReuseIdentifier
        )
        let tap = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(NearbyMapCoordinator.handleTap(_:))
        )
        // La carte garde tous ses gestes : ce reconnaisseur ne fait
        // qu'observer, il n'annule rien.
        tap.cancelsTouchesInView = false
        tap.delegate = context.coordinator
        map.addGestureRecognizer(tap)
        context.coordinator.map = map
        context.coordinator.apply(self, to: map, animated: false)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.map = map
        context.coordinator.apply(self, to: map, animated: true)
    }

    func makeCoordinator() -> NearbyMapCoordinator {
        NearbyMapCoordinator()
    }
}

final class NearbyMapCoordinator: NSObject, MKMapViewDelegate, UIGestureRecognizerDelegate {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    weak var map: MKMapView?

    private var onSelectPost: ((String) -> Void)?
    private var onSelectCell: ((NearbyDensityCell) -> Void)?
    private var onRecenter: ((CLLocationCoordinate2D) -> Void)?
    private var mode: NearbyDiscoveryMode = .density
    private var cellSize: NearbyDensityCellSize = .city
    private var renderedCells: [NearbyDensityCell] = []
    private var appliedPostIds: Set<String> = []
    private var appliedOverlaySignature: String = ""
    private var appliedRegionSignature: String = ""
    private var heatByOverlay: [ObjectIdentifier: Double] = [:]
    private var haloOverlays: Set<ObjectIdentifier> = []
    /// Le centre que NOUS avons posé, et le rayon qui l'accompagnait. Les deux
    /// servent à départager un déplacement de l'utilisateur d'un rebond de
    /// notre propre `setRegion` — sans quoi le relais bouclerait sur lui-même.
    private var appliedCenter: CLLocationCoordinate2D?
    private var appliedRadiusKm: Double = 0
    private var recenterTask: Task<Void, Never>?

    func apply(_ view: NearbyDiscoveryMapView, to map: MKMapView, animated: Bool) {
        onSelectPost = view.onSelectPost
        onSelectCell = view.onSelectCell
        onRecenter = view.onRecenter
        mode = view.mode
        cellSize = view.cellSize
        renderedCells = view.cells

        applyRegion(center: view.center, radiusKm: view.radiusKm, to: map, animated: animated)
        applyAnnotations(view.pins, showPins: view.showsPins, to: map)
        applyOverlays(
            cells: view.mode == .density ? view.cells : [],
            halos: view.showsPins ? view.pins : [],
            cellSize: view.cellSize,
            hottest: view.hottestCellCount,
            to: map
        )
    }

    // MARK: - Région

    /// La région ne se réécrit que lorsqu'elle CHANGE vraiment. Sans cette
    /// garde, chaque `updateUIView` — donc chaque frame d'animation SwiftUI —
    /// repositionnerait la caméra et la carte deviendrait impossible à
    /// déplacer à la main.
    private func applyRegion(
        center: CLLocationCoordinate2D?, radiusKm: Double, to map: MKMapView, animated: Bool
    ) {
        // Sans centre — permission refusée, aucun relevé — la carte recevait
        // AUCUNE région : elle naissait au milieu de nulle part et le geste
        // qu'on proposait à l'utilisateur (« déplacez la carte ») n'avait
        // aucun point de départ. Un repli monde la rend manipulable, et c'est
        // son déplacement qui fournira le centre.
        let applied = center ?? Self.worldFallbackCenter
        let appliedRadius = center == nil ? Self.worldFallbackRadiusKm : radiusKm
        let signature = "\(applied.latitude),\(applied.longitude),\(appliedRadius)"
        guard signature != appliedRegionSignature else { return }
        appliedRegionSignature = signature
        appliedCenter = applied
        appliedRadiusKm = appliedRadius
        let region = MKCoordinateRegion(
            center: applied,
            latitudinalMeters: appliedRadius * 2000,
            longitudinalMeters: appliedRadius * 2000
        )
        map.setRegion(map.regionThatFits(region), animated: animated)
    }

    private static let worldFallbackCenter = CLLocationCoordinate2D(latitude: 20, longitude: 0)
    private static let worldFallbackRadiusKm: Double = 4_000

    // MARK: - Déplacer la carte À LA MAIN

    /// **Le geste que les états vides promettent.**
    ///
    /// Trois conditions, et chacune répond à un piège précis :
    /// - le déplacement vient d'un GESTE (les reconnaisseurs de la vue de
    ///   contenu sont actifs), sinon notre propre `setRegion` se relancerait
    ///   lui-même en boucle ;
    /// - il est SIGNIFICATIF devant le rayon regardé (un dixième), sinon
    ///   chaque frottement du doigt referait une requête ;
    /// - il est DÉBOUNCÉ, pour qu'un balayage continu n'en produise qu'une.
    func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
        guard onRecenter != nil, isUserGesture(on: mapView) else { return }
        let moved = mapView.centerCoordinate
        if let appliedCenter, !Self.isSignificantMove(
            from: appliedCenter, to: moved, radiusKm: appliedRadiusKm
        ) { return }

        recenterTask?.cancel()
        // Deux `Double` plutôt que la coordonnée : ce qui traverse une
        // frontière de tâche doit être `Sendable`, et `onRecenter` — une
        // fermeture isolée — ne peut pas y aller du tout. On la relit depuis
        // `self`, qui est isolé au main actor.
        let latitude = moved.latitude
        let longitude = moved.longitude
        recenterTask = Task { [weak self] in
            do {
                try await Task.sleep(nanoseconds: 600_000_000)
            } catch {
                return
            }
            guard let self, !Task.isCancelled else { return }
            self.onRecenter?(CLLocationCoordinate2D(latitude: latitude, longitude: longitude))
        }
    }

    private func isUserGesture(on map: MKMapView) -> Bool {
        guard let content = map.subviews.first,
              let recognizers = content.gestureRecognizers else { return false }
        return recognizers.contains { recognizer in
            recognizer.state == .began || recognizer.state == .changed || recognizer.state == .ended
        }
    }

    private static func isSignificantMove(
        from origin: CLLocationCoordinate2D,
        to destination: CLLocationCoordinate2D,
        radiusKm: Double
    ) -> Bool {
        let meters = CLLocation(latitude: origin.latitude, longitude: origin.longitude)
            .distance(from: CLLocation(latitude: destination.latitude, longitude: destination.longitude))
        return meters > max(radiusKm * 100, 500)
    }

    // MARK: - Pins

    private func applyAnnotations(_ pins: [NearbyMapPin], showPins: Bool, to map: MKMapView) {
        let ids = showPins ? Set(pins.map(\.id)) : []
        guard ids != appliedPostIds else { return }
        appliedPostIds = ids

        map.removeAnnotations(map.annotations)
        guard showPins else { return }
        map.addAnnotations(pins.map(NearbyPostAnnotation.init(pin:)))
    }

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        if annotation is MKClusterAnnotation {
            let view = mapView.dequeueReusableAnnotationView(
                withIdentifier: MKMapViewDefaultClusterAnnotationViewReuseIdentifier,
                for: annotation
            ) as? MKMarkerAnnotationView
            view?.markerTintColor = UIColor(MeeshyColors.indigo700)
            return view
        }
        guard annotation is NearbyPostAnnotation else { return nil }
        let view = mapView.dequeueReusableAnnotationView(
            withIdentifier: MKMapViewDefaultAnnotationViewReuseIdentifier,
            for: annotation
        ) as? MKMarkerAnnotationView
        view?.clusteringIdentifier = "nearby-post"
        view?.markerTintColor = UIColor(MeeshyColors.indigo500)
        view?.glyphImage = UIImage(systemName: "text.bubble.fill")
        view?.displayPriority = .defaultHigh
        return view
    }

    func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
        if let cluster = view.annotation as? MKClusterAnnotation {
            mapView.showAnnotations(cluster.memberAnnotations, animated: true)
            mapView.deselectAnnotation(cluster, animated: false)
            return
        }
        guard let annotation = view.annotation as? NearbyPostAnnotation else { return }
        onSelectPost?(annotation.postId)
    }

    // MARK: - Cellules de densité

    /// Densité ET halos d'imprécision passent par le MÊME site, parce qu'ils
    /// partagent le même `map.overlays` : deux méthodes qui s'y remplacent
    /// l'une l'autre effaceraient chacune le travail de l'autre.
    private func applyOverlays(
        cells: [NearbyDensityCell],
        halos: [NearbyMapPin],
        cellSize: NearbyDensityCellSize,
        hottest: Int,
        to map: MKMapView
    ) {
        let cellSignature = cells
            .map { "\($0.cellLat),\($0.cellLng),\($0.count)" }
            .joined(separator: "|")
        let haloSignature = halos
            .map { "\($0.id):\($0.latitude),\($0.longitude),\($0.precision?.rawValue ?? "-")" }
            .joined(separator: "|")
        let signature = "\(cellSignature)@\(cellSize.kilometers)#\(haloSignature)"
        guard signature != appliedOverlaySignature else { return }
        appliedOverlaySignature = signature

        map.removeOverlays(map.overlays)
        heatByOverlay.removeAll()
        haloOverlays.removeAll()

        let discs = cells.map { cell -> MKCircle in
            let circle = NearbyDensityDisc.circle(for: cell, cellSize: cellSize)
            heatByOverlay[ObjectIdentifier(circle)] = NearbyDensityPalette.normalized(
                count: cell.count, hottest: hottest
            )
            return circle
        }
        let rings = halos.compactMap { pin -> MKCircle? in
            guard let circle = NearbyPrecisionHalo.circle(for: pin) else { return nil }
            haloOverlays.insert(ObjectIdentifier(circle))
            return circle
        }
        let overlays = discs + rings
        guard !overlays.isEmpty else { return }
        map.addOverlays(overlays)
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        guard let circle = overlay as? MKCircle else {
            return MKOverlayRenderer(overlay: overlay)
        }
        if let heat = heatByOverlay[ObjectIdentifier(circle)] {
            let renderer = MKCircleRenderer(circle: circle)
            let color = NearbyDensityPalette.color(normalized: heat)
            renderer.fillColor = color.withAlphaComponent(
                CGFloat(NearbyDensityPalette.fillAlpha(normalized: heat))
            )
            renderer.strokeColor = color.withAlphaComponent(0.85)
            renderer.lineWidth = 1
            return renderer
        }
        guard haloOverlays.contains(ObjectIdentifier(circle)) else {
            return MKOverlayRenderer(overlay: overlay)
        }
        // Le halo se lit comme une ZONE, pas comme une tache : trait tireté,
        // remplissage à peine perceptible. Il doit dire « quelque part
        // là-dedans » sans concurrencer la carte de chaleur.
        let renderer = MKCircleRenderer(circle: circle)
        renderer.fillColor = UIColor(MeeshyColors.indigo500).withAlphaComponent(0.10)
        renderer.strokeColor = UIColor(MeeshyColors.indigo500).withAlphaComponent(0.55)
        renderer.lineWidth = 1
        renderer.lineDashPattern = [3, 3]
        return renderer
    }

    // MARK: - Taper une cellule

    /// Un `MKOverlay` ne reçoit pas de tap : MapKit n'a pas de sélection
    /// d'overlay. Le point touché est donc converti en coordonnée, puis
    /// rapproché de la cellule qui le contient — bornes de la cellule, pas
    /// distance au centre, pour que le bord d'une cellule appartienne à une
    /// seule d'entre elles.
    @objc func handleTap(_ recognizer: UITapGestureRecognizer) {
        guard mode == .density, let map, !renderedCells.isEmpty else { return }
        let point = recognizer.location(in: map)
        let coordinate = map.convert(point, toCoordinateFrom: map)
        let half = cellSize.degrees / 2
        let hit = renderedCells.first { cell in
            abs(cell.cellLat - coordinate.latitude) <= half
                && abs(cell.cellLng - coordinate.longitude) <= half
        }
        guard let hit else { return }
        onSelectCell?(hit)
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool {
        true
    }
}
