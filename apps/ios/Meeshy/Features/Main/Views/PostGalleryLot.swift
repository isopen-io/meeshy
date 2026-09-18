import Foundation
import CoreGraphics
import MeeshySDK
import MeeshyUI

/// **Une SCÈNE de post, posée dans la galerie comme une page parmi les autres**
/// (#6709).
///
/// La galerie feuillette des `MessageAttachment` et range tout ce qu'elle sait
/// d'une page dans des cartes indexées par identifiant — légende, auteur. Une
/// scène y entre de la même façon : une pièce jointe SYNTHÉTIQUE porte son
/// identité, sa vignette et son ThumbHash (ce que la pellicule et le hors-champ
/// lisent), et cette valeur porte ce que la PAGE lit — le document, la scène, le
/// porteur, le rapport, le mouvement.
///
/// **La nature d'une page se lit sur la carte `scenes`, jamais sur le MIME.** Le
/// MIME synthétique n'a qu'un rôle : rendre la pièce INERTE pour tout chemin
/// écrit pour les médias. Il ne commence ni par `image/` ni par `video/`, donc
/// aucune extraction de poster, aucun préchauffage, aucune libération du player
/// partagé ne s'arme sur une scène.
/// **Ce qu'une scène présente sur UNE surface** — son cadre et son fond, rendus
/// ensemble (#6806).
///
/// Deux valeurs dans un type plutôt que deux propriétés voisines : voisines,
/// elles se lisent séparément, et c'est exactement ainsi qu'un lot a changé
/// l'une en laissant l'autre.
nonisolated struct SceneSurface: Equatable {
    /// Le rapport largeur / hauteur du CADRE présenté.
    let aspect: CGFloat
    /// Le canvas habille-t-il ses bandes ? Vrai exactement quand elles entrent
    /// dans le cadre ci-dessus.
    let paintsLetterbox: Bool
}

