import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Un post à plusieurs scènes se lit d'un coup d'œil** (directive porteur
/// 2026-09-06, #5322).
///
/// > « Le rendu est une mosaïque d'image avec +n sur la dernière des 4 images.
/// > On peut définir comment la mosaïque sera affichée : il faut proposer 4
/// > différentes manières — en vague, en mode hero, en mode défilement comme
/// > pour les réels, en mode sinusoïde. »
///
/// ## Ce qu'elle remplace
///
/// `PostSceneCard` monte le player sur `sceneIndex: .constant(0)` : un post à
/// dix scènes n'en montrait qu'UNE, et les neuf autres n'étaient atteignables
/// par aucun geste du fil.
///
/// ## Où vit quoi
///
/// La GÉOMÉTRIE est au SDK (`MosaicLayout`) : pure, sans produit, éprouvée
/// sans écran. Cette vue est la moitié APP — elle lit un `FeedPost`, monte des
/// players, câble un geste. Le test du grain range la première en atome et la
/// seconde en orchestration.
///
/// ## Une tuile est une SCÈNE ARRÊTÉE, pas une vignette
///
/// Chaque tuile monte le player sur sa propre scène, en pause. C'est plus cher
/// qu'une image — et c'est le seul rendu qui dise la vérité : une scène porte
/// du texte, des stickers, un fond, et une vignette de son seul média mentirait
/// sur ce que l'auteur a composé.
///
/// Le coût est borné par le plafond de quatre, et par la pause : aucune tuile
/// ne joue. Le mouvement appartient à la carte mono-scène, qui a une scène à
/// jouer et un coordinateur pour l'élire.
struct PostSceneMosaic: View {

    let post: FeedPost
    let document: CanvasV3
    let accentColor: String
    let preferredContentLanguages: [String]
    /// Le doigt sur une tuile ouvre le plein écran SUR CETTE SCÈNE — pas sur
    /// la première. Une mosaïque dont toutes les tuiles mènent au même endroit
    /// serait un seul bouton dessiné quatre fois.
    var onTapScene: ((Int) -> Void)?

    private var mode: MosaicLayoutMode { document.resolvedLayout }
    private var tuiles: [MosaicLayout.Tile] {
        MosaicLayout.tiles(sceneCount: document.scenes.count, mode: mode)
    }

    var body: some View {
        GeometryReader { geo in
            let boite = CGSize(width: geo.size.width,
                               height: geo.size.width * MosaicLayout.aspectRatio(mode: mode))
            ZStack(alignment: .topLeading) {
                ForEach(tuiles, id: \.sceneIndex) { tuile in
                    vignette(tuile)
                        .frame(width: tuile.width * boite.width,
                               height: tuile.height * boite.height)
                        .offset(x: tuile.x * boite.width, y: tuile.y * boite.height)
                }
            }
            .frame(width: boite.width, height: boite.height, alignment: .topLeading)
            // Seul le DÉFILEMENT déborde ; les trois mosaïques tiennent dans
            // leur boîte et n'ont rien à rogner. Rogner quand même coûterait
            // une couche de composition à chaque carte du fil.
            .modifier(RognageDeMosaique(actif: mode == .reel))
        }
        .aspectRatio(1 / MosaicLayout.aspectRatio(mode: mode), contentMode: .fit)
        .frame(maxWidth: PostSceneCard.maxWidth)
        .frame(maxWidth: .infinity, alignment: .center)
    }

    // MARK: - Une tuile

    @ViewBuilder
    private func vignette(_ tuile: MosaicLayout.Tile) -> some View {
        let scene = document.scenes.indices.contains(tuile.sceneIndex)
            ? document.scenes[tuile.sceneIndex] : nil
        ZStack {
            if scene != nil {
                // Chaque tuile CADRE sa propre scène : une tuile de mosaïque
                // est encore plus petite qu'une carte, donc le vide d'un 9:16
                // y coûte encore plus cher.
                SceneFocusFrame(focus: scene.flatMap { SceneFraming.focus(scene: $0) }) {
                    MeeshyScenePlayer(
                        document: document,
                        mode: .card,
                        sceneIndex: .constant(tuile.sceneIndex),
                        // **Aucune tuile ne joue.** Quatre lectures simultanées
                        // dans une liste défilante, c'est quatre décodeurs par
                        // carte — et le fil en montre plusieurs à la fois.
                        isPlaying: .constant(false),
                        accentColorHex: accentColor,
                        carrier: carrier
                    )
                    .preferredContentLanguages(preferredContentLanguages)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(alignment: .center) { report(tuile) }
        .contentShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture { onTapScene?(tuile.sceneIndex) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(libelle(tuile))
        .accessibilityAddTraits(.isButton)
    }

    /// **Le « +N », sur la dernière tuile et sur elle seule.**
    ///
    /// Il compte ce qui RESTE — `MosaicLayout` le calcule, cette vue ne le
    /// recalcule pas. Un `+\(scenes.count)` posé ici compterait aussi les
    /// tuiles qu'on a sous les yeux.
    @ViewBuilder
    private func report(_ tuile: MosaicLayout.Tile) -> some View {
        if tuile.overflow > 0 {
            ZStack {
                Rectangle().fill(.black.opacity(0.45))
                Text("+\(tuile.overflow)")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
            }
            .allowsHitTesting(false)
        }
    }

    private func libelle(_ tuile: MosaicLayout.Tile) -> Text {
        if tuile.overflow > 0 {
            return Text(String(localized: "feed.scene.mosaic.more",
                               defaultValue: "Scène \(tuile.sceneIndex + 1), et \(tuile.overflow) de plus",
                               bundle: .main))
        }
        return Text(String(localized: "feed.scene.mosaic.tile",
                           defaultValue: "Scène \(tuile.sceneIndex + 1)",
                           bundle: .main))
    }

    /// Le porteur, construit ici comme dans `PostSceneCard` — les deux
    /// surfaces montent le MÊME player et lui doivent le même index de médias.
    private var carrier: StoryItem {
        StoryItem(id: post.id,
                  content: post.content,
                  media: post.media,
                  storyEffects: post.storyEffects,
                  createdAt: post.timestamp)
    }
}

/// Rogner ne se paie que là où quelque chose dépasse.
private struct RognageDeMosaique: ViewModifier {
    let actif: Bool
    func body(content: Content) -> some View {
        if actif { content.clipped() } else { content }
    }
}
