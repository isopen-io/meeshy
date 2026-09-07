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

/// **Qui monte la mosaïque — et ce que cet hôte fait entendre** (#5593).
///
/// Deux surfaces montent `PostSceneMosaic`, et elles n'ont pas le même contrat
/// sonore :
///
/// | hôte | ce qu'on entend | pourquoi |
/// |---|---|---|
/// | fil | rien, définitivement | plusieurs cartes à l'écran, aucune n'a de bouton à piloter (#4084, E3) |
/// | détail | le son de fond, coupable par la barre d'actions | une seule publication à l'écran, et `StoryDetailPlaybackPolicy` : « Audio is ON by DEFAULT in detail » |
///
/// La question « quel mode de player ? » se posait AILLEURS — dans la vue, en
/// dur. Un mode enfoui suit la vue partout où elle va : celui de la carte de
/// fil a accompagné la mosaïque jusqu'à la fiche détail (`4a3e13607b`), où il
/// verrouillait un muet que personne n'avait demandé.
///
/// > **Un mode de lecture n'appartient pas à ce qui est rendu, mais à l'endroit
/// > où on le rend.** Nommer l'hôte le rend impossible à hériter par accident.
nonisolated enum PostSceneMosaicHost: Equatable {
    /// Le fil — muet PAR CONSTRUCTION.
    case feed
    /// La fiche détail — le son de fond joue, le viewer peut le couper.
    case detail

    /// Le mode servi au `MeeshyScenePlayer`. C'est LUI qui porte le verrou
    /// (`ScenePlayerConfig.locksMute`), jamais un booléen doublé ici : deux
    /// écritures d'une même règle divergent.
    var playerMode: ScenePlayerMode {
        switch self {
        case .feed: return .card
        case .detail: return .preview
        }
    }
}

struct PostSceneMosaic: View {

    let post: FeedPost
    let document: CanvasV3
    let accentColor: String
    let preferredContentLanguages: [String]
    /// Élu par `ReelFeedAutoplayCoordinator` — la carte est-elle CELLE que le
    /// fil autorise à jouer ? `false` par défaut : un hôte sans coordinateur
    /// (détail, signets) ne fabrique pas une élection que personne ne tient.
    var isActive: Bool = false
    /// **Où cette mosaïque est montée — donc ce qu'on y entend** (#5593).
    ///
    /// Le mode du player n'est pas une propriété de CETTE vue : c'est une
    /// propriété de son hôte. Écrit en dur (`.card`), il a suivi la mosaïque du
    /// fil jusqu'à la fiche détail, où il disait l'inverse de ce que le détail
    /// veut — et le son de fond d'un post à plusieurs scènes ne s'y jouait
    /// jamais. Le défaut par défaut reste le FIL : un site qui ne dit rien
    /// n'ouvre pas le son par inadvertance.
    var host: PostSceneMosaicHost = .feed
    /// Le muet DEMANDÉ par l'hôte — celui que la barre d'actions du détail
    /// bascule (`isCanvasMuted`). Le fil l'ignore : son mode VERROUILLE le
    /// muet (`ScenePlayerConfig.locksMute`, #4084), et c'est `hostMute` qui
    /// tranche, jamais une seconde règle recopiée ici.
    var isMuted: Bool = false
    /// Le doigt sur une tuile ouvre le plein écran SUR CETTE SCÈNE — pas sur
    /// la première. Une mosaïque dont toutes les tuiles mènent au même endroit
    /// serait un seul bouton dessiné quatre fois.
    var onTapScene: ((Int) -> Void)?

    /// La page COURANTE du carrousel. Elle vit ici et non chez la carte : si
    /// l'index remontait, chaque glissement invaliderait l'en-tête, le texte et
    /// la rangée d'actions — c'est l'invariant que `FeedPostCardCarousel`
    /// tient déjà pour les médias.
    @State private var page = 0

