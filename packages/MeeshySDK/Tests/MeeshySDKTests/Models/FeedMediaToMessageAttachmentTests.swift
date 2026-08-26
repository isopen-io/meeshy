import Testing
import Foundation
@testable import MeeshySDK

/// Plein écran net (feature 3) — la galerie choisit la variante d'image élue
/// (`ImageVariantSelector`) depuis `MessageAttachment.imageVariants`. Une
/// image ouverte depuis un POST traverse `FeedMedia.toMessageAttachment()`,
/// qui perdait les variantes : la galerie retombait sur l'original multi-Mo.
@Suite("FeedMedia.toMessageAttachment — variantes d'image")
struct FeedMediaToMessageAttachmentTests {

    private var variants: [MeeshyImageVariant] {
        [
            MeeshyImageVariant(width: 640, height: 480, url: "https://cdn.meeshy.me/x-640.webp", size: 40_000),
            MeeshyImageVariant(width: 1920, height: 1440, url: "https://cdn.meeshy.me/x-1920.webp", size: 300_000)
        ]
    }

    @Test("les variantes traversent la passerelle vers MeeshyMessageAttachment")
    func transportsVariants() {
        let media = FeedMedia(type: .image, url: "https://cdn.meeshy.me/x.jpg",
                              width: 4000, height: 3000, imageVariants: variants)
        #expect(media.toMessageAttachment().imageVariants == variants)
    }

    @Test("sans variantes (image chiffrée, ancien blob) → nil, jamais un tableau vide inventé")
    func noVariantsStaysNil() {
        let media = FeedMedia(type: .image, url: "https://cdn.meeshy.me/x.jpg")
        #expect(media.toMessageAttachment().imageVariants == nil)
    }

    @Test("un blob de feed persisté AVANT le champ décode toujours (clé absente → nil)")
    func legacyBlobDecodes() throws {
        let json = """
        {"id":"m1","type":"image","url":"https://cdn.meeshy.me/x.jpg","thumbnailColor":"4ECDC4"}
        """
        let media = try JSONDecoder().decode(FeedMedia.self, from: Data(json.utf8))
        #expect(media.imageVariants == nil)
    }

    @Test("aller-retour Codable conserve les variantes (cache GRDB du feed)")
    func codableRoundTrip() throws {
        let media = FeedMedia(type: .image, url: "https://cdn.meeshy.me/x.jpg", imageVariants: variants)
        let data = try JSONEncoder().encode(media)
        let decoded = try JSONDecoder().decode(FeedMedia.self, from: data)
        #expect(decoded.imageVariants == variants)
    }

    @Test("APIPostMedia.toFeedMedia transporte les variantes servies par le fil")
    func apiPostMediaTransportsVariants() throws {
        let json = """
        {"id":"pm1","mimeType":"image/jpeg","fileUrl":"https://cdn.meeshy.me/x.jpg","width":4000,"height":3000,
         "imageVariants":[{"width":640,"height":480,"url":"https://cdn.meeshy.me/x-640.webp","size":40000,"format":"webp"}]}
        """
        let api = try JSONDecoder().decode(APIPostMedia.self, from: Data(json.utf8))
        let attachment = api.toFeedMedia().toMessageAttachment()
        #expect(attachment.imageVariants?.count == 1)
        #expect(attachment.imageVariants?.first?.url == "https://cdn.meeshy.me/x-640.webp")
    }
}
