import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le canvas de la page détail — vue `2h` du document composer.**
///
/// Extrait de `PostDetailView.swift` (#4086) : le fichier portait 2 572 lignes,
/// bien au-delà du budget de 800–1100 et dans la dette héritée, où la loi 4 de
/// `BOUCLE.md` interdit d'ajouter. Le canvas est une responsabilité entière :
/// ce qu'on rend, ce qu'on affiche à défaut, et le suivi de visibilité qui met
/// la lecture en pause hors écran.
///
/// Ce que la vue `2h` établit, et que ce fichier porte :
///
/// > « Le bouton n'existe que si un canvas est réellement rendu. Un post sans
/// > scène ne montre ni muet ni badge — la porte du bouton est le même
/// > prédicat que celui du rendu, jamais une seconde condition recopiée. »
///
/// La règle vit dans `BackgroundSoundBadge.canvasHasContent(_:)` et les TROIS
/// consommateurs la consultent : les deux rendus ci-dessous et la porte du
/// bouton muet dans `actionsBar`. Aucun ne la réécrit.
extension PostDetailView {

    // MARK: - Story Canvas (inline reader)

    /// **Le point de décision UNIQUE : rendre, ou dire qu'il n'y a rien.**
    ///
    /// Les deux chemins qui rendent un canvas dans le détail — la story
    /// native et la republication de story — passent par ici. C'est ce qui
    /// interdit la divergence que la vue `2h` nomme : avant ce lot, le chemin
    /// natif portait la garde d'absence de contenu et le chemin republication
    /// n'en avait AUCUNE, si bien qu'une story republiée dont la source est
    /// expirée ou sans asset rendait un rectangle NOIR — là où la même story,
    /// native, affichait « Story indisponible ».
    ///
    /// La règle n'est pas écrite ici : elle vit dans
    /// `BackgroundSoundBadge.canvasHasContent(_:)`, que la porte du bouton
    /// muet consulte aussi. Trois consommateurs, une règle.
    ///
    /// `renderedItem` est HISSÉ par l'appelant (`postDetailContent`) et
    /// partagé avec cette porte (correctif revue mineur #8) : jamais
    /// reconstruit ici, où le panneau réévalue à chaque frame de scroll via
    /// `storyCanvasVisible`.
    @ViewBuilder
    func storyCanvasOrPlaceholder(renderedItem: StoryItem,
                                  @ViewBuilder reader: () -> StoryReaderRepresentable) -> some View {
        if BackgroundSoundBadge.canvasHasContent(renderedItem) {
            storyCanvasContainer(reader())
        } else {
            HStack(spacing: 6) {
                Image(systemName: "sparkles.rectangle.stack")
                Text(String(localized: "feed.post.detail.story_unavailable", defaultValue: "Story indisponible", bundle: .main))
            }
            .font(.footnote)
            .foregroundColor(theme.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
        }
    }

    /// Le chemin NATIF. Le lecteur est construit sur `renderedItem` plutôt que
    /// de laisser `StoryReaderRepresentable(feedPost:)` reconvertir le même
    /// `FeedPost` : une seconde conversion par évaluation de body, et surtout
    /// deux valeurs qui pourraient diverger si la cascade de repli changeait
    /// d'un côté sans l'autre (post-revue 2026-07-13).
    @ViewBuilder
    func storyCanvasSection(_ post: FeedPost, renderedItem: StoryItem) -> some View {
        storyCanvasOrPlaceholder(renderedItem: renderedItem) {
            StoryReaderRepresentable(
                story: renderedItem,
                preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages,
                mute: isCanvasMuted,
                isPaused: StoryDetailPlaybackPolicy.isPaused(visible: storyCanvasVisible, callActive: isCallActive)
            )
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    /// Shared canvas wrapper for BOTH the native story and the STORY-repost paths
    /// (RF3): identical sizing + the GeometryReader/`StoryCanvasFrameKey`/
    /// `onPreferenceChange` visibility tracking that updates `storyCanvasVisible`.
    /// Extracting it guarantees the off-screen pause wiring can't exist on one path
    /// and be missing on the other (which would leak audio on the repost path).
    func storyCanvasContainer(_ reader: StoryReaderRepresentable) -> some View {
        reader
            .aspectRatio(9.0 / 16.0, contentMode: .fit)
            .frame(maxWidth: 460)
            .frame(maxWidth: .infinity, alignment: .center)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .background(
                GeometryReader { geo in
                    Color.clear.preference(key: StoryCanvasFrameKey.self,
                                           value: geo.frame(in: .named(Self.scrollSpace)))
                }
            )
            .onPreferenceChange(StoryCanvasFrameKey.self) { frame in
                let h = scrollViewportHeight > 0 ? scrollViewportHeight : frame.maxY + 1
                storyCanvasVisible = StoryCanvasVisibility.isVisible(canvasFrame: frame, viewportHeight: h)
            }
    }
}