    /// **Chaque scène porte SA légende — là où la place le permet** (directive
    /// porteur 2026-09-06, en deux temps).
    ///
    /// > « La légende doit s'afficher par-dessus la scène PRÉCISE et non
    /// > par-dessus le poste entier ! Chaque scène a sa légende d'image ! »
    ///
    /// > « Il ne faut pas systématiquement mettre la légende sur la tuile !
    /// > Mais le faire sur les formats le permettant (défilement continu, image
    /// > par image, mode hero sur la première image, une seule scène). »
    ///
    /// D'où un bandeau peint DANS la tuile, et non au bas de la vue. Une
    /// première écriture posait un seul bandeau sur l'ensemble : juste sur un
    /// carrousel — où la tuile visible EST la vue — et faux sur les quatre
    /// mosaïques, où quatre scènes se partagent l'écran et n'auraient eu qu'une
    /// légende pour elles quatre, à cheval sur les tuiles.
    ///
    /// `carrierFallback: false` : le texte de la publication est déjà rendu
    /// au-dessus de la carte, et le répéter par-dessus la scène ne serait pas
    /// afficher une légende.
    ///
    /// Ce que la vue NE décide pas : quelle tuile a la place
    /// (`MosaicLayout.tileCarriesCaption`) ni combien de mots elle porte
    /// (`captionWordLimit(…tileWidth:)`) — deux questions pures, éprouvées sans
    /// écran, qu'un sixième mode n'aura à renseigner qu'une fois.
    @ViewBuilder private func bandeauDeLegende(_ tuile: MosaicLayout.Tile) -> some View {
        // Le report `+N` porte déjà un voile et un compteur au centre : une
        // légende y ferait une troisième chose au même endroit.
        if tuile.overflow == 0,
           MosaicLayout.tileCarriesCaption(mode: mode, sceneIndex: tuile.sceneIndex,
                                           visualCount: document.scenes.count) {
            FeedCaptionOverlay(
                caption: SceneCaption.resolve(sceneIndex: tuile.sceneIndex,
                                              in: document, post: post,
                                              carrierFallback: false),
                words: MosaicLayout.captionWordLimit(mode: mode,
                                                     visualCount: document.scenes.count,
                                                     tileWidth: tuile.width))
        }
    }

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
            mosaiqueDefilante(
                ZStack(alignment: .topLeading) {
                    ForEach(tuiles, id: \.sceneIndex) { tuile in
                        vignette(tuile, joue: false)
                            .frame(width: tuile.width * boite.width,
                                   height: tuile.height * boite.height)
                            .offset(x: tuile.x * boite.width, y: tuile.y * boite.height)
                    }
                }
                .frame(width: largeurUtile(boite), height: boite.height,
                       alignment: .topLeading)
            )
            // Le DÉFILEMENT fait la largeur de la boîte ; c'est son CONTENU qui
            // déborde (`largeurUtile`, posée juste au-dessus). Contraindre le
            // conteneur à la largeur utile lui ferait dépasser la carte au lieu
            // de la faire défiler — le débordement reviendrait par la porte
            // qu'on vient de fermer.
            .frame(width: boite.width, height: boite.height, alignment: .topLeading)
        }
        .aspectRatio(1 / MosaicLayout.aspectRatio(mode: mode), contentMode: .fit)
        .frame(maxWidth: PostSceneCard.maxWidth)
        .frame(maxWidth: .infinity, alignment: .center)
    }

    /// **Le défilement DÉFILE** (directive porteur 2026-09-06 : « permettre
    /// donc le défilement continu »).
    ///
    /// Le mode `.reel` déborde volontairement à droite — c'est l'amorce qui dit
    /// « il y en a d'autres ». Mais rien ne le faisait défiler : ses tuiles 3 et
    /// 4 vivaient à x ≥ 456 pt sur un écran de 402, hors du cadre et
    /// inatteignables par aucun geste. **Un mode qui déborde sans défiler cache
    /// ses tuiles au lieu de les offrir.**
    ///
    /// Rogner était la moitié fausse du remède : ça masquait le débordement au
    /// lieu de le rendre parcourable.
    @ViewBuilder
    private func mosaiqueDefilante(_ contenu: some View) -> some View {
        if mode == .reel {
            ScrollView(.horizontal, showsIndicators: false) { contenu }
        } else {
            contenu
        }
    }

    /// La largeur RÉELLE de la rangée : les trois mosaïques tiennent dans leur
    /// boîte, le défilement s'étend au-delà pour que son contenu existe et
    /// puisse être atteint.
    private func largeurUtile(_ boite: CGSize) -> CGFloat {
        guard mode == .reel, let derniere = tuiles.last else { return boite.width }
        return max(boite.width, (derniere.x + derniere.width) * boite.width)
    }

    // MARK: - Une tuile, une page

    @ViewBuilder
    private func vignette(_ tuile: MosaicLayout.Tile, joue: Bool) -> some View {
        let scene = document.scenes.indices.contains(tuile.sceneIndex)
            ? document.scenes[tuile.sceneIndex] : nil
        let bouge = scene.map(SceneMotion.isCinematic) ?? false
        ZStack {
            if scene != nil {
                // **Une TUILE montre la scène ENTIÈRE, réduite** (directive
                // porteur 2026-09-06 : « la mise à l'échelle d'une scène doit
                // mettre à l'échelle tout son contenu »).
                //
                // Le cadrage par contenu ne s'applique donc qu'aux PAGES. Sur
                // une carte ou une page — pleine largeur, dont la boîte adopte
                // le rapport du cadrage — les deux termes du `max` s'égalisent
                // et l'échelle reste 1. Dans une TUILE, le rapport de la boîte
                // vient de la GÉOMÉTRIE et non du cadrage : le canvas reçoit
                // alors `1 / focus.width` fois la largeur de la tuile, soit
                // jusqu'à **× 2,4** (le plancher `minimumSide` vaut 0,42).
                //
                // `CanvasGeometry.scaleFactor = renderSize.width / 1080` : tout
                // le contenu suit cette largeur. Un canvas 2,4 fois trop large
                // rend donc un texte 2,4 fois trop gros — mesuré sur une tuile
                // `reel` de 200 pt : 25 pt au lieu des 9 pt attendus.
                //
                // > Il n'y a d'ailleurs aucun vide à gagner dans une tuile : le
                // > cadrage sert à RACCOURCIR une carte, et une tuile impose
                // > déjà son propre rapport.
                SceneFocusFrame(focus: MosaicLayout.isPaged(mode: mode)
                                ? scene.flatMap { SceneFraming.focus(scene: $0) }
                                : nil) {
                    scenePlayer(sceneIndex: tuile.sceneIndex, joue: joue && bouge)
                        .preferredContentLanguages(preferredContentLanguages)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // Posée AVANT le rognage : une légende qui déborderait s'écrirait sur
        // la tuile voisine, exactement comme le texte d'une scène le faisait.
        .overlay(alignment: .bottom) { bandeauDeLegende(tuile) }
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

    /// **Le player d'une tuile — nommé pour être LU** (#5593).
    ///
    /// Extrait de `vignette` parce qu'une garde de source prouve qu'une ligne
    /// existe, jamais qu'elle s'exécute : `DetailMosaicBackgroundSoundTests`
    /// monte la mosaïque et lit le muet réellement SERVI à l'hôte canvas,
    /// comme `ScenePlayerModeTests` le fait côté SDK.
    ///
    /// `joue` porte déjà la conjonction de l'élection et du mouvement — cette
    /// fonction ne rejuge rien, elle CÂBLE.
    func scenePlayer(sceneIndex: Int, joue: Bool) -> MeeshyScenePlayer {
        MeeshyScenePlayer(
            document: document,
            mode: host.playerMode,
            sceneIndex: .constant(sceneIndex),
            // **Une scène ne joue que si elle BOUGE.** Une scène fixe qui
            // remporterait la lecture occuperait l'unique place jouante du fil
            // sans rien en faire — et TAIRAIT la vidéo voisine.
            isPlaying: .constant(joue),
            accentColorHex: accentColor,
            carrier: carrier,
            isMuted: isMuted
        )
    }

    /// Le muet est-il VERROUILLÉ par le mode de l'hôte ? Une seule lecture,
    /// partagée par le player (via `hostMute`) et par l'indicateur ci-dessous —
    /// l'indicateur ne peut donc pas annoncer un état que le player ne sert pas.
    private var muetVerrouille: Bool {
        ScenePlayerConfig(mode: host.playerMode).locksMute
    }

    /// La porte de l'indicateur, exposée pour son témoin : « ce document a
    /// quelque chose à couper » ET « cet hôte ne peut pas le rétablir ».
    var montreLIndicateurDeSonCoupe: Bool {
        muetVerrouille && SceneMotion.isAudible(document)
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
    ///
    /// **Et seulement là où le muet est VERROUILLÉ** (#5593). Son libellé dit
    /// « ouvrir en plein écran pour l'entendre » : dans la fiche détail, où le
    /// fond joue et où la barre d'actions le coupe, ce conseil serait faux deux
    /// fois. La porte suit donc le verrou du mode, jamais un `true` en dur.
    @ViewBuilder
    private func indicateurDeSonCoupe(_ document: CanvasV3) -> some View {
        if montreLIndicateurDeSonCoupe {
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

// `RognageDeMosaique` a été RETIRÉ le 2026-09-06 : il rognait le débordement
// du mode `.reel`, c'est-à-dire qu'il CACHAIT les tuiles que le porteur
// demande maintenant d'atteindre (« permettre donc le défilement continu »).
// Un `ScrollView` les offre au lieu de les masquer, et le modificateur n'avait
// plus de consommateur — une vue sans appelant ne rougit nulle part.
