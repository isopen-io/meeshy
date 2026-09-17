import SwiftUI
import MeeshySDK

/// **Ouvrir la galerie plein écran d'un post — un seul site, quatre surfaces**
/// (#4927).
///
/// ## Ce que ce fichier ferme
///
/// `ConversationMediaGalleryView` est la surface qui FEUILLETTE : plein écran,
/// glissement d'un média au suivant, légende par média. Trois surfaces sociales
/// l'ouvraient déjà — la carte du fil, le détail d'un post, un commentaire — en
/// recopiant chacune une vingtaine de lignes : filtrer les médias visuels, les
/// convertir en pièces jointes, composer l'auteur, dériver la carte des
/// légendes.
///
/// > Une composition recopiée n'a pas besoin de diverger pour coûter : il suffit
/// > qu'une quatrième surface arrive. Le réel est cette quatrième surface, et le
/// > geste juste n'était pas d'écrire un quatrième exemplaire.
///
/// ## UN plein écran, scènes comprises (#6709)
///
/// Directive porteur du 2026-09-15 : « lorsqu'on ouvre les scènes de poste, on
/// doit utiliser LE même composant qu'on utilise pour afficher les attachements
/// de conversation ! Et afficher en bas la liste des images du poste et des
/// médias en commentaire ! »
///
/// Un post qui portait un canvas ouvrait jusque-là un SECOND plein écran —
/// sans cadre, sans plein cadre au toucher, sans pellicule, sans « Répondre ».
/// La question « ce post porte-t-il une scène ? » se pose toujours, mais elle ne
/// choisit plus un écran : elle choisit la NATURE des pages (`PostGalleryLot`).
///
/// ## Ce qu'il ne décide pas
///
/// Ni QUAND ouvrir (l'hôte tient son `isPresented`), ni PAR OÙ (une pastille, un
/// tap sur la vignette, un appui long). Il tient ce qui doit être identique
/// partout : la sélection des pages, l'auteur servi à chaque page, et la
/// LÉGENDE — `SocialMediaCaption` et `SceneCaption` restent les sites uniques de
/// leurs règles, appelés ici une fois pour tout le monde.
extension View {

    /// - Parameters:
    ///   - post: le porteur des médias. `nil` ⇒ la feuille ne présente rien —
    ///     l'hôte n'a pas à garder son binding, ce qui évite le cas où l'on
    ///     ouvre un plein écran vide pendant un rechargement.
    ///   - startMediaId: le média par lequel on ENTRE. `nil` ⇒ le premier. Un
    ///     média du post montré par une scène ouvre cette scène.
    ///   - startSceneIndex: la SCÈNE par laquelle on entre, quand le post en
    ///     porte plusieurs — le doigt sur une tuile de mosaïque ouvre SA scène
    ///     (directive porteur 2026-09-06). Sans défaut chez les appelants qui
    ///     n'ont qu'un média à feuilleter : `0` ne coûte rien à une galerie.
    ///   - preferredContentLanguages: le Prisme servi au PLAYER des scènes —
    ///     aux textes posés dans la scène. Vide ⇒ le Prisme du lecteur.
    func socialMediaGallery(
        post: FeedPost?,
        isPresented: Binding<Bool>,
        startMediaId: String?,
        startSceneIndex: Int = 0,
        accentColor: String,
        preferredContentLanguages: [String] = []
    ) -> some View {
        modifier(SocialMediaGalleryLayer(
            post: post,
            isPresented: isPresented,
            startMediaId: startMediaId,
            startSceneIndex: startSceneIndex,
            accentColor: accentColor,
            preferredContentLanguages: preferredContentLanguages
        ))
    }
}

/// **Le plein écran d'un post, ET la porte qu'il ouvre** (#6085).
///
/// Un `ViewModifier` nominal plutôt qu'une fermeture : « Composer » enchaîne
/// DEUX présentations sur le même hôte — la galerie se referme, le meuble prend
/// sa place — et une séquence a besoin d'un endroit où se lire d'un seul tenant.
/// C'est exactement la raison, et la forme, de `ConversationMediaGalleryLayer`
/// sur le chemin conversation.
private struct SocialMediaGalleryLayer: ViewModifier {

    let post: FeedPost?
    @Binding var isPresented: Bool
    let startMediaId: String?
    let startSceneIndex: Int
    let accentColor: String
    let preferredContentLanguages: [String]

