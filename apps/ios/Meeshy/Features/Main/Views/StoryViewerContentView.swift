import SwiftUI
import MeeshySDK
import MeeshyUI

// Quitte `StoryViewerView+Canvas.swift` (dette héritée) par RESPONSABILITÉ :
// la racine du lecteur ne sait rien de la carte qu'elle monte. Relocalisation
// pure — le lot #8642 y paie la place de la scène qui se réduit en saisie.

// MARK: - Story Viewer Content

/// Root canvas of the story viewer: opaque black base, offscreen prefetcher
/// host, and the geometry-wrapped story card with its transform stack and
/// lifecycle modifiers. Extracted from `StoryViewerView.viewerContent`
/// (formerly an `AnyView`) so the whole subtree is its own type-metadata
/// unit instead of inflating `StoryViewerView.body`'s opaque type.
struct StoryViewerContentView: View {
    let prefetcher: StoryReaderPrefetcher

    // Card transform inputs
    let cardScale: CGFloat
    let cardCornerRadius: CGFloat
    let cardOpacity: Double
    let cardOffsetY: CGFloat
    let totalSlideX: CGFloat
    let slideProgress: CGFloat
    let dragProgress: CGFloat

    // Cube inter-groupes (Lot 3) : aperçu statique léger du groupe voisin
    // rendu comme seconde face pendant le drag horizontal / le commit.
    let neighborGroup: StoryGroup?
    let neighborEntryStory: StoryItem?
    let neighborDirection: Int
    // Interlude du voisin révélé AU DOIGT (directive user 2026-07-25) —
    // valeurs OPAQUES résolues par `StoryViewerView` (cache d'intros
    // pré-résolues + présence + amitié) et descendues jusqu'à la face du cube.
    // `nil` = pas encore résolu → la face reste sur son backdrop seul.
    let neighborIntro: StoryViewModel.StoryGroupIntro?
    let neighborPresence: UserPresence?
    let neighborIsFriend: Bool

    @Binding var isPresented: Bool

    /// Builds the story card for the supplied geometry. The closure is owned by
    /// `StoryViewerView` so the card receives the view's `@State` bindings.
    let makeStoryCard: (GeometryProxy) -> StoryCardView

    var body: some View {
        ZStack {
            // Opaque black base — prevents any white frame bleed
            Color.black.ignoresSafeArea()

            // === P3 wire-up : offscreen prefetcher host ===
            PrefetcherHostView(prefetcher: prefetcher)
                .frame(width: 1, height: 1)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .zIndex(-1000)

            GeometryReader { geometry in
                ZStack {
                    // The story card with all transforms layered.
                    // Pin to geometry size BEFORE applying scale/clip — the
                    // story canvas itself (`StoryCardView`) hard-frames its
                    // body, and we double-down here so neither the
                    // `scaleEffect` nor any unexpected intrinsic content
                    // size can leak beyond the viewport's actual bounds.
                    // Vrai cube inter-groupes (Lot 3) : angle proportionnel à
                    // la position écran, anchor sur l'arête intérieure — les
                    // deux faces (carte sortante + aperçu voisin) tournent
                    // autour de l'arête commune. À 90° la face est de profil :
                    // le swap de contenu au commit y est invisible.
                    let cubeWidth = max(geometry.size.width, 1)
                    makeStoryCard(geometry)
                        .frame(width: geometry.size.width, height: geometry.size.height)
                        .scaleEffect(cardScale * (1.0 - slideProgress * 0.08))
                        .clipShape(RoundedRectangle(cornerRadius: cardCornerRadius + slideProgress * 16, style: .continuous))
                        .opacity(cardOpacity)
                        .offset(x: totalSlideX, y: cardOffsetY)
                        .rotation3DEffect(
                            .degrees(Double(totalSlideX / cubeWidth) * 90.0),
                            axis: (x: 0, y: 1, z: 0),
                            anchor: totalSlideX > 0 ? .leading : .trailing,
                            perspective: 0.5
                        )
                        .shadow(
                            color: .black.opacity(dragProgress > 0.05 || slideProgress > 0.02 ? 0.5 : 0),
                            radius: 40, y: 15
                        )

                    if let neighborGroup, neighborDirection != 0 {
                        let incomingX = totalSlideX + (neighborDirection == 1 ? cubeWidth : -cubeWidth)
                        NeighborGroupCubeFace(
                            entryStory: neighborEntryStory,
                            intro: neighborIntro,
                            avatarURL: neighborGroup.avatarURL,
                            avatarColor: neighborGroup.avatarColor,
                            presence: neighborPresence,
                            isFriend: neighborIsFriend,
                            revealProgress: slideProgress
                        )
                            .frame(width: geometry.size.width, height: geometry.size.height)
                            .clipShape(RoundedRectangle(cornerRadius: cardCornerRadius + slideProgress * 16, style: .continuous))
                            .offset(x: incomingX, y: cardOffsetY)
                            .rotation3DEffect(
                                .degrees(Double(incomingX / cubeWidth) * 90.0),
                                axis: (x: 0, y: 1, z: 0),
                                anchor: incomingX > 0 ? .leading : .trailing,
                                perspective: 0.5
                            )
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                    }

                    // La croix de fermeture du preview est portée par le
                    // `StoryHeaderView` (coin haut-droit, `dismissViewer()`).
                    // Pas de bouton ✕ additionnel en haut-gauche — une seule
                    // croix de fermeture (directive user 2026-07-23).

                }
            }
        }
    }
}