nonisolated struct GallerySceneItem: Equatable {
    static let mimeType = "application/x-meeshy-scene"

    let id: String
    let postId: String
    let document: CanvasV3
    let sceneIndex: Int
    /// Le porteur de la scène : le document dit ce qu'il faut peindre, pas où
    /// vivent les pixels. Sans lui, une scène de MÉDIA se peint vide (#4926).
    let carrier: StoryItem
    /// Le média du post que la scène MONTRE (`SceneCaption.mediaIdentity`), ou
    /// `nil` pour une scène de texte, de dessin ou de couleur. C'est lui qu'une
    /// citation désigne, et lui qu'une citation rouvre.
    let mediaId: String?
    /// Le rapport largeur / hauteur auquel la scène se cadre SUR UNE CARTE —
    /// TOUJOURS `SceneShape.aspect` depuis #6896/#6904 (voir
    /// `PostGalleryLot.sceneAspect`) : une scène qui n'est qu'une image ne se
    /// cadre plus au rapport de cette image.
    let aspect: CGFloat

    /// **Le rapport du CANVAS lui-même** (#6806) — celui auquel la scène se
    /// présente en PLEIN CADRE. Identique à `aspect` depuis #6896/#6904 (les
    /// deux sont TOUJOURS `SceneShape.aspect`) : le champ survit pour que
    /// `mediaRatio(of:scenes:presentation:)` garde un site unique par
    /// présentation, `surface(inFullFrame:)`, plutôt que de brancher sur
    /// `presentation.isFull` lui-même.
    let canvasAspect: CGFloat
    /// La scène a-t-elle quelque chose à jouer — vidéo, son, animation,
    /// transition, ou le son de fond du document ? Seule une scène qui bouge
    /// porte un play/pause et répond à l'appui long par une pause (loi 4).
    let moves: Bool
    let thumbHash: String?
    let thumbnailURL: String?

    /// La scène elle-même, et non le document entier : deux pages d'un même
    /// document ne diffèrent que par elle, et comparer le document ferait payer
    /// une égalité profonde à chaque page à chaque rendu de la racine.
    var scene: SceneV3? {
        document.scenes.indices.contains(sceneIndex) ? document.scenes[sceneIndex] : nil
    }

    /// **Le canvas repeint-il le fond que la galerie peint déjà ?** (#6791,
    /// directive porteur 2026-09-16).
    ///
    /// > « Il faut utiliser le fond comme canvas une fois plutôt que de refaire
    /// > un cadre de canvas […] on a deux fonds thumbHash au lieu d'en avoir
    /// > qu'une »
    ///
    /// La page pose déjà le ThumbHash sous le cadre (`MediaStageBackdrop`,
    /// #6143). Quand la scène n'est QU'UNE image, elle se présente au rapport de
    /// cette image (`PostGalleryLot.sceneAspect`) : ses bandes sortent alors du
    /// cadre présenté, et le calque que le canvas y peint
    /// (`StoryLetterboxFill`) n'ajoute aucun pixel visible — il ajoute un
    /// SECOND dégradé du même hachage, étiré dans un autre cadre. Mesuré au
    /// simulateur : deux teintes distinctes au-dessus du même média.
    ///
    /// C'est la règle de #6636 — « si rien ne sort des cadres de l'image, il ne
    /// faut pas afficher le canvas » — que le lecteur de stories porte depuis ce
    /// jour-là (`imageOnlyRect(of:)`) et que cette page, née après, n'avait
    /// jamais reçue.
    ///
    /// **Ce qu'une scène PRÉSENTE, et ce n'est pas la même chose selon la
    /// surface qui la porte** (#6806 + #6791, tenus par UNE réponse).
    ///
    /// Le rapport du cadre et le fond que le canvas peint sont la MÊME
    /// question — le doc-comment de l'ancienne `servesLetterboxFill` (retirée
    /// au lot #6904, sans consommateur depuis que la CARTE peint seule) le
    /// disait déjà : « un second prédicat à tenir d'accord avec `sceneAspect`
    /// divergerait le jour où l'un des deux changerait ». Ce jour est arrivé
    /// le 2026-09-16 : un lot
    /// a fait passer le plein cadre au rapport du canvas **sans** toucher au
    /// fond. Géométrie exacte (`media = 402 × 714,7`, le sol divisé par trois),
    /// rendu PIRE — la photo ne grandissait pas, elle glissait vers le haut en
    /// laissant ~340 pt de vide. Ce vide était la bande du canvas, que plus
    /// personne ne peignait.
    ///
    /// La règle, une fois les deux moitiés ensemble :
    /// - **cardée**, on ouvre la PHOTO : le cadre prend le rapport de l'image,
    ///   ses bandes SORTENT du cadre, le canvas ne les peint pas (#6791) ;
    /// - **en plein cadre**, on ouvre la SCÈNE : le cadre prend le rapport du
    ///   canvas, ses bandes entrent DANS le cadre, le canvas les habille.
    ///
    /// Rendre les deux d'un seul appel est ce qui interdit la divergence : on
    /// ne peut plus changer le cadre en oubliant le fond.
    func surface(inFullFrame: Bool) -> SceneSurface {
        // **La scène est TOUJOURS 9:16, cardée ou en plein cadre** (#6896,
        // #6904) : `inFullFrame` ne fait plus varier le rapport présenté, et
        // le canvas ne peint plus jamais de bandes — `SceneShape.layout(...)`
        // dit qui peint le hors-champ (le plateau).
        SceneSurface(aspect: SceneShape.aspect, paintsLetterbox: false)
    }

    static func == (gauche: GallerySceneItem, droite: GallerySceneItem) -> Bool {
        gauche.id == droite.id
            && gauche.postId == droite.postId
            && gauche.sceneIndex == droite.sceneIndex
            && gauche.mediaId == droite.mediaId
            && gauche.aspect == droite.aspect
            && gauche.moves == droite.moves
            && gauche.thumbHash == droite.thumbHash
            && gauche.thumbnailURL == droite.thumbnailURL
            && gauche.scene == droite.scene
    }
}