    /// **Le publieur de « Composer »** — valeur d'environnement, jamais
    /// `@EnvironmentObject` : les hôtes de ce modificateur sont montés dans des
    /// FEUILLES qui ne portent pas les objets de la racine (`UserProfileSheet` →
    /// `ProfileUserPostsList`, `FeedCommentsSheet`, `BookmarksView`). Lire un
    /// objet absent fait trapper ; `nil` ne fait que retirer l'entrée (loi 4).
    @Environment(\.meeshyStoryComposer) private var storyComposer: StoryViewModel?

    /// **Armer, puis fermer** — jamais présenter tout de suite. Deux
    /// `fullScreenCover` armés dans la même transaction n'en présentent AUCUN.
    @State private var pendingCompose: ComposerSeedTarget?
    @State private var composeTarget: ComposerSeedTarget?

    /// **« Composer » s'arme sur la PIÈCE ouverte** (#6709, recette du 2026-09-16).
    ///
    /// La couche résolvait la règle d'offre pour le POST entier (critère 2 de
    /// #6085) : un post à plusieurs scènes n'offrait donc aucune pièce, et la
    /// colonne n'avait que « Répondre ». La galerie montre UNE pièce, et la règle
    /// d'offre répond maintenant pour elle (`PostGalleryLot.composeTarget`) ; la
    /// couche ne fait plus qu'armer la cible reçue. Sans publieur, aucune entrée
    /// (loi 4).
    private var armCompose: ((ComposerSeedTarget) -> Void)? {
        guard storyComposer != nil else { return nil }
        return { cible in
            pendingCompose = cible
            isPresented = false
        }
    }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: $isPresented, onDismiss: promote) { galerie }
            // **La porte vit sur un HÔTE À ELLE** — SwiftUI ne présente qu'UNE
            // modale par vue, et celle du dessus occupe déjà la place de cet
            // hôte. Un `Color.clear` en arrière-plan lui en donne une autre ;
            // sans quoi la galerie se referme sur une cible armée que rien
            // n'ouvre. Mesuré au simulateur sur le chemin story, qui présentait
            // le même défaut pour la même raison.
            .background {
                Color.clear
                    .fullScreenCover(item: $composeTarget) { target in
                        if let storyComposer {
                            MediaComposerDoor(
                                target: target,
                                storyViewModel: storyComposer,
                                // Aucun aperçu : les trois modèles que
                                // `StoryViewerView` réclame ne traversent pas
                                // cette frontière depuis un hôte de fil.
                                // DETTE NOMMÉE, comme `ShareComposeDoor`.
                                preview: nil,
                                onDismiss: { composeTarget = nil }
                            )
                        }
                    }
            }
    }

    /// La galerie est DÉMONTÉE : le meuble peut prendre sa place.
    private func promote() {
        guard let attendue = pendingCompose else { return }
        pendingCompose = nil
        composeTarget = attendue
    }

    /// **La valeur d'environnement est REMISE à l'intérieur du cover.**
    ///
    /// Un `fullScreenCover` n'hérite pas de l'environnement de son hôte dans ce
    /// dépôt — six sites le documentent et le contournent à la main. La couche
    /// la lit DEHORS (où la racine l'a posée) et la repose DEDANS.
    @ViewBuilder
    private var galerie: some View {
        Group {
            if let post {
                SocialMediaGalleryContent(
                    post: post,
                    startMediaId: startMediaId,
                    startSceneIndex: startSceneIndex,
                    accentColor: accentColor,
                    playerLanguages: preferredContentLanguages,
                    // **Le même item, dans le menu de la PIÈCE** (arbitrage
                    // porteur 2026-09-11). C'est la rangée d'actions du plein
                    // écran — celle qui porte déjà « Créer avec ce média » en
                    // conversation — et non un bouton inventé pour le fil :
                    // même libellé, même glyphe, même rang.
                    onCompose: armCompose,
                    // **« Commenter CE média »** (#6578) — même rangée
                    // d'actions, même glyphe de réponse qu'en conversation.
                    //
                    // La couche DÉSIGNE puis se referme ; elle n'écrit rien. Le
                    // composer du fil, qui n'est pas monté ici, reprend la
                    // désignation par `CommentQuotationStore` — le même magasin
                    // par `postId` que `CommentDraftStore` pour le brouillon
                    // texte, et pour la même raison : une modale ne peut pas
                    // poser un `@State` sur l'hôte qui la présente.
                    //
                    // La CITATION est résolue par le lot (`PostGalleryLot
                    // .quotation`) : une page scène cite le média qu'elle montre,
                    // un média joint à un commentaire ne se cite pas — le serveur
                    // refuse un média étranger au post commenté. Les médias
                    // PROTÉGÉS sont exclus en amont par `ConversationMediaGalleryView`.
                    onQuote: { citation in
                        CommentQuotationStore.shared.designate(citation, for: post.id)
                        isPresented = false
                    }
                )
                // **L'entrée doit RECRÉER la galerie, pas seulement la
                // reconfigurer** (directive porteur 2026-09-06 : « en touchant
                // une scène voisine, j'ai la première scène qui ouvre en plein
                // écran »).
                //
                // La galerie sème sa page courante (`@State`) depuis son
                // point d'entrée dans son `init` — et **un `@State` ne
                // s'initialise qu'à la PREMIÈRE naissance d'une identité de
                // vue**. SwiftUI réutilisant l'identité d'une présentation à la
                // suivante, la deuxième ouverture reconstruit bien la `struct`
                // mais IGNORE le `State(initialValue:)` : la page courante
                // resterait celle de l'ouverture précédente.
                //
                // > **Un `init` qui a l'air de tout recalculer peut n'en garder
                // > qu'une moitié.** Les propriétés stockées suivent, les
                // > `@State` non — et rien ne distingue les deux à la lecture du
                // > site d'appel.
                //
                // `.id()` répond au bon niveau : entrer par une AUTRE page est
                // une autre présentation, pas la même reconfigurée. L'identité
                // est STABLE pendant la présentation : c'est le point d'ENTRÉE,
                // jamais la page courante — le doigt qui feuillette ne le change
                // pas, donc rien n'est recréé pendant qu'on regarde.
                .id("\(startMediaId ?? "")#\(startSceneIndex)")
            }
        }
        .environment(\.meeshyStoryComposer, storyComposer)
    }
}

