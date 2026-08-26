import SwiftUI
import MapKit
import MeeshySDK
import MeeshyUI

// MARK: - Feed Posts Map (retour user 2026-08-12)

/// Carte plein écran des posts géolocalisés du feed.
///
/// UX d'accès retenue : bouton `map` dans le slot `trailing` du header du
/// feed — toujours visible, découvrable, un tap, même langage que le
/// basculement liste ↔ carte des apps de référence. Les alternatives ont été
/// écartées : onglet dédié (la tab bar est déjà pleine), entrée dans le menu
/// « + » (c'est un menu de CRÉATION), long-press sur le sticker de lieu (non
/// découvrable). Le sticker de lieu d'un post continue d'ouvrir le LIEU du
/// post (`LocationFullscreenView`) ; cette carte est le niveau au-dessus —
/// tous les posts localisés d'un coup.
///
/// Volontairement app-side (pas SDK) : elle lit les posts du feed et route
/// vers `.postDetail` — de l'orchestration produit, pas un atome.
struct FeedPostsMapView: View {
    @Environment(\.dismiss) private var dismiss

    /// Posts géolocalisés uniquement — le filtre vit chez l'appelant pour que
    /// le compteur du bouton d'entrée et la carte partagent la même source.
    let posts: [FeedPost]
    /// Ouvre le détail du post sélectionné (l'appelant ferme la carte et
    /// pousse la route — la navigation ne traverse pas le fullScreenCover).
    let onOpenPost: (FeedPost) -> Void

    @State private var selectedPostId: String?

    private var selectedPost: FeedPost? {
        selectedPostId.flatMap { id in posts.first(where: { $0.id == id }) }
    }

    var body: some View {
        ZStack(alignment: .top) {
            PostsMapRepresentable(posts: posts, selectedPostId: $selectedPostId)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                headerBar
                Spacer()
                if let post = selectedPost {
                    selectedPostCard(post)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }

            if posts.isEmpty {
                emptyState
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: selectedPostId)
        .environment(\.colorScheme, .dark)
    }

    // MARK: - Chrome

    private var headerBar: some View {
        HStack(spacing: 10) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.black.opacity(0.5)))
            }
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))

            Spacer()

            Text(String(localized: "feed.map.title", defaultValue: "Posts sur la carte", bundle: .main))
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Capsule().fill(Color.black.opacity(0.5)))

            Spacer()

            // Contrepoids du bouton fermer pour centrer le titre.
            Color.clear.frame(width: 36, height: 36)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "mappin.slash")
                .font(.system(size: 34, weight: .medium))
                .foregroundColor(.white.opacity(0.85))
                .accessibilityHidden(true)
            Text(String(localized: "feed.map.empty.title", defaultValue: "Aucun post localisé", bundle: .main))
                .font(.headline)
                .foregroundColor(.white)
            Text(String(localized: "feed.map.empty.detail", defaultValue: "Les posts partagés avec une position apparaîtront ici", bundle: .main))
                .font(.subheadline)
                .foregroundColor(.white.opacity(0.8))
                .multilineTextAlignment(.center)
        }
        .padding(24)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.black.opacity(0.55)))
        .padding(.horizontal, 40)
        .frame(maxHeight: .infinity)
    }

    // MARK: - Carte du post sélectionné

    private func selectedPostCard(_ post: FeedPost) -> some View {
        Button {
            HapticFeedback.light()
            onOpenPost(post)
        } label: {
            HStack(spacing: 12) {
                MeeshyAvatar(
                    name: post.author,
                    context: .custom(44),
                    accentColor: post.authorColor,
                    avatarURL: post.authorAvatarURL
                )
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 3) {
                    Text(post.author)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    if !post.displayContent.isEmpty {
                        Text(post.displayContent)
                            .font(.footnote)
                            .foregroundColor(.white.opacity(0.85))
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                    if let placeLabel = post.location.flatMap({ $0.name ?? $0.address }), !placeLabel.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "mappin.circle.fill")
                                .font(.caption2.weight(.semibold))
                                .accessibilityHidden(true)
                            Text(placeLabel)
                                .lineLimit(1)
                        }
                        .font(.caption)
                        .foregroundColor(MeeshyColors.indigo200)
                    }
                }

                Spacer(minLength: 8)

                Image(systemName: "chevron.forward")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.white.opacity(0.7))
                    .accessibilityHidden(true)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(.ultraThinMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(MeeshyColors.indigo500.opacity(0.5), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
        .accessibilityLabel(post.author + (post.displayContent.isEmpty ? "" : " — \(post.displayContent)"))
        .accessibilityHint(String(localized: "feed.map.openPost.hint", defaultValue: "Ouvre le post", bundle: .main))
    }
}

// MARK: - MKMapView (annotations + clustering, iOS 16+)

/// Un point par post géolocalisé. `MKMapView` natif plutôt que l'API SwiftUI
/// Map : le plancher iOS 16 n'offre ni annotations custom riches ni
/// clustering côté SwiftUI — MKMarkerAnnotationView les fournit gratuitement.
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

    init(post: FeedPost, place: SharedPlace) {
        self.postId = post.id
        self.coordinate = CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude)
        self.title = post.author
        self.subtitle = place.name ?? place.address
    }
}

private struct PostsMapRepresentable: UIViewRepresentable {
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
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