/// **D'où vient la légende d'une scène** — la légende propre de son média, ou le
/// texte du post en repli (`SceneCaption.Origin`, #6280). Les deux se traduisent
/// par des routes distinctes, et la chaîne seule ne dit pas laquelle on affiche.
nonisolated struct GallerySceneCaption: Equatable {
    let origin: SceneCaption.Origin
    let mediaId: String?

    /// Le contenu que la rangée et la feuille traduisent : celui qui est AFFICHÉ,
    /// jamais son voisin, même à chaînes égales.
    func source(in post: FeedPost) -> CaptionTranslationSource? {
        CaptionTranslationSource.of(origin: origin, post: post, mediaId: mediaId)
    }

    /// **La langue affichée, résolue UNE fois** — le choix du lecteur, sinon la
    /// descente du Prisme. Le texte ET le drapeau actif la lisent : deux
    /// résolutions parallèles ont déjà marqué « Français » actif sur un texte
    /// portugais (#6531).
    func displayedLanguage(in post: FeedPost,
                           preferredLanguages: [String],
                           chosenLanguage: String?) -> String? {
        chosenLanguage ?? source(in: post)?.displayedLanguage(preferredLanguages: preferredLanguages)
    }

    /// **Le texte servi, lu DEPUIS la langue affichée** — site unique du lot et du
    /// bloc de légende. Une langue sans texte connu rend le contenu, jamais une
    /// légende vide.
    func servedText(in post: FeedPost, fallback: String, language: String?) -> String {
        guard let source = source(in: post) else { return fallback }
        return CaptionTranslationOffer.carrierText(
            content: source.text,
            originalLanguage: source.originalLanguage,
            translations: source.translations,
            language: language
        )
    }
}

