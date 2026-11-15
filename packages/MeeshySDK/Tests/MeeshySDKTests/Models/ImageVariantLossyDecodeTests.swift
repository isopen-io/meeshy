import Testing
import Foundation
@testable import MeeshySDK

/// `imageVariants` est un champ PÉRIPHÉRIQUE servi par un fil qui ne garantit
/// rien de sa forme : `packages/shared/types/api-schemas.ts` ne déclare aucun
/// `required` sur les items et `schema.prisma` stocke un `Json?` libre. Un
/// modèle plus STRICT que le fil fait DISPARAÎTRE le contenu porteur — un
/// élément écrit à moitié par le générateur de variantes, et c'est le POST ou
/// le MESSAGE entier qui échoue au décodage (précédent Android, mémoire
/// `reference_android_model_stricter_than_the_wire`).
///
/// La règle tenue ici : aucun élément partiel ne fait tomber son porteur —
/// il est ignoré ; et `format`, dont le défaut `"webp"` n'existait que dans
/// l'init memberwise, a son repli DANS le décodage.
@Suite("imageVariants — décodage tolérant par élément")
struct ImageVariantLossyDecodeTests {

    /// Un élément complet, un SANS `size`, un SANS `format`.
    private static let mixedVariantsJSON = """
    [
      {"width":640,"height":480,"url":"https://cdn.meeshy.me/x-640.webp","size":40000,"format":"webp"},
      {"width":1280,"height":960,"url":"https://cdn.meeshy.me/x-1280.webp"},
      {"width":1920,"height":1440,"url":"https://cdn.meeshy.me/x-1920.webp","size":300000}
    ]
    """

    // MARK: - L'élément lui-même

    @Test("format absent → repli \"webp\" DANS le décodage, pas seulement dans l'init memberwise")
    func formatFallsBackToWebpWhenDecoding() throws {
        let json = """
        {"width":1920,"height":1440,"url":"https://cdn.meeshy.me/x-1920.webp","size":300000}
        """
        let variant = try JSONDecoder().decode(MeeshyImageVariant.self, from: Data(json.utf8))
        #expect(variant.format == "webp")
    }

    // MARK: - Les quatre porteurs

    @Test("APIPostMedia : un élément partiel est ignoré, le média porteur décode")
    func apiPostMediaSurvivesAPartialVariant() throws {
        let json = """
        {"id":"pm1","mimeType":"image/jpeg","fileUrl":"https://cdn.meeshy.me/x.jpg","width":4000,"height":3000,
         "imageVariants":\(Self.mixedVariantsJSON)}
        """
        let media = try JSONDecoder().decode(APIPostMedia.self, from: Data(json.utf8))
        let variants = try #require(media.imageVariants)
        #expect(variants.map(\.url) == [
            "https://cdn.meeshy.me/x-640.webp",
            "https://cdn.meeshy.me/x-1920.webp"
        ])
        #expect(variants.last?.format == "webp")
    }

    @Test("FeedMedia : un élément partiel est ignoré, le média de feed décode")
    func feedMediaSurvivesAPartialVariant() throws {
        let json = """
        {"id":"m1","type":"image","url":"https://cdn.meeshy.me/x.jpg","thumbnailColor":"4ECDC4",
         "imageVariants":\(Self.mixedVariantsJSON)}
        """
        let media = try JSONDecoder().decode(FeedMedia.self, from: Data(json.utf8))
        let variants = try #require(media.imageVariants)
        #expect(variants.count == 2)
        #expect(variants.last?.format == "webp")
    }

    @Test("APIMessageAttachment : un élément partiel est ignoré, la pièce jointe décode")
    func apiMessageAttachmentSurvivesAPartialVariant() throws {
        let json = """
        {"id":"a1","fileUrl":"https://cdn.meeshy.me/x.jpg","mimeType":"image/jpeg",
         "imageVariants":\(Self.mixedVariantsJSON)}
        """
        let attachment = try JSONDecoder().decode(APIMessageAttachment.self, from: Data(json.utf8))
        let variants = try #require(attachment.imageVariants)
        #expect(variants.count == 2)
    }

    @Test("MeeshyMessageAttachment : un blob attachmentsJson partiel décode quand même")
    func messageAttachmentSurvivesAPartialVariant() throws {
        // Le blob est ÉCRIT par le modèle lui-même (attachmentsJson), puis on y
        // greffe la liste mixte : aucun inventaire de champs à tenir ici.
        let seed = MeeshyMessageAttachment(mimeType: "image/jpeg")
        var object = try #require(
            try JSONSerialization.jsonObject(with: JSONEncoder().encode(seed)) as? [String: Any]
        )
        object["imageVariants"] = try JSONSerialization.jsonObject(
            with: Data(Self.mixedVariantsJSON.utf8)
        )
        let data = try JSONSerialization.data(withJSONObject: object)
        let attachment = try JSONDecoder().decode(MeeshyMessageAttachment.self, from: data)
        let variants = try #require(attachment.imageVariants)
        #expect(variants.count == 2)
    }

    // MARK: - Ce que la tolérance ne doit PAS casser

    @Test("clé absente → nil, jamais un tableau vide inventé")
    func absentKeyStaysNil() throws {
        let json = """
        {"id":"pm1","mimeType":"image/jpeg","fileUrl":"https://cdn.meeshy.me/x.jpg"}
        """
        let media = try JSONDecoder().decode(APIPostMedia.self, from: Data(json.utf8))
        #expect(media.imageVariants == nil)
    }

    @Test("valeur null → nil")
    func nullValueStaysNil() throws {
        let json = """
        {"id":"pm1","mimeType":"image/jpeg","fileUrl":"https://cdn.meeshy.me/x.jpg","imageVariants":null}
        """
        let media = try JSONDecoder().decode(APIPostMedia.self, from: Data(json.utf8))
        #expect(media.imageVariants == nil)
    }

    @Test("tous les éléments malformés → tableau vide, le porteur décode toujours")
    func allElementsMalformedYieldsEmpty() throws {
        let json = """
        {"id":"pm1","mimeType":"image/jpeg","fileUrl":"https://cdn.meeshy.me/x.jpg",
         "imageVariants":[{"width":640},{"nope":true}]}
        """
        let media = try JSONDecoder().decode(APIPostMedia.self, from: Data(json.utf8))
        #expect(media.imageVariants == [])
    }

    @Test("aller-retour Codable : la clé reste ABSENTE quand il n'y a pas de variante")
    func roundTripOmitsTheKeyWhenNil() throws {
        let media = FeedMedia(type: .image, url: "https://cdn.meeshy.me/x.jpg")
        let encoded = try JSONEncoder().encode(media)
        let text = try #require(String(data: encoded, encoding: .utf8))
        #expect(!text.contains("imageVariants"))
        #expect(try JSONDecoder().decode(FeedMedia.self, from: encoded).imageVariants == nil)
    }

    @Test("aller-retour Codable : les variantes survivent au cache GRDB")
    func roundTripKeepsVariants() throws {
        let variants = [
            MeeshyImageVariant(width: 640, height: 480, url: "https://cdn.meeshy.me/x-640.webp", size: 40_000)
        ]
        let attachment = MeeshyMessageAttachment(mimeType: "image/jpeg", imageVariants: variants)
        let encoded = try JSONEncoder().encode(attachment)
        #expect(try JSONDecoder().decode(MeeshyMessageAttachment.self, from: encoded).imageVariants == variants)
    }
}
