import XCTest
@testable import Meeshy

/// **Une vue qui n'a AUCUN consommateur est une feature absente** (#4925).
///
/// Le lot d'origine a livré `AnimatedImageDecoder` (des octets → des images) et
/// `AnimatedImageView` (des images → du mouvement), puis a câblé la SCÈNE, qui
/// n'est pas une vue SwiftUI mais un `CALayer`. Au 2026-09-03,
/// `AnimatedImageView` n'était montée **nulle part** : zéro occurrence dans
/// `apps/ios/` comme dans `packages/MeeshySDK/Sources/`. Un sticker de message
/// et une image de commentaire arrivaient figés avec un décodeur parfait et une
/// vue parfaite dans le même paquet.
///
/// > Rien n'était en panne. Les témoins du décodeur passaient, ceux de la vue
/// > aussi, le build était vert — et la feature n'existait pas. C'est le mode de
/// > panne le plus discret du dépôt, et il ne se voit qu'en demandant **qui
/// > monte ce que j'ai écrit**.
///
/// Ces témoins lisent la source, commentaires retirés : une doctrine qui cite
/// la ligne cherchée ne doit pas passer pour la ligne elle-même.
final class AnimatedImageConsumerGuardTests: XCTestCase {

    private static let stickerArtwork = "Meeshy/Features/Main/Views/Bubble/MessageStickerArtwork.swift"
    private static let commentMedia = "Meeshy/Features/Main/Views/CommentMediaView.swift"