/// **La composition elle-même, et ce que l'hôte tient VIVANT pendant
/// l'ouverture.**
///
/// `PostGalleryLot` décide des pages : les scènes d'un canvas ou les médias du
/// post, puis les médias joints aux commentaires (#6709, #6710). Cette vue ne
/// compose rien elle-même — elle tient les deux choses que la carte qui la
/// présente ne peut plus lui relayer, parce que le plein écran la COUVRE :
///
/// - **les commentaires**, lus au cache d'abord puis au réseau
///   (`PostGalleryCommentSource`), et suivis en temps réel : un commentaire publié
///   pendant la lecture rejoint la FIN du lot, la page ouverte ne bouge pas ;
/// - **les traductions arrivées** (#6560) — la légende d'une scène se traduit à la
///   demande, et la traduction revient par la socket.
struct SocialMediaGalleryContent: View {

    let post: FeedPost
    let startMediaId: String?
    let startSceneIndex: Int
    let accentColor: String
    /// Le Prisme que l'hôte transmet au PLAYER des scènes. Vide (un réel ne le
    /// transmet pas) ⇒ le Prisme du lecteur.
    let playerLanguages: [String]

    /// **« Composer » sur la pièce ouverte** (#6085, #6709). `nil` ⇒ aucun bouton.
    /// La couche arme la cible ; c'est ICI, par le lot, que la règle d'offre répond
    /// pour la pièce qu'on regarde (`PostGalleryLot.composeTarget`).
    var onCompose: ((ComposerSeedTarget) -> Void)?

    /// **« Commenter CE média »** (#6578) — la moitié publication du geste dont
    /// `ConversationView+MediaGallery` porte la moitié conversation.
    var onQuote: ((CommentQuotedMedia) -> Void)?

    @State private var comments: [FeedComment]
    @State private var arrivals: [CaptionTranslationArrival] = []

    init(post: FeedPost,
         startMediaId: String?,
         startSceneIndex: Int = 0,
         accentColor: String,
         playerLanguages: [String] = [],
         onCompose: ((ComposerSeedTarget) -> Void)? = nil,
         onQuote: ((CommentQuotedMedia) -> Void)? = nil) {
        self.post = post
        self.startMediaId = startMediaId
        self.startSceneIndex = startSceneIndex
        self.accentColor = accentColor
        self.playerLanguages = playerLanguages
        self.onCompose = onCompose
        self.onQuote = onQuote
        // La carte embarque quelques commentaires : ils sont là tout de suite,
        // avant même que le cache réponde.
        _comments = State(initialValue: post.comments)
    }