/// **Le LOT que le plein écran d'un post feuillette** (#6709, #6710, directive
/// porteur 2026-09-15).
///
/// > « lorsqu'on ouvre les scènes de poste, on doit utiliser LE même composant
/// > qu'on utilise pour afficher les attachements de conversation ! Et afficher
/// > en bas la liste des images du poste et des médias en commentaire ! »
///
/// ## L'ordre
///
/// D'abord la PUBLICATION — ses scènes quand le post est un canvas qui montre
/// tout (`SocialFullscreenRoute.scene(of:)`), ses médias visuels sinon, dans
/// l'ordre de publication. Ensuite les médias JOINTS aux commentaires, dans
/// l'ordre des commentaires. Un identifiant n'entre qu'une fois : la première
/// occurrence gagne, donc la publication gagne sur un commentaire.
///
/// ## Pourquoi une valeur pure
///
/// La composition décide de ce que la galerie peint, dans quel ordre et avec
/// quelle attribution. Un doublon ou un ordre faux ne se voit sur aucune capture
/// isolée — il se voit en feuilletant. Pure, elle s'éprouve sans monter une vue
/// (`PostGalleryLotTests`).
nonisolated struct PostGalleryLot {

    /// **Qui a posé la pièce, et quand.** L'auteur du POST pour ses scènes et ses
    /// médias ; l'auteur du COMMENTAIRE pour les médias qu'il a joints (#6710).
    struct Attribution: Equatable {
        let name: String
        let avatarURL: String?
        let color: String
        let date: Date
        /// Le commentaire qui porte la pièce ; `nil` pour une pièce du post.
        let commentId: String?

        static func of(post: FeedPost) -> Attribution {
            Attribution(name: post.author, avatarURL: post.authorAvatarURL,
                        color: post.authorColor, date: post.timestamp, commentId: nil)
        }

        static func of(comment: FeedComment) -> Attribution {
            Attribution(name: comment.author, avatarURL: comment.authorAvatarURL,
                        color: comment.authorColor, date: comment.timestamp, commentId: comment.id)
        }
    }

    let attachments: [MessageAttachment]
    let scenes: [String: GallerySceneItem]
    let sceneCaptions: [String: GallerySceneCaption]
    let captionServings: [String: SocialMediaCaptionServing]
    let captionMap: [String: String]
    let attributions: [String: Attribution]

    static let empty = PostGalleryLot(attachments: [], scenes: [:], sceneCaptions: [:],
                                      captionServings: [:], captionMap: [:], attributions: [:])

    static func compose(post: FeedPost,
                        comments: [FeedComment],
                        preferredLanguages: [String]) -> PostGalleryLot {
        let publication = SocialFullscreenRoute.scene(of: post)
            .map { scenes(of: post, document: $0, preferredLanguages: preferredLanguages) }
            ?? media(of: post, preferredLanguages: preferredLanguages)
        return publication.followed(by: commentMedia(comments, preferredLanguages: preferredLanguages))
    }

    /// **La page par laquelle on ENTRE.**
    ///
    /// 1. Une page dont l'identité est celle demandée — un média du post, ou un
    ///    média de commentaire.
    /// 2. La scène qui MONTRE le média demandé : c'est le chemin d'une citation,
    ///    qui désigne un média du post et doit rouvrir la scène qui le porte.
    /// 3. La scène touchée, bornée : un index hors bornes ferait ouvrir une page
    ///    qui n'existe pas.
    static func entryId(in lot: PostGalleryLot, startMediaId: String?, startSceneIndex: Int) -> String {
        if let startMediaId, lot.attachments.contains(where: { $0.id == startMediaId }) {
            return startMediaId
        }
        let pagesScene = lot.attachments.filter { lot.scenes[$0.id] != nil }
        if let startMediaId,
           let montre = pagesScene.first(where: { lot.scenes[$0.id]?.mediaId == startMediaId }) {
            return montre.id
        }
        guard !pagesScene.isEmpty else { return lot.attachments.first?.id ?? "" }
        return pagesScene[min(max(0, startSceneIndex), pagesScene.count - 1)].id
    }

    /// **La citation que « Répondre » pose sur cette page** — la même que #6578,
    /// jamais un second format.
    ///
    /// Une page scène cite le média qu'elle MONTRE ; une page média cite son
    /// média. Un média JOINT à un commentaire n'est pas un média du post : le
    /// serveur refuserait la citation, donc `nil` — et la page n'offre pas le
    /// geste (loi 4). Une scène sans média n'a rien à citer.
    func quotation(for pieceId: String, in post: FeedPost) -> CommentQuotedMedia? {
        guard let mediaId = postMediaId(for: pieceId, in: post),
              let media = post.media.first(where: { $0.id == mediaId }) else { return nil }
        return CommentQuotedMedia(postMediaId: media.id,
                                  kind: CommentQuotedMedia.Kind(rawValue: media.type.rawValue) ?? .file,
                                  media: media)
    }

    /// **Le média du POST que cette page montre** — son propre média pour une page
    /// média, celui que la scène montre pour une page scène. `nil` pour un média
    /// joint à un commentaire ou une scène sans média : ni la citation ni « Créer
    /// avec ce média » n'y ont de pièce. Site unique des deux gestes.
    func postMediaId(for pieceId: String, in post: FeedPost) -> String? {
        let candidat = scenes[pieceId].map(\.mediaId) ?? pieceId
        guard let candidat, post.media.contains(where: { $0.id == candidat }) else { return nil }
        return candidat
    }

    /// **« Créer avec CE média »** (#6709) — la cible du média que la page montre,
    /// par la règle d'offre unique (`ComposerSeedTarget(post:mediaId:)`). Recette du
    /// 2026-09-16 : sur les posts à plusieurs scènes, la colonne n'offrait que
    /// « Répondre », parce que l'offre était résolue pour le POST entier.
    @MainActor
    func composeTarget(for pieceId: String, in post: FeedPost) -> ComposerSeedTarget? {
        postMediaId(for: pieceId, in: post).flatMap { ComposerSeedTarget(post: post, mediaId: $0) }
    }

    /// L'identité d'une page scène. L'INDEX et non l'id de scène :
    /// `CanvasV3(migrating:)` a gravé `"s1"` en dur pendant tout le corpus
    /// legacy, et deux scènes homonymes doivent rester deux pages. Le préfixe ne
    /// peut rencontrer aucun identifiant de média (des ObjectId de 24 caractères).
    static func sceneItemId(postId: String, sceneIndex: Int) -> String {
        "scene:\(postId)#\(sceneIndex)"
    }

    /// **Le rapport auquel une scène se présente — point UNIQUE de la galerie.**
    ///
    /// TOUJOURS `SceneShape.aspect` (9:16, #6896/#6904) : la scène ne se
    /// présente plus au rapport d'une image ni d'un `carrierAspect` logé —
    /// ceux-là ne gouvernent que la manière dont un fond se POSE dans les
    /// 9:16 (`SceneShape.mediaBand`), jamais le cadre présenté. L'index et le
    /// document restent des paramètres pour que la signature ne change pas
    /// au fil des surfaces qui l'appellent — aucun des deux n'est plus lu.
    static func sceneAspect(_ document: CanvasV3, sceneIndex: Int) -> CGFloat {
        SceneShape.aspect
    }

    // MARK: - La publication

    private struct ScenePage {
        let item: GallerySceneItem
        let attachment: MessageAttachment
        let anchor: GallerySceneCaption?
        let caption: String?
    }

    private static func scenes(of post: FeedPost,
                               document: CanvasV3,
                               preferredLanguages: [String]) -> PostGalleryLot {
        let carrier = StoryItem(id: post.id, content: post.content, media: post.media,
                                storyEffects: post.storyEffects, createdAt: post.timestamp)
        let auteur = Attribution.of(post: post)
        let pages = document.scenes.indices.map { index in
            scenePage(index, of: post, document: document, carrier: carrier,
                      preferredLanguages: preferredLanguages)
        }
        return PostGalleryLot(
            attachments: pages.map(\.attachment),
            scenes: indexed(pages.map { ($0.item.id, $0.item) }),
            sceneCaptions: indexed(pages.compactMap { page in page.anchor.map { (page.item.id, $0) } }),
            captionServings: [:],
            captionMap: indexed(pages.compactMap { page in page.caption.map { (page.item.id, $0) } }),
            attributions: indexed(pages.map { ($0.item.id, auteur) })
        )
    }

    private static func scenePage(_ index: Int,
                                  of post: FeedPost,
                                  document: CanvasV3,
                                  carrier: StoryItem,
                                  preferredLanguages: [String]) -> ScenePage {
        let scene = document.scenes[index]
        let mediaId = SceneCaption.mediaIdentity(sceneIndex: index, in: document, post: post)
        let media = mediaId.flatMap { id in post.media.first { $0.id == id } }
        let item = GallerySceneItem(
            id: sceneItemId(postId: post.id, sceneIndex: index),
            postId: post.id,
            document: document,
            sceneIndex: index,
            carrier: carrier,
            mediaId: media?.id,
            aspect: sceneAspect(document, sceneIndex: index),
            canvasAspect: SceneShape.aspect,
            // Le son de fond appartient au DOCUMENT, pas à une scène : il fait
            // jouer chacune d'elles.
            moves: SceneMotion.isCinematic(scene) || document.sound != nil,
            // Le ThumbHash de la SCÈNE composée d'abord — texte et stickers
            // compris —, celui de son média en repli.
            thumbHash: scene.thumbHash ?? media?.thumbHash,
            thumbnailURL: media.flatMap(thumbnailURL(of:))
        )
        let attachment = MessageAttachment(
            id: item.id,
            mimeType: GallerySceneItem.mimeType,
            thumbnailUrl: item.thumbnailURL,
            thumbHash: item.thumbHash,
            uploadedBy: post.authorId,
            createdAt: post.timestamp,
            thumbnailColor: media?.thumbnailColor ?? "000000"
        )
        // **En plein écran, la légende est OBLIGATOIRE** (directive porteur
        // 2026-09-06) : le texte du post tient lieu de légende quand la scène
        // n'en porte pas.
        let legende = SceneCaption.resolveWithOrigin(sceneIndex: index, in: document, post: post,
                                                     carrierFallback: true)
        let anchor = legende.map { GallerySceneCaption(origin: $0.origin, mediaId: mediaId) }
        let caption = legende.map { legende in
            let ancre = GallerySceneCaption(origin: legende.origin, mediaId: mediaId)
            return ancre.servedText(in: post,
                                    fallback: legende.text,
                                    language: ancre.displayedLanguage(in: post,
                                                                      preferredLanguages: preferredLanguages,
                                                                      chosenLanguage: nil))
        }
        return ScenePage(item: item, attachment: attachment, anchor: anchor, caption: caption)
    }

    private static func media(of post: FeedPost, preferredLanguages: [String]) -> PostGalleryLot {
        let visuels = post.media.filter(CommentMediaGallery.isPageable)
        let auteur = Attribution.of(post: post)
        return PostGalleryLot(
            attachments: visuels.map { $0.toMessageAttachment() },
            scenes: [:],
            sceneCaptions: [:],
            // `captionMap` est le chemin simple, `captionServings` le chemin
            // riche qui porte les alternatives de langue (#4934).
            captionServings: SocialMediaCaption.serving(for: post.media, carrier: .from(post: post),
                                                        preferredLanguages: preferredLanguages),
            captionMap: SocialMediaCaption.map(for: post.media, carrierText: post.displayContent,
                                               preferredLanguages: preferredLanguages),
            attributions: indexed(visuels.map { ($0.id, auteur) })
        )
    }

    // MARK: - Les commentaires

    /// Les médias visuels joints aux commentaires, dans l'ordre des commentaires.
    /// L'audio a son propre plein écran ; la légende suit la règle UNIQUE des
    /// commentaires (`CommentMediaGallery.caption`).
    private static func commentMedia(_ comments: [FeedComment],
                                     preferredLanguages: [String]) -> PostGalleryLot {
        let pieces = comments.flatMap { comment in
            comment.media.filter(CommentMediaGallery.isPageable).map { (comment: comment, media: $0) }
        }
        return PostGalleryLot(
            attachments: pieces.map { $0.media.toMessageAttachment() },
            scenes: [:],
            sceneCaptions: [:],
            captionServings: [:],
            captionMap: indexed(pieces.compactMap { piece in
                CommentMediaGallery.caption(of: piece.media, in: piece.comment,
                                            preferredLanguages: preferredLanguages)
                    .map { (piece.media.id, $0) }
            }),
            attributions: indexed(pieces.map { ($0.media.id, Attribution.of(comment: $0.comment)) })
        )
    }

    // MARK: - Assemblage

    /// **La première occurrence gagne**, pour les pages comme pour leurs cartes.
    /// Deux pages de même identité casseraient le pager, qui n'aurait plus
    /// d'index unique par page.
    private func followed(by suite: PostGalleryLot) -> PostGalleryLot {
        let pages = (attachments + suite.attachments).reduce(into: (vus: Set<String>(), gardees: [MessageAttachment]())) { acc, page in
            guard acc.vus.insert(page.id).inserted else { return }
            acc.gardees.append(page)
        }.gardees
        return PostGalleryLot(
            attachments: pages,
            scenes: scenes.merging(suite.scenes) { premier, _ in premier },
            sceneCaptions: sceneCaptions.merging(suite.sceneCaptions) { premier, _ in premier },
            captionServings: captionServings.merging(suite.captionServings) { premier, _ in premier },
            captionMap: captionMap.merging(suite.captionMap) { premier, _ in premier },
            attributions: attributions.merging(suite.attributions) { premier, _ in premier }
        )
    }

    private static func indexed<Value>(_ paires: [(String, Value)]) -> [String: Value] {
        Dictionary(paires, uniquingKeysWith: { premier, _ in premier })
    }

    private static func thumbnailURL(of media: FeedMedia) -> String? {
        if let vignette = media.thumbnailUrl, !vignette.isEmpty { return vignette }
        guard media.type == .image, let url = media.url, !url.isEmpty else { return nil }
        return url
    }
}

