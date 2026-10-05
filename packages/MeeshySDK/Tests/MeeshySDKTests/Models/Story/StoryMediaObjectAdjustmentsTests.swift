import Testing
import Foundation
@testable import MeeshySDK

/// **Les réglages d'une image posée vivent sur l'objet, et le fil les garde**
/// (#9175). L'éditeur plein écran les cuisait dans un bitmap jeté à la
/// fermeture ; dans la scène, ils sont une PROPRIÉTÉ de l'objet — posée,
/// sérialisée, rejouée par le player qui les peint.
struct StoryMediaObjectAdjustmentsTests {

    private func image(_ reglages: ImageAdjustments? = nil) -> StoryMediaObject {
        var media = StoryMediaObject(id: "posed", postMediaId: "64b0000000000000000000aa",
                                     kind: .image, aspectRatio: 1)
        media.adjustments = reglages
        return media
    }

    private func reglagesChauds() -> ImageAdjustments {
        var reglages = ImageAdjustments()
        reglages[.exposure] = 0.5
        reglages[.contrast] = 1.2
        reglages[.temperature] = -0.3
        return reglages
    }

    private func json(_ media: StoryMediaObject) throws -> [String: Any] {
        let data = try JSONEncoder().encode(media)
        return try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: - Le blob v1

    @Test func unReglagePose_survitALEncodage() throws {
        let relu = try JSONDecoder().decode(StoryMediaObject.self,
                                            from: JSONEncoder().encode(image(reglagesChauds())))
        #expect(relu.adjustments == reglagesChauds())
    }

    @Test func sansReglage_aucuneCleNEstEcrite() throws {
        #expect(try json(image())["adjustments"] == nil,
                "Une image sans réglage n'alourdit pas les effets publiés.")
    }

    @Test func seulsLesReglagesActifsVoyagent() throws {
        let charge = try #require(try json(image(reglagesChauds()))["adjustments"] as? [String: Any])
        #expect(Set(charge.keys) == ["exposure", "contrast", "temperature"],
                "Une valeur neutre est omise : son absence la restitue.")
    }

    @Test func uneChargePartielle_restitueLesNeutres() throws {
        let data = Data(#"{"id":"m","mediaType":"image","adjustments":{"saturation":0.4}}"#.utf8)
        let relu = try JSONDecoder().decode(StoryMediaObject.self, from: data)
        #expect(relu.adjustments?[.saturation] == 0.4)
        #expect(relu.adjustments?[.contrast] == AdjustmentKind.contrast.neutralValue)
    }

    @Test func uneValeurHorsBornes_estRameneeDansSaPlage() throws {
        let data = Data(#"{"id":"m","mediaType":"image","adjustments":{"blur":400}}"#.utf8)
        let relu = try JSONDecoder().decode(StoryMediaObject.self, from: data)
        #expect(relu.adjustments?[.blur] == AdjustmentKind.blur.range.upperBound,
                "Un flou de 400 ferait un rayon de 6 400 px : la charge ne décide pas du coût du rendu.")
    }

    @Test func uneValeurIllisible_neCassePasLObjet() throws {
        let data = Data(#"{"id":"m","mediaType":"image","adjustments":{"exposure":"fort","contrast":1.3}}"#.utf8)
        let relu = try JSONDecoder().decode(StoryMediaObject.self, from: data)
        #expect(relu.id == "m", "Un réglage illisible ne fait jamais tomber la story entière.")
        #expect(relu.adjustments?[.exposure] == AdjustmentKind.exposure.neutralValue)
        #expect(relu.adjustments?[.contrast] == 1.3)
    }

    // MARK: - Le pont v3

    @Test func lePontV3_rendLesReglagesALObjet() {
        var effets = StoryEffects()
        effets.mediaObjects = [image(reglagesChauds())]
        let relu = StoryEffects(rendering: CanvasV3(migrating: effets), sceneIndex: 0)
        #expect(relu.mediaObjects?.first?.adjustments == reglagesChauds())
    }

    @Test func lePontV3_nEmetRienPourUneImageNeutre() {
        var effets = StoryEffects()
        effets.mediaObjects = [image(ImageAdjustments())]
        let doc = CanvasV3(migrating: effets)
        let objet = doc.scenes.flatMap(\.objects).first { $0.id == "posed" }
        #expect(objet?.payload["adjustments"] == nil)
    }
}