    /// Le Prisme du LECTEUR — la descente stricte qui gouverne ce qui s'AFFICHE
    /// (`ReaderPrism`, jamais le repli « fr » des défauts de composition).
    private var readerLanguages: [String] {
        ReaderPrism.resolve(for: AuthManager.shared.currentUser)
    }

    var body: some View {
        let affiche = CaptionTranslationArrival.applying(arrivals, to: post)
        let langues = readerLanguages
        let lot = PostGalleryLot.compose(post: affiche, comments: comments, preferredLanguages: langues)
        ConversationMediaGalleryView(
            allAttachments: lot.attachments,
            startAttachmentId: PostGalleryLot.entryId(in: lot, startMediaId: startMediaId,
                                                      startSceneIndex: startSceneIndex),
            accentColor: accentColor,
            // `captionMap` est le chemin simple, `captionServings` le chemin
            // riche qui porte les alternatives de langue (#4934) : les deux sont
            // servis. L'ORDRE suit celui de la déclaration — l'init l'impose.
            captionServings: lot.captionServings,
            captionMap: lot.captionMap,
            senderInfoMap: lot.attributions.mapValues(Self.senderInfo),
            // **« Créer avec CE média »** (#6709) : la cible de la pièce OUVERTE, par
            // la règle d'offre unique — une scène sème le média qu'elle montre, et une
            // pièce sans cible n'a pas de bouton.
            onComposeWithMedia: onCompose.map { arm in { piece in
                guard let cible = lot.composeTarget(for: piece.id, in: affiche) else { return }
                arm(cible)
            } },
            onReplyToMedia: onQuote.map { quote in { piece in
                guard let citation = lot.quotation(for: piece.id, in: affiche) else { return }
                quote(citation)
            } },
            replyableMedia: { lot.quotation(for: $0.id, in: affiche) != nil },
            composableMedia: { lot.composeTarget(for: $0.id, in: affiche) != nil },
            sceneContext: lot.scenes.isEmpty ? nil : GallerySceneContext(
                post: affiche,
                scenes: lot.scenes,
                captions: lot.sceneCaptions,
                playerLanguages: playerLanguages.isEmpty ? langues : playerLanguages,
                captionLanguages: langues
            )
        )
        .task(id: post.id) { await refreshComments() }
        .onReceive(SocialSocketManager.shared.commentAdded.receive(on: DispatchQueue.main)) { recu in
            guard recu.postId == post.id else { return }
            comments = PostGalleryCommentFeed.adding(
                StoryViewerView.storyComment(from: recu.comment, preferredLanguages: readerLanguages),
                to: comments)
        }
        .onReceive(SocialSocketManager.shared.commentUpdated.receive(on: DispatchQueue.main)) { recu in
            guard recu.postId == post.id, comments.contains(where: { $0.id == recu.comment.id }) else { return }
            comments = PostGalleryCommentFeed.adding(
                StoryViewerView.storyComment(from: recu.comment, preferredLanguages: readerLanguages),
                to: comments)
        }
        .onReceive(SocialSocketManager.shared.commentDeleted.receive(on: DispatchQueue.main)) { recu in
            guard recu.postId == post.id else { return }
            comments = PostGalleryCommentFeed.removing(commentId: recu.commentId, from: comments)
        }
        // **Les traductions de CE post arrivées pendant l'ouverture** (#6560) :
        // tant que le plein écran couvre la carte hôte, le post qu'elle relaie
        // ne change pas. L'hôte les plie lui-même sur le post qu'il sert.
        .onReceive(SocialSocketManager.shared.mediaCaptionTranslationUpdated.receive(on: DispatchQueue.main)) { recue in
            guard recue.postId == post.id else { return }
            arrivals.append(.mediaCaption(recue))
        }
        .onReceive(SocialSocketManager.shared.postTranslationUpdated.receive(on: DispatchQueue.main)) { recue in
            guard recue.postId == post.id else { return }
            arrivals.append(.post(recue))
        }
    }

