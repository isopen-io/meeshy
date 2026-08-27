import SwiftUI
import MapKit
import MeeshySDK
import MeeshyUI

// MARK: - Carte des posts du feed (retour user 2026-08-12 → mode Discover 2026-08-26)

/// La carte des publications du fil qui portent un lieu.
///
/// Née comme carte plein écran derrière un bouton `map` du header du feed
/// (2026-08-12), elle vit depuis le 2026-08-26 DANS « À proximité », sous le
/// mode Discover réservé au staff de la plateforme (`NearbyDiscoverAccess`) :
/// elle plante le LIEU AFFICHÉ de chaque publication, pas le point consenti
/// à la découvrabilité, et n'a donc pas à être offerte à tout le monde. Le
/// wrapper plein écran, son en-tête et sa carte de post sélectionné ont été
/// retirés — `NearbyDiscoveryView` fournit les siens.
///
/// `MKMapView` natif plutôt que l'API SwiftUI `Map` : le plancher iOS 16
/// n'offre ni annotations custom riches ni clustering côté SwiftUI —
/// `MKMarkerAnnotationView` les fournit gratuitement.
///
/// Volontairement app-side (pas SDK) : elle lit des `FeedPost` et remonte une
/// sélection que l'hôte route vers `.postDetail` — de l'orchestration produit.
struct PostsMapRepresentable: UIViewRepresentable {
    /// Posts géolocalisés uniquement — le filtre vit chez l'appelant
    /// (`NearbyDiscoveryViewModel.discoverPosts`), source unique de la carte.
    let posts: [FeedPost]
    /// **Discover · Populaire (directive 2026-08-27).** Quand `true`, les points
    /// sont pondérés par la POPULARITÉ (vues + impressions) : les publications
    /// les plus chaudes rendent une épingle plus opaque et plus grande.
    var weightByPopularity: Bool = false
    @Binding var selectedPostId: String?

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
        context.coordinator.apply(posts: posts, to: map, animatedFit: false)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.selectedPostId = $selectedPostId
        context.coordinator.weightByPopularity = weightByPopularity
        context.coordinator.apply(posts: posts, to: map, animatedFit: true)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(selectedPostId: $selectedPostId, weightByPopularity: weightByPopularity)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
        // défaut) → double-free `pointer being freed was not allocated` (abrt)
        // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
        // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
        nonisolated deinit {}
        var selectedPostId: Binding<String?>
        var weightByPopularity: Bool
        private var appliedPostIds: Set<String> = []
        /// Le maximum de popularité du lot courant — dénominateur de la
        /// normalisation, jamais zéro.
        private var maxPopularity: Int = 1

        init(selectedPostId: Binding<String?>, weightByPopularity: Bool) {
            self.selectedPostId = selectedPostId
            self.weightByPopularity = weightByPopularity
        }

        /// Rejoue les annotations UNIQUEMENT quand l'ensemble des posts
        /// change — updateUIView se déclenche aussi pour la sélection, et
        /// retirer/reposer les pins ferait clignoter la carte.
        func apply(posts: [FeedPost], to map: MKMapView, animatedFit: Bool) {
            let ids = Set(posts.map(\.id))
            guard ids != appliedPostIds else { return }
            appliedPostIds = ids

            map.removeAnnotations(map.annotations)
            let annotations = posts.compactMap { post -> PostMapAnnotation? in
                guard let place = post.location else { return nil }
                return PostMapAnnotation(post: post, place: place)
            }
            maxPopularity = max(1, annotations.map(\.popularity).max() ?? 1)
            map.addAnnotations(annotations)
            if !annotations.isEmpty {
                map.showAnnotations(annotations, animated: animatedFit)
            }
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
            guard annotation is PostMapAnnotation else { return nil }
            let view = mapView.dequeueReusableAnnotationView(
                withIdentifier: MKMapViewDefaultAnnotationViewReuseIdentifier,
                for: annotation
            ) as? MKMarkerAnnotationView
            view?.clusteringIdentifier = "feed-post"
            view?.glyphImage = UIImage(systemName: "text.bubble.fill")
            if weightByPopularity, let post = annotation as? PostMapAnnotation {
                // Populaire : plus la publication est vue/impressionnée, plus
                // l'épingle est chaude (indigo → rose), opaque et prioritaire
                // (elle survit au clustering). Le froid reste indigo au repos.
                let t = min(1, Double(post.popularity) / Double(maxPopularity))
                view?.markerTintColor = Self.heatTint(CGFloat(t))
                view?.alpha = 0.5 + 0.5 * CGFloat(t)
                view?.displayPriority = t > 0.5 ? .required : .defaultHigh
            } else {
                view?.markerTintColor = UIColor(MeeshyColors.indigo500)
                view?.alpha = 1
                view?.displayPriority = .defaultHigh
            }
            return view
        }

        /// Indigo (froid) → rose (chaud) par interpolation RGB — la teinte du
        /// point Populaire selon `t ∈ [0,1]`.
        static func heatTint(_ t: CGFloat) -> UIColor {
            let cold = UIColor(MeeshyColors.indigo500)
            let hot = UIColor.systemPink
            var cr: CGFloat = 0, cg: CGFloat = 0, cb: CGFloat = 0, ca: CGFloat = 0
            var hr: CGFloat = 0, hg: CGFloat = 0, hb: CGFloat = 0, ha: CGFloat = 0
            cold.getRed(&cr, green: &cg, blue: &cb, alpha: &ca)
            hot.getRed(&hr, green: &hg, blue: &hb, alpha: &ha)
            return UIColor(red: cr + (hr - cr) * t,
                           green: cg + (hg - cg) * t,
                           blue: cb + (hb - cb) * t,
                           alpha: ca + (ha - ca) * t)
        }

        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            if let cluster = view.annotation as? MKClusterAnnotation {
                // Tap sur un cluster : zoom dessus plutôt qu'une sélection.
                mapView.showAnnotations(cluster.memberAnnotations, animated: true)
                mapView.deselectAnnotation(cluster, animated: false)
                return
            }
            guard let annotation = view.annotation as? PostMapAnnotation else { return }
            selectedPostId.wrappedValue = annotation.postId
        }

        func mapView(_ mapView: MKMapView, didDeselect view: MKAnnotationView) {
            guard view.annotation is PostMapAnnotation else { return }
            selectedPostId.wrappedValue = nil
        }
    }
}

// MARK: - Un pin par post géolocalisé

/// Un point par post géolocalisé, planté sur le LIEU AFFICHÉ (`FeedPost.location`).
private final class PostMapAnnotation: NSObject, MKAnnotation {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    let postId: String
    let coordinate: CLLocationCoordinate2D
    let title: String?
    let subtitle: String?
    /// Popularité = vues + impressions. Pondère l'épingle en mode Populaire.
    let popularity: Int

    init(post: FeedPost, place: SharedPlace) {
        self.postId = post.id
        self.coordinate = CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude)
        self.title = post.author
        self.subtitle = place.name ?? place.address
        self.popularity = post.viewCount + post.impressionCount
    }
}
