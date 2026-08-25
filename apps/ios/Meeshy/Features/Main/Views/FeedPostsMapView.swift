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
        context.coordinator.apply(posts: posts, to: map, animatedFit: true)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(selectedPostId: $selectedPostId)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var selectedPostId: Binding<String?>
        private var appliedPostIds: Set<String> = []

        init(selectedPostId: Binding<String?>) {
            self.selectedPostId = selectedPostId
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
            view?.markerTintColor = UIColor(MeeshyColors.indigo500)
            view?.glyphImage = UIImage(systemName: "text.bubble.fill")
            view?.displayPriority = .defaultHigh
            return view
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
    let postId: String
    let coordinate: CLLocationCoordinate2D
    let title: String?
    let subtitle: String?

    init(post: FeedPost, place: SharedPlace) {
        self.postId = post.id
        self.coordinate = CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude)
        self.title = post.author
        self.subtitle = place.name ?? place.address
    }
}
