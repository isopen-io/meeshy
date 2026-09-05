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
}
