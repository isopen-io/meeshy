import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - Neighbor Group Cube Face (Lot 3)

/// Face entrante du cube inter-groupes : backdrop statique LÉGER du groupe
/// voisin (thumbHash flouté du slide d'entrée + voile), surmonté de l'interlude
/// d'identité — jamais une seconde `StoryCardView` interactive (les états du viewer sont
/// mono-slide, et rendre deux piles complètes pendant un geste 60-120 Hz
/// coûterait un frame budget entier). Parité reels : la face entrante est un
/// rendu du média, le swap vers la vraie carte se fait au commit, masqué par
/// l'arête à 90°. Le vrai canvas du voisin est déjà chaud (prefetch
/// inter-groupes), donc la première frame réelle suit instantanément.
///
/// L'identité de l'auteur voisin monte AU DOIGT par-dessus ce backdrop, via
/// `StoryAuthorIdentityCard` — la vue d'identité PARTAGÉE avec
/// `StoryGroupIntroOverlay` (directive user 2026-07-25, règle 4 de la
/// navigation gestuelle : « le swipe doit afficher l'interlude du groupe
/// suivant en mode cube, l'animation suit le geste »). Cela RENVERSE la
/// contrainte du 2026-07-14 (« aucune identité ici »), qui visait deux rendus
/// DIFFÉRENTS s'enchaînant : face du cube puis interstitiel. Avec une seule
/// implémentation, le doigt révèle progressivement exactement la carte que
/// l'interstitiel prolongera au commit — plus de double affichage divergent.
///
/// `intro == nil` (voisin pas encore résolu par `prefetchNeighborGroupIntros`)
/// → backdrop SEUL, jamais un placeholder d'identité vide.
struct NeighborGroupCubeFace: View {
    let entryStory: StoryItem?
    /// Identité pré-résolue du groupe voisin (`groupIntroCache`). `nil` tant
    /// que la résolution n'a pas abouti → aucune identité rendue.
    let intro: StoryViewModel.StoryGroupIntro?
    let avatarURL: String?
    let avatarColor: String
    let presence: UserPresence?
    let isFriend: Bool
    /// Avancement du geste (0 = au repos, 1 = arête à 90°). Pilote la montée
    /// de l'identité — l'effet SUIT le doigt.
    let revealProgress: CGFloat

    /// Courbe de révélation PURE : l'identité reste invisible sur les tout
    /// premiers points de course (un micro-drag ne doit pas flasher un
    /// visage), puis monte linéairement pour être pleine bien avant le commit
    /// — l'interstitiel qui suit prend alors le relais sans saut d'opacité.
    static func identityOpacity(forProgress progress: CGFloat) -> Double {
        let start: CGFloat = 0.08
        let full: CGFloat = 0.55
        return Double(min(max((progress - start) / (full - start), 0), 1))
    }

    private var backdrop: UIImage? {
        guard let story = entryStory else { return nil }
        if let hash = story.storyEffects?.thumbHash, !hash.isEmpty,
           let img = UIImage.fromThumbHash(hash) {
            return img
        }
        if let hash = story.media.first(where: { $0.thumbHash?.isEmpty == false })?.thumbHash,
           let img = UIImage.fromThumbHash(hash) {
            return img
        }
        return nil
    }

    var body: some View {
        ZStack {
            if let img = backdrop {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .blur(radius: 24)
                    .scaleEffect(1.1)
                    // `.scaledToFill()` + `.blur()` peut proposer une taille
                    // intrinsèque plus grande que le viewport, gonflant ce
                    // ZStack de façon asymétrique selon le ratio du
                    // ThumbHash — l'avatar/nom centrés dedans dérivent alors
                    // visuellement du centre réel de la carte (piège déjà
                    // documenté dans `StoryReaderLoadingOverlay`). Verrouiller
                    // la taille AVANT le `.clipped()` ci-dessous.
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                LinearGradient(
                    colors: [MeeshyColors.indigo950, MeeshyColors.indigo900],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
            Color.black.opacity(0.35)
            if let intro {
                StoryAuthorIdentityCard(
                    intro: intro,
                    avatarURL: avatarURL,
                    avatarColor: avatarColor,
                    presence: presence,
                    isFriend: isFriend,
                    contentOpacity: Self.identityOpacity(forProgress: revealProgress)
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .accessibilityHidden(true)
    }
}
