import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Un post à plusieurs scènes se lit d'un coup d'œil — ou page par page**
/// (directive porteur 2026-09-06, #5322 puis directive du même jour).
///
/// > « Le rendu est une mosaïque d'image avec +n sur la dernière des 4 images.
/// > On peut définir comment la mosaïque sera affichée : il faut proposer 4
/// > différentes manières — en vague, en mode hero, en mode défilement comme
/// > pour les réels, en mode sinusoïde. »
///
/// > « Le défilement image par image est aussi un mode de mosaïque à prendre et
/// > ce doit être le mode PAR DÉFAUT ! »
///
/// ## Deux natures, une vue
///
/// Quatre modes POSENT des tuiles côte à côte ; le cinquième empile des PAGES
/// qu'on fait défiler. La bascule ne se lit pas ici — `MosaicLayout.isPaged`
/// la tient, pour qu'un sixième mode n'ait pas à être rangé deux fois.
///
/// ## Où vit quoi
///
/// La GÉOMÉTRIE est au SDK (`MosaicLayout`, `SceneCarouselLayout`) : pure,
/// sans produit, éprouvée sans écran. Cette vue est la moitié APP — elle lit un
/// `FeedPost`, monte des players, câble un geste.
///
/// ## Une tuile est une SCÈNE ARRÊTÉE, pas une vignette
///
/// Chaque tuile monte le player sur sa propre scène. C'est plus cher qu'une
/// image — et c'est le seul rendu qui dise la vérité : une scène porte du
/// texte, des stickers, un fond, et une vignette de son seul média mentirait
/// sur ce que l'auteur a composé.
///
/// Le coût est borné par le plafond de quatre et par la pause. **Seul le
/// carrousel joue**, et seulement sa page courante, seulement si la carte est
/// élue par le viewport, et seulement si la scène BOUGE (`SceneMotion`) — trois
/// conditions dont la dernière est celle que la directive ajoute : « une scène
/// cinématique doit être considérée comme une vidéo ».
struct PostSceneMosaic: View {

    let post: FeedPost
    let document: CanvasV3
    let accentColor: String
    let preferredContentLanguages: [String]
    /// Élu par `ReelFeedAutoplayCoordinator` — la carte est-elle CELLE que le
    /// fil autorise à jouer ? `false` par défaut : un hôte sans coordinateur
    /// (détail, signets) ne fabrique pas une élection que personne ne tient.
    var isActive: Bool = false
    /// Le doigt sur une tuile ouvre le plein écran SUR CETTE SCÈNE — pas sur
    /// la première. Une mosaïque dont toutes les tuiles mènent au même endroit
    /// serait un seul bouton dessiné quatre fois.
    var onTapScene: ((Int) -> Void)?

    /// La page COURANTE du carrousel. Elle vit ici et non chez la carte : si
    /// l'index remontait, chaque glissement invaliderait l'en-tête, le texte et
    /// la rangée d'actions — c'est l'invariant que `FeedPostCardCarousel`
    /// tient déjà pour les médias.
    @State private var page = 0

    private var mode: MosaicLayoutMode { document.resolvedLayout }
    private var tuiles: [MosaicLayout.Tile] {
        MosaicLayout.tiles(sceneCount: document.scenes.count, mode: mode)
    }

    var body: some View {
        if MosaicLayout.isPaged(mode: mode) {
            carrousel
        } else {
            mosaique
        }
    }

    // MARK: - Le défilement image par image

