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

    /// **Un sticker animé ne change pas le comportement de la bulle.**
    ///
    /// `AnimatedImageView` et `LottieView` (#10639) sont des vues UIKit hébergées : sans
    /// `.allowsHitTesting(false)`, elle avale le toucher, et l'appui long d'une
    /// bulle (menu, réaction, réponse) ne part plus — sur un Mee ou un GIF
    /// seulement, alors que le gabarit et l'emoji voisins le gardent
    /// (retour porteur 2026-10-01).
    func test_everyAnimatedImageHost_letsTheBubbleGesturesThrough() throws {
        for (host, view) in [("Media/AnimatedCachedImage.swift", "AnimatedImageView("), ("Story/MeeStickerFilmView.swift", "LottieView(")] {
            let source = try sdkSource(host)
            XCTAssertTrue(source.contains(view), "\(host) ne monte plus la vue animée : témoin à revoir.")
            XCTAssertTrue(source.contains(".allowsHitTesting(false)"),
                          "\(host) doit rendre la vue animée transparente aux touchers — sinon l'appui long de la bulle ne part plus.")
        }
    }
    // MARK: - #4984 — une image animée envoyée en PIÈCE JOINTE joue

    /// **Une photo ne paie rien.** JPEG, PNG, HEIC : jamais le chemin animé,
    /// donc jamais une seconde lecture d'octets ni un décodage de N images.
    func test_aStillPhoto_neverTakesTheAnimatedPath() {
        for mime in ["image/jpeg", "image/png", "image/heic", "video/mp4", "", "application/octet-stream"] {
            XCTAssertEqual(AttachmentAnimationRule.presentation(mimeType: mime, inGrid: false), .still, mime)
            XCTAssertEqual(AttachmentAnimationRule.presentation(mimeType: mime, inGrid: true), .still, mime)
        }
    }

    func test_aGIFAloneAtItsPlace_animates() {
        XCTAssertEqual(AttachmentAnimationRule.presentation(mimeType: "image/gif", inGrid: false), .animated)
        XCTAssertEqual(AttachmentAnimationRule.presentation(mimeType: "IMAGE/GIF; charset=binary", inGrid: false), .animated)
        XCTAssertEqual(AttachmentAnimationRule.presentation(mimeType: "image/webp", inGrid: false), .animated)
        XCTAssertEqual(AttachmentAnimationRule.presentation(mimeType: "image/apng", inGrid: false), .animated)
    }

    /// En grille : figé, marqué « GIF » ; un WebP, qui peut être fixe, n'est
    /// pas marqué — la pastille ne ment jamais.
    func test_aGIFInAGrid_staysStillAndIsMarked() {
        XCTAssertEqual(AttachmentAnimationRule.presentation(mimeType: "image/gif", inGrid: true), .stillMarkedGIF)
        XCTAssertEqual(AttachmentAnimationRule.presentation(mimeType: "image/webp", inGrid: true), .still)
    }

    func test_theAnimatedPath_readsTheOriginal_neverAnEmptyURL() {
        XCTAssertNil(AttachmentAnimationRule.animatedSourceURL(fileUrl: ""))
        XCTAssertEqual(AttachmentAnimationRule.animatedSourceURL(fileUrl: "file:///tmp/sent.gif"), "file:///tmp/sent.gif")
        XCTAssertEqual(AttachmentAnimationRule.animatedSourceURL(fileUrl: "https://cdn.test/a.gif"), "https://cdn.test/a.gif")
    }

    /// Une bulle suit la politique de téléchargement de l'image fixe ; un plein
    /// écran ouvert, un fichier local ou un original déjà là passent toujours.
    func test_theAnimatedPath_followsTheDownloadPolicyInline() {
        XCTAssertFalse(AttachmentAnimationRule.mayFetch(explicitOpen: false, isLocalFile: false, isOnDevice: false, policyAllows: false))
        XCTAssertTrue(AttachmentAnimationRule.mayFetch(explicitOpen: true, isLocalFile: false, isOnDevice: false, policyAllows: false))
        XCTAssertTrue(AttachmentAnimationRule.mayFetch(explicitOpen: false, isLocalFile: true, isOnDevice: false, policyAllows: false))
        XCTAssertTrue(AttachmentAnimationRule.mayFetch(explicitOpen: false, isLocalFile: false, isOnDevice: true, policyAllows: false))
        XCTAssertTrue(AttachmentAnimationRule.mayFetch(explicitOpen: false, isLocalFile: false, isOnDevice: false, policyAllows: true))
    }

    /// **Chaque surface d'une pièce jointe monte l'enveloppe UNIQUE** : bulle
    /// (seule et grille), focal, aperçu du menu, aperçu d'une pièce, carrousel,
    /// galerie plein écran, fil, carrousel du fil, détail du post, réels.
    func test_everyAttachmentSurface_mountsTheSingleAnimatedWrapper() throws {
        let sites = [
            "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift",
            "Meeshy/Features/Focal/Row/FocalAttachmentBlock.swift",
            "Meeshy/Features/Main/Components/MessagePieceOverlay.swift",
            "Meeshy/Features/Main/Views/Bubble/BubbleCarouselView.swift",
            "Meeshy/Features/Main/Views/ConversationMediaGalleryView+Pages.swift",
            "Meeshy/Features/Main/Views/FeedPostCard+Media.swift",
            "Meeshy/Features/Main/Views/FeedPostCardCarousel.swift",
            "Meeshy/Features/Main/Views/PostDetailView+Media.swift",
            "Meeshy/Features/Main/Views/ReelFeedCard.swift",
            "Meeshy/Features/Main/Views/ReelsPlayerView+Carousel.swift",
        ]
        for site in sites {
            let source = try appSource(site)
            XCTAssertTrue(source.contains("AnimatedAttachmentImage(") || source.contains("FeedMediaImage("),
                          "\(site) doit monter l'enveloppe animée des pièces jointes.")
            XCTAssertFalse(source.contains("AnimatedCachedImage("), "\(site) ne doit pas réécrire le chemin animé : une seule enveloppe.")
        }
    }

    /// L'enveloppe ne monte le décodeur que dans son cas animé, et garde le
    /// chemin fixe en repli.
    func test_theWrapper_mountsTheDecoderOnce_andKeepsTheStillFallback() throws {
        let wrapper = try appSource("Meeshy/Features/Main/Components/AnimatedAttachmentImage.swift")
        XCTAssertEqual(wrapper.components(separatedBy: "AnimatedCachedImage(").count - 1, 1)
        XCTAssertTrue(wrapper.contains("AttachmentAnimationRule.presentation("))
        XCTAssertEqual(wrapper.components(separatedBy: "AnimatedAttachmentImage(mimeType:").count - 1, 1,
                       "l'image d'un média de fil passe par la même enveloppe, jamais une seconde.")
    }
}
