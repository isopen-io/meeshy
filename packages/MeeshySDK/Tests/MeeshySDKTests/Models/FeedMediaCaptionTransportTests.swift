import Testing
import Foundation
@testable import MeeshySDK

/// La légende d'un média social voyageait déjà sur le fil (`PostMedia.caption`,
/// servi par la gateway) et vivait dans le schéma — mais `FeedMedia` ne la
/// DÉCLARAIT pas : le décodeur la jetait avant qu'aucune vue puisse la demander,
/// et `toMessageAttachment()` ne pouvait donc rien remettre au plein écran.
///
/// Un champ servi que personne ne décode est indiscernable d'un champ absent :
/// ces témoins vérifient la chaîne ENTIÈRE — fil → `FeedMedia` → attachement.
@Suite("FeedMedia — transport de la légende")
struct FeedMediaCaptionTransportTests {

    @Test("la légende traverse la passerelle vers MeeshyMessageAttachment")
    func transportsCaption() {
        let media = FeedMedia(type: .image, url: "https://cdn.meeshy.me/x.jpg",
                              caption: "Coucher de soleil à Dakar")
        #expect(media.toMessageAttachment().caption == "Coucher de soleil à Dakar")
    }

    @Test("sans légende → nil, jamais une chaîne vide inventée")
    func noCaptionStaysNil() {
        let media = FeedMedia(type: .image, url: "https://cdn.meeshy.me/x.jpg")
        #expect(media.toMessageAttachment().caption == nil)
    }

    @Test("un blob de feed persisté AVANT le champ décode toujours (clé absente → nil)")
    func legacyBlobDecodes() throws {
        let json = """
        {"id":"m1","type":"image","url":"https://cdn.meeshy.me/x.jpg","thumbnailColor":"4ECDC4"}
        """
        let media = try JSONDecoder().decode(FeedMedia.self, from: Data(json.utf8))
        #expect(media.caption == nil)
    }

    @Test("aller-retour Codable conserve la légende (cache GRDB du feed)")
    func codableRoundTrip() throws {
        let media = FeedMedia(type: .image, url: "https://cdn.meeshy.me/x.jpg", caption: "Une légende")
        let data = try JSONEncoder().encode(media)
        #expect(try JSONDecoder().decode(FeedMedia.self, from: data).caption == "Une légende")
    }

    @Test("APIPostMedia.toFeedMedia transporte la légende servie par le fil")
    func apiPostMediaTransportsCaption() throws {
        let json = """
        {"id":"pm1","mimeType":"image/jpeg","fileUrl":"https://cdn.meeshy.me/x.jpg","caption":"Vue du balcon"}
        """
        let api = try JSONDecoder().decode(APIPostMedia.self, from: Data(json.utf8))
        #expect(api.toFeedMedia().caption == "Vue du balcon")
        #expect(api.toFeedMedia().toMessageAttachment().caption == "Vue du balcon")
    }

    @Test("un média servi SANS légende ne fabrique rien au bout de la chaîne")
    func apiPostMediaWithoutCaption() throws {
        let json = """
        {"id":"pm1","mimeType":"image/jpeg","fileUrl":"https://cdn.meeshy.me/x.jpg"}
        """
        let api = try JSONDecoder().decode(APIPostMedia.self, from: Data(json.utf8))
        #expect(api.toFeedMedia().toMessageAttachment().caption == nil)
    }
}