    private var carrousel: some View {
        VStack(spacing: 8) {
            ZStack(alignment: .topTrailing) {
                TabView(selection: $page) {
                    ForEach(tuiles, id: \.sceneIndex) { tuile in
                        vignette(tuile, joue: tuile.sceneIndex == page && isActive)
                            .tag(tuile.sceneIndex)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                fleches
                compteur
            }
            // **La forme vient de la page la plus HAUTE**, pas de la mesure
            // d'un conteneur qui n'a pas de taille intrinsèque : `TabView` n'en
            // a aucune, et lui en demander une donne une bande de la hauteur du
            // compteur à la première passe (défaut mesuré sur le carrousel des
            // médias, dont ce fichier reprend la leçon plutôt que l'erreur).
            .aspectRatio(SceneCarouselLayout.cardAspect(document: document),
                         contentMode: .fit)
            .frame(maxWidth: PostSceneCard.maxWidth)
            .frame(maxWidth: .infinity, alignment: .center)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .reportReelFrame(id: post.id, kind: .scene)

            pastilles
        }
    }

    /// **Les flèches — le même contrôle que le carrousel des MÉDIAS.**
    ///
    /// > « Que ce soit mosaïque de média ou de scène c'est la même chose. »
    ///
    /// Elles ne sont pas une commodité : le glissement est le seul chemin vers
    /// les scènes 2 à N, et un seul chemin ne suffit pas. Il ne suffit pas à
    /// VoiceOver, qui ne fait pas glisser une page ; il ne suffit pas à une
    /// main qui tient l'appareil d'un pouce ; et il ne suffit pas là où le
    /// geste horizontal entre en concurrence avec le défilement vertical du
    /// fil.
    ///
    /// Montées SEULEMENT là où elles ont un effet — aucune « précédente » sur
    /// la première page, aucune « suivante » sur la dernière. Une flèche grisée
    /// occuperait la même surface pour ne rien faire (loi 4).
    ///
    /// `backward`/`forward`, JAMAIS `left`/`right` : ces derniers nomment un
    /// côté PHYSIQUE et ne se retournent pas en arabe, où « suivant » est à
    /// gauche. Le `HStack`, lui, suit la direction de lecture.
    @ViewBuilder
    private var fleches: some View {
        HStack {
            if page > 0 {
                fleche("chevron.backward",
                       String(localized: "feed.scene.carousel.previous",
                              defaultValue: "Scène précédente", bundle: .main)) {
                    page -= 1
                }
            }
            Spacer()
            if page < document.scenes.count - 1 {
                fleche("chevron.forward",
                       String(localized: "feed.scene.carousel.next",
                              defaultValue: "Scène suivante", bundle: .main)) {
                    page += 1
                }
            }
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }

    private func fleche(_ glyphe: String, _ libelle: String,
                        action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) { action() }
        } label: {
            // Glyphe dans un cercle de dimension FIXE : il déborderait s'il
            // scalait. La cible tactile reste à 44.
            Image(systemName: glyphe)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 34, height: 34)
                .background(Circle().fill(.black.opacity(0.45)))
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(libelle)
    }

    private var compteur: some View {
        Text("\(page + 1) / \(document.scenes.count)")
            .font(MeeshyFont.relative(12, weight: .bold, design: .monospaced))
            .foregroundColor(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(.black.opacity(0.5)))
            .padding(10)
            .contentTransition(.numericText())
            .animation(.spring(response: 0.3), value: page)
            .accessibilityHidden(true)
    }

    /// Les pastilles vivent SOUS les pages, sur le fond de la carte — comme
    /// celles du carrousel des médias, et pour la même raison : posées à
    /// l'intérieur, elles se disputeraient le bas avec la légende.
    private var pastilles: some View {
        HStack(spacing: 6) {
            ForEach(document.scenes.indices, id: \.self) { position in
                Capsule()
                    .fill(position == page
                          ? Color(hex: accentColor)
                          : Color(hex: accentColor).opacity(0.28))
                    .frame(width: position == page ? 18 : 6, height: 6)
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: page)
            }
        }
        .accessibilityHidden(true)
    }

    // MARK: - Les quatre mosaïques