/// **Le fil de commentaires que la pellicule suit pendant la lecture** (#6710).
///
/// La page ouverte ne doit jamais sauter sous le doigt : ce que la galerie
/// montre garde son rang, et ce qui arrive vient APRÈS.
nonisolated enum PostGalleryCommentFeed {

    /// Un commentaire publié en direct rejoint la fin ; un commentaire déjà là —
    /// l'écho socket de son propre envoi, une édition — se met à jour sur place.
    static func adding(_ comment: FeedComment, to current: [FeedComment]) -> [FeedComment] {
        guard current.contains(where: { $0.id == comment.id }) else { return current + [comment] }
        return current.map { $0.id == comment.id ? comment : $0 }
    }

    /// Un commentaire supprimé emporte son média — et ses réponses, que le
    /// serveur supprime avec lui.
    static func removing(commentId: String, from current: [FeedComment]) -> [FeedComment] {
        current.filter { $0.id != commentId && $0.parentId != commentId }
    }

    /// **Le cache ou le réseau complètent le fil sans le réordonner** : ce qui
    /// est déjà affiché garde son rang (dans sa version la plus récente), ce
    /// qui est neuf vient après, dans l'ordre de la page reçue.
    static func merging(_ incoming: [FeedComment], into current: [FeedComment]) -> [FeedComment] {
        let recus = Dictionary(incoming.map { ($0.id, $0) }, uniquingKeysWith: { premier, _ in premier })
        let affiches = Set(current.map(\.id))
        let neufs = incoming.reduce(into: (vus: affiches, gardes: [FeedComment]())) { acc, comment in
            guard acc.vus.insert(comment.id).inserted else { return }
            acc.gardes.append(comment)
        }.gardes
        return current.map { recus[$0.id] ?? $0 } + neufs
    }
}

/// **Ce que la commande de lecture d'une scène devient après une porte** (#6142).
///
/// La galerie tient UNE commande pour la scène ouverte, comme le player partagé
/// en tient une pour la vidéo ouverte : l'appui long l'arrête en entrant dans le
/// plein cadre, et la bascule une fois dedans.
nonisolated enum GalleryScenePlayback {

    static func playing(after intent: StageTransportIntent, isPlaying: Bool) -> Bool {
        switch intent {
        case .none: return isPlaying
        case .pause: return false
        case .togglePlayback: return !isPlaying
        }
    }
}
