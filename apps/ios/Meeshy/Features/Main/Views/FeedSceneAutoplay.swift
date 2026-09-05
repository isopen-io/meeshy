import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les scènes du fil se lisent comme les vidéos** (directive porteur
/// 2026-09-05) :
///
/// > « Repartage ou non, les scènes sont comme les vidéos : lorsqu'on est face
/// > à elles dans le viewport, il faut maintenir une cohérence générale. »
///
/// Avant ce fichier, le fil portait TROIS politiques de lecture pour le MÊME
/// objet — un canvas 9:16 :
///
/// | surface | ce qu'elle faisait |
/// |---|---|
/// | réel natif / repost de réel | autoplay muet, élu par le viewport, coupé pendant un appel |
/// | scène composée d'un post | **figée** (`isPlaying: .constant(false)`), sous une étiquette « scène · muette, en pause » |
/// | story repartagée | **jouait en permanence** (`isPaused` laissé à `false`), sans élection ni call-awareness |
///
/// Le même canvas bougeait ou non selon la façon dont il était arrivé dans le
/// fil, et seul le figé portait un mot d'excuse. Les deux surfaces de scène
/// rejoignent ici le mécanisme qui existait déjà pour les réels —
/// `ReelFeedAutoplayCoordinator` + `reportReelFrame` — sans en écrire un
/// second : une SEULE surface joue dans tout le fil, celle qui est la plus
/// proche du centre du viewport, et un appel les tait toutes.
///
/// **Ce que la performance y gagne, et ce qu'elle y perd.** La décision qui
/// figeait la carte de post (revue Fable n°25, « zéro AVPlayer/décodage actif
/// ici ») visait juste : un fil où chaque canvas décode est un fil qui rame.
/// L'élection unique tient cet objectif MIEUX qu'un gel, parce qu'elle le tient
/// aussi pour les surfaces qui n'étaient pas gelées : au plus un décodage actif
/// à la fois, contre autant que de stories repartagées visibles auparavant.
///
/// **Zero Unnecessary Re-render.** Chaque container observe le coordinateur et
/// calcule `isActive` EN INTERNE ; la feuille qu'il rend est `Equatable` et
/// court-circuite dès que son élection n'a pas bougé. Sans ce découpage, une
/// élection ré-évaluerait le `ForEach` entier du fil (même patron que
/// `ReelFeedCardContainer` / `ReelRepostEmbedContainer`).

// MARK: - Scène composée d'un post

/// La scène 9:16 d'un post qui porte son PROPRE canvas v3 (composé, pas
/// reposté) — `MeeshyScenePlayer(mode: .card)`.
///
/// `isPlaying` est une VALEUR REÇUE, jamais un état local : la carte ne décide
/// pas de sa lecture, le viewport le fait pour tout le fil. C'est ce qui
/// distingue cette surface d'un `@State` basculable — il n'existe aucun chemin
/// par lequel une carte se mettrait à jouer seule.
///
/// `.aspectRatio(9.0 / 16.0, contentMode: .fit)` — même patron que le voisin
/// `StoryRepostEmbedCell`, qui rend le MÊME hôte dans le MÊME fil sans jamais
/// avoir récursé. C'est un modificateur TOP-DOWN : le parent propose une taille
/// à l'enfant, l'enfant ne mesure jamais la sienne pour la reboucler sur le
/// layout — distinct du piège self-sizing BOTTOM-UP (famille du crash SIGTRAP
/// `_updateVisibleCellsNow` de `MessageListLayout.swift`). Un `GeometryReader`
/// local resterait interdit ; `.aspectRatio` ne l'est pas.
struct PostSceneCard: View {
    let post: FeedPost
    let document: CanvasV3
    /// Élu par `ReelFeedAutoplayCoordinator`, câblé par `PostSceneCardContainer`.
    let isActive: Bool
    let accentColor: String
    /// Le Prisme Linguistique du lecteur, servi en VALEUR par le container —
    /// sans lui, `MeeshyScenePlayer` garde `languages: []` et
    /// `StoryTextObject.resolvedText` rend inconditionnellement le texte
    /// ORIGINAL de l'auteur (« le prisme s'applique à TOUT le contenu »).
    let preferredContentLanguages: [String]
    var onTapPost: ((FeedPost) -> Void)?

    /// Largeur plafonnée — même convention que `StoryRepostEmbedCell` (un iPad
    /// en colonne large n'étire pas la scène en mur vertical géant). La hauteur
    /// n'est PAS dupliquée en constante : `.aspectRatio` la dérive de la largeur
    /// RÉELLEMENT proposée par le parent. Un plafond en points calculé sur la
    /// largeur MAXIMALE (420 × 16/9 = 747 pt) déformerait la scène dès que la
    /// carte est plus étroite (≈329 pt sur iPhone 16 Pro, après le double
    /// padding horizontal de 16 pt).
    static let maxWidth: CGFloat = 420

    /// **LE PORTEUR de la scène — sans lui, le player sert une COQUILLE.**
    ///
    /// Mesuré sur staging le 2026-09-05 : un post composé avec une scène rendait
    /// une carte de 601 pt entièrement VIDE. Le canvas était pourtant servi
    /// (`storyEffects` sous `X-Canvas-Caps: 3`, un objet `media` de plan
    /// `content`), et son fichier téléchargeable (200 sur la route des
    /// attachements). Rien ne manquait à la donnée.
    ///
    /// Ce qui manquait était l'INDEX. `MeeshyScenePlayer` le dit dans son
    /// propre doc-comment, et la phrase était déjà écrite avant ce lot :
    ///
    /// > « Le document dit ce qu'il faut PEINDRE ; il ne dit pas où vivent les
    /// > pixels. L'adresse des médias vit dans le `StoryItem` qui porte la
    /// > scène. […] Le résolveur de `makeUIView` y puise en plus son repli
    /// > distant par `postMediaId`. **Sans porteur, le player sert une
    /// > coquille** : c'est licite (une scène purement textuelle se peint sans
    /// > lui) mais un viewer story doit toujours le donner. »
    ///
    /// Le viewer story le donne. La carte du FIL, née plus tard, ne le donnait
    /// pas — et le paramètre ayant une valeur par défaut (`carrier: nil`), rien
    /// n'a rougi : ni compilation, ni témoin, ni journal.
    ///
    /// > **Un défaut de paramètre transforme un oubli en silence.** La phrase
    /// > qui décrit le mécanisme était là, exacte, au-dessus du type ; c'est le
    /// > `= nil` de la signature qui a permis de l'ignorer. Une scène de TEXTE
    /// > se peignait sans porteur, donc l'absence ne se voyait que sur les
    /// > scènes de MÉDIA — c'est-à-dire sur le cas nominal d'un post-photo.
    ///
    /// Le porteur est construit ICI, à partir du post, plutôt que reçu : les
    /// deux seules choses dont le résolveur a besoin — l'index des médias et le
    /// canvas — sont exactement ce que le post porte déjà. Le fabriquer chez
    /// l'appelant aurait donné autant de fabriques que de surfaces.
    private var carrier: StoryItem {
        StoryItem(id: post.id,
                  content: post.content,
                  media: post.media,
                  storyEffects: post.storyEffects,
                  // `timestamp` chez `FeedPost`, `createdAt` chez `StoryItem` :
                  // deux noms pour la même horloge. Le porteur ne s'en sert
                  // que pour son identité de lecture, mais lui donner une date
                  // FABRIQUÉE ferait dater la scène du rendu.
                  createdAt: post.timestamp)
    }

    var body: some View {
        MeeshyScenePlayer(
            document: document,
            mode: .card,
            sceneIndex: .constant(0),
            isPlaying: .constant(isActive),
            accentColorHex: accentColor,
            carrier: carrier
        )
        .preferredContentLanguages(preferredContentLanguages)
        .aspectRatio(9.0 / 16.0, contentMode: .fit)
        .frame(maxWidth: Self.maxWidth)
        .frame(maxWidth: .infinity, alignment: .center)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .reportReelFrame(id: post.id, kind: .scene)
        .contentShape(Rectangle())
        .onTapGesture { onTapPost?(post) }
    }
}

extension PostSceneCard: Equatable {
    /// Ne se re-rend que si son ÉLECTION ou son contenu change — le churn
    /// d'élection des AUTRES cartes laisse celle-ci intacte.
    nonisolated static func == (lhs: PostSceneCard, rhs: PostSceneCard) -> Bool {
        lhs.post.id == rhs.post.id
            && lhs.isActive == rhs.isActive
            && lhs.accentColor == rhs.accentColor
            && lhs.preferredContentLanguages == rhs.preferredContentLanguages
            && lhs.document == rhs.document
    }
}

/// Observe le coordinateur du fil et pilote la lecture de la scène d'un post
/// depuis l'élection de viewport. SEUL point qui dépend de `activeReelId` :
/// `FeedPostCard` ne le lit jamais, sans quoi tout changement d'élection
/// ré-évaluerait le `ForEach` entier.
struct PostSceneCardContainer: View {
    @ObservedObject var coordinator: ReelFeedAutoplayCoordinator
    let post: FeedPost
    let document: CanvasV3
    let accentColor: String
    var onTapPost: ((FeedPost) -> Void)?

    var body: some View {
        PostSceneCard(
            post: post,
            document: document,
            isActive: coordinator.activeReelId == post.id,
            accentColor: accentColor,
            preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages ?? [],
            onTapPost: onTapPost
        )
        .equatable()
    }
}

/// **Le choix container / feuille, fait UNE fois.**
///
/// Un hôte de fil (`FeedView`, `RootViewComponents`) tient un coordinateur et
/// obtient l'élection ; un hôte isolé (détail, signets, résultats de hashtag)
/// n'en a pas et la scène y reste en pause. Écrire ce `if` chez chaque hôte
/// serait la porte d'entrée d'une quatrième politique de lecture — c'est
/// exactement ainsi que les trois précédentes sont nées.
struct PostSceneSurface: View {
    let coordinator: ReelFeedAutoplayCoordinator?
    let post: FeedPost
    let document: CanvasV3
    let accentColor: String
    var onTapPost: ((FeedPost) -> Void)?

    var body: some View {
        if let coordinator {
            PostSceneCardContainer(
                coordinator: coordinator,
                post: post,
                document: document,
                accentColor: accentColor,
                onTapPost: onTapPost
            )
        } else {
            // Sans coordinateur, la scène ne fabrique pas une élection que
            // personne ne tient : c'est le viewport du FIL qui décide, ou rien.
            PostSceneCard(
                post: post,
                document: document,
                isActive: false,
                accentColor: accentColor,
                preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages ?? [],
                onTapPost: onTapPost
            )
            .equatable()
        }
    }
}

// MARK: - Story repartagée

/// Observe le coordinateur et pilote la lecture de la story repartagée d'un
/// post. Miroir de `PostSceneCardContainer` : c'est la MÊME loi de lecture, sur
/// la surface qui, jusqu'au 2026-09-05, était la seule du fil à jouer sans
/// jamais rien demander à personne.
///
/// L'identité d'élection est le post CONTENANT (`post.id`), jamais l'id de la
/// story repostée — une même story affichée deux fois dans le fil (par deux
/// reposteurs) doit élire exactement une surface, la règle que
/// `ReelRepostEmbedCell.reelCellId` porte déjà pour les réels.
struct StoryRepostEmbedContainer: View {
    @ObservedObject var coordinator: ReelFeedAutoplayCoordinator
    let post: FeedPost
    let preferredContentLanguages: [String]?

    var body: some View {
        StoryRepostEmbedCell(
            post: post,
            preferredContentLanguages: preferredContentLanguages,
            isActive: coordinator.activeReelId == post.id
        )
        .equatable()
    }
}

/// Le pendant de `PostSceneSurface` pour une story repartagée — même règle,
/// même raison de vivre à un seul endroit.
struct StoryRepostSurface: View {
    let coordinator: ReelFeedAutoplayCoordinator?
    let post: FeedPost
    let preferredContentLanguages: [String]?

    var body: some View {
        if let coordinator {
            StoryRepostEmbedContainer(
                coordinator: coordinator,
                post: post,
                preferredContentLanguages: preferredContentLanguages
            )
        } else {
            StoryRepostEmbedCell(post: post, preferredContentLanguages: preferredContentLanguages)
                .equatable()
        }
    }
}