    private var mosaique: some View {
        GeometryReader { geo in
            let boite = CGSize(width: geo.size.width,
                               height: geo.size.width * MosaicLayout.aspectRatio(mode: mode))
            ZStack(alignment: .topLeading) {
                ForEach(tuiles, id: \.sceneIndex) { tuile in
                    vignette(tuile, joue: false)
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

    // MARK: - Une tuile, une page

    @ViewBuilder
    private func vignette(_ tuile: MosaicLayout.Tile, joue: Bool) -> some View {
        let scene = document.scenes.indices.contains(tuile.sceneIndex)
            ? document.scenes[tuile.sceneIndex] : nil
        let bouge = scene.map(SceneMotion.isCinematic) ?? false
        ZStack {
            if scene != nil {
                // Chaque cadre CADRE sa propre scène : le cadrage raccourcit la
                // carte, il ne zoome pas dessus (directive porteur 2026-09-06,
                // réalisée dans `SceneFraming`).
                SceneFocusFrame(focus: scene.flatMap { SceneFraming.focus(scene: $0) }) {
                    MeeshyScenePlayer(
                        document: document,
                        mode: .card,
                        sceneIndex: .constant(tuile.sceneIndex),
                        // **Une scène ne joue que si elle BOUGE.** Une scène
                        // fixe qui remporterait la lecture occuperait l'unique
                        // place jouante du fil sans rien en faire — et
                        // TAIRAIT la vidéo voisine.
                        isPlaying: .constant(joue && bouge),
                        accentColorHex: accentColor,
                        carrier: carrier
                    )
                    .preferredContentLanguages(preferredContentLanguages)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // **Ce qui dépasse d'une tuile ne doit pas s'écrire sur sa voisine.**
        //
        // Mesuré sur une mosaïque `wave` (tuiles de ~81 pt) : les textes des
        // scènes se chevauchaient d'une tuile à l'autre et se lisaient en
        // travers de la rangée. La cause n'est pas la géométrie — les cadres
        // sont justes — mais le rendu : l'hôte canvas est un `UIView` dont les
        // couches ne sont pas masquées par leurs bornes, et `SceneFocusFrame`
        // s'efface entièrement quand la scène ne se cadre pas (`focus == nil`),
        // donc rien ne rognait.
        //
        // > Un `clipShape` décrit une FORME ; il ne garantit pas qu'une couche
        // > UIKit imbriquée reste dedans. `.clipped()` pose le masque de rendu
        // > que le représentable n'a pas.
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(alignment: .center) { report(tuile) }
        // **Une scène cinématique se signale comme une vidéo.** Le glyphe ne
        // se pose que sur ce qui NE joue pas : sur la page en lecture, il
        // recouvrirait le mouvement qu'il annonce.
        //
        // Et sur celle qui JOUE, c'est le SON qu'il faut dire — le fil joue
        // muet par construction, et sans ce signe l'utilisateur voit une scène
        // bouger sans comprendre pourquoi il n'entend rien.
        .overlay(alignment: .bottomTrailing) {
            if tuile.overflow == 0 {
                if joue { indicateurDeSonCoupe(document) }
                else if bouge { glypheDeLecture }
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture { onTapScene?(tuile.sceneIndex) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(libelle(tuile, bouge: bouge))
        .accessibilityAddTraits(.isButton)
    }

    /// **Le son est COUPÉ, et voici pourquoi vous n'entendez rien.**
    ///
    /// > « Les scènes cinématiques jouent avec signe audio barré » (constat
    /// > porteur 2026-09-06).
    ///
    /// Un INDICATEUR, pas un contrôle — et la distinction est une décision, pas
    /// une facilité. `ScenePlayerConfig.locksMute` fige le muet du mode `.card`
    /// PAR CONSTRUCTION (#4084), et son doc-comment dit que la carte de fil
    /// « n'expose AUCUN bouton de son (elle n'aurait rien à piloter) ». Un
    /// bouton monté là-dessus serait le contrôle inerte que
    /// `MuteButtonExistenceGuardTests` a déjà rejeté deux fois.
    ///
    /// Le chemin vers le son existe et il est à un doigt : toucher la scène
    /// ouvre le plein écran, dont le mode `.reader` ne verrouille pas le muet.
    ///
    /// **Il ne paraît que si le document a vraiment quelque chose à couper** —
    /// `SceneMotion.isAudible`, et non `isCinematic` : une vidéo muette bouge
    /// sans rien faire entendre, et y poser un haut-parleur barré ferait mentir
    /// l'indicateur sur l'état qu'il annonce.
    @ViewBuilder
    private func indicateurDeSonCoupe(_ document: CanvasV3) -> some View {
        if SceneMotion.isAudible(document) {
            Image(systemName: BackgroundSoundBadge.muteIconName(isMuted: true))
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 22, height: 22)
                .background(Circle().fill(.black.opacity(0.45)))
                .padding(8)
                .allowsHitTesting(false)
                .accessibilityLabel(Text(String(
                    localized: "feed.scene.sound.muted",
                    defaultValue: "Son coupé — ouvrir en plein écran pour l'entendre",
                    bundle: .main)))
        }
    }

    private var glypheDeLecture: some View {
        Image(systemName: "play.fill")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.black.opacity(0.75))
            .frame(width: 22, height: 22)
            .background(Circle().fill(.white.opacity(0.85)))
            .padding(8)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    /// **Le « +N », sur la dernière tuile et sur elle seule.**
    ///
    /// Il compte ce qui RESTE — `MosaicLayout` le calcule, cette vue ne le
    /// recalcule pas. Un `+\(scenes.count)` posé ici compterait aussi les
    /// tuiles qu'on a sous les yeux. Le carrousel n'en produit jamais : il ne
    /// cache aucune scène.
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

    private func libelle(_ tuile: MosaicLayout.Tile, bouge: Bool) -> Text {
        let place = tuile.overflow > 0
            ? String(localized: "feed.scene.mosaic.more",
                     defaultValue: "Scène \(tuile.sceneIndex + 1), et \(tuile.overflow) de plus",
                     bundle: .main)
            : String(localized: "feed.scene.mosaic.tile",
                     defaultValue: "Scène \(tuile.sceneIndex + 1)",
                     bundle: .main)
        // **Ce qui bouge s'annonce comme une vidéo.** Sans ce mot, VoiceOver
        // décrit une image là où l'écran montre un clip — et l'utilisateur qui
        // ne voit pas n'a aucun moyen d'apprendre qu'il y a du mouvement.
        guard bouge else { return Text(place) }
        return Text("\(place), \(String(localized: "feed.scene.mosaic.video", defaultValue: "vidéo", bundle: .main))")
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