    /// **Cache d'abord, réseau ensuite** — et le réseau seulement si le cache
    /// n'est pas frais ET que le post compte des commentaires que le fil ne
    /// porte pas encore.
    private func refreshComments() async {
        if let cache = await PostGalleryCommentSource.cached(postId: post.id) {
            comments = PostGalleryCommentFeed.merging(cache.comments, into: comments)
            if cache.isFresh { return }
        }
        guard post.commentCount > comments.count,
              let fetched = await PostGalleryCommentSource.fetched(postId: post.id,
                                                                   preferredLanguages: readerLanguages)
        else { return }
        comments = PostGalleryCommentFeed.merging(fetched, into: comments)
    }

    private static func senderInfo(_ attribution: PostGalleryLot.Attribution) -> ConversationViewModel.MediaSenderInfo {
        ConversationViewModel.MediaSenderInfo(
            senderName: attribution.name,
            senderAvatarURL: attribution.avatarURL,
            senderColor: attribution.color,
            sentAt: attribution.date
        )
    }
}

/// **Quelle NATURE ont les pages de la publication** — une décision, donc une
/// règle pure et non une condition enfouie dans un `@ViewBuilder`.
///
/// La question n'a qu'une forme : *ce post porte-t-il une scène qui montre
/// tout ?* Un canvas se rejoue par le player ; tout le reste se feuillette. Elle
/// décidait jusqu'au #6709 de l'ÉCRAN à ouvrir ; elle décide désormais de la
/// nature des pages du lot (`PostGalleryLot.compose`), dans UNE galerie.
/// Séparée du rendu, elle s'éprouve — et c'est ce qui empêche un futur lot de
/// rerouter silencieusement une scène vers ses ingrédients.
/// `nonisolated` : la règle ne touche rien de l'interface. Sans l'annotation
/// elle hérite de l'isolation `@MainActor` du module et devient inappelable
/// depuis un témoin synchrone — une décision qu'aucun test ne peut interroger
/// n'est pas une décision gardée.
nonisolated enum SocialFullscreenRoute {

    /// Le canvas à rejouer, ou `nil` quand le post n'en porte pas — auquel cas
    /// ses médias se feuillettent.
    ///
    /// **Un canvas VIDE n'est pas une scène.** Le composer stampe une enveloppe
    /// dès qu'il touche une publication ; sans slide, elle ne décrit rien et le
    /// player n'aurait rien à peindre. Les médias, eux, sont toujours là.
    static func scene(of post: FeedPost) -> CanvasV3? {
        guard let document = post.storyEffects?.canvasV3,
              !document.scenes.isEmpty,
              coversEveryVisual(document, of: post)
        else { return nil }
        return document
    }

    /// **Un canvas qui ne montre pas TOUT ce que le post porte n'a pas le
    /// dernier mot** (régression mesurée puis corrigée le 2026-09-06).
    ///
    /// Mesuré au simulateur : un post composé de DEUX photos part avec ses deux
    /// médias et leurs deux légendes — et un canvas d'UNE seule scène, portant
    /// UN seul média en fond (le composer ne publie que sa slide courante). La
    /// route vers la scène montrait donc une photo sur deux, sans pellicule ni
    /// moyen d'atteindre l'autre. Les pages média, elles, les montrent toutes.
    ///
    /// > **Un correctif qui améliore le cas visé peut dégrader son voisin.**
    /// > Router une scène vers son player est juste quand le canvas EST la
    /// > publication ; c'est une perte quand il n'en est qu'une partie. La
    /// > première écriture de cette règle ne posait que la question « y a-t-il
    /// > une scène ? » — il fallait aussi demander « montre-t-elle tout ? ».
    ///
    /// La comparaison porte sur le NOMBRE de visuels, pas sur leur identité :
    /// pendant la composition les médias n'ont pas encore d'id serveur, et le
    /// canvas les référence par des clés que le post ne porte pas. Un compte
    /// suffit à répondre à la seule question qui décide — la scène laisse-t-elle
    /// quelque chose dehors ?
    ///
    /// Le jour où le composer publiera toutes ses slides, cette garde deviendra
    /// vraie d'elle-même et cessera de faire feuilleter les médias.
    private static func coversEveryVisual(_ document: CanvasV3, of post: FeedPost) -> Bool {
        let visuelsDuPost = post.media.filter { $0.type == .image || $0.type == .video }.count
        guard visuelsDuPost > 0 else { return true }
        let visuelsDuCanvas = document.scenes
            .flatMap(\.objects)
            .filter { $0.kind == .media }
            .count
        return visuelsDuCanvas >= visuelsDuPost
    }
}