    private func appSource(_ relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    /// Le SDK vit à côté de `apps/ios`, pas dedans : la garde traverse la
    /// frontière parce que le défaut la traversait — la vue est d'un côté, ses
    /// consommateurs de l'autre, et c'est exactement ce qui l'a laissée seule.
    private func sdkSource(_ relativePath: String, file: StaticString = #filePath) throws -> String {
        let repo = MyStoriesSourceCorpus.appRoot(file: file)   // …/apps/ios
            .deletingLastPathComponent()                        // …/apps
            .deletingLastPathComponent()                        // …/
        let url = repo.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/\(relativePath)")
        return MyStoriesSourceCorpus.strippingComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// **Le sticker d'un MESSAGE anime** — l'atome que les quatre modes de
    /// lecture montent (bulle, focal, script, rivière).
    func test_messageSticker_mountsTheAnimatedPath() throws {
        let artwork = try appSource(Self.stickerArtwork)

        XCTAssertTrue(artwork.contains("AnimatedCachedImage("),
                      "le cas `.picture` doit passer par l'enveloppe animée — sinon un GIF de sticker reste figé.")
    }

    /// **Une image FIXE ne change pas de chemin.** L'enveloppe garde le
    /// progressif en repli : thumbHash, cache, placeholder. Perdre ce repli
    /// ferait payer à chaque sticker fixe un chemin qui ne lui sert à rien.
    func test_messageSticker_keepsTheProgressiveFallback() throws {
        let artwork = try appSource(Self.stickerArtwork)

        XCTAssertTrue(artwork.contains("ProgressiveCachedImage("),
                      "le repli progressif doit rester : `nil` du décodeur signifie « garde ton chemin ».")
    }

    /// **Un GIF de COMMENTAIRE joue.** Le second consommateur, nommé par la
    /// directive porteur du 2026-09-02 au même titre que le message.
    func test_commentImage_mountsTheAnimatedPath() throws {
        let media = try appSource(Self.commentMedia)

        XCTAssertTrue(media.contains("AnimatedCachedImage("),
                      "une image de commentaire doit passer par l'enveloppe animée.")
        XCTAssertTrue(media.contains("ProgressiveCachedImage("),
                      "…sans perdre le repli progressif d'une photo, qui est le cas nominal.")
    }

    // ========================================================================
    // MARK: - Les huit surfaces d'une PIECE JOINTE (#4984)
    // ========================================================================
    //
    // #4925 a fait animer le mot « sticker ». Le geste le plus courant du
    // produit — « j'envoie un GIF dans une conversation » — n'etait dans aucune
    // des trois surfaces que la directive nommait, parce que son chemin de code
    // est celui d'une PHOTO. Le vocabulaire d'une directive dessine un
    // perimetre, et ce perimetre n'est pas celui de l'utilisateur.

    private static let bubbleMedia = "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift"
    private static let focalBlock = "Meeshy/Features/Main/Focal/Row/FocalAttachmentBlock.swift"
    private static let galleryPages = "Meeshy/Features/Main/Views/ConversationMediaGalleryView+Pages.swift"
    private static let feedCardMedia = "Meeshy/Features/Main/Views/FeedPostCard+Media.swift"
    private static let reelCard = "Meeshy/Features/Main/Views/ReelFeedCard.swift"
    private static let feedCarousel = "Meeshy/Features/Main/Views/FeedPostCardCarousel.swift"

    /// Les blocs d'appel de l'enveloppe dans un fichier — de quoi interroger
    /// les ARGUMENTS, pas seulement la presence du nom.
    private func wrapperCalls(in source: String) -> [String] {
        source.components(separatedBy: "AnimatedCachedImage(").dropFirst().map { String($0.prefix(320)) }
    }

    func test_lesQuatreSurfacesDuCritere1_montentLEnveloppe() throws {
        for path in [Self.bubbleMedia, Self.focalBlock, Self.galleryPages] {
            let source = try appSource(path)
            XCTAssertTrue(source.contains("AnimatedCachedImage("),
                          "\(path) : un GIF envoye en piece jointe y reste fige.")
            XCTAssertTrue(source.contains("ProgressiveCachedImage("),
                          "\(path) : le repli progressif doit rester — une photo est le cas nominal.")
        }
    }

    func test_lesTroisSurfacesDuFil_montentLEnveloppe() throws {
        for path in [Self.feedCardMedia, Self.reelCard, Self.feedCarousel] {
            let source = try appSource(path)
            XCTAssertTrue(source.contains("AnimatedCachedImage("), "\(path) : surface du fil restee figee.")
            XCTAssertTrue(source.contains("ProgressiveCachedImage("), "\(path) : repli progressif perdu.")
        }
    }

    /// **Le temoin le plus important du lot, et le plus silencieux.**
    ///
    /// La bulle choisit une VARIANTE serveur allegee (`ImageVariantSelector`)
    /// pour economiser de la bande passante. Pour un GIF, cette variante est
    /// une image FIXE. Servir `selectedFull` au chemin anime rendrait le lot
    /// entier inoperant **sans qu'une seule ligne soit fausse** : l'enveloppe
    /// serait montee, le decodeur appele, et il rendrait `nil` parce que les
    /// octets qu'on lui donne n'animent pas.
    ///
    /// > Un correctif peut etre pose partout et ne rien corriger, s'il lit la
    /// > mauvaise source. La question n'est pas « l'enveloppe est-elle la ? »
    /// > mais « sur QUOI est-elle branchee ? ».
    func test_laBulleAnime_lOriginal_jamaisLaVarianteServeur() throws {
        let bubble = try appSource(Self.bubbleMedia)
        let gridCall = try XCTUnwrap(wrapperCalls(in: bubble).first,
                                     "aucun appel de l'enveloppe dans la bulle")

        XCTAssertTrue(gridCall.contains("urlString: originalFull"),
                      "le chemin anime doit lire l'ORIGINAL : une variante serveur d'un GIF est fixe.")
        XCTAssertFalse(gridCall.contains("urlString: selectedFull"),
                       "servir la variante allegee au decodeur rendrait le lot muet, sans erreur nulle part.")
    }

    /// **La regle tranchee avant d'ecrire** : anime ce qui est SEUL ou ACTIF.
    /// La distinction `solo` existait au niveau de la cellule et ne descendait
    /// pas jusqu'a la vue d'image — sans elle, la regle n'est pas exprimable,
    /// et douze vignettes decodent trente images chacune pendant un defilement.
    func test_laBulle_nAnimeQueLeMediaSeul() throws {
        let bubble = try appSource(Self.bubbleMedia)

        XCTAssertTrue(bubble.contains("animates: solo"),
                      "une grille de bulle doit rester figee — dimensions 3 et 4.")
        XCTAssertTrue(bubble.contains("BubbleGridImageView(attachment: attachment, cellPointWidth: cellPointWidth, solo: solo)"),
                      "`solo` doit etre threade jusqu'a la vue d'image, sinon la regle ne s'exprime pas.")
        XCTAssertTrue(bubble.contains("animates: attachment.id == currentPageID"),
                      "seule la page visible d'un carrousel de bulle anime.")
    }

    /// **Un poster de VIDEO n'anime jamais.** Il est fixe par construction :
    /// l'envelopper ferait payer une lecture d'octets a chaque video pour
    /// apprendre a chaque fois qu'elle n'anime pas. C'est le temoin qui arrete
    /// une passe « envelopper partout » — le releve de l'issue comptait ce site
    /// parmi les trois de la bulle.
    func test_unPosterDeVideo_nEstJamaisEnveloppe() throws {
        let bubble = try appSource(Self.bubbleMedia)
        guard let videoView = bubble.components(separatedBy: "struct BubbleGridVideoThumbnailView").last else {
            return XCTFail("BubbleGridVideoThumbnailView introuvable")
        }
        let thumbnailLayer = String(videoView.prefix(900))

        XCTAssertTrue(thumbnailLayer.contains("ProgressiveCachedImage("))
        XCTAssertFalse(thumbnailLayer.contains("AnimatedCachedImage("),
                       "un poster de video est fixe : l'envelopper coute une porte par video, pour rien.")
    }

    /// Le fil garde plusieurs reels montes ; un seul est a l'ecran. Et la tuile
    /// du carrousel est partagee avec la GRILLE d'une carte, donc son defaut
    /// penche du cote qui ne coute rien.
    func test_leFil_nAnimeQueCeQuiEstActif() throws {
        let reel = try appSource(Self.reelCard)
        let carousel = try appSource(Self.feedCarousel)

        XCTAssertTrue(reel.contains("animates: isActive"),
                      "un reel hors ecran ne doit pas decoder ses images.")
        XCTAssertTrue(carousel.contains("var animates: Bool = false"),
                      "la tuile est partagee avec la grille : figee par defaut.")
        XCTAssertTrue(carousel.contains("FeedMediaTile(media: item, animates: offset == index)"),
                      "seule la page visible du carrousel ouvre l'animation.")
    }

    /// **Le plein ecran anime, la fenetre HORS rendu non.** La branche `else`
    /// d'`imageLayer` est ce qui borne le nombre d'images vivantes a +/-2 pages ;
    /// y animer annulerait la borne que la galerie existe pour tenir.
    func test_laGalerie_nAnimeQueLaPageRendue() throws {
        let gallery = try appSource(Self.galleryPages)
        let calls = wrapperCalls(in: gallery)

        XCTAssertEqual(calls.count, 1,
                       "une seule enveloppe dans la galerie : la page rendue. La fenetre hors rendu et le poster video restent figes.")
        XCTAssertTrue(calls[0].contains("urlString: mount.fullURL"),
                      "le plein ecran anime le plein format, pas la vignette serveur.")
    }

    /// L'enveloppe DOIT jouer ce qu'elle décode. Sans ce montage, elle
    /// paierait la lecture d'octets et le décodage de N images pour afficher
    /// la première — le défaut d'origine, déplacé d'un cran et plus coûteux.
    func test_theWrapperActuallyPlaysWhatItDecodes() throws {
        let wrapper = try sdkSource("Media/AnimatedCachedImage.swift")

        XCTAssertTrue(wrapper.contains("AnimatedImageView("),
                      "`AnimatedCachedImage` doit MONTER `AnimatedImageView` — décoder sans jouer ne montre rien de plus.")
        XCTAssertTrue(wrapper.contains("AnimatedImageResolution.resolve("),
                      "la décision « tente-t-on ? » vit dans la règle mesurable, pas dans le corps de la vue.")
    }
}
